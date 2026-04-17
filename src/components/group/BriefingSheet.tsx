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

export default function BriefingSheet({
  open,
  onClose,
  groupName,
  briefing,
  isFromCache,
}: Props) {
  // 일정별 상세 블록 조립 — 일차/정렬 순서 유지
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

    // scheduleSummaries는 서버에서 (day_number, sort_order) 오름차순 정렬 가정
    return briefing.scheduleSummaries
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
  }, [briefing]);

  // 일차 별로 block 그룹핑 (렌더용)
  const blocksByDay = useMemo(() => {
    const map = new Map<number, ScheduleBlock[]>();
    for (const block of scheduleBlocks) {
      const day = block.schedule.day_number;
      const arr = map.get(day) ?? [];
      arr.push(block);
      map.set(day, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [scheduleBlocks]);

  const hasRoles = briefing.roleAssignments.length > 0;
  const hasDetails = scheduleBlocks.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden p-0">
        <div className="flex-shrink-0 border-b border-stone-100 px-5 pb-3 pt-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base">{groupName} 브리핑</DialogTitle>
            <DialogDescription className="text-xs">
              {isFromCache
                ? "오프라인 캐시 기준 · 연결되면 최신으로 업데이트돼요"
                : "출발 전 꼭 확인해주세요"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4 text-sm">
          {!hasRoles && !hasDetails && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              등록된 브리핑 항목이 없어요
            </p>
          )}

          {/* 1. 여행 역할 */}
          {hasRoles && (
            <section aria-labelledby="briefing-roles">
              <h3 id="briefing-roles" className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                여행 역할
              </h3>
              <ul className="space-y-1.5">
                {briefing.roleAssignments.map((r) => (
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
                    {r.airline && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                        ✈︎ {r.airline}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 2. 일정별 상세 (일차 헤더 포함) */}
          {hasDetails && (
            <section aria-labelledby="briefing-details">
              <h3 id="briefing-details" className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                일정별 안내
              </h3>
              <div className="space-y-4">
                {blocksByDay.map(([day, blocks]) => (
                  <div key={day}>
                    <p className="mb-2 text-xs font-semibold text-stone-600">{day}일차</p>
                    <div className="space-y-3">
                      {blocks.map((block) => (
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

                          {/* 조 단위 정보 */}
                          {block.groupInfo && (
                            <div className="mb-2 space-y-1.5">
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
                              {block.groupInfo.note && (
                                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                  {block.groupInfo.note}
                                </p>
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
                                    {/* Phase G 후속 fix: 조이동 정보를 보내는 쪽 조장에게도 노출 */}
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
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
