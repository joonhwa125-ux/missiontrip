"use client";

import React, { useState, useMemo } from "react";
import { cn, getGroupBadgeStatus, filterMembersByScope } from "@/lib/utils";
import { COPY, GROUP_BADGE_STYLE, isLeaderRole } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import AdminGroupDrillDown from "./AdminGroupDrillDown";
import { PhoneIcon } from "@/components/ui/icons";
import type {
  Group,
  Schedule,
  AdminMember,
  AdminCheckIn,
  AdminReport,
} from "@/lib/types";

interface Props {
  schedule: Schedule | null;
  groups: Group[];
  members: AdminMember[];
  checkIns: AdminCheckIn[];
  reports: AdminReport[];
  isReadOnly: boolean;
  loading?: boolean;
  onClose: () => void;
  onCheckInsChange: React.Dispatch<React.SetStateAction<AdminCheckIn[]>>;
}

export default function AdminBottomSheet({
  schedule,
  groups,
  members,
  checkIns,
  reports,
  isReadOnly,
  loading,
  onClose,
  onCheckInsChange,
}: Props) {
  const [drillGroup, setDrillGroup] = useState<Group | null>(null);

  const checkedIds = useMemo(() => new Set(checkIns.map((c) => c.user_id)), [checkIns]);
  const absentIds = useMemo(
    () => new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id)),
    [checkIns]
  );
  const reportMap = useMemo(() => new Map(reports.map((r) => [r.group_id, r])), [reports]);

  const scopeMembers = useMemo(
    () => filterMembersByScope(members, schedule?.scope ?? "all"),
    [schedule?.scope, members]
  );

  const summaries = useMemo(
    () =>
      groups
        .map((g) => {
          const gMembers = scopeMembers.filter((m) => m.group_id === g.id);
          const absentCount = gMembers.filter((m) => absentIds.has(m.id)).length;
          const checkedCount = gMembers.filter(
            (m) => checkedIds.has(m.id) && !absentIds.has(m.id)
          ).length;
          const totalCount = gMembers.length - absentCount;
          const badge = getGroupBadgeStatus(totalCount, checkedCount, reportMap.has(g.id));
          const leader = gMembers.find((m) => isLeaderRole(m.role));
          return { group: g, totalCount, checkedCount, absentCount, badge, leader, rawTotal: gMembers.length };
        })
        .filter((s) => s.rawTotal > 0),
    [groups, scopeMembers, checkedIds, absentIds, reportMap]
  );

  const busEntries = useMemo(() => {
    const busGroups = new Map<string, typeof summaries>();
    for (const s of summaries) {
      const bus = s.group.bus_name ?? "미배정";
      if (!busGroups.has(bus)) busGroups.set(bus, []);
      busGroups.get(bus)!.push(s);
    }
    return Array.from(busGroups.entries()).sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [summaries]);

  const totalChecked = useMemo(
    () => scopeMembers.filter((m) => checkedIds.has(m.id) && !absentIds.has(m.id)).length,
    [scopeMembers, checkedIds, absentIds]
  );

  return (
    <>
      <Dialog open={schedule !== null} onOpenChange={(o) => {
        if (!o && drillGroup) return;
        if (!o) onClose();
      }}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0">
          <div className="flex-shrink-0 px-6 pt-6">
            <DialogHeader>
              <DialogTitle>{schedule?.location ?? schedule?.title} 현황</DialogTitle>
              <DialogDescription aria-live="polite">
                {COPY.totalSummary(totalChecked, scopeMembers.length)}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="relative overflow-y-auto px-6 pb-6">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-main-action" role="status" aria-label="불러오는 중" />
            </div>
          )}
          {busEntries.map(([busName, busSummaries]) => (
            <section key={busName} className="mb-4">
              <h3 className="mb-2 text-sm font-bold text-muted-foreground">{busName}</h3>
              <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
                {busSummaries.map(({ group, totalCount, checkedCount, absentCount, badge, leader }) => {
                  const b = GROUP_BADGE_STYLE[badge];
                  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
                  return (
                    <button
                      key={group.id}
                      onClick={() => setDrillGroup(group)}
                      className="rounded-2xl border border-gray-200 bg-white p-4 text-left transition-colors active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-main-action"
                      aria-label={`${group.name} 상세 보기`}
                    >
                      <div className="mb-1.5">
                        <span
                          className={cn(
                            "inline-block -ml-1 rounded-full px-2 py-0.5 text-[0.8125rem] font-medium",
                            b.bg,
                            b.text
                          )}
                        >
                          {b.label}
                        </span>
                        <p className="mt-1 text-sm font-semibold leading-snug">{group.name}</p>
                      </div>
                      {leader && (
                        <div className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="truncate">{leader.name}</span>
                          {leader.phone && (
                            <a
                              href={`tel:${leader.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex min-h-11 min-w-11 items-center justify-center"
                              aria-label={`${leader.name} 조장에게 전화`}
                            >
                              <PhoneIcon />
                            </a>
                          )}
                        </div>
                      )}
                      <div
                        className="mb-1 h-2 overflow-hidden rounded-full bg-gray-100"
                        role="progressbar"
                        aria-valuenow={checkedCount}
                        aria-valuemax={totalCount}
                        aria-label={`${checkedCount}/${totalCount}명 탑승`}
                      >
                        <div
                          className="h-full rounded-full bg-complete-check transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {checkedCount} / {totalCount}명
                      </p>
                      {absentCount > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          불참 {absentCount}명
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          </div>
        </DialogContent>
      </Dialog>

      <AdminGroupDrillDown
        group={drillGroup}
        members={scopeMembers}
        checkIns={checkIns}
        activeSchedule={isReadOnly ? null : schedule}
        onClose={() => setDrillGroup(null)}
        onCheckInsChange={onCheckInsChange}
      />
    </>
  );
}