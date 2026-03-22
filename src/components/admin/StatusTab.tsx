"use client";

import { useState, useEffect } from "react";
import { getElapsedMinutes, cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  const checkedIds = new Set(checkIns.map((c) => c.user_id));
  const absentIds = new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id));
  const reportMap = new Map(reports.map((r) => [r.group_id, r]));

  const summaries = groups.map((g) => {
    const gMembers = members.filter((m) => m.group_id === g.id);
    const absentCount = gMembers.filter((m) => absentIds.has(m.id)).length;
    const checkedCount = gMembers.filter((m) => checkedIds.has(m.id) && !absentIds.has(m.id)).length;
    const totalCount = gMembers.length - absentCount;
    const badge = getBadge(totalCount, checkedCount, reportMap.has(g.id));
    const leader = gMembers.find((m) => m.role === "leader");
    return { group: g, gMembers, totalCount, checkedCount, badge, leader };
  });

  // bus_name별 그룹핑
  const busGroups = new Map<string, typeof summaries>();
  for (const s of summaries) {
    const bus = s.group.bus_name ?? "미배정";
    if (!busGroups.has(bus)) busGroups.set(bus, []);
    busGroups.get(bus)!.push(s);
  }
  const busEntries = Array.from(busGroups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], "ko")
  );

  const reportedCount = summaries.filter((s) => s.badge === "reported").length;
  const inProgressCount = summaries.filter((s) =>
    ["in_progress", "all_checked"].includes(s.badge)
  ).length;
  const notStartedCount = summaries.filter((s) => s.badge === "not_started").length;

  const drillMembers = drillGroup
    ? members.filter((m) => m.group_id === drillGroup.id)
    : [];

  return (
    <div className="px-4 py-4">
      {/* 경과 시간 */}
      {activeSchedule?.activated_at && (
        <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
          {activeSchedule.title} · {elapsed}분 경과
        </p>
      )}

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
          <div className="grid grid-cols-2 gap-2">
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
                          <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
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

      {/* 드릴다운 다이얼로그 */}
      <Dialog open={!!drillGroup} onOpenChange={(o) => !o && setDrillGroup(null)}>
        <DialogContent className="max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{drillGroup?.name} 미탑승 인원</DialogTitle>
          </DialogHeader>
          {(() => {
            const unchecked = drillMembers.filter((m) => !checkedIds.has(m.id));
            return unchecked.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                전원 확인 완료
              </p>
            ) : (
              <ul className="space-y-2">
                {unchecked.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5"
                  >
                    <span className="font-medium">{m.name}</span>
                    {m.phone && (
                      <a
                        href={`tel:${m.phone}`}
                        className="flex min-h-11 min-w-11 items-center justify-center"
                        aria-label={`${m.name}에게 전화`}
                      >
                        <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
