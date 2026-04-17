import type { Metadata } from "next";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GroupView from "@/components/group/GroupView";
import { hasActiveOrPastTempLeaderRole } from "@/lib/auth";
import type { CheckIn, Schedule, Group, GroupParty, GroupMember, ShuttleReport } from "@/lib/types";

export const metadata: Metadata = { title: "조장" };

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

  const [
    { data: group },
    { data: members },
    { data: activeSchedule },
    { data: schedules },
    { data: allGroups },
    { data: allMembers },
  ] = await Promise.all([
    supabase
      .from("groups")
      .select("name")
      .eq("id", currentUser.group_id)
      .single(),
    supabase
      .from("users")
      .select("id, name, party, airline, trip_role")
      .eq("group_id", currentUser.group_id)
      .order("name"),
    supabase
      .from("schedules")
      .select("id, title, location, day_number, sort_order, scheduled_time, scope, is_active, shuttle_type, activated_at, created_at")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("schedules")
      .select("id, title, location, day_number, sort_order, scheduled_time, scope, is_active, shuttle_type, activated_at, created_at")
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
      ? supabase.from("users").select("id, name, party, airline, trip_role").eq("shuttle_bus", currentUser.shuttle_bus).order("name")
          .then(({ data: sm }) => {
            shuttleMembers = (sm ?? []).map((m) => ({
              id: m.id,
              name: m.name,
              party: (m.party as GroupParty) ?? null,
              airline: m.airline ?? null,
              trip_role: m.trip_role ?? null,
            }));
          })
      : Promise.resolve(),
    currentUser.return_shuttle_bus
      ? supabase.from("users").select("id, name, party, airline, trip_role").eq("return_shuttle_bus", currentUser.return_shuttle_bus).order("name")
          .then(({ data: rm }) => {
            returnShuttleMembers = (rm ?? []).map((m) => ({
              id: m.id,
              name: m.name,
              party: (m.party as GroupParty) ?? null,
              airline: m.airline ?? null,
              trip_role: m.trip_role ?? null,
            }));
          })
      : Promise.resolve(),
  ]);

  let checkIns: CheckIn[] = [];
  let allCheckIns: { user_id: string; is_absent: boolean }[] = [];
  let allReports: { group_id: string }[] = [];
  let initialReported = false;
  let shuttleReports: ShuttleReport[] = [];
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

    // (1) 활성 일정 체크인 + 보고
    if (activeSchedule) {
      queries.push(
        Promise.all([
          supabase.from("check_ins").select("id, user_id, schedule_id, checked_at, checked_by, checked_by_user_id, offline_pending, is_absent, absence_reason, absence_location, group_id_at_checkin").eq("schedule_id", activeSchedule.id),
          supabase.from("group_reports").select("group_id").eq("schedule_id", activeSchedule.id),
        ]).then(([{ data: allCi }, { data: allReportsData }]) => {
          const allData = allCi ?? [];
          allCheckIns = allData.map((ci) => ({ user_id: ci.user_id, is_absent: ci.is_absent }));
          const memberIds = new Set(members?.map((m) => m.id) ?? []);
          checkIns = allData.filter((ci) => memberIds.has(ci.user_id)) as CheckIn[];
          allReports = allReportsData ?? [];
          initialReported = allReports.some((r) => r.group_id === currentUser.group_id);
        })
      );
    }

    // (2) 셔틀 보고 (활성 일정이 셔틀이고 배정 버스 있을 때)
    if (activeSchedule?.shuttle_type && myShuttleBus) {
      queries.push(
        supabase.from("shuttle_reports").select("id, shuttle_bus, schedule_id, reported_by, pending_count, reported_at").eq("schedule_id", activeSchedule.id)
          .then(({ data: sr }) => {
            shuttleReports = (sr ?? []) as ShuttleReport[];
            initialReported = shuttleReports.some((r) => r.shuttle_bus === myShuttleBus);
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

  return (
    <GroupView
      currentUser={{ id: currentUser.id, group_id: currentUser.group_id, shuttle_bus: currentUser.shuttle_bus ?? null, return_shuttle_bus: currentUser.return_shuttle_bus ?? null }}
      groupName={group?.name ?? "내 조"}
      members={(members ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        party: (m.party as GroupParty) ?? null,
        airline: m.airline ?? null,
        trip_role: m.trip_role ?? null,
      }))}
      shuttleMembers={shuttleMembers}
      returnShuttleMembers={returnShuttleMembers}
      activeSchedule={activeSchedule ?? null}
      initialCheckIns={checkIns}
      schedules={(schedules as Schedule[]) ?? []}
      allGroups={(allGroups as Group[]) ?? []}
      allCheckIns={allCheckIns}
      allMembers={(allMembers ?? []).map((m) => ({ id: m.id, group_id: m.group_id, party: (m.party as "advance" | "rear") ?? null, name: m.name, role: m.role }))}
      allReports={allReports}
      scheduleCounts={scheduleCounts}
      scheduleAbsentCounts={scheduleAbsentCounts}
      initialReported={initialReported}
    />
  );
}
