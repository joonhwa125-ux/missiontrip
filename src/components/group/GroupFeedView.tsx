"use client";

import { useState } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { formatTime, cn, getScheduleStatus, sortSchedulesByStatus, getDefaultDay } from "@/lib/utils";
import DayTabs from "@/components/common/DayTabs";
import { COPY } from "@/lib/constants";
import type { Schedule, CheckIn, Group, GroupMember } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Member = GroupMember;

interface AllMember {
  id: string;
  group_id: string;
}

interface Props {
  schedules: Schedule[];
  activeSchedule: Schedule | null;
  members: Member[];
  checkIns: CheckIn[];
  scheduleCounts: Record<string, number>;
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
  allMembers: AllMember[];
  onEnterCheckin: () => void;
}

// getScheduleStatus는 utils.ts에서 import

export default function GroupFeedView({
  schedules,
  activeSchedule,
  members,
  checkIns,
  scheduleCounts,
  allGroups,
  allCheckIns,
  allMembers,
  onEnterCheckin,
}: Props) {
  const { isOnline, pendingCount } = useOfflineSync();
  const [statusOpen, setStatusOpen] = useState(false);

  const days = Array.from(new Set(schedules.map((s) => s.day_number))).sort();
  const [selectedDay, setSelectedDay] = useState(() => getDefaultDay(schedules));
  const daySchedules = sortSchedulesByStatus(
    schedules.filter((s) => s.day_number === selectedDay)
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 일차 탭 + 일정 타임라인 */}
      <DayTabs days={days} selected={selectedDay} onChange={setSelectedDay} panelId="group-feed-panel" />
      <div id="group-feed-panel" role="tabpanel" className="px-4 py-4">
        <div className="space-y-2">
          {daySchedules.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              members={members}
              checkIns={checkIns}
              scheduleCounts={scheduleCounts}
              onEnterCheckin={onEnterCheckin}
              onStatusOpen={() => setStatusOpen(true)}
            />
          ))}
          {daySchedules.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {COPY.emptySchedule}
            </p>
          )}
        </div>
      </div>

      {/* 전체 조 현황 바텀시트 */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>전체 현황</DialogTitle>
            <DialogDescription>
              {activeSchedule?.title} 기준
            </DialogDescription>
          </DialogHeader>
          <GroupStatusGrid
            allGroups={allGroups}
            allCheckIns={allCheckIns}
            allMembers={allMembers}
          />
        </DialogContent>
      </Dialog>

      {/* 오프라인 배너 (하단 고정) */}
      {!isOnline && (
        <div
          className="fixed bottom-0 left-1/2 w-full max-w-lg -translate-x-1/2 bg-offline-banner px-4 py-2 text-center text-sm"
          aria-live="polite"
          role="status"
        >
          {COPY.offline(pendingCount)}
        </div>
      )}
    </div>
  );
}

// 일정 카드 (진행중/완료/대기)
function ScheduleCard({
  schedule,
  members,
  checkIns,
  scheduleCounts,
  onEnterCheckin,
  onStatusOpen,
}: {
  schedule: Schedule;
  members: Member[];
  checkIns: CheckIn[];
  scheduleCounts: Record<string, number>;
  onEnterCheckin: () => void;
  onStatusOpen: () => void;
}) {
  const status = getScheduleStatus(schedule);
  const timeDisplay = schedule.scheduled_time
    ? formatTime(schedule.scheduled_time)
    : null;
  const total = members.length;

  if (status === "active") {
    const checked = checkIns.filter((c) => !c.is_absent).length;
    return (
      <div
        className={cn(
          "rounded-2xl p-4",
          "bg-main-action/20 ring-2 ring-main-action"
        )}
      >
        <button
          onClick={onEnterCheckin}
          className="w-full text-left min-h-11 focus-visible:ring-2 focus-visible:ring-main-action rounded-lg"
          aria-label={`${schedule.title} 체크인 화면으로 이동`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="font-medium">{schedule.title}</p>
              {schedule.location && (
                <p className="text-sm text-muted-foreground">{schedule.location}</p>
              )}
              {timeDisplay && (
                <p className="mt-0.5 text-sm text-muted-foreground">{timeDisplay}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="flex-shrink-0 rounded-full bg-main-action px-2 py-0.5 text-xs font-medium text-gray-900">
                진행중
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {checked}/{total}명
              </span>
            </div>
          </div>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStatusOpen();
          }}
          className="mt-2 w-full min-h-11 rounded-xl bg-white/60 text-xs font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-main-action"
          aria-label="전체 현황 보기"
        >
          전체 현황 보기 &gt;
        </button>
      </div>
    );
  }

  const completedCount = scheduleCounts[schedule.id] ?? 0;

  return (
    <div
      className={cn(
        "rounded-2xl p-4",
        status === "completed" ? "bg-white opacity-55" : "bg-white"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <p className="font-medium">{schedule.title}</p>
          {schedule.location && (
            <p className="text-sm text-muted-foreground">{schedule.location}</p>
          )}
          {timeDisplay && (
            <p className="mt-0.5 text-sm text-muted-foreground">{timeDisplay}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              status === "completed"
                ? "bg-gray-100 text-muted-foreground"
                : "bg-secondary text-muted-foreground"
            )}
          >
            {status === "completed" ? "완료" : "대기"}
          </span>
          {status === "completed" && total > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <svg
                className="h-3 w-3 text-complete-check"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {completedCount}/{total}명
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// 전체 조 현황 그리드 (읽기 전용)
function GroupStatusGrid({
  allGroups,
  allCheckIns,
  allMembers,
}: {
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
  allMembers: AllMember[];
}) {
  // 조별 인원 수 계산
  const groupMemberCounts = new Map<string, number>();
  for (const m of allMembers) {
    groupMemberCounts.set(m.group_id, (groupMemberCounts.get(m.group_id) ?? 0) + 1);
  }

  // user_id -> group_id 매핑
  const userGroupMap = new Map(allMembers.map((m) => [m.id, m.group_id]));

  // 조별 체크인 수 (불참 제외)
  const groupCheckedCounts = new Map<string, number>();
  for (const c of allCheckIns) {
    if (c.is_absent) continue;
    const gid = userGroupMap.get(c.user_id);
    if (gid) {
      groupCheckedCounts.set(gid, (groupCheckedCounts.get(gid) ?? 0) + 1);
    }
  }

  // bus_name별 그룹핑
  const busGroups = new Map<string, Group[]>();
  for (const g of allGroups) {
    const bus = g.bus_name ?? "미배정";
    if (!busGroups.has(bus)) busGroups.set(bus, []);
    busGroups.get(bus)!.push(g);
  }
  const busEntries = Array.from(busGroups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], "ko")
  );

  return (
    <div className="space-y-3">
      {busEntries.map(([busName, busGroupList]) => (
        <section key={busName}>
          <h3 className="mb-1.5 text-xs font-bold text-muted-foreground">
            {busName}
          </h3>
          <div className="grid grid-cols-2 gap-1.5 [&>*:last-child:nth-child(odd)]:col-span-2">
            {busGroupList.map((g) => {
              const total = groupMemberCounts.get(g.id) ?? 0;
              const checked = groupCheckedCounts.get(g.id) ?? 0;
              const badge = getBadgeStatus(total, checked);
              const progress = total > 0 ? (checked / total) * 100 : 0;
              return (
                <GroupMiniCard
                  key={g.id}
                  name={g.name}
                  checked={checked}
                  total={total}
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
}

type FeedBadgeStatus = "not_started" | "in_progress" | "all_checked";

const FEED_BADGE: Record<FeedBadgeStatus, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-secondary", text: "text-muted-foreground", label: "시작전" },
  in_progress: { bg: "bg-progress-badge", text: "text-[#633806]", label: "진행중" },
  all_checked: { bg: "bg-main-action", text: "text-[#3C1E1E]", label: "전원확인" },
};

function getBadgeStatus(total: number, checked: number): FeedBadgeStatus {
  if (total === 0 || checked === 0) return "not_started";
  if (checked >= total) return "all_checked";
  return "in_progress";
}

function GroupMiniCard({
  name,
  checked,
  total,
  badge,
  progress,
}: {
  name: string;
  checked: number;
  total: number;
  badge: FeedBadgeStatus;
  progress: number;
}) {
  const b = FEED_BADGE[badge];
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="truncate text-sm font-medium">{name}</span>
        <span
          className={cn(
            "flex-shrink-0 rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium leading-tight",
            b.bg,
            b.text
          )}
        >
          {b.label}
        </span>
      </div>
      <div
        className="mb-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={checked}
        aria-valuemax={total}
        aria-label={`${name} ${checked}/${total}명 탑승`}
      >
        <div
          className="h-full rounded-full bg-complete-check transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {checked}/{total}명
      </p>
    </div>
  );
}
