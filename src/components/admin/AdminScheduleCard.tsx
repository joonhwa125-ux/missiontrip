"use client";

import { formatTime, getScheduleStatus, filterMembersByScope } from "@/lib/utils";
import { CheckIcon } from "@/components/ui/icons";
import { SCOPE_LABEL } from "@/lib/constants";
import type { Schedule, AdminCheckIn, AdminMember, AdminReport } from "@/lib/types";

interface Props {
  schedule: Schedule;
  checkIns: AdminCheckIn[];
  reports: AdminReport[];
  members: AdminMember[];
  onSummaryTap: () => void;
  onActivate: () => void;
  onTimeEdit: () => void;
}

export default function AdminScheduleCard({
  schedule, checkIns, reports, members,
  onSummaryTap, onActivate, onTimeEdit,
}: Props) {
  const status = getScheduleStatus(schedule);
  const timeDisplay = schedule.scheduled_time ? formatTime(schedule.scheduled_time) : null;
  const scopeLabel = schedule.scope === "rear" ? SCOPE_LABEL[schedule.scope] : null;

  const scopeMembers = filterMembersByScope(members, schedule.scope);
  const checkedCount = checkIns.filter((c) => !c.is_absent).length;
  const totalMembers = scopeMembers.length;
  const reportedCount = new Set(reports.map((r) => r.group_id)).size;
  const scopeGroupIds = new Set(scopeMembers.map((m) => m.group_id));
  const totalGroups = scopeGroupIds.size;
  const progressPct = totalGroups > 0 ? Math.round((reportedCount / totalGroups) * 100) : 0;

  // location 우선, 없으면 title
  const primaryText = schedule.location ?? schedule.title;

  // 후발 배지
  const scopeBadge = scopeLabel ? (
    <span className="mr-1 inline-block rounded bg-orange-100 px-1.5 py-0.5 text-[0.625rem] font-bold leading-tight text-orange-800">
      {scopeLabel}
    </span>
  ) : null;

  // 대기/완료 카드 서브텍스트: "일정명 · 집결 HH:MM"
  const metaLine = (schedule.location || timeDisplay) ? (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
      {schedule.location && <span>{schedule.title}</span>}
      {schedule.location && timeDisplay && <span aria-hidden="true">·</span>}
      {timeDisplay && <span>집결 {timeDisplay}</span>}
    </p>
  ) : null;

  if (status === "active") {
    return (
      <div
        className="rounded-2xl ring-2 ring-main-action bg-white p-4"
        role="region"
        aria-label={`진행중 일정: ${schedule.title}`}
      >
        {/* 헤더: 진행중 pill + 집결 시간 */}
        <div className="mb-2 flex items-center justify-between">
          <span className="rounded-full bg-main-action px-2 py-0.5 text-xs font-bold text-gray-900">
            진행중
          </span>
          {timeDisplay && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              집결 {timeDisplay}
            </span>
          )}
        </div>

        {/* 장소 (primary) + 일정명 (secondary) */}
        <p className="text-base font-semibold leading-snug">
          {scopeBadge}{primaryText}
        </p>
        {schedule.location && (
          <p className="mt-0.5 text-sm text-muted-foreground">{schedule.title}</p>
        )}

        {/* 통계 */}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm font-medium" aria-live="polite">
            {reportedCount}/{totalGroups}조{" "}
            <span className="text-xs font-normal text-muted-foreground">보고완료</span>
          </p>
          <p className="text-sm text-muted-foreground">{checkedCount}/{totalMembers}명</p>
        </div>

        {/* 프로그레스 바 */}
        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`조 보고 진행률 ${progressPct}%`}
        >
          <div
            className="h-full rounded-full bg-main-action transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">전체 진행률 {progressPct}%</p>
          <p className="text-xs text-muted-foreground">{totalGroups - reportedCount}조 대기 중</p>
        </div>

        <button
          onClick={onSummaryTap}
          className="mt-3 w-full min-h-11 rounded-xl bg-gray-50 text-xs font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-main-action"
          aria-label="전체 현황 보기"
        >
          전체 현황 보기 →
        </button>
      </div>
    );
  }

  if (status === "waiting") {
    return (
      <div
        className="rounded-2xl bg-white p-4"
        role="region"
        aria-label={`대기 일정: ${schedule.title}`}
      >
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={onTimeEdit}
            className="flex-1 text-left rounded-lg focus-visible:ring-2 focus-visible:ring-main-action"
            aria-label={`${schedule.title} 시간 수정`}
          >
            <p className="font-medium">{scopeBadge}{primaryText}</p>
            {metaLine}
          </button>
          <button
            onClick={onActivate}
            className="flex-shrink-0 min-h-11 rounded-xl border border-gray-300 px-3 text-xs font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${schedule.title} 활성화`}
          >
            활성화
          </button>
        </div>
      </div>
    );
  }

  // completed
  return (
    <div
      className="rounded-2xl bg-white p-4 opacity-55"
      role="region"
      aria-label={`완료 일정: ${schedule.title}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="font-medium">{scopeBadge}{primaryText}</p>
          {metaLine}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            완료
          </span>
          <p className="flex items-center gap-0.5 text-sm font-medium text-muted-foreground">
            <CheckIcon className="h-3 w-3 text-complete-check" aria-hidden />
            {reportedCount}/{totalGroups}조
          </p>
          <p className="text-xs text-muted-foreground">
            ({checkedCount}/{totalMembers}명)
          </p>
        </div>
      </div>
      <button
        onClick={onSummaryTap}
        className="mt-2 w-full min-h-11 rounded-xl bg-gray-50 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-main-action"
        aria-label="완료 일정 현황 보기"
      >
        현황 보기 &gt;
      </button>
    </div>
  );
}
