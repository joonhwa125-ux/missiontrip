"use client";

import { formatTime, getScheduleStatus, filterMembersByScope } from "@/lib/utils";
import { CheckIcon } from "@/components/ui/icons";
import { SCOPE_LABEL, getReportedLabel } from "@/lib/constants";
import type { Schedule, AdminCheckIn, AdminMember, AdminReport, AdminShuttleReport } from "@/lib/types";

interface Props {
  schedule: Schedule;
  checkIns: AdminCheckIn[];
  reports: AdminReport[];
  shuttleReports: AdminShuttleReport[];
  members: AdminMember[];
  onSummaryTap: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onTimeEdit: () => void;
}

export default function AdminScheduleCard({
  schedule, checkIns, reports, shuttleReports, members,
  onSummaryTap, onActivate, onDeactivate, onTimeEdit,
}: Props) {
  const status = getScheduleStatus(schedule);
  const timeDisplay = schedule.scheduled_time ? formatTime(schedule.scheduled_time) : null;
  const scopeLabel = schedule.scope === "rear" ? SCOPE_LABEL[schedule.scope] : null;

  const isShuttle = !!schedule.shuttle_type;
  const unit = isShuttle ? "차량" : "조";
  const scopeMembers = filterMembersByScope(members, schedule.scope);
  const checkedIds = new Set(checkIns.filter((c) => !c.is_absent).map((c) => c.user_id));
  const absentIds = new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id));

  let totalUnits: number;
  let reportedCount: number;

  if (isShuttle) {
    const busField = schedule.shuttle_type === "departure" ? "shuttle_bus" : "return_shuttle_bus";
    const allBuses = new Set(
      scopeMembers.map((m) => m[busField]).filter((b): b is string => !!b)
    );
    totalUnits = allBuses.size;
    const reportedBuses = new Set(shuttleReports.map((r) => r.shuttle_bus));
    reportedCount = Array.from(allBuses).filter((bus) => {
      if (!reportedBuses.has(bus)) return false;
      const bm = scopeMembers.filter((m) => m[busField] === bus);
      const bAbs = bm.filter((m) => absentIds.has(m.id)).length;
      const bChk = bm.filter((m) => checkedIds.has(m.id)).length;
      return (bm.length - bAbs) === 0 || bChk >= (bm.length - bAbs);
    }).length;
  } else {
    const scopeGroupIds = new Set(scopeMembers.map((m) => m.group_id));
    totalUnits = scopeGroupIds.size;
    const reportMap = new Set(reports.map((r) => r.group_id));
    reportedCount = Array.from(scopeGroupIds).filter((gid) => {
      if (!reportMap.has(gid)) return false;
      const gMembers = scopeMembers.filter((m) => m.group_id === gid);
      const gAbsent = gMembers.filter((m) => absentIds.has(m.id)).length;
      const gChecked = gMembers.filter((m) => checkedIds.has(m.id)).length;
      const gTotal = gMembers.length - gAbsent;
      return gTotal === 0 || gChecked >= gTotal;
    }).length;
  }

  const progressPct = totalUnits > 0 ? Math.round((reportedCount / totalUnits) * 100) : 0;
  const allReported = totalUnits > 0 && reportedCount >= totalUnits;

  // location 우선, 없으면 title
  const primaryText = schedule.location ?? schedule.title;

  // 후발 배지 (완료 시 stone 톤 dim)
  const isCompleted = status === "completed";
  const scopeBadge = scopeLabel ? (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[0.625rem] font-bold leading-tight ${isCompleted ? "bg-stone-100 text-stone-400" : "bg-violet-100 text-violet-700"}`}>
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
        className="rounded-2xl ring-2 ring-main-action bg-white shadow-sm p-4"
        role="region"
        aria-label={`진행중 일정: ${schedule.title}`}
      >
        {/* 헤더: 진행중 pill + 배지 */}
        <div className="mb-2 flex items-center gap-1">
          <span className="rounded-full bg-progress-badge px-2 py-0.5 text-xs font-medium text-yellow-900">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1 align-middle animate-pulse" aria-hidden="true" />
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
            className="flex-shrink-0 min-h-11 min-w-11 rounded-xl border border-rose-300 px-4 text-xs font-medium text-rose-500 focus-visible:ring-2 focus-visible:ring-rose-300"
            aria-label={`${schedule.title} 일정 종료`}
          >
            종료
          </button>
        </div>

        {/* 진행률 + 단위 수 */}
        <div className="mt-3 flex items-baseline justify-between">
          <p className="text-xs text-muted-foreground">전체 진행률 {progressPct}%</p>
          <p className="text-xs font-medium text-gray-700" aria-live="polite">
            {reportedCount}/{totalUnits}{unit}
          </p>
        </div>

        {/* 프로그레스 바 */}
        <div
          className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${unit} 보고 진행률 ${progressPct}%`}
        >
          <div
            className="h-full rounded-full bg-progress-bar transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* 전 단위 보고완료 배너 — 항상 렌더링, 내용만 조건부 (aria-live 마운트 타이밍) */}
        <div role="status" aria-live="polite" aria-atomic="true" className="mt-2">
          {allReported && (
            <div className="flex items-center rounded-xl bg-[#EAF3DE] px-3 py-2">
              <span className="text-xs font-medium text-[#27500A]">
                {getReportedLabel(reportedCount, totalUnits, unit)}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onSummaryTap}
          className="mt-2 w-full min-h-11 rounded-xl border border-stone-200 bg-gray-50 px-4 text-xs font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-main-action"
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
        className="rounded-2xl bg-white shadow-sm p-4"
        role="region"
        aria-label={`예정 일정: ${schedule.title}`}
      >
        {/* 헤더: 예정 배지 + 집결시간 배지 + 후발 배지 */}
        <div className="mb-2 flex items-center gap-1">
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
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
            className={statusBtnClass}
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
      className="rounded-2xl bg-stone-50/80 shadow-sm p-4"
      role="region"
      aria-label={`완료 일정: ${schedule.title}`}
    >
      {/* 헤더: 완료 배지 + 집결시간 배지 + 후발 배지 */}
      <div className="mb-2 flex items-center gap-1">
        <span className="inline-flex items-center gap-0.5 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
          <CheckIcon className="h-3 w-3" aria-hidden />
          완료
        </span>
        {timeDisplay && (
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-400">
            집결 {timeDisplay}
          </span>
        )}
        {scopeBadge}
      </div>

      {/* 장소/일정명 + 통계 */}
      <div>
        <p className="font-medium">{primaryText}</p>
        {schedule.location ? (
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <p className="text-sm text-muted-foreground">{schedule.title}</p>
            <p className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
              <CheckIcon className="h-3 w-3 text-stone-400" aria-hidden />
              {reportedCount}/{totalUnits}{unit}
            </p>
          </div>
        ) : (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
            <CheckIcon className="h-3 w-3 text-stone-400" aria-hidden />
            {reportedCount}/{totalUnits}{unit}
          </p>
        )}
      </div>

      <button
        onClick={onSummaryTap}
        className="mt-2 w-full min-h-11 rounded-xl border border-stone-200 bg-gray-50 px-4 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-main-action"
        aria-label="완료 일정 현황 보기"
      >
        현황 보기 &gt;
      </button>
    </div>
  );
}
