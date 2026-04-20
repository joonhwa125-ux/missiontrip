import type { Metadata } from "next";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GroupView from "@/components/group/GroupView";
import { hasActiveOrPastTempLeaderRole } from "@/lib/auth";
import { getEffectiveRoster } from "@/lib/roster";
import { matchesAirlineFilter } from "@/lib/constants";
import type {
  CheckIn,
  Schedule,
  Group,
  GroupParty,
  GroupMember,
  BriefingData,
  ScheduleMemberInfo,
  ScheduleGroupInfo,
  EffectiveRoster,
  EffectiveRosterClient,
} from "@/lib/types";

export const metadata: Metadata = { title: "조장" };

// router.refresh() 가 항상 fresh data를 받도록 보장.
// Realtime broadcast → onScheduleActivated/Deactivated → router.refresh 흐름에서
// Vercel/Next 캐시가 stale 응답을 줄 수 있는 케이스 차단 (admin/page.tsx와 동일 패턴).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GroupPage() {
  // 인증 확인은 쿠키 기반 클라이언트
  const authClient = createClient();
  const {
    data: { user: authUser },
  } = await authClient.auth.getUser();
  if (!authUser) redirect("/login");

  // 데이터 조회는 service client (RLS의 auth.uid() ≠ users.id 문제 우회)
  const supabase = createServiceClient();

  const { data: currentUser } = await supabase
    .from("users")
    .select("id, name, role, group_id, shuttle_bus, return_shuttle_bus")
    .eq("email", authUser.email ?? "")
    .single();

  if (!currentUser) redirect("/");

  // 기본 권한: leader / admin / admin_leader
  const isPermanentLeader = ["leader", "admin", "admin_leader"].includes(currentUser.role);
  // v2: 임시 조장 권한 (schedule_member_info.temp_role='leader')도 접근 허용
  const hasTempLeader = isPermanentLeader ? false : await hasActiveOrPastTempLeaderRole(currentUser.id);
  if (!isPermanentLeader && !hasTempLeader) redirect("/");

  // Phase J: active schedule을 먼저 조회 — effective group 결정에 필요
  const { data: activeSchedule } = await supabase
    .from("schedules")
    .select("id, title, location, day_number, sort_order, scheduled_time, scope, is_active, shuttle_type, airline_leg, airline_filter, notice, activated_at, created_at")
    .eq("is_active", true)
    .maybeSingle();

  // Phase J: 현재 사용자의 effective group 결정
  //  - 일반 일정 + smi.temp_role='leader' + smi.temp_group_id 지정 시 → 해당 조로 뷰 전환
  //  - 셔틀 일정은 기존 로직 유지 (shuttle은 그룹 개념과 다름)
  let effectiveGroupId = currentUser.group_id;
  if (activeSchedule && !activeSchedule.shuttle_type) {
    const { data: mySmi } = await supabase
      .from("schedule_member_info")
      .select("temp_group_id, temp_role")
      .eq("user_id", currentUser.id)
      .eq("schedule_id", activeSchedule.id)
      .maybeSingle();
    if (mySmi?.temp_role === "leader" && mySmi.temp_group_id) {
      effectiveGroupId = mySmi.temp_group_id;
    }
  }

  const [
    { data: group },
    { data: members },
    { data: schedules },
    { data: allGroups },
    { data: allMembers },
  ] = await Promise.all([
    supabase
      .from("groups")
      .select("name")
      .eq("id", effectiveGroupId)
      .single(),
    supabase
      .from("users")
      .select("id, name, party, airline, return_airline, trip_role")
      .eq("group_id", effectiveGroupId)
      .order("name"),
    supabase
      .from("schedules")
      .select("id, title, location, day_number, sort_order, scheduled_time, scope, is_active, shuttle_type, airline_leg, airline_filter, notice, activated_at, created_at")
      .order("day_number")
      .order("sort_order"),
    supabase.from("groups").select("id, name, bus_name").order("name"),
    supabase.from("users").select("id, group_id, party, name, role"),
  ]);

  // 출발/귀가 셔틀 버스 배정자인 경우 해당 버스 인원 추가 조회
  let shuttleMembers: GroupMember[] = [];
  let returnShuttleMembers: GroupMember[] = [];
  await Promise.all([
    currentUser.shuttle_bus
      ? supabase.from("users").select("id, name, party, airline, return_airline, trip_role").eq("shuttle_bus", currentUser.shuttle_bus).order("name")
          .then(({ data: sm }) => {
            shuttleMembers = (sm ?? []).map((m) => ({
              id: m.id,
              name: m.name,
              party: (m.party as GroupParty) ?? null,
              airline: m.airline ?? null,
              return_airline: m.return_airline ?? null,
              trip_role: m.trip_role ?? null,
            }));
          })
      : Promise.resolve(),
    currentUser.return_shuttle_bus
      ? supabase.from("users").select("id, name, party, airline, return_airline, trip_role").eq("return_shuttle_bus", currentUser.return_shuttle_bus).order("name")
          .then(({ data: rm }) => {
            returnShuttleMembers = (rm ?? []).map((m) => ({
              id: m.id,
              name: m.name,
              party: (m.party as GroupParty) ?? null,
              airline: m.airline ?? null,
              return_airline: m.return_airline ?? null,
              trip_role: m.trip_role ?? null,
            }));
          })
      : Promise.resolve(),
  ]);

  let checkIns: CheckIn[] = [];
  let initialReported = false;
  // Phase F: 활성 일정의 effective roster (non-shuttle일 때만 계산)
  let effectiveRoster: EffectiveRoster | null = null;
  const scheduleCounts: Record<string, number> = {};
  const scheduleAbsentCounts: Record<string, number> = {};

  // 완료 일정 ID 추출 (병렬 쿼리에 사용)
  const completedScheduleIds = (schedules ?? [])
    .filter((s: Schedule) => s.activated_at && !s.is_active)
    .map((s: Schedule) => s.id);

  // 셔틀 버스명 미리 계산
  const myShuttleBus = activeSchedule
    ? (activeSchedule.shuttle_type === "departure" ? currentUser.shuttle_bus
      : activeSchedule.shuttle_type === "return" ? currentUser.return_shuttle_bus
      : null)
    : null;

  // 활성 일정 체크인 + 보고 + 셔틀 보고 + 완료 일정 카운트 — 전부 병렬
  if (activeSchedule || (completedScheduleIds.length > 0 && members?.length)) {
    const queries: Promise<void>[] = [];

    // (1) 활성 일정 체크인 + 보고 + effective roster (Phase F, non-shuttle만)
    if (activeSchedule) {
      queries.push(
        (async () => {
          const baseRosterMembers: GroupMember[] = (members ?? []).map((m) => ({
            id: m.id,
            name: m.name,
            party: (m.party as GroupParty) ?? null,
            airline: m.airline ?? null,
            return_airline: m.return_airline ?? null,
            trip_role: m.trip_role ?? null,
          }));
          const [rosterResult, { data: allCi }, { data: myReportData }] = await Promise.all([
            !activeSchedule.shuttle_type && baseRosterMembers.length > 0
              ? getEffectiveRoster({
                  scheduleId: activeSchedule.id,
                  groupId: effectiveGroupId,
                  baseMembers: baseRosterMembers,
                  allGroups: (allGroups ?? []) as Group[],
                })
              : Promise.resolve(null),
            supabase.from("check_ins").select("id, user_id, schedule_id, checked_at, checked_by, checked_by_user_id, offline_pending, is_absent, absence_reason, absence_location, group_id_at_checkin").eq("schedule_id", activeSchedule.id),
            // 보고 여부는 effective group 기준 (임시 조장도 자기 조 보고 상태를 봄)
            supabase.from("group_reports").select("group_id").eq("schedule_id", activeSchedule.id).eq("group_id", effectiveGroupId).maybeSingle(),
          ]);

          effectiveRoster = rosterResult;
          const allData = allCi ?? [];
          // Phase F: roster 적용 시 transferredIn 포함/transferredOut 제외된 id 집합 사용
          const rosterIds = rosterResult
            ? new Set(rosterResult.activeMembers.map((m) => m.id))
            : new Set(members?.map((m) => m.id) ?? []);
          checkIns = allData.filter((ci) => rosterIds.has(ci.user_id)) as CheckIn[];
          initialReported = !!myReportData;
        })()
      );
    }

    // (2) 셔틀 보고 (활성 일정이 셔틀이고 배정 버스 있을 때)
    // UNIQUE (shuttle_bus, schedule_id) 인덱스로 1-row 조회
    if (activeSchedule?.shuttle_type && myShuttleBus) {
      queries.push(
        supabase.from("shuttle_reports").select("id").eq("schedule_id", activeSchedule.id).eq("shuttle_bus", myShuttleBus).maybeSingle()
          .then(({ data: sr }) => {
            initialReported = !!sr;
          }) as Promise<void>
      );
    }

    // (3) 완료 일정 카운트
    if (completedScheduleIds.length > 0 && members?.length) {
      queries.push(
        supabase.from("check_ins").select("schedule_id, is_absent")
          .in("schedule_id", completedScheduleIds)
          .in("user_id", members.map((m) => m.id))
          .then(({ data: counts }) => {
            for (const c of counts ?? []) {
              if (c.is_absent) {
                scheduleAbsentCounts[c.schedule_id] = (scheduleAbsentCounts[c.schedule_id] ?? 0) + 1;
              } else {
                scheduleCounts[c.schedule_id] = (scheduleCounts[c.schedule_id] ?? 0) + 1;
              }
            }
          }) as Promise<void>
      );
    }

    await Promise.all(queries);
  }

  // ============================================================================
  // v2 Phase E: 조장 브리핑 데이터 조립
  // — schedule_group_info (내 조) + schedule_member_info (내 조원 OR 우리 조로 이동/임시권한)
  // — 결과가 비어있어도 BriefingData 객체는 유지 (GroupFeedView가 카운트 0이면 배너 숨김)
  // ============================================================================
  const baseMemberIds = (members ?? []).map((m) => m.id);
  const [{ data: sgiRows }, byUserSmiRes, byTempSmiRes] = await Promise.all([
    supabase
      .from("schedule_group_info")
      .select("id, schedule_id, group_id, group_location, note, created_at, updated_at, updated_by")
      .eq("group_id", effectiveGroupId),
    baseMemberIds.length > 0
      ? supabase
          .from("schedule_member_info")
          .select("id, schedule_id, user_id, temp_group_id, temp_role, excused_reason, activity, menu, note, caused_by_smi_id, created_at, updated_at, updated_by")
          .in("user_id", baseMemberIds)
      : Promise.resolve({ data: [] as ScheduleMemberInfo[] }),
    supabase
      .from("schedule_member_info")
      .select("id, schedule_id, user_id, temp_group_id, temp_role, excused_reason, activity, menu, note, caused_by_smi_id, created_at, updated_at, updated_by")
      .eq("temp_group_id", effectiveGroupId),
  ]);

  const smiById = new Map<string, ScheduleMemberInfo>();
  for (const row of (byUserSmiRes.data ?? []) as ScheduleMemberInfo[]) smiById.set(row.id, row);
  for (const row of (byTempSmiRes.data ?? []) as ScheduleMemberInfo[]) smiById.set(row.id, row);
  const smiRows = Array.from(smiById.values());

  // userNameMap: 브리핑 시트에서 이름 렌더링에 사용
  const relevantUserIds = new Set<string>(baseMemberIds);
  for (const smi of smiRows) relevantUserIds.add(smi.user_id);
  const userNameMap: Record<string, string> = {};
  for (const m of allMembers ?? []) {
    if (relevantUserIds.has(m.id)) userNameMap[m.id] = m.name;
  }

  // 브리핑에 등장하는 일정 — sgi/smi 레코드 있는 일정 + airline_leg 있는 비행 일정 + notice(공지) 있는 일정
  //  (비행·공지 있는 일정은 sgi/smi 없어도 섹션 렌더 트리거)
  //  단, airline_leg/notice 트리거는 이 조가 실제로 참여하는 일정에 한정 —
  //  scope(선발/후발)·shuttle_type(셔틀 배정)·airline_filter(항공사) 기준으로 필터링.
  //  GroupFeedView의 mySchedules 필터와 동일 로직 (조장 피드에 보이지 않는 일정의 공지는 브리핑에도 안 나옴).
  const hasAdvance = (members ?? []).some((m) => m.party === "advance");
  const hasRear = (members ?? []).some((m) => m.party === "rear");
  const isScheduleVisibleToGroup = (s: Schedule): boolean => {
    if (s.shuttle_type === "departure") return !!currentUser.shuttle_bus;
    if (s.shuttle_type === "return") return !!currentUser.return_shuttle_bus;
    const scopeOk =
      s.scope === "all" ||
      (s.scope === "advance" && hasAdvance) ||
      (s.scope === "rear" && hasRear);
    if (!scopeOk) return false;
    return matchesAirlineFilter(s.airline_filter, members ?? []);
  };

  const briefingScheduleIds = new Set<string>();
  for (const s of (sgiRows ?? []) as ScheduleGroupInfo[]) briefingScheduleIds.add(s.schedule_id);
  for (const s of smiRows) briefingScheduleIds.add(s.schedule_id);
  for (const s of (schedules ?? []) as Schedule[]) {
    if (!(s.airline_leg || s.notice)) continue;
    if (!isScheduleVisibleToGroup(s)) continue;
    briefingScheduleIds.add(s.id);
  }
  const scheduleSummaries = ((schedules ?? []) as Schedule[])
    .filter((s) => briefingScheduleIds.has(s.id))
    .map((s) => ({
      schedule_id: s.id,
      title: s.title,
      location: s.location,
      day_number: s.day_number,
      sort_order: s.sort_order,
      scheduled_time: s.scheduled_time,
      airline_leg: s.airline_leg,
      notice: s.notice,
    }))
    .sort((a, b) => a.day_number - b.day_number || a.sort_order - b.sort_order);

  const roleAssignments = (members ?? [])
    .filter((m) => m.trip_role || m.airline || m.return_airline)
    .map((m) => ({
      user_id: m.id,
      name: m.name,
      trip_role: m.trip_role ?? null,
      airline: m.airline ?? null,
      return_airline: m.return_airline ?? null,
    }));

  // group_id → name 매핑 (temp_group_id 칩 렌더 시 필요)
  const groupNameMap: Record<string, string> = {};
  for (const g of (allGroups ?? []) as Group[]) groupNameMap[g.id] = g.name;

  const briefing: BriefingData = {
    roleAssignments,
    groupInfos: (sgiRows ?? []) as ScheduleGroupInfo[],
    memberInfos: smiRows,
    scheduleSummaries,
    userNameMap,
    groupNameMap,
    cachedAt: new Date().toISOString(),
  };

  // Phase F: Map을 배열로 바꾼 클라이언트-직렬화용 roster
  // NOTE: `let effectiveRoster = null`가 closure 내부 할당을 TS가 추적하지 못해
  //        narrowing되는 이슈를 피하려 명시적 타입 캐스트 후 사용
  const roster = effectiveRoster as EffectiveRoster | null;
  const effectiveRosterClient: EffectiveRosterClient | null = roster
    ? {
        activeMembers: roster.activeMembers,
        excusedMembers: roster.excusedMembers,
        transferredIn: roster.transferredIn,
        memberInfos: Array.from(roster.memberInfoMap.values()),
      }
    : null;

  return (
    <GroupView
      currentUser={{ id: currentUser.id, group_id: effectiveGroupId, shuttle_bus: currentUser.shuttle_bus ?? null, return_shuttle_bus: currentUser.return_shuttle_bus ?? null }}
      groupName={group?.name ?? "내 조"}
      members={(members ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        party: (m.party as GroupParty) ?? null,
        airline: m.airline ?? null,
        return_airline: m.return_airline ?? null,
        trip_role: m.trip_role ?? null,
      }))}
      shuttleMembers={shuttleMembers}
      returnShuttleMembers={returnShuttleMembers}
      activeSchedule={activeSchedule ?? null}
      initialCheckIns={checkIns}
      schedules={(schedules as Schedule[]) ?? []}
      scheduleCounts={scheduleCounts}
      scheduleAbsentCounts={scheduleAbsentCounts}
      initialReported={initialReported}
      briefing={briefing}
      effectiveRoster={effectiveRosterClient}
    />
  );
}
