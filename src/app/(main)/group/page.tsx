import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GroupView from "@/components/group/GroupView";
import type { CheckIn, Schedule, Group } from "@/lib/types";

export default async function GroupPage() {
  const supabase = createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: currentUser } = await supabase
    .from("users")
    .select("id, name, role, group_id")
    .eq("email", authUser.email!)
    .single();

  if (!currentUser || !["leader", "admin"].includes(currentUser.role)) redirect("/");

  const [
    { data: group },
    { data: members },
    { data: activeSchedule },
    { data: schedules },
    { data: allGroups },
  ] = await Promise.all([
    supabase
      .from("groups")
      .select("name")
      .eq("id", currentUser.group_id)
      .single(),
    supabase
      .from("users")
      .select("id, name")
      .eq("group_id", currentUser.group_id)
      .order("name"),
    supabase
      .from("schedules")
      .select("*")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("schedules")
      .select("*")
      .order("day_number")
      .order("sort_order"),
    supabase.from("groups").select("*").order("name"),
  ]);

  let checkIns: CheckIn[] = [];
  let allCheckIns: { user_id: string; is_absent: boolean; group_id?: string }[] = [];

  if (activeSchedule) {
    const queries = [
      supabase
        .from("check_ins")
        .select("user_id, is_absent")
        .eq("schedule_id", activeSchedule.id),
    ];

    if (members?.length) {
      queries.push(
        supabase
          .from("check_ins")
          .select("*")
          .eq("schedule_id", activeSchedule.id)
          .in("user_id", members.map((m) => m.id))
      );
    }

    const results = await Promise.all(queries);
    allCheckIns = (results[0].data ?? []) as typeof allCheckIns;
    if (results[1]) {
      checkIns = (results[1].data as CheckIn[]) ?? [];
    }
  }

  return (
    <GroupView
      currentUser={{ id: currentUser.id, group_id: currentUser.group_id }}
      groupName={group?.name ?? "내 조"}
      members={members ?? []}
      activeSchedule={activeSchedule ?? null}
      initialCheckIns={checkIns}
      schedules={(schedules as Schedule[]) ?? []}
      allGroups={(allGroups as Group[]) ?? []}
      allCheckIns={allCheckIns}
    />
  );
}
