import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminView from "@/components/admin/AdminView";
import type { Group, Schedule } from "@/lib/types";

export default async function AdminPage() {
  const supabase = createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: currentUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", authUser.email ?? "")
    .single();

  if (!currentUser || currentUser.role !== "admin") redirect("/");

  const [
    { data: groups },
    { data: members },
    { data: activeSchedule },
    { data: schedules },
  ] = await Promise.all([
    supabase.from("groups").select("*").order("name"),
    supabase.from("users").select("id, name, phone, role, group_id").order("name"),
    supabase.from("schedules").select("*").eq("is_active", true).maybeSingle(),
    supabase
      .from("schedules")
      .select("*")
      .order("day_number")
      .order("sort_order"),
  ]);

  // 활성화된 적 있는 모든 일정의 checkIns + reports (바텀시트용)
  const activatedIds = ((schedules as Schedule[]) ?? [])
    .filter((s) => s.activated_at)
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
      (checkInsMap[ci.schedule_id] ??= []).push(ci);
    }
    for (const rp of allRp ?? []) {
      (reportsMap[rp.schedule_id] ??= []).push(rp);
    }
  }

  return (
    <AdminView
      key={activeSchedule?.id ?? "no-schedule"}
      groups={(groups as Group[]) ?? []}
      members={members ?? []}
      activeSchedule={(activeSchedule as Schedule) ?? null}
      schedules={(schedules as Schedule[]) ?? []}
      initialCheckInsMap={checkInsMap}
      initialReportsMap={reportsMap}
    />
  );
}
