"use client";

import { useOfflineSync } from "@/hooks/useOfflineSync";
import { formatTime, cn } from "@/lib/utils";
import { COPY } from "@/lib/constants";
import type { Schedule, CheckIn, Group } from "@/lib/types";

interface Member {
  id: string;
  name: string;
}

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

type ScheduleStatus = "active" | "completed" | "waiting";

function getStatus(s: Schedule): ScheduleStatus {
  if (s.is_active) return "active";
  if (s.activated_at) return "completed";
  return "waiting";
}

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

  const todayDay =
    activeSchedule?.day_number ??
    schedules.find((s) => s.activated_at)?.day_number ??
    1;

  const todaySchedules = schedules.filter((s) => s.day_number === todayDay);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 오늘 일정 타임라인 */}
      <div className="px-4 py-4">
        <h2 className="mb-3 text-sm font-bold text-muted-foreground">
          {todayDay}일차 일정
        </h2>
        <div className="space-y-2">
          {todaySchedules.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              members={members}
              checkIns={checkIns}
              scheduleCounts={scheduleCounts}
              onEnterCheckin={onEnterCheckin}
            />
          ))}
          {todaySchedules.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {COPY.emptySchedule}
            </p>
          )}
        </div>
      </div>

      {/* 전체 조 현황 (활성 일정 있을 때만) */}
      {activeSchedule && (
        <div className="px-4 pb-6">
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            전체 현황
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {activeSchedule.title} 기준
          </p>
          <GroupStatusGrid
            allGroups={allGroups}
            allCheckIns={allCheckIns}
            allMembers={allMembers}
          />
        </div>
      )}

      {/* 오프라인 배너 (하단 고정) */}
      {!isOnline && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-offline-banner px-4 py-2 text-center text-sm"
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
}: {
  schedule: Schedule;
  members: Member[];
  checkIns: CheckIn[];
  scheduleCounts: Record<string, number>;
  onEnterCheckin: () => void;
}) {
  const status = getStatus(schedule);
  const timeDisplay = schedule.scheduled_time
    ? formatTime(schedule.scheduled_time)
    : null;
  const total = members.length;

  if (status === "active") {
    const checked = checkIns.filter((c) => !c.is_absent).length;
    return (
      <button
        onClick={onEnterCheckin}
        className={cn(
          "w-full rounded-2xl p-4 text-left",
          "bg-main-action/20 ring-2 ring-main-action",
          "min-h-11 focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2"
        )}
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
    <div className="rounded-xl bg-white px-3 py-2">
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
