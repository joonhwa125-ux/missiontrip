import { formatTime, getScheduleStatus, filterMembersByScope } from "@/lib/utils";
import { CheckIcon } from "@/components/ui/icons";
import { SCOPE_LABEL } from "@/lib/constants";
import type { Schedule, CheckIn, GroupMember } from "@/lib/types";

interface Props {
  schedule: Schedule;
  members: GroupMember[];
  checkIns: CheckIn[];
  scheduleCounts: Record<string, number>;
  scheduleAbsentCounts: Record<string, number>;
  onEnterCheckin: () => void;
  onStatusOpen: () => void;
  reportInfo?: { reported: number; total: number; unit: "조" | "차량" | "대" };
}

export default function ScheduleCard({
  schedule,
  members,
  checkIns,
  scheduleCounts,
  scheduleAbsentCounts,
  onEnterCheckin,
  onStatusOpen,
  reportInfo,
}: Props) {
  const status = getScheduleStatus(schedule);
  const timeDisplay = schedule.scheduled_time ? formatTime(schedule.scheduled_time) : null;
  const scopeMembers = filterMembersByScope(members, schedule.scope);
  const total = scopeMembers.length;

  // location 우선, 없으면 title
  const primaryText = schedule.location ?? schedule.title;

  // 완료 상태면 배지도 stone 톤으로 dim
  const isCompleted = status === "completed";

  // 후발 배지 (후발만 특수 케이스이므로 배지 표시)
  const scopeLabel = schedule.scope === "rear" ? SCOPE_LABEL[schedule.scope] : null;
  const scopeBadge = scopeLabel ? (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[0.625rem] font-bold leading-tight ${isCompleted ? "bg-stone-100 text-stone-400" : "bg-violet-100 text-violet-700"}`}>
      {scopeLabel}
    </span>
  ) : null;


  if (status === "active") {
    const checked = checkIns.filter((c) => !c.is_absent).length;
    const absentCount = checkIns.filter((c) => c.is_absent).length;
    const effectiveTotal = total - absentCount;
    const pct = effectiveTotal > 0 ? Math.round((checked / effectiveTotal) * 100) : 0;
    return (
      <div className="rounded-2xl bg-white ring-2 ring-main-action shadow-sm p-4">
        <button
          onClick={onEnterCheckin}
          className="w-full text-left min-h-11 rounded-lg"
          aria-label={`${schedule.title} 체크인 화면으로 이동`}
        >
          {/* 헤더: 진행중 pill + 집결시간 배지 + 후발 배지 */}
          <div className="mb-2 flex items-center gap-1">
            <span className="rounded-full bg-progress-badge px-2 py-0.5 text-xs font-medium text-yellow-900">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1 align-middle animate-pulse" aria-hidden="true" />
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
          <div className="mt-3 flex items-baseline justify-between">
            <p className="text-xs text-muted-foreground">탑승 {pct}%</p>
            <p className="text-xs font-medium text-gray-700" aria-live="polite">
              {checked}/{total}명{absentCount > 0 && ` (불참 ${absentCount})`}
            </p>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
            aria-valuenow={checked}
            aria-valuemax={effectiveTotal}
            aria-label={`${checked}/${total}명 탑승${absentCount > 0 ? `, 불참 ${absentCount}명` : ""}`}
          >
            <div
              className="h-full rounded-full bg-progress-bar transition-all"
              style={{ width: effectiveTotal > 0 ? `${pct}%` : "0%" }}
            />
          </div>
          {reportInfo && (
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
              {reportInfo.reported}/{reportInfo.total}{reportInfo.unit} 보고완료
            </p>
          )}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onStatusOpen(); }}
          className="mt-2 w-full min-h-11 rounded-xl border border-stone-200 bg-gray-50 text-xs font-medium text-gray-700"
          aria-label="현황 보기"
        >
          현황 보기 &gt;
        </button>
      </div>
    );
  }

  if (status === "waiting") {
    return (
      <div className="rounded-2xl bg-white shadow-sm p-4">
        {/* 헤더: 예정 배지 + 집결시간 배지 + 후발 배지 */}
        <div className="mb-1.5 flex items-center gap-1">
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
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
  const completedAbsent = scheduleAbsentCounts[schedule.id] ?? 0;

  return (
    <div className="rounded-2xl bg-stone-50/80 shadow-sm p-4">
      {/* 헤더: 완료 배지 + 집결시간 배지 + 후발 배지 */}
      <div className="mb-1.5 flex items-center gap-1">
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
      {/* 장소/일정명 + 카운트 */}
      <div>
        <p className="font-medium">{primaryText}</p>
        {schedule.location ? (
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <p className="text-sm text-muted-foreground">{schedule.title}</p>
            {total > 0 && (
              <p className="flex-shrink-0 flex items-center gap-0.5 text-xs text-muted-foreground">
                <CheckIcon className="h-3 w-3 text-stone-400" aria-hidden />
                {completedCount}/{total}명{completedAbsent > 0 && ` (불참 ${completedAbsent})`}
              </p>
            )}
          </div>
        ) : total > 0 ? (
          <p className="mt-1 flex items-center gap-0.5 text-xs text-muted-foreground">
            <CheckIcon className="h-3 w-3 text-stone-400" aria-hidden />
            {completedCount}/{total}명{completedAbsent > 0 && ` (불참 ${completedAbsent})`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
