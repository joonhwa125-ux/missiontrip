"use client";

import React, { useState, useEffect, useMemo } from "react";
import { getElapsedMinutes, cn } from "@/lib/utils";
import { COPY } from "@/lib/constants";
import AdminGroupDrillDown from "./AdminGroupDrillDown";
import type { Group, Schedule, GroupBadgeStatus } from "@/lib/types";

interface Member {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  group_id: string;
}
interface CheckIn {
  user_id: string;
  is_absent: boolean;
  checked_at?: string;
}
interface Report {
  group_id: string;
  pending_count: number;
  reported_at: string;
}

interface Props {
  groups: Group[];
  members: Member[];
  activeSchedule: Schedule | null;
  checkIns: CheckIn[];
  reports: Report[];
  onMembersChange: (members: Member[]) => void;
  onCheckInsChange: React.Dispatch<React.SetStateAction<CheckIn[]>>;
}

const BADGE: Record<GroupBadgeStatus, { bg: string; text: string; label: string }> = {
  reported: { bg: "bg-[#EAF3DE]", text: "text-[#27500A]", label: "보고완료" },
  all_checked: { bg: "bg-main-action", text: "text-[#3C1E1E]", label: "전원확인" },
  in_progress: { bg: "bg-progress-badge", text: "text-[#633806]", label: "진행중" },
  not_started: { bg: "bg-secondary", text: "text-muted-foreground", label: "시작전" },
};

function getBadge(
  total: number,
  checked: number,
  hasReport: boolean
): GroupBadgeStatus {
  if (total === 0 || checked === 0) return "not_started";
  if (checked < total) return "in_progress";
  if (hasReport) return "reported";
  return "all_checked";
}

export default function StatusTab({
  groups,
  members,
  activeSchedule,
  checkIns,
  reports,
  onMembersChange,
  onCheckInsChange,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [drillGroup, setDrillGroup] = useState<Group | null>(null);

  useEffect(() => {
    if (!activeSchedule?.activated_at) return;
    setElapsed(getElapsedMinutes(activeSchedule.activated_at));
    const timer = setInterval(
      () => setElapsed(getElapsedMinutes(activeSchedule.activated_at!)),
      60000
    );
    return () => clearInterval(timer);
  }, [activeSchedule?.activated_at]);

  const checkedIds = useMemo(() => new Set(checkIns.map((c) => c.user_id)), [checkIns]);
  const absentIds = useMemo(() => new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id)), [checkIns]);
  const reportMap = useMemo(() => new Map(reports.map((r) => [r.group_id, r])), [reports]);

  const summaries = useMemo(() => groups.map((g) => {
    const gMembers = members.filter((m) => m.group_id === g.id);
    const absentCount = gMembers.filter((m) => absentIds.has(m.id)).length;
    const checkedCount = gMembers.filter((m) => checkedIds.has(m.id) && !absentIds.has(m.id)).length;
    const totalCount = gMembers.length - absentCount;
    const badge = getBadge(totalCount, checkedCount, reportMap.has(g.id));
    const leader = gMembers.find((m) => m.role === "leader");
    return { group: g, gMembers, totalCount, checkedCount, badge, leader };
  }), [groups, members, checkedIds, absentIds, reportMap]);

  const busEntries = useMemo(() => {
    const busGroups = new Map<string, typeof summaries>();
    for (const s of summaries) {
      const bus = s.group.bus_name ?? "미배정";
      if (!busGroups.has(bus)) busGroups.set(bus, []);
      busGroups.get(bus)!.push(s);
    }
    return Array.from(busGroups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "ko")
    );
  }, [summaries]);

  const { reportedCount, inProgressCount, notStartedCount } = useMemo(() => ({
    reportedCount: summaries.filter((s) => s.badge === "reported").length,
    inProgressCount: summaries.filter((s) => ["in_progress", "all_checked"].includes(s.badge)).length,
    notStartedCount: summaries.filter((s) => s.badge === "not_started").length,
  }), [summaries]);

  const totalChecked = useMemo(() => members.filter(
    (m) => checkedIds.has(m.id) && !absentIds.has(m.id)
  ).length, [members, checkedIds, absentIds]);

  return (
    <div className="px-4 py-4">
      {/* 경과 시간 */}
      {activeSchedule?.activated_at && (
        <p className="mb-1 text-sm text-muted-foreground" aria-live="polite">
          {activeSchedule.title} · {elapsed}분 경과
        </p>
      )}

      {/* 전체 인원 요약 */}
      <p className="mb-3 text-sm font-medium" aria-live="polite">
        {COPY.totalSummary(totalChecked, members.length)}
      </p>

      {/* 요약 카드 */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: "보고완료", count: reportedCount, color: "text-[#27500A]" },
          { label: "진행중", count: inProgressCount, color: "text-[#633806]" },
          {
            label: "시작전",
            count: notStartedCount,
            color: "text-muted-foreground",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white p-3 text-center">
            <p className={cn("text-2xl font-bold", s.color)}>{s.count}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 차량별 조 그리드 */}
      {busEntries.map(([busName, busSummaries]) => (
        <section key={busName} className="mb-4">
          <h3 className="mb-2 text-sm font-bold text-muted-foreground">
            {busName}
          </h3>
          <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
            {busSummaries.map(({ group, totalCount, checkedCount, badge, leader }) => {
              const b = BADGE[badge];
              const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
              return (
                <button
                  key={group.id}
                  onClick={() => setDrillGroup(group)}
                  className="rounded-2xl bg-white p-4 text-left focus-visible:ring-2 focus-visible:ring-main-action"
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
                  <div className="mb-1 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={checkedCount} aria-valuemax={totalCount} aria-label={`${checkedCount}/${totalCount}명 탑승`}>
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

      {/* 드릴다운 */}
      <AdminGroupDrillDown
        group={drillGroup}
        members={members}
        checkIns={checkIns}
        activeSchedule={activeSchedule}
        onClose={() => setDrillGroup(null)}
        onMembersChange={onMembersChange}
        onCheckInsChange={onCheckInsChange}
      />
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}
