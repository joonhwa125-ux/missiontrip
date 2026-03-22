"use client";

import { formatTime, getScheduleStatus } from "@/lib/utils";
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
  elapsed: number;
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
  elapsed,
  onSummaryTap,
  onActivate,
  onTimeEdit,
}: Props) {
  const status = getScheduleStatus(schedule);
  const timeDisplay = schedule.scheduled_time
    ? formatTime(schedule.scheduled_time)
    : null;

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
            <p className="font-medium">{schedule.title}</p>
            {schedule.location && (
              <p className="text-sm text-muted-foreground">
                {schedule.location}
              </p>
            )}
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              {timeDisplay && <span>{timeDisplay}</span>}
              <span>{elapsed}분 경과</span>
            </div>
          </div>
          <span className="flex-shrink-0 rounded-full bg-main-action px-2 py-0.5 text-xs font-bold">
            진행중
          </span>
        </div>
        <button
          onClick={onSummaryTap}
          className="mt-3 w-full min-h-11 rounded-xl bg-white/60 px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-main-action"
          aria-label="진행중 일정 상세보기"
        >
          <span className="font-medium">
            보고 {reportedCount}/{totalGroups}조 · 확인{" "}
            {checkedCount}/{totalMembers}명
          </span>
          <span className="ml-2 text-muted-foreground">[상세보기 &gt;]</span>
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
            <p className="font-medium">{schedule.title}</p>
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
          <p className="font-medium">{schedule.title}</p>
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
        <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-muted-foreground">
          완료
        </span>
      </div>
      <button
        onClick={onSummaryTap}
        className="mt-3 w-full min-h-11 rounded-xl bg-gray-50 px-3 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-main-action"
        aria-label="완료 일정 상세보기"
      >
        <span className="font-medium">
          &#10003; {checkedCount}/{totalMembers}명
        </span>
        <span className="ml-2 text-muted-foreground">[상세보기 &gt;]</span>
      </button>
    </div>
  );
}
