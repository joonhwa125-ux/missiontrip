"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { COPY } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import AdminGroupDrillDown from "./AdminGroupDrillDown";
import type {
  Group,
  Schedule,
  GroupBadgeStatus,
  AdminMember,
  AdminCheckIn,
  AdminReport,
} from "@/lib/types";

type Report = AdminReport;

interface Props {
  schedule: Schedule | null;
  groups: Group[];
  members: AdminMember[];
  checkIns: AdminCheckIn[];
  reports: Report[];
  isReadOnly: boolean;
  onClose: () => void;
  onMembersChange: (members: AdminMember[]) => void;
  onCheckInsChange: React.Dispatch<React.SetStateAction<AdminCheckIn[]>>;
}

const BADGE: Record<GroupBadgeStatus, { bg: string; text: string; label: string }> = {
  reported: { bg: "bg-[#EAF3DE]", text: "text-[#27500A]", label: "보고완료" },
  all_checked: { bg: "bg-main-action", text: "text-[#3C1E1E]", label: "전원확인" },
  in_progress: { bg: "bg-progress-badge", text: "text-[#633806]", label: "진행중" },
  not_started: { bg: "bg-secondary", text: "text-muted-foreground", label: "시작전" },
};

function getBadge(total: number, checked: number, hasReport: boolean): GroupBadgeStatus {
  if (total === 0 || checked === 0) return "not_started";
  if (checked < total) return "in_progress";
  if (hasReport) return "reported";
  return "all_checked";
}

export default function AdminBottomSheet({
  schedule,
  groups,
  members,
  checkIns,
  reports,
  isReadOnly,
  onClose,
  onMembersChange,
  onCheckInsChange,
}: Props) {
  const [drillGroup, setDrillGroup] = useState<Group | null>(null);

  const checkedIds = useMemo(() => new Set(checkIns.map((c) => c.user_id)), [checkIns]);
  const absentIds = useMemo(
    () => new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id)),
    [checkIns]
  );
  const reportMap = useMemo(() => new Map(reports.map((r) => [r.group_id, r])), [reports]);

  // scope 기반 멤버 필터링 (선발/후발 일정은 해당 party만 카운트)
  const scopeMembers = useMemo(() => {
    const scope = schedule?.scope;
    if (!scope || scope === "all") return members;
    return members.filter((m) => m.party === scope);
  }, [schedule?.scope, members]);

  const summaries = useMemo(
    () =>
      groups.map((g) => {
        const gMembers = scopeMembers.filter((m) => m.group_id === g.id);
        const absentCount = gMembers.filter((m) => absentIds.has(m.id)).length;
        const checkedCount = gMembers.filter(
          (m) => checkedIds.has(m.id) && !absentIds.has(m.id)
        ).length;
        const totalCount = gMembers.length - absentCount;
        const badge = getBadge(totalCount, checkedCount, reportMap.has(g.id));
        const leader = gMembers.find((m) => m.role === "leader");
        return { group: g, totalCount, checkedCount, badge, leader };
      }),
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
              <DialogTitle>{schedule?.title} 현황</DialogTitle>
              <DialogDescription aria-live="polite">
                {COPY.totalSummary(totalChecked, scopeMembers.length)}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="overflow-y-auto px-6 pb-6">
          {busEntries.map(([busName, busSummaries]) => (
            <section key={busName} className="mb-4">
              <h3 className="mb-2 text-sm font-bold text-muted-foreground">{busName}</h3>
              <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
                {busSummaries.map(({ group, totalCount, checkedCount, badge, leader }) => {
                  const b = BADGE[badge];
                  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
                  return (
                    <button
                      key={group.id}
                      onClick={() => setDrillGroup(group)}
                      className="rounded-2xl border border-gray-200 bg-white p-4 text-left transition-colors active:bg-gray-50 focus-visible:ring-2 focus-visible:ring-main-action"
                      aria-label={`${group.name} 상세 보기`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-1">
                        <span className="truncate font-semibold">{group.name}</span>
                        <span
                          className={cn(
                            "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                            b.bg,
                            b.text
                          )}
                        >
                          {b.label}
                        </span>
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
        members={members}
        checkIns={checkIns}
        activeSchedule={isReadOnly ? null : schedule}
        onClose={() => setDrillGroup(null)}
        onMembersChange={onMembersChange}
        onCheckInsChange={onCheckInsChange}
      />
    </>
  );
}

function PhoneIcon() {
  return (
    <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}
