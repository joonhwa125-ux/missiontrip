"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatTime } from "@/lib/utils";
import type {
  BriefingData,
  ScheduleGroupInfo,
  ScheduleMemberInfo,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  groupName: string;
  briefing: BriefingData;
  isFromCache: boolean;
  /** 현재 조장 화면에서 선택된 일차. 이 일차의 정보만 노출. */
  selectedDay: number;
}

type ScheduleSummary = BriefingData["scheduleSummaries"][number];

/**
 * 일정별 상세 블록에 들어갈 데이터 — 해당 일정의 조 단위 info(sgi) +
 * 내 조원(이동IN 포함) 중 해당 일정에 메타데이터가 있는 인원들(smi).
 */
interface ScheduleBlock {
  schedule: ScheduleSummary;
  groupInfo: ScheduleGroupInfo | null;
  memberInfos: Array<{ info: ScheduleMemberInfo; name: string }>;
}

/** 인원별 메타가 "비어있는지" 판정 — 모든 필드 null이면 스킵 */
function isMemberInfoEmpty(info: ScheduleMemberInfo): boolean {
  return (
    !info.excused_reason &&
    !info.activity &&
    !info.menu &&
    !info.note &&
    !info.temp_group_id &&
    !info.temp_role
  );
}

/** 조 단위 info가 비어있는지 — 4개 표시 필드가 모두 null이면 스킵 */
function isGroupInfoEmpty(info: ScheduleGroupInfo): boolean {
  return (
    !info.location_detail &&
    !info.rotation &&
    !info.sub_location &&
    !info.note
  );
}

/** 작은 칩 배지 컴포넌트 */
function Chip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warn" | "info" }) {
  const tones = {
    neutral: "bg-stone-100 text-stone-700",
    warn: "bg-amber-100 text-amber-800",
    info: "bg-indigo-100 text-indigo-800",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      <span className="text-[0.6875rem] text-stone-500">{label}</span>
      <span>{value}</span>
    </span>
  );
}

/**
 * 항공사별 인원 그룹핑 (삽입 순서 보존)
 * @returns Map<airline, 이름 배열>
 */
function groupByAirline(
  entries: Array<{ name: string; airline: string | null }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.airline) continue;
    const arr = map.get(e.airline) ?? [];
    arr.push(e.name);
    map.set(e.airline, arr);
  }
  return map;
}

export default function BriefingSheet({
  open,
  onClose,
  groupName,
  briefing,
  isFromCache,
  selectedDay,
}: Props) {
  // 해당 일차의 항공 구간 판정 — schedules.airline_leg 기반 (일차 하드코딩 없음)
  const { hasOutboundFlight, hasReturnFlight } = useMemo(() => {
    const daySchedules = briefing.scheduleSummaries.filter(
      (s) => s.day_number === selectedDay
    );
    return {
      hasOutboundFlight: daySchedules.some((s) => s.airline_leg === "outbound"),
      hasReturnFlight: daySchedules.some((s) => s.airline_leg === "return"),
    };
  }, [briefing.scheduleSummaries, selectedDay]);

  // trip_role은 1일차에만 노출 (여행 전체 역할이므로 출발 당일 리마인드용)
  const showTripRole = selectedDay === 1;

  const tripRoles = useMemo(() => {
    if (!showTripRole) return [];
    return briefing.roleAssignments.filter((r) => r.trip_role);
  }, [briefing.roleAssignments, showTripRole]);

  const outboundAirlineGroups = useMemo(
    () =>
      hasOutboundFlight
        ? groupByAirline(
            briefing.roleAssignments.map((r) => ({ name: r.name, airline: r.airline }))
          )
        : new Map<string, string[]>(),
    [briefing.roleAssignments, hasOutboundFlight]
  );

  const returnAirlineGroups = useMemo(
    () =>
      hasReturnFlight
        ? groupByAirline(
            briefing.roleAssignments.map((r) => ({ name: r.name, airline: r.return_airline }))
          )
        : new Map<string, string[]>(),
    [briefing.roleAssignments, hasReturnFlight]
  );

  // 일정별 상세 블록 조립 — 선택된 일차에 속한 일정만
  const scheduleBlocks: ScheduleBlock[] = useMemo(() => {
    const sgByScheduleId = new Map<string, ScheduleGroupInfo>();
    for (const sgi of briefing.groupInfos) {
      if (!isGroupInfoEmpty(sgi)) sgByScheduleId.set(sgi.schedule_id, sgi);
    }

    const smByScheduleId = new Map<string, ScheduleMemberInfo[]>();
    for (const smi of briefing.memberInfos) {
      if (isMemberInfoEmpty(smi)) continue;
      const arr = smByScheduleId.get(smi.schedule_id) ?? [];
      arr.push(smi);
      smByScheduleId.set(smi.schedule_id, arr);
    }

    return briefing.scheduleSummaries
      .filter((s) => s.day_number === selectedDay)
      .map<ScheduleBlock>((schedule) => ({
        schedule,
        groupInfo: sgByScheduleId.get(schedule.schedule_id) ?? null,
        memberInfos: (smByScheduleId.get(schedule.schedule_id) ?? [])
          .map((info) => ({
            info,
            name: briefing.userNameMap[info.user_id] ?? "참가자",
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      }))
      .filter((block) => block.groupInfo !== null || block.memberInfos.length > 0);
  }, [briefing, selectedDay]);

  const hasTripRoles = tripRoles.length > 0;
  const hasOutboundAirlines = outboundAirlineGroups.size > 0;
  const hasReturnAirlines = returnAirlineGroups.size > 0;
  const hasDetails = scheduleBlocks.length > 0;
  const hasAnyContent = hasTripRoles || hasOutboundAirlines || hasReturnAirlines || hasDetails;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 px-5 pb-2 pt-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base">
              {groupName} 브리핑 · {selectedDay}일차
            </DialogTitle>
            {/* 접근성: 시각적으로는 숨기되 스크린리더에는 컨텍스트 제공 */}
            <DialogDescription className="sr-only">
              {groupName} {selectedDay}일차 브리핑 상세
              {isFromCache ? " · 오프라인 캐시 기준" : ""}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-4 pt-2 text-sm">
          {!hasAnyContent && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              이 일차에 등록된 브리핑 항목이 없어요
            </p>
          )}

          {/* 1. 여행 역할 (1일차만) */}
          {hasTripRoles && (
            <section aria-labelledby="briefing-roles">
              <h3 id="briefing-roles" className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                여행 역할
              </h3>
              <ul className="space-y-1.5">
                {tripRoles.map((r) => (
                  <li
                    key={r.user_id}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 px-3 py-2"
                  >
                    <span className="font-medium text-stone-900">{r.name}</span>
                    {r.trip_role && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                        {r.trip_role}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 2. 가는편 항공사 (해당 일차에 outbound 일정 있을 때) */}
          {hasOutboundAirlines && (
            <section aria-labelledby="briefing-outbound">
              <h3 id="briefing-outbound" className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                가는편 항공사
              </h3>
              <ul className="space-y-1.5">
                {Array.from(outboundAirlineGroups.entries()).map(([airline, names]) => (
                  <li key={airline} className="rounded-lg bg-sky-50 px-3 py-2">
                    <div className="mb-0.5 flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-sky-900">{airline}</span>
                      <span className="text-xs text-sky-700">{names.length}명</span>
                    </div>
                    <p className="text-xs text-stone-700">{names.join(", ")}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 3. 오는편 항공사 (해당 일차에 return 일정 있을 때) */}
          {hasReturnAirlines && (
            <section aria-labelledby="briefing-return">
              <h3 id="briefing-return" className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                오는편 항공사
              </h3>
              <ul className="space-y-1.5">
                {Array.from(returnAirlineGroups.entries()).map(([airline, names]) => (
                  <li key={airline} className="rounded-lg bg-sky-50 px-3 py-2">
                    <div className="mb-0.5 flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-sky-900">{airline}</span>
                      <span className="text-xs text-sky-700">{names.length}명</span>
                    </div>
                    <p className="text-xs text-stone-700">{names.join(", ")}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 4. 일정별 상세 (선택 일차의 일정만) */}
          {hasDetails && (
            <section aria-labelledby="briefing-details">
              <h3 id="briefing-details" className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                일정별 안내
              </h3>
              <div className="space-y-3">
                {scheduleBlocks.map((block) => (
                  <article
                    key={block.schedule.schedule_id}
                    className="rounded-xl border border-stone-200 bg-white p-3"
                  >
                    <header className="mb-2 flex items-baseline justify-between gap-2">
                      <h4 className="text-sm font-semibold text-stone-900">
                        {block.schedule.title}
                      </h4>
                      {block.schedule.scheduled_time && (
                        <span className="flex-shrink-0 text-xs text-stone-500">
                          {formatTime(block.schedule.scheduled_time)}
                        </span>
                      )}
                    </header>

                    {/* 조 단위 정보 — 멤버 정보와 동일한 bg-stone-50 컨테이너 패턴 */}
                    {block.groupInfo && (
                      <div className="mb-2 space-y-1.5 rounded-lg bg-stone-50 px-3 py-2">
                        {(block.groupInfo.location_detail ||
                          block.groupInfo.rotation ||
                          block.groupInfo.sub_location) && (
                          <div className="flex flex-wrap gap-1">
                            {block.groupInfo.location_detail && (
                              <Chip label="층" value={block.groupInfo.location_detail} tone="info" />
                            )}
                            {block.groupInfo.rotation && (
                              <Chip label="순서" value={block.groupInfo.rotation} tone="info" />
                            )}
                            {block.groupInfo.sub_location && (
                              <Chip label="장소" value={block.groupInfo.sub_location} tone="info" />
                            )}
                          </div>
                        )}
                        {block.groupInfo.note && (
                          <p className="text-xs text-stone-600">{block.groupInfo.note}</p>
                        )}
                      </div>
                    )}

                    {/* 인원별 정보 */}
                    {block.memberInfos.length > 0 && (
                      <ul className="space-y-1.5">
                        {block.memberInfos.map(({ info, name }) => (
                          <li
                            key={info.id}
                            className="rounded-lg bg-stone-50 px-3 py-2"
                          >
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium text-stone-900">{name}</span>
                              {info.excused_reason && (
                                <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[0.6875rem] font-medium text-stone-700">
                                  제외 · {info.excused_reason}
                                </span>
                              )}
                              {info.temp_group_id && (
                                <Chip
                                  label="조이동"
                                  value={briefing.groupNameMap[info.temp_group_id] ?? "다른 조"}
                                  tone="warn"
                                />
                              )}
                              {info.temp_role === "leader" && (
                                <Chip label="임시역할" value="조장" tone="warn" />
                              )}
                              {info.activity && (
                                <Chip label="활동" value={info.activity} />
                              )}
                              {info.menu && (
                                <Chip label="메뉴" value={info.menu} />
                              )}
                            </div>
                            {info.note && (
                              <p className="text-xs text-stone-600">{info.note}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
