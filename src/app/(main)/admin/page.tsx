import type { Metadata } from "next";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/constants";
import AdminView from "@/components/admin/AdminView";
import type { Group, Schedule } from "@/lib/types";

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
    supabase.from("groups").select("*").order("name"),
    supabase.from("users").select("id, name, phone, role, group_id, party, shuttle_bus, return_shuttle_bus").order("name"),
    supabase.from("schedules").select("*").eq("is_active", true).maybeSingle(),
    supabase
      .from("schedules")
      .select("*")
      .order("day_number")
      .order("sort_order"),
  ]);

  // 활성화된 적 있는 모든 일정의 checkIns + reports (바텀시트용)
  // 안전장치: is_active=true인데 activated_at=null인 엣지케이스 방어
  const activatedIds = ((schedules as Schedule[]) ?? [])
    .filter((s) => s.activated_at || s.is_active)
    .map((s) => s.id);

  type CiRow = { schedule_id: string; user_id: string; is_absent: boolean; checked_at: string };
  type RpRow = { schedule_id: string; group_id: string; pending_count: number; reported_at: string };

  const checkInsMap: Record<string, CiRow[]> = {};
  const reportsMap: Record<string, RpRow[]> = {};

  if (activatedIds.length > 0) {
    const [{ data: allCi }, { data: allRp }] = await Promise.all([
      supabase
        .from("check_ins")
        .select("schedule_id, user_id, is_absent, checked_at")
        .in("schedule_id", activatedIds),
      supabase
        .from("group_reports")
        .select("schedule_id, group_id, pending_count, reported_at")
        .in("schedule_id", activatedIds),
    ]);
    for (const ci of allCi ?? []) {
      (checkInsMap[ci.schedule_id] ??= []).push({
        schedule_id: ci.schedule_id,
        user_id: ci.user_id,
        is_absent: ci.is_absent ?? false,
        checked_at: ci.checked_at,
      });
    }
    for (const rp of allRp ?? []) {
      (reportsMap[rp.schedule_id] ??= []).push(rp);
    }
  }

  return (
    <AdminView
      key={activeSchedule?.id ?? "no-schedule"}
      currentUser={{ id: currentUser.id, group_id: currentUser.group_id, shuttle_bus: currentUser.shuttle_bus ?? null, return_shuttle_bus: currentUser.return_shuttle_bus ?? null }}
      groups={(groups as Group[]) ?? []}
      members={members ?? []}
      activeSchedule={(activeSchedule as Schedule) ?? null}
      schedules={(schedules as Schedule[]) ?? []}
      initialCheckInsMap={checkInsMap}
      initialReportsMap={reportsMap}
    />
  );
}
