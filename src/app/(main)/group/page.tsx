import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GroupCheckinView from "@/components/group/GroupCheckinView";
import type { CheckIn } from "@/lib/types";

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

  const [{ data: group }, { data: members }, { data: activeSchedule }] =
    await Promise.all([
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
    ]);

  let checkIns: CheckIn[] = [];
  if (activeSchedule && members?.length) {
    const { data } = await supabase
      .from("check_ins")
      .select("*")
      .eq("schedule_id", activeSchedule.id)
      .in(
        "user_id",
        members.map((m) => m.id)
      );
    checkIns = (data as CheckIn[]) ?? [];
  }

  return (
    <GroupCheckinView
      currentUser={{ id: currentUser.id, group_id: currentUser.group_id }}
      groupName={group?.name ?? "내 조"}
      members={members ?? []}
      activeSchedule={activeSchedule ?? null}
      initialCheckIns={checkIns}
    />
  );
}
