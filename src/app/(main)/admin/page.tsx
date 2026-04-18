import type { Metadata } from "next";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/constants";
import AdminView from "@/components/admin/AdminView";
import type { Group, Schedule, ScheduleMemberInfo } from "@/lib/types";

export const metadata: Metadata = { title: "관리자" };

// Next.js 서버 컴포넌트 캐싱 완전 차단 — 매 요청마다 fresh 데이터 보장
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
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
    .select("id, role, group_id, shuttle_bus, return_shuttle_bus")
    .eq("email", authUser.email ?? "")
    .single();

  if (!currentUser || !isAdminRole(currentUser.role)) redirect("/");

  const [
    { data: groups },
    { data: members },
    { data: activeSchedule },
    { data: schedules },
  ] = await Promise.all([
    supabase.from("groups").select("id, name, bus_name").order("name"),
    supabase.from("users").select("id, name, phone, role, group_id, party, shuttle_bus, return_shuttle_bus, airline, return_airline, trip_role").order("name"),
    supabase.from("schedules").select("id, title, location, day_number, sort_order, scheduled_time, scope, is_active, shuttle_type, airline_leg, activated_at, created_at").eq("is_active", true).maybeSingle(),
    supabase
      .from("schedules")
      .select("id, title, location, day_number, sort_order, scheduled_time, scope, is_active, shuttle_type, airline_leg, activated_at, created_at")
      .order("day_number")
      .order("sort_order"),
  ]);

  // 활성화된 적 있는 모든 일정의 checkIns + reports (바텀시트용)
  // 안전장치: is_active=true인데 activated_at=null인 엣지케이스 방어
  const activatedIds = ((schedules as Schedule[]) ?? [])
    .filter((s) => s.activated_at || s.is_active)
    .map((s) => s.id);

  type CiRow = { schedule_id: string; user_id: string; is_absent: boolean; checked_at: string; absence_reason: string | null; absence_location: string | null };
  type RpRow = { schedule_id: string; group_id: string; pending_count: number; reported_at: string };
  type ShRpRow = { schedule_id: string; shuttle_bus: string; pending_count: number; reported_at: string };

  const checkInsMap: Record<string, CiRow[]> = {};
  const reportsMap: Record<string, RpRow[]> = {};
  const shuttleReportsMap: Record<string, ShRpRow[]> = {};
  // v2 Phase J: 활성화된 일정별 schedule_member_info 매핑.
  //             관리자 대시보드가 effective roster(조이동/임시조장)를 반영하려면 필요.
  const memberInfosMap: Record<string, ScheduleMemberInfo[]> = {};

  if (activatedIds.length > 0) {
    // 모든 활성화 일정에 빈 배열을 미리 생성 (체크인 0건이어도 캐시 히트)
    for (const id of activatedIds) {
      checkInsMap[id] = [];
      reportsMap[id] = [];
      shuttleReportsMap[id] = [];
      memberInfosMap[id] = [];
    }
    const [{ data: allCi }, { data: allRp }, { data: allShRp }, { data: allSmi }] = await Promise.all([
      supabase
        .from("check_ins")
        .select("schedule_id, user_id, is_absent, checked_at, absence_reason, absence_location")
        .in("schedule_id", activatedIds),
      supabase
        .from("group_reports")
        .select("schedule_id, group_id, pending_count, reported_at")
        .in("schedule_id", activatedIds),
      supabase
        .from("shuttle_reports")
        .select("schedule_id, shuttle_bus, pending_count, reported_at")
        .in("schedule_id", activatedIds),
      supabase
        .from("schedule_member_info")
        .select("id, schedule_id, user_id, temp_group_id, temp_role, excused_reason, activity, menu, note, caused_by_smi_id, created_at, updated_at, updated_by")
        .in("schedule_id", activatedIds),
    ]);
    for (const ci of allCi ?? []) {
      checkInsMap[ci.schedule_id].push({
        schedule_id: ci.schedule_id,
        user_id: ci.user_id,
        is_absent: ci.is_absent ?? false,
        checked_at: ci.checked_at,
        absence_reason: ci.absence_reason ?? null,
        absence_location: ci.absence_location ?? null,
      });
    }
    for (const rp of allRp ?? []) {
      reportsMap[rp.schedule_id].push(rp);
    }
    for (const sr of allShRp ?? []) {
      shuttleReportsMap[sr.schedule_id].push(sr);
    }
    for (const smi of (allSmi ?? []) as ScheduleMemberInfo[]) {
      memberInfosMap[smi.schedule_id].push(smi);
    }
  }

  return (
    <AdminView
      currentUser={{ id: currentUser.id, role: currentUser.role, group_id: currentUser.group_id, shuttle_bus: currentUser.shuttle_bus ?? null, return_shuttle_bus: currentUser.return_shuttle_bus ?? null }}
      groups={(groups as Group[]) ?? []}
      members={members ?? []}
      activeSchedule={(activeSchedule as Schedule) ?? null}
      schedules={(schedules as Schedule[]) ?? []}
      initialCheckInsMap={checkInsMap}
      initialReportsMap={reportsMap}
      initialShuttleReportsMap={shuttleReportsMap}
      initialMemberInfosMap={memberInfosMap}
    />
  );
}
