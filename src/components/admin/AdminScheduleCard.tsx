"use client";

import { formatTime, getScheduleStatus, filterMembersByScope, cn } from "@/lib/utils";
import { CheckIcon } from "@/components/ui/icons";
import { SCOPE_LABEL, COPY } from "@/lib/constants";
import type { Schedule, AdminCheckIn, AdminMember, AdminReport } from "@/lib/types";

interface Props {
  schedule: Schedule;
  checkIns: AdminCheckIn[];
  reports: AdminReport[];
  members: AdminMember[];
  onSummaryTap: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onTimeEdit: () => void;
}

export default function AdminScheduleCard({
  schedule, checkIns, reports, members,
  onSummaryTap, onActivate, onDeactivate, onTimeEdit,
}: Props) {
  const status = getScheduleStatus(schedule);
  const timeDisplay = schedule.scheduled_time ? formatTime(schedule.scheduled_time) : null;
  const scopeLabel = schedule.scope === "rear" ? SCOPE_LABEL[schedule.scope] : null;

  const scopeMembers = filterMembersByScope(members, schedule.scope);
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
    return gTotal === 0 || gChecked >= gTotal;
  }).length;

  const progressPct = totalGroups > 0 ? Math.round((reportedCount / totalGroups) * 100) : 0;
  const allReported = totalGroups > 0 && reportedCount >= totalGroups;

  // location 우선, 없으면 title
  const primaryText = schedule.location ?? schedule.title;

  // 후발 배지
  const scopeBadge = scopeLabel ? (
    <span className="inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[0.625rem] font-bold leading-tight text-violet-700">
      {scopeLabel}
    </span>
  ) : null;

  // 일정 상태 전환 버튼 공통 스타일
  const statusBtnClass =
    "flex-shrink-0 min-h-11 min-w-11 rounded-xl border border-gray-300 px-4 text-xs font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-ring";

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
        className="rounded-2xl ring-2 ring-main-action bg-white p-4 shadow-sm"
        role="region"
        aria-label={`진행중 일정: ${schedule.title}`}
      >
        {/* 헤더: 진행중 pill + 배지 */}
        <div className="mb-3 flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-active-bg px-2.5 py-1 text-xs font-semibold text-status-active-text">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
            진행중
          </span>
          {timeBadge}
          {scopeBadge}
        </div>

        {/* 장소/일정명 + 종료 버튼 (시작 버튼과 동일 위치) */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-base font-semibold leading-snug">{primaryText}</p>
            {subtitle}
          </div>
          <button
            onClick={onDeactivate}
            className={statusBtnClass}
            aria-label={`${schedule.title} 일정 종료`}
          >
            종료
          </button>
        </div>

        {/* 진행률 + 조 수 */}
        <div className="mt-4 flex items-baseline justify-between">
          <p className="text-sm text-stone-600">전체 진행률 {progressPct}%</p>
          <p className="text-sm font-semibold text-stone-800" aria-live="polite">
            {reportedCount}/{totalGroups}조
          </p>
        </div>

        {/* 프로그레스 바 */}
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`조 보고 진행률 ${progressPct}%`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              allReported ? "bg-complete-check" : "bg-progress-bar"
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* 전 조 보고완료 배너 — 항상 렌더링, 내용만 조건부 (aria-live 마운트 타이밍) */}
        <div role="status" aria-live="polite" aria-atomic="true" className="mt-3">
          {allReported && (
            <div className="flex items-center gap-2 rounded-xl bg-status-complete-bg px-3 py-2.5">
              <CheckIcon className="h-4 w-4 text-complete-check" aria-hidden />
              <span className="text-sm font-medium text-status-complete-text">
                {COPY.allReported}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onSummaryTap}
          className="mt-3 w-full min-h-11 rounded-xl border border-stone-200 bg-stone-50 px-4 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 active:bg-stone-200 focus-visible:ring-2 focus-visible:ring-main-action"
          aria-label="현황 보기"
        >
          현황 보기 &gt;
        </button>
      </div>
    );
  }

  if (status === "waiting") {
    return (
      <div
        className="rounded-2xl border border-stone-200 bg-white p-4 transition-shadow hover:shadow-sm"
        role="region"
        aria-label={`예정 일정: ${schedule.title}`}
      >
        {/* 헤더: 예정 배지 + 집결시간 배지 + 후발 배지 */}
        <div className="mb-3 flex items-center gap-1.5 flex-wrap">
          <span className="rounded-full bg-status-pending-bg px-2.5 py-1 text-xs font-semibold text-status-pending-text">
            예정
          </span>
          {timeDisplay ? (
            <button
              onClick={onTimeEdit}
              className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100 focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label={`집결 시간 ${timeDisplay} — 탭하여 수정`}
            >
              집결 {timeDisplay}
            </button>
          ) : (
            <button
              onClick={onTimeEdit}
              className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-400 transition-colors hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-main-action"
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
            <p className="text-base font-semibold text-stone-800">{primaryText}</p>
            {subtitle}
          </div>
          <button
            onClick={onActivate}
            className="flex-shrink-0 min-h-11 min-w-16 rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 active:bg-stone-100 focus-visible:ring-2 focus-visible:ring-ring"
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
      className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4"
      role="region"
      aria-label={`완료 일정: ${schedule.title}`}
    >
      {/* 헤더: 완료 배지 + 집결시간 배지 + 후발 배지 */}
      <div className="mb-3 flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-full bg-status-complete-bg px-2.5 py-1 text-xs font-semibold text-status-complete-text">
          <CheckIcon className="h-3 w-3" aria-hidden />
          완료
        </span>
        {timeDisplay && (
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
            집결 {timeDisplay}
          </span>
        )}
        {scopeBadge}
      </div>

      {/* 장소/일정명 + 통계 */}
      <div>
        <p className="font-semibold text-stone-600">{primaryText}</p>
        {schedule.location ? (
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="text-sm text-stone-500">{schedule.title}</p>
            <p className="flex-shrink-0 flex items-center gap-1 text-sm font-medium text-complete-check" aria-live="polite">
              <CheckIcon className="h-3.5 w-3.5" aria-hidden />
              {reportedCount}/{totalGroups}조
            </p>
          </div>
        ) : (
          <p className="mt-1 flex items-center gap-1 text-sm font-medium text-complete-check" aria-live="polite">
            <CheckIcon className="h-3.5 w-3.5" aria-hidden />
            {reportedCount}/{totalGroups}조
          </p>
        )}
      </div>

      <button
        onClick={onSummaryTap}
        className="mt-3 w-full min-h-11 rounded-xl border border-stone-200 bg-white/60 px-4 text-sm font-medium text-stone-500 transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-main-action"
        aria-label="완료 일정 현황 보기"
      >
        현황 보기 &gt;
      </button>
    </div>
  );
}
