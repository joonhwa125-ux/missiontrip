import React, { useMemo } from "react";
import { cn, getGroupBadgeStatus, filterMembersByScope } from "@/lib/utils";
import { isLeaderRole, GROUP_BADGE_STYLE } from "@/lib/constants";
import type { Group, GroupMemberBrief, GroupBadgeStatus } from "@/lib/types";

interface Props {
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
  allMembers: GroupMemberBrief[];
  allReports: { group_id: string }[];
  scope: "all" | "advance" | "rear";
}

export default React.memo(function GroupStatusGrid({
  allGroups,
  allCheckIns,
  allMembers,
  allReports,
  scope,
}: Props) {
  const reportedIds = useMemo(() => new Set(allReports.map((r) => r.group_id)), [allReports]);
  const scopeMembers = useMemo(() => filterMembersByScope(allMembers, scope), [allMembers, scope]);

  const { groupMemberCounts, userGroupMap, groupLeaderMap } = useMemo(() => {
    const memberCounts = new Map<string, number>();
    for (const m of scopeMembers) {
      memberCounts.set(m.group_id, (memberCounts.get(m.group_id) ?? 0) + 1);
    }
    const ugMap = new Map(allMembers.map((m) => [m.id, m.group_id]));
    const leaderMap = new Map<string, string>();
    for (const m of allMembers) {
      if (isLeaderRole(m.role)) leaderMap.set(m.group_id, m.name);
    }
    return { groupMemberCounts: memberCounts, userGroupMap: ugMap, groupLeaderMap: leaderMap };
  }, [scopeMembers, allMembers]);

  const { groupCheckedCounts, groupAbsentCounts } = useMemo(() => {
    const checked = new Map<string, number>();
    const absent = new Map<string, number>();
    for (const c of allCheckIns) {
      const gid = userGroupMap.get(c.user_id);
      if (!gid) continue;
      if (c.is_absent) {
        absent.set(gid, (absent.get(gid) ?? 0) + 1);
      } else {
        checked.set(gid, (checked.get(gid) ?? 0) + 1);
      }
    }
    return { groupCheckedCounts: checked, groupAbsentCounts: absent };
  }, [allCheckIns, userGroupMap]);

  const busEntries = useMemo(() => {
    const nonEmptyGroups = allGroups.filter((g) => (groupMemberCounts.get(g.id) ?? 0) > 0);
    const busGroups = new Map<string, Group[]>();
    for (const g of nonEmptyGroups) {
      const bus = g.bus_name ?? "미배정";
      if (!busGroups.has(bus)) busGroups.set(bus, []);
      busGroups.get(bus)!.push(g);
    }
    return Array.from(busGroups.entries()).sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [allGroups, groupMemberCounts]);

  return (
    <div className="space-y-3">
      {busEntries.map(([busName, busGroupList]) => (
        <section key={busName}>
          <h3 className="mb-1.5 text-xs font-bold text-muted-foreground">
            {busName}
          </h3>
          <div className="grid grid-cols-2 gap-1.5 [&>*:last-child:nth-child(odd)]:col-span-2">
            {busGroupList.map((g) => {
              const rawTotal = groupMemberCounts.get(g.id) ?? 0;
              const absent = groupAbsentCounts.get(g.id) ?? 0;
              const total = rawTotal - absent;
              const checked = groupCheckedCounts.get(g.id) ?? 0;
              const badge = getGroupBadgeStatus(rawTotal, checked, reportedIds.has(g.id), absent);
              const progress = total > 0 ? (checked / total) * 100 : 0;
              return (
                <GroupMiniCard
                  key={g.id}
                  name={g.name}
                  leaderName={groupLeaderMap.get(g.id)}
                  checked={checked}
                  total={total}
                  rawTotal={rawTotal}
                  absent={absent}
                  badge={badge}
                  progress={progress}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
});

function GroupMiniCard({
  name,
  leaderName,
  checked,
  total,
  rawTotal,
  absent,
  badge,
  progress,
}: {
  name: string;
  leaderName?: string;
  checked: number;
  total: number;
  rawTotal: number;
  absent: number;
  badge: GroupBadgeStatus;
  progress: number;
}) {
  const b = GROUP_BADGE_STYLE[badge];
  return (
    <div className={cn("rounded-2xl border bg-white p-4", badge === "reported" ? "border-emerald-300" : "border-stone-200")}>
      <div className="mb-1.5">
        <span
          className={cn(
            "inline-block -ml-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
            b.bg,
            b.text
          )}
        >
          {b.label}
        </span>
        <p className="mt-1 text-sm font-semibold leading-snug">{name}</p>
        {leaderName && (
          <p className="mt-0.5 text-xs text-muted-foreground">{leaderName}</p>
        )}
      </div>
      <div
        className="mb-0.5 h-2 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={checked}
        aria-valuemax={total}
        aria-label={`${name} ${checked}/${total}명 탑승`}
      >
        <div
          className="h-full rounded-full bg-progress-bar transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {checked}/{rawTotal}명{absent > 0 ? ` (불참 ${absent})` : ""}
      </p>
    </div>
  );
}
