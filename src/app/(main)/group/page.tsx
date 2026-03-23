import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GroupView from "@/components/group/GroupView";
import type { CheckIn, Schedule, Group, GroupParty } from "@/lib/types";

export default async function GroupPage() {
  const supabase = createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: currentUser } = await supabase
    .from("users")
    .select("id, name, role, group_id")
    .eq("email", authUser.email ?? "")
    .single();

  if (!currentUser || !["leader", "admin"].includes(currentUser.role)) redirect("/");

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
      .select("id, name, party")
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
    supabase.from("users").select("id, group_id"),
  ]);

  let checkIns: CheckIn[] = [];
  let allCheckIns: { user_id: string; is_absent: boolean }[] = [];
  let initialReported = false;

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

    // 보고 여부 확인
    const { data: report } = await supabase
      .from("group_reports")
      .select("id")
      .eq("group_id", currentUser.group_id)
      .eq("schedule_id", activeSchedule.id)
      .maybeSingle();
    initialReported = !!report;
  }

  // 완료 일정별 체크인 카운트 (우리 조 기준)
  const completedScheduleIds = (schedules ?? [])
    .filter((s: Schedule) => s.activated_at && !s.is_active)
    .map((s: Schedule) => s.id);

  const scheduleCounts: Record<string, number> = {};
  if (completedScheduleIds.length > 0 && members?.length) {
    const { data: counts } = await supabase
      .from("check_ins")
      .select("schedule_id")
      .in("schedule_id", completedScheduleIds)
      .in("user_id", members.map((m) => m.id));
    for (const c of counts ?? []) {
      scheduleCounts[c.schedule_id] = (scheduleCounts[c.schedule_id] ?? 0) + 1;
    }
  }

  return (
    <GroupView
      key={activeSchedule?.id ?? "no-schedule"}
      currentUser={{ id: currentUser.id, group_id: currentUser.group_id }}
      groupName={group?.name ?? "내 조"}
      members={(members ?? []).map((m) => ({ ...m, party: (m.party as GroupParty) ?? null }))}

      activeSchedule={activeSchedule ?? null}
      initialCheckIns={checkIns}
      schedules={(schedules as Schedule[]) ?? []}
      allGroups={(allGroups as Group[]) ?? []}
      allCheckIns={allCheckIns}
      allMembers={(allMembers ?? []) as { id: string; group_id: string }[]}
      scheduleCounts={scheduleCounts}
      initialReported={initialReported}
    />
  );
}
