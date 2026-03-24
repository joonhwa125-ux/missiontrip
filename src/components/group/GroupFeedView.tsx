"use client";

import { useState, useMemo } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { formatTime, cn, getScheduleStatus, sortSchedulesByStatus, getDefaultDay, getGroupBadgeStatus, filterMembersByScope } from "@/lib/utils";
import PageHeader from "@/components/common/PageHeader";
import DayTabs from "@/components/common/DayTabs";
import { CheckIcon } from "@/components/ui/icons";
import { COPY, GROUP_BADGE_STYLE, isLeaderRole, SCOPE_LABEL } from "@/lib/constants";
import type { Schedule, CheckIn, Group, GroupMember, GroupMemberBrief, GroupBadgeStatus } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Member = GroupMember;

interface Props {
  groupName: string;
  schedules: Schedule[];
  activeSchedule: Schedule | null;
  members: Member[];
  checkIns: CheckIn[];
  scheduleCounts: Record<string, number>;
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
  allMembers: GroupMemberBrief[];
  allReports: { group_id: string }[];
  onEnterCheckin: () => void;
}

// getScheduleStatus는 utils.ts에서 import

export default function GroupFeedView({
  groupName,
  schedules,
  activeSchedule,
  members,
  checkIns,
  scheduleCounts,
  allGroups,
  allCheckIns,
  allMembers,
  allReports,
  onEnterCheckin,
}: Props) {
  const { isOnline, pendingCount } = useOfflineSync();
  const [statusOpen, setStatusOpen] = useState(false);

  // scope 필터: 조 내에 해당 party 멤버가 있는 일정만 표시
  const hasAdvance = members.some((m) => m.party === "advance");
  const hasRear = members.some((m) => m.party === "rear");
  const mySchedules = schedules.filter(
    (s) =>
      s.scope === "all" ||
      (s.scope === "advance" && hasAdvance) ||
      (s.scope === "rear" && hasRear)
  );
  const days = useMemo(
    () => Array.from(new Set(mySchedules.map((s) => s.day_number))).sort(),
    [mySchedules]
  );
  const [selectedDay, setSelectedDay] = useState(() => getDefaultDay(mySchedules));
  const daySchedules = sortSchedulesByStatus(
    mySchedules.filter((s) => s.day_number === selectedDay)
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 통일 헤더 */}
      <PageHeader
        superTitle="2026 링키지랩 미션트립"
        title="혼디모영"
        titleNode={
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span>🍊 혼디모영</span>
            <span className="flex-shrink-0 rounded-full bg-gray-900 px-2 py-0.5 font-semibold text-white text-[clamp(0.6875rem,2.5vw,0.875rem)]">
              {groupName} 조장
            </span>
          </span>
        }
      />

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
        <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden p-0">
          <div className="flex-shrink-0 px-6 pt-6">
            <DialogHeader>
              <DialogTitle>전체 현황</DialogTitle>
              <DialogDescription>
                {activeSchedule?.location ?? activeSchedule?.title ?? "대기 중"} 기준
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="overflow-y-auto px-6 pb-6">
            <GroupStatusGrid
              allGroups={allGroups}
              allCheckIns={allCheckIns}
              allMembers={allMembers}
              allReports={allReports}
              scope={activeSchedule?.scope ?? "all"}
            />
          </div>
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
  const timeDisplay = schedule.scheduled_time ? formatTime(schedule.scheduled_time) : null;
  const scopeMembers = filterMembersByScope(members, schedule.scope);
  const total = scopeMembers.length;

  // location 우선, 없으면 title
  const primaryText = schedule.location ?? schedule.title;

  // 후발 배지 (waiting 카드 헤더용)
  const scopeLabel = schedule.scope === "rear" ? SCOPE_LABEL[schedule.scope] : null;
  const scopeBadge = scopeLabel ? (
    <span className="inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[0.625rem] font-bold leading-tight text-violet-700">
      {scopeLabel}
    </span>
  ) : null;

  if (status === "active") {
    const checked = checkIns.filter((c) => !c.is_absent).length;
    const absentCount = checkIns.filter((c) => c.is_absent).length;
    const effectiveTotal = total - absentCount;
    return (
      <div className="rounded-2xl bg-white ring-2 ring-main-action p-4">
        <button
          onClick={onEnterCheckin}
          className="w-full text-left min-h-11 focus-visible:ring-2 focus-visible:ring-main-action rounded-lg"
          aria-label={`${schedule.title} 체크인 화면으로 이동`}
        >
          {/* 헤더: 진행중 pill + 집결시간 배지 + 후발 배지 (모두 좌측) */}
          <div className="mb-2 flex items-center gap-1">
            <span className="rounded-full bg-progress-badge px-2 py-0.5 text-xs font-bold text-[#633806]">
              진행중
            </span>
            {timeDisplay && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                집결 {timeDisplay}
              </span>
            )}
            {scopeBadge}
          </div>
          <p className="text-base font-semibold leading-snug">{primaryText}</p>
          {schedule.location && (
            <p className="mt-0.5 text-sm text-muted-foreground">{schedule.title}</p>
          )}
          <p className="mt-1.5 text-sm font-medium" aria-live="polite">
            {checked}/{effectiveTotal}명 탑승 완료
          </p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
            aria-valuenow={checked}
            aria-valuemax={effectiveTotal}
            aria-label={`${checked}/${effectiveTotal}명 탑승`}
          >
            <div
              className="h-full rounded-full bg-complete-check transition-all"
              style={{ width: effectiveTotal > 0 ? `${Math.round((checked / effectiveTotal) * 100)}%` : "0%" }}
            />
          </div>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onStatusOpen(); }}
          className="mt-2 w-full min-h-11 rounded-xl bg-gray-50 text-xs font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-main-action"
          aria-label="전체 현황 보기"
        >
          전체 현황 보기 &gt;
        </button>
      </div>
    );
  }

  if (status === "waiting") {
    return (
      <div className="rounded-2xl bg-white p-4">
        {/* 헤더: 예정 배지 + 집결시간 배지 + 후발 배지 */}
        <div className="mb-1.5 flex items-center gap-1">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            예정
          </span>
          {timeDisplay && (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
              집결 {timeDisplay}
            </span>
          )}
          {scopeBadge}
        </div>
        <p className="font-medium">{primaryText}</p>
        {schedule.location && (
          <p className="mt-0.5 text-sm text-muted-foreground">{schedule.title}</p>
        )}
      </div>
    );
  }

  const completedCount = scheduleCounts[schedule.id] ?? 0;

  return (
    <div className="rounded-2xl bg-white p-4 opacity-55">
      {/* 헤더: 완료 배지 + 집결시간 배지 + 후발 배지 */}
      <div className="mb-1.5 flex items-center gap-1">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          완료
        </span>
        {timeDisplay && (
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
            집결 {timeDisplay}
          </span>
        )}
        {scopeBadge}
      </div>
      {/* 장소/일정명 (좌) + 카운트 (우하단) */}
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="font-medium">{primaryText}</p>
          {schedule.location && (
            <p className="mt-0.5 text-sm text-muted-foreground">{schedule.title}</p>
          )}
        </div>
        {total > 0 && (
          <span className="flex-shrink-0 flex items-center gap-0.5 text-xs text-muted-foreground">
            <CheckIcon className="h-3 w-3 text-complete-check" aria-hidden />
            {completedCount}/{total}명
          </span>
        )}
      </div>
    </div>
  );
}

// 전체 조 현황 그리드 (읽기 전용)
function GroupStatusGrid({
  allGroups,
  allCheckIns,
  allMembers,
  allReports,
  scope,
}: {
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
  allMembers: GroupMemberBrief[];
  allReports: { group_id: string }[];
  scope: "all" | "advance" | "rear";
}) {
  const reportedIds = new Set(allReports.map((r) => r.group_id));
  const scopeMembers = filterMembersByScope(allMembers, scope);
  // 조별 인원 수 계산
  const groupMemberCounts = new Map<string, number>();
  for (const m of scopeMembers) {
    groupMemberCounts.set(m.group_id, (groupMemberCounts.get(m.group_id) ?? 0) + 1);
  }

  // user_id -> group_id 매핑
  const userGroupMap = new Map(allMembers.map((m) => [m.id, m.group_id]));

  // 조별 조장 이름
  const groupLeaderMap = new Map<string, string>();
  for (const m of allMembers) {
    if (isLeaderRole(m.role)) groupLeaderMap.set(m.group_id, m.name);
  }

  // 조별 체크인 수 (불참 제외) + 조별 불참 수
  const groupCheckedCounts = new Map<string, number>();
  const groupAbsentCounts = new Map<string, number>();
  for (const c of allCheckIns) {
    const gid = userGroupMap.get(c.user_id);
    if (!gid) continue;
    if (c.is_absent) {
      groupAbsentCounts.set(gid, (groupAbsentCounts.get(gid) ?? 0) + 1);
    } else {
      groupCheckedCounts.set(gid, (groupCheckedCounts.get(gid) ?? 0) + 1);
    }
  }

  // 멤버가 0명인 그룹 제외 후 bus_name별 그룹핑
  const nonEmptyGroups = allGroups.filter((g) => (groupMemberCounts.get(g.id) ?? 0) > 0);
  const busGroups = new Map<string, Group[]>();
  for (const g of nonEmptyGroups) {
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
              const rawTotal = groupMemberCounts.get(g.id) ?? 0;
              const absent = groupAbsentCounts.get(g.id) ?? 0;
              const total = rawTotal - absent;
              const checked = groupCheckedCounts.get(g.id) ?? 0;
              const badge = getGroupBadgeStatus(total, checked, reportedIds.has(g.id));
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
}

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
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
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
        {checked}/{rawTotal}명{absent > 0 ? ` (불참 ${absent})` : ""}
      </p>
    </div>
  );
}
