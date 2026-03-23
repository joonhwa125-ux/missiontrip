"use client";

import { formatTime, getScheduleStatus } from "@/lib/utils";
import { SCOPE_LABEL } from "@/lib/constants";
import type { Schedule, AdminCheckIn, AdminMember, Group } from "@/lib/types";

interface Report {
  group_id: string;
  pending_count: number;
  reported_at: string;
}

interface Props {
  schedule: Schedule;
  checkIns: AdminCheckIn[];
  reports: Report[];
  groups: Group[];
  members: AdminMember[];
  onSummaryTap: () => void;
  onActivate: () => void;
  onTimeEdit: () => void;
}

export default function AdminScheduleCard({
  schedule,
  checkIns,
  reports,
  groups,
  members,
  onSummaryTap,
  onActivate,
  onTimeEdit,
}: Props) {
  const status = getScheduleStatus(schedule);
  const timeDisplay = schedule.scheduled_time
    ? formatTime(schedule.scheduled_time)
    : null;
  const scopeLabel = schedule.scope !== "all" ? SCOPE_LABEL[schedule.scope] : null;

  const checkedCount = checkIns.filter((c) => !c.is_absent).length;
  const totalMembers = members.length;
  const reportedCount = new Set(reports.map((r) => r.group_id)).size;
  const totalGroups = groups.length;

  if (status === "active") {
    return (
      <div
        className="rounded-2xl ring-2 ring-main-action bg-main-action/20 p-4"
        role="region"
        aria-label={`진행중 일정: ${schedule.title}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="font-medium">
              {scopeLabel && (
                <span className="mr-1 inline-block rounded bg-gray-700 px-1.5 py-0.5 text-[0.625rem] font-bold leading-tight text-white">
                  {scopeLabel}
                </span>
              )}
              {schedule.title}
            </p>
            {schedule.location && (
              <p className="text-sm text-muted-foreground">
                {schedule.location}
              </p>
            )}
            {timeDisplay && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {timeDisplay}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="flex-shrink-0 rounded-full bg-main-action px-2 py-0.5 text-xs font-bold text-gray-900">
              진행중
            </span>
            <p className="text-sm font-medium" aria-live="polite">
              {reportedCount}/{totalGroups}조
            </p>
            <p className="text-xs text-muted-foreground">
              ({checkedCount}/{totalMembers}명)
            </p>
          </div>
        </div>

        <button
          onClick={onSummaryTap}
          className="mt-2 w-full min-h-11 rounded-xl bg-white/60 text-xs font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-main-action"
          aria-label="전체 현황 보기"
        >
          전체 현황 보기 &gt;
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
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={onTimeEdit}
            className="flex-1 text-left rounded-lg focus-visible:ring-2 focus-visible:ring-main-action"
            aria-label={`${schedule.title} 시간 수정`}
          >
            <p className="font-medium">
              {scopeLabel && (
                <span className="mr-1 inline-block rounded bg-gray-700 px-1.5 py-0.5 text-[0.625rem] font-bold leading-tight text-white">
                  {scopeLabel}
                </span>
              )}
              {schedule.title}
            </p>
            {schedule.location && (
              <p className="text-sm text-muted-foreground">
                {schedule.location}
              </p>
            )}
            {timeDisplay && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {timeDisplay}
              </p>
            )}
          </button>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-muted-foreground">
              대기
            </span>
            <button
              onClick={onActivate}
              className="min-h-11 rounded-xl bg-gray-900 px-3 text-xs font-bold text-white focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${schedule.title} 활성화`}
            >
              활성화
            </button>
          </div>
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
          <p className="font-medium">
            {scopeLabel && (
              <span className="mr-1 inline-block rounded bg-gray-700 px-1.5 py-0.5 text-[0.625rem] font-bold leading-tight text-white">
                {scopeLabel}
              </span>
            )}
            {schedule.title}
          </p>
          {schedule.location && (
            <p className="text-sm text-muted-foreground">
              {schedule.location}
            </p>
          )}
          {timeDisplay && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {timeDisplay}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            완료
          </span>
          <p className="flex items-center gap-0.5 text-sm font-medium text-muted-foreground">
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
