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
  onSummaryTap: () => void;
  onActivate: () => void;
  onTimeEdit: () => void;
}

// Mini Ring Gauge — SVG 원형 프로그레스
function RingGauge({
  value,
  max,
  label,
  color,
}: {
  value: number;
  max: number;
  label: string;
  color: string;
}) {
  const size = 48;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? value / max : 0;
  const offset = circumference * (1 - ratio);
  const percent = max > 0 ? Math.round(ratio * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          {/* 배경 원 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-gray-200"
          />
          {/* 프로그레스 원 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-all duration-500"
          />
        </svg>
        {/* 중앙 퍼센트 */}
        <span
          className="absolute inset-0 flex items-center justify-center text-xs font-bold"
          aria-label={`${label} ${value}/${max} (${percent}%)`}
        >
          {percent}%
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {label} {value}/{max}
      </span>
    </div>
  );
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
            {timeDisplay && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {timeDisplay}
              </p>
            )}
          </div>
          <span className="flex-shrink-0 rounded-full bg-main-action px-2 py-0.5 text-xs font-bold text-gray-900">
            진행중
          </span>
        </div>

        {/* Ring Gauge 지표 */}
        <div
          className="mt-3 flex items-center justify-center gap-8"
          aria-live="polite"
        >
          <RingGauge
            value={reportedCount}
            max={totalGroups}
            label="보고"
            color="#00C471"
          />
          <RingGauge
            value={checkedCount}
            max={totalMembers}
            label="확인"
            color="#FEE500"
          />
        </div>

        <button
          onClick={onSummaryTap}
          className="mt-3 w-full min-h-11 rounded-xl bg-white/60 text-xs font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-main-action"
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

  // completed — 완료 카드에도 작은 링 게이지 표시
  const completedRatio = totalMembers > 0 ? checkedCount / totalMembers : 0;
  const completedPercent = Math.round(completedRatio * 100);

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
        <div className="flex flex-col items-end gap-1">
          <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            완료
          </span>
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
            {completedPercent}% · {checkedCount}/{totalMembers}명
          </span>
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
