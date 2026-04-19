"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatTime } from "@/lib/utils";
import { BRIEFING_SEPARATOR } from "@/lib/constants";
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

/** 조 단위 info가 비어있는지 — 표시 필드가 모두 null이면 스킵 */
function isGroupInfoEmpty(info: ScheduleGroupInfo): boolean {
  return !info.group_location && !info.note;
}

/** 라벨 chip — 개인 특이사항(미참여/조이동/임시역할)에 재사용 */
function Chip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warn" | "info" }) {
  const tones = {
    neutral: "bg-stone-100 text-stone-700",
    warn: "bg-amber-100 text-amber-800",
    info: "bg-indigo-100 text-indigo-800",
  } as const;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-stone-500">{label}</span>
      <span className={`rounded-full px-2 py-0.5 font-medium ${tones[tone]}`}>{value}</span>
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

/**
 * 항공사 섹션 — 전원 동일이면 한 줄 압축, 분기면 그룹별 이름.
 * Semantic 혼동 방지 차원에서 색상 닷/배경 없음 — 타이포그래피·간격으로 시각 위계.
 */
function AirlineSection({
  labelId,
  title,
  groups,
}: {
  labelId: string;
  title: string;
  groups: Map<string, string[]>;
}) {
  const entries = Array.from(groups.entries());
  if (entries.length === 0) return null;

  const totalCount = entries.reduce((sum, [, names]) => sum + names.length, 0);
  const isAllSame = entries.length === 1;

  return (
    <section aria-labelledby={labelId}>
      <h3 id={labelId} className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h3>
      {isAllSame ? (
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <span className="font-semibold text-stone-900">전원 {entries[0][0]}</span>
          <span className="ml-1 text-stone-500">· {totalCount}명</span>
        </p>
      ) : (
        <div className="space-y-2.5">
          {entries.map(([airline, names]) => (
            <div key={airline}>
              <p className="mb-1 text-sm">
                <span className="font-semibold text-stone-900">{airline}</span>
                <span className="ml-1 text-stone-500">
                  · {names.length}/{totalCount}명
                </span>
              </p>
              <p className="text-xs leading-relaxed text-stone-700">
                {names.join(BRIEFING_SEPARATOR)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * 활동 배정 축 전환 렌더 — 같은 활동 멤버를 한 그룹으로 묶어 노출.
 * 활동 값 내 "(조장)" 접미는 해당 프로그램 조의 조장으로 별도 강조(⭐).
 */
function ActivitySection({
  infos,
  userNameMap,
}: {
  infos: ScheduleMemberInfo[];
  userNameMap: BriefingData["userNameMap"];
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string; isActivityLeader: boolean }>>();
    for (const info of infos) {
      if (!info.activity) continue;
      // "숲체험 6조 (조장)" → activityName="숲체험 6조", isActivityLeader=true
      const leaderMatch = /\s*\((조장|조장\s*지원|.+\s*지원)\)\s*$/.exec(info.activity);
      const activityName = leaderMatch
        ? info.activity.slice(0, leaderMatch.index).trim()
        : info.activity.trim();
      const isActivityLeader = !!leaderMatch && leaderMatch[1] === "조장";
      const arr = map.get(activityName) ?? [];
      arr.push({
        id: info.id,
        name: userNameMap[info.user_id] ?? "참가자",
        isActivityLeader,
      });
      map.set(activityName, arr);
    }
    // 활동명 내부에서 조장 먼저, 그 외 가나다
    map.forEach((arr) => {
      arr.sort((a, b) => {
        if (a.isActivityLeader && !b.isActivityLeader) return -1;
        if (!a.isActivityLeader && b.isActivityLeader) return 1;
        return a.name.localeCompare(b.name, "ko");
      });
    });
    return map;
  }, [infos, userNameMap]);

  const entries = Array.from(groups.entries());
  if (entries.length === 0) return null;
  const totalCount = entries.reduce((sum, [, arr]) => sum + arr.length, 0);

  return (
    <div className="mb-2">
      <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-stone-500">
        활동 배정 · {totalCount}명
      </p>
      <ul className="space-y-2.5">
        {entries.map(([activity, members]) => {
          if (members.length === 1) {
            // 단일 멤버 — 한 줄 압축
            const m = members[0];
            return (
              <li key={activity} className="text-xs leading-relaxed">
                <span className="font-semibold text-stone-900">{activity}</span>
                <span className="text-stone-500">
                  {" · "}1명{" · "}
                </span>
                <span className="text-stone-800">
                  {m.isActivityLeader && (
                    <>
                      <span aria-hidden="true">⭐ </span>
                      <span className="sr-only">활동 조장 </span>
                    </>
                  )}
                  {m.name}
                </span>
              </li>
            );
          }
          return (
            <li key={activity}>
              <p className="mb-0.5 text-xs">
                <span className="font-semibold text-stone-900">{activity}</span>
                <span className="ml-1 text-stone-500">· {members.length}명</span>
              </p>
              <p className="text-xs leading-relaxed text-stone-700">
                {members.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && BRIEFING_SEPARATOR}
                    {m.isActivityLeader && (
                      <>
                        <span aria-hidden="true">⭐ </span>
                        <span className="sr-only">활동 조장 </span>
                      </>
                    )}
                    {m.name}
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 메뉴 섹션 — 메인·음료 총량 + 조원별 배정(기본 접힘).
 * menu 필드는 자유 텍스트이나 build 스크립트가 " · " 구분자로 결합하므로 split 휴리스틱 사용.
 */
function MenuSection({
  infos,
  userNameMap,
}: {
  infos: ScheduleMemberInfo[];
  userNameMap: BriefingData["userNameMap"];
}) {
  const [expanded, setExpanded] = useState(false);

  const { perPerson, mainCount, drinkCount } = useMemo(() => {
    const perPerson: Array<{ id: string; name: string; main: string; drink: string }> = [];
    const mainCount = new Map<string, number>();
    const drinkCount = new Map<string, number>();

    for (const info of infos) {
      if (!info.menu) continue;
      const parts = info.menu
        .split(BRIEFING_SEPARATOR)
        .map((s) => s.trim())
        .filter(Boolean);
      const main = parts[0] ?? "";
      const drink = parts[1] ?? "";
      perPerson.push({
        id: info.id,
        name: userNameMap[info.user_id] ?? "참가자",
        main,
        drink,
      });
      if (main) mainCount.set(main, (mainCount.get(main) ?? 0) + 1);
      if (drink) drinkCount.set(drink, (drinkCount.get(drink) ?? 0) + 1);
    }

    perPerson.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return { perPerson, mainCount, drinkCount };
  }, [infos, userNameMap]);

  if (perPerson.length === 0) return null;

  const renderCountList = (map: Map<string, number>) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => (
        <li key={name} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-stone-800">{name}</span>
          <span className="text-stone-500">· {n}명</span>
        </li>
      ));

  return (
    <div className="mb-2">
      <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-stone-500">
        메뉴 배정 · {perPerson.length}명
      </p>
      <div className="space-y-1.5">
        {mainCount.size > 0 && (
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <p className="mb-1 text-[0.6875rem] font-medium text-stone-500">메인</p>
            <ul className="space-y-0.5">{renderCountList(mainCount)}</ul>
          </div>
        )}
        {drinkCount.size > 0 && (
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <p className="mb-1 text-[0.6875rem] font-medium text-stone-500">음료</p>
            <ul className="space-y-0.5">{renderCountList(drinkCount)}</ul>
          </div>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs font-medium text-stone-700 outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
        >
          <span>조원별 배정 ({perPerson.length}명)</span>
          <ChevronDown
            className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
        {expanded && (
          <ul className="space-y-0.5 rounded-lg bg-stone-50 px-3 py-2">
            {perPerson.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-1 text-xs">
                <span className="font-medium text-stone-900">{p.name}</span>
                <span className="text-stone-500">·</span>
                <span className="text-stone-700">
                  {[p.main, p.drink].filter(Boolean).join(" / ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * 개인 특이사항 (미참여·조이동·임시역할·메모) — 개인 단위 유지.
 * 수가 적고 예외적이라 축 전환보다 개인 매핑이 명확.
 */
function SpecialInfoList({
  infos,
  userNameMap,
  groupNameMap,
}: {
  infos: ScheduleMemberInfo[];
  userNameMap: BriefingData["userNameMap"];
  groupNameMap: BriefingData["groupNameMap"];
}) {
  const sorted = useMemo(
    () =>
      [...infos]
        .map((info) => ({ info, name: userNameMap[info.user_id] ?? "참가자" }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [infos, userNameMap]
  );
  if (sorted.length === 0) return null;
  return (
    <div className="mb-2">
      <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-stone-500">
        개인 특이사항
      </p>
      <ul className="space-y-1.5">
        {sorted.map(({ info, name }) => (
          <li key={info.id} className="rounded-lg bg-stone-50 px-3 py-2">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium text-stone-900">{name}</span>
              {info.excused_reason && (
                <Chip label="미참여" value={info.excused_reason} />
              )}
              {info.temp_group_id && (
                <Chip
                  label="조이동"
                  value={groupNameMap[info.temp_group_id] ?? "다른 조"}
                  tone="warn"
                />
              )}
              {info.temp_role === "leader" && (
                <Chip label="임시역할" value="조장" tone="warn" />
              )}
            </div>
            {info.note && <p className="text-xs text-stone-600">{info.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
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
      // 공지·조안내·개인안내 중 하나라도 있으면 블록 유지
      .filter(
        (block) =>
          !!block.schedule.notice ||
          block.groupInfo !== null ||
          block.memberInfos.length > 0
      );
  }, [briefing, selectedDay]);

  const hasTripRoles = tripRoles.length > 0;
  const hasOutboundAirlines = outboundAirlineGroups.size > 0;
  const hasReturnAirlines = returnAirlineGroups.size > 0;
  const hasDetails = scheduleBlocks.length > 0;
  const hasAnyContent = hasTripRoles || hasOutboundAirlines || hasReturnAirlines || hasDetails;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 px-5 pb-1 pt-4">
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

        {/* 스크롤 컨테이너: overflow-y-auto + overscroll-behavior-contain — 모바일 드래그 제스처 충돌 방지 */}
        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pb-4 pt-1 text-sm">
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

          {/* 2. 가는편 항공사 — 전원 동일 압축 or 그룹별 이름 */}
          {hasOutboundAirlines && (
            <AirlineSection
              labelId="briefing-outbound"
              title="가는편 항공사"
              groups={outboundAirlineGroups}
            />
          )}

          {/* 3. 오는편 항공사 — 동일 패턴 */}
          {hasReturnAirlines && (
            <AirlineSection
              labelId="briefing-return"
              title="오는편 항공사"
              groups={returnAirlineGroups}
            />
          )}

          {/* 4. 일정별 상세 (선택 일차의 일정만) */}
          {hasDetails && (
            <section aria-labelledby="briefing-details">
              <h3 id="briefing-details" className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                일정별 안내
              </h3>
              <div className="space-y-3">
                {scheduleBlocks.map((block) => {
                  const activityInfos = block.memberInfos
                    .map((m) => m.info)
                    .filter((info) => !!info.activity);
                  const menuInfos = block.memberInfos
                    .map((m) => m.info)
                    .filter((info) => !!info.menu);
                  // 개인 특이사항: 활동·메뉴 외 필드가 하나라도 있는 info
                  const specialInfos = block.memberInfos
                    .map((m) => m.info)
                    .filter(
                      (info) =>
                        !!info.excused_reason ||
                        !!info.temp_group_id ||
                        info.temp_role === "leader" ||
                        !!info.note
                    );

                  return (
                    <article
                      key={block.schedule.schedule_id}
                      className="rounded-xl border border-stone-200 bg-white"
                    >
                      {/* Sticky 헤더 — 스크롤 중 일정명 항상 가시 (iOS UITableView 패턴) */}
                      <header className="sticky top-0 z-10 flex items-baseline justify-between gap-2 rounded-t-xl border-b border-stone-100 bg-white/95 px-3 py-2 backdrop-blur-sm">
                        <h4 className="text-sm font-semibold text-stone-900">
                          {block.schedule.title}
                        </h4>
                        {block.schedule.scheduled_time && (
                          <span className="flex-shrink-0 text-xs text-stone-500">
                            {formatTime(block.schedule.scheduled_time)}
                          </span>
                        )}
                      </header>

                      <div className="p-3">
                        {/* 일정별 공지 — 모든 조에 공통 */}
                        {block.schedule.notice && (
                          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <p className="mb-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-amber-800">
                              공지
                            </p>
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-amber-900">
                              {block.schedule.notice}
                            </p>
                          </div>
                        )}

                        {/* 조 단위 정보 */}
                        {block.groupInfo && (
                          <div className="mb-2 space-y-1.5 rounded-lg bg-stone-50 px-3 py-2">
                            {block.groupInfo.group_location && (
                              <div className="flex flex-wrap gap-1">
                                <Chip label="조 위치" value={block.groupInfo.group_location} tone="info" />
                              </div>
                            )}
                            {block.groupInfo.note && (
                              <p className="text-xs text-stone-600">{block.groupInfo.note}</p>
                            )}
                          </div>
                        )}

                        {/* 활동 배정 — Group-by-Activity 축 전환 */}
                        {activityInfos.length > 0 && (
                          <ActivitySection
                            infos={activityInfos}
                            userNameMap={briefing.userNameMap}
                          />
                        )}

                        {/* 메뉴 배정 — 총량 요약 + 조원별 (기본 접힘) */}
                        {menuInfos.length > 0 && (
                          <MenuSection
                            infos={menuInfos}
                            userNameMap={briefing.userNameMap}
                          />
                        )}

                        {/* 개인 특이사항 — 미참여·조이동·임시역할·메모 */}
                        {specialInfos.length > 0 && (
                          <SpecialInfoList
                            infos={specialInfos}
                            userNameMap={briefing.userNameMap}
                            groupNameMap={briefing.groupNameMap}
                          />
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
