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
  const scopeMemberIds = new Set(scopeMembers.map((m) => m.id));
  const checkedCount = checkIns.filter((c) => !c.is_absent && scopeMemberIds.has(c.user_id)).length;
  const absentCount = checkIns.filter((c) => c.is_absent && scopeMemberIds.has(c.user_id)).length;
  const totalMembers = scopeMembers.length;
  const scopeGroupIds = new Set(scopeMembers.map((m) => m.group_id));
  const totalGroups = scopeGroupIds.size;

  const reportMap = new Set(reports.map((r) => r.group_id));
  const checkedIds = new Set(checkIns.filter((c) => !c.is_absent).map((c) => c.user_id));
  const absentIds = new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id));
  const reportedCount = Array.from(scopeGroupIds).filter((gid) => {
    if (!reportMap.has(gid)) return false;
    const gMembers = scopeMembers.filter((m) => m.group_id === gid);
    const gAbsent = gMembers.filter((m) => absentIds.has(m.id)).length;
    const gChecked = gMembers.filter((m) => checkedIds.has(m.id)).length;
    const gTotal = gMembers.length - gAbsent;
    return gTotal > 0 && gChecked >= gTotal;
  }).length;

  const progressPct = totalGroups > 0 ? Math.round((reportedCount / totalGroups) * 100) : 0;

  // location 우선, 없으면 title
  const primaryText = schedule.location ?? schedule.title;

  // 후발 배지
  const scopeBadge = scopeLabel ? (
    <span className="inline-block rounded bg-orange-100 px-1.5 py-0.5 text-[0.625rem] font-bold leading-tight text-orange-800">
      {scopeLabel}
    </span>
  ) : null;

  // 부제목: location이 있을 때 title을 보조로 (시간 제거 — 헤더 배지로 이동)
  const subtitle = schedule.location ? (
    <p className="mt-0.5 text-sm text-muted-foreground">{schedule.title}</p>
  ) : null;

  // 공통 시간 배지 — 집결 시간 (active 카드 우측)
  const timeBadge = timeDisplay ? (
    <button
      onClick={onTimeEdit}
      className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 focus-visible:ring-2 focus-visible:ring-main-action"
      aria-label={`집결 시간 ${timeDisplay} — 탭하여 수정`}
    >
      집결 {timeDisplay}
    </button>
  ) : (
    <button
      onClick={onTimeEdit}
      className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-400 focus-visible:ring-2 focus-visible:ring-main-action"
      aria-label="집결 시간 추가"
    >
      + 시간 추가
    </button>
  );

  if (status === "active") {
    return (
      <div
        className="rounded-2xl ring-2 ring-main-action bg-white p-4"
        role="region"
        aria-label={`진행중 일정: ${schedule.title}`}
      >
        {/* 헤더: 진행중 pill + 집결시간 배지 + 후발 배지 (모두 좌측) */}
        <div className="mb-2 flex items-center gap-1">
          <span className="rounded-full bg-progress-badge px-2 py-0.5 text-xs font-bold text-[#633806]">
            진행중
          </span>
          {timeBadge}
          {scopeBadge}
        </div>

        {/* 장소 (primary) + 일정명 (secondary) */}
        <p className="text-base font-semibold leading-snug">{primaryText}</p>
        {subtitle}

        {/* 진행률 + 조·명 수 */}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">전체 진행률 {progressPct}%</p>
          <p className="text-sm font-medium" aria-live="polite">
            {reportedCount}/{totalGroups}조
            <span className="font-normal text-muted-foreground"> ({checkedCount}/{totalMembers}명)</span>
          </p>
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

        {/* 불참 (있을 때만) */}
        {absentCount > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">불참 {absentCount}명</p>
        )}

        <button
          onClick={onSummaryTap}
          className="mt-3 w-full min-h-11 rounded-xl bg-gray-50 px-4 text-xs font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-main-action"
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
        aria-label={`예정 일정: ${schedule.title}`}
      >
        {/* 헤더: 예정 배지 + 집결시간 배지 + 후발 배지 */}
        <div className="mb-2 flex items-center gap-1">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            예정
          </span>
          {timeDisplay ? (
            <button
              onClick={onTimeEdit}
              className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label={`집결 시간 ${timeDisplay} — 탭하여 수정`}
            >
              집결 {timeDisplay}
            </button>
          ) : (
            <button
              onClick={onTimeEdit}
              className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-400 focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="집결 시간 추가"
            >
              + 시간
            </button>
          )}
          {scopeBadge}
        </div>

        {/* 장소/일정명 + 시작 버튼 (우하단) */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-medium">{primaryText}</p>
            {subtitle}
          </div>
          <button
            onClick={onActivate}
            className="flex-shrink-0 min-h-11 rounded-xl border border-gray-300 px-4 text-xs font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${schedule.title} 체크인 시작`}
          >
            시작
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
      {/* 헤더: 완료 배지 + 집결시간 배지 + 후발 배지 */}
      <div className="mb-2 flex items-center gap-1">
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

      {/* 장소/일정명 (좌) + 통계 (우) */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="font-medium">{primaryText}</p>
          {subtitle}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-0.5 text-muted-foreground" aria-live="polite">
          <p className="flex items-center gap-0.5 text-sm font-medium">
            <CheckIcon className="h-3 w-3 text-complete-check" aria-hidden />
            {reportedCount}/{totalGroups}조
          </p>
          <p className="text-xs">({checkedCount}/{totalMembers}명)</p>
        </div>
      </div>

      <button
        onClick={onSummaryTap}
        className="mt-2 w-full min-h-11 rounded-xl bg-gray-50 px-4 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-main-action"
        aria-label="완료 일정 현황 보기"
      >
        현황 보기 &gt;
      </button>
    </div>
  );
}
