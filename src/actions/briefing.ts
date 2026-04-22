import type { createServiceClient } from "@/lib/supabase/server";
import { matchesAirlineFilter } from "@/lib/constants";
import type { BriefingData, Group, Schedule, ScheduleGroupInfo, ScheduleMemberInfo, AdminMember } from "@/lib/types";

export async function getBriefingData({
  supabase,
  effectiveGroupId,
  members,
  allGroups,
  schedules,
  currentUser,
}: {
  supabase: ReturnType<typeof createServiceClient>;
  effectiveGroupId: string;
  members: AdminMember[];
  allGroups: Group[];
  schedules: Schedule[];
  currentUser: { shuttle_bus: string | null; return_shuttle_bus: string | null };
}): Promise<BriefingData> {
  const baseMemberIds = members.map((m) => m.id);
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

  const relevantUserIds = new Set<string>(baseMemberIds);
  for (const smi of smiRows) relevantUserIds.add(smi.user_id);
  
  let extraNames: Record<string, string> = {};
  const missingIds = Array.from(relevantUserIds).filter(id => !members.find(m => m.id === id));
  if (missingIds.length > 0) {
    const { data: extraUsers } = await supabase.from("users").select("id, name").in("id", missingIds);
    for (const u of extraUsers ?? []) extraNames[u.id] = u.name;
  }

  const userNameMap: Record<string, string> = {};
  for (const m of members) userNameMap[m.id] = m.name;
  Object.assign(userNameMap, extraNames);

  const hasAdvance = members.some((m) => m.party === "advance");
  const hasRear = members.some((m) => m.party === "rear");
  const isScheduleVisibleToGroup = (s: Schedule): boolean => {
    if (s.shuttle_type === "departure") return !!currentUser.shuttle_bus;
    if (s.shuttle_type === "return") return !!currentUser.return_shuttle_bus;
    const scopeOk =
      s.scope === "all" ||
      (s.scope === "advance" && hasAdvance) ||
      (s.scope === "rear" && hasRear);
    if (!scopeOk) return false;
    return matchesAirlineFilter(s.airline_filter, members);
  };

  const briefingScheduleIds = new Set<string>();
  for (const s of (sgiRows ?? []) as ScheduleGroupInfo[]) briefingScheduleIds.add(s.schedule_id);
  for (const s of smiRows) briefingScheduleIds.add(s.schedule_id);
  for (const s of schedules) {
    if (!(s.airline_leg || s.notice)) continue;
    if (!isScheduleVisibleToGroup(s)) continue;
    briefingScheduleIds.add(s.id);
  }
  const scheduleSummaries = schedules
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

  const roleAssignments = members
    .filter((m) => m.trip_role || m.airline || m.return_airline)
    .map((m) => ({
      user_id: m.id,
      name: m.name,
      trip_role: m.trip_role ?? null,
      airline: m.airline ?? null,
      return_airline: m.return_airline ?? null,
    }));

  const groupNameMap: Record<string, string> = {};
  for (const g of allGroups) groupNameMap[g.id] = g.name;

  return {
    roleAssignments,
    groupInfos: (sgiRows ?? []) as ScheduleGroupInfo[],
    memberInfos: smiRows,
    scheduleSummaries,
    groupNameMap,
    userNameMap,
  };
}
