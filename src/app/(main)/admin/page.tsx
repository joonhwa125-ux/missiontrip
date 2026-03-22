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
    .eq("email", authUser.email!)
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

  let checkIns: { user_id: string; is_absent: boolean }[] = [];
  let reports: {
    group_id: string;
    pending_count: number;
    reported_at: string;
  }[] = [];

  if (activeSchedule) {
    const [{ data: ci }, { data: rp }] = await Promise.all([
      supabase
        .from("check_ins")
        .select("user_id, is_absent")
        .eq("schedule_id", activeSchedule.id),
      supabase
        .from("group_reports")
        .select("group_id, pending_count, reported_at")
        .eq("schedule_id", activeSchedule.id),
    ]);
    checkIns = ci ?? [];
    reports = rp ?? [];
  }

  return (
    <AdminView
      currentUser={{ id: currentUser.id }}
      groups={(groups as Group[]) ?? []}
      members={members ?? []}
      activeSchedule={(activeSchedule as Schedule) ?? null}
      schedules={(schedules as Schedule[]) ?? []}
      initialCheckIns={checkIns}
      initialReports={reports}
    />
  );
}
