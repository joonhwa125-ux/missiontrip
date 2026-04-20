"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useBriefingCache } from "@/hooks/useBriefingCache";
import { sortSchedulesByStatus, getDefaultDay } from "@/lib/utils";
import PageHeader from "@/components/common/PageHeader";
import SettingsDropdown from "@/components/common/SettingsDropdown";
import DayTabs from "@/components/common/DayTabs";
import ScheduleCard from "./ScheduleCard";
import BriefingBanner from "./BriefingBanner";
import BriefingSheet from "./BriefingSheet";
import { COPY, matchesAirlineFilter } from "@/lib/constants";
import type {
  Schedule,
  CheckIn,
  GroupMember,
  BriefingData,
} from "@/lib/types";

type Member = GroupMember;

interface Props {
  schedules: Schedule[];
  members: Member[];
  shuttleBus?: string | null;
  returnShuttleBus?: string | null;
  checkIns: CheckIn[];
  scheduleCounts: Record<string, number>;
  scheduleAbsentCounts: Record<string, number>;
  /** Phase B: 탭된 일정을 인자로 전달 — 진행중/대기/완료 모두 진입 가능 */
  onEnterCheckin: (schedule: Schedule) => void;
  /** 조장 브리핑 (v2 Phase E) — null이면 배너 숨김 */
  briefing: BriefingData | null;
  groupId: string;
  groupName: string;
}

export default function GroupFeedView({
  schedules,
  members,
  shuttleBus,
  returnShuttleBus,
  checkIns,
  scheduleCounts,
  scheduleAbsentCounts,
  onEnterCheckin,
  briefing,
  groupId,
  groupName,
}: Props) {
  const { isOnline, pendingCount } = useOfflineSync();
  const [briefingOpen, setBriefingOpen] = useState(false);
  const { briefing: cachedBriefing, isFromCache } = useBriefingCache(groupId, briefing);

  // scope 필터: 셔틀 일정은 버스 배정자만, 일반 일정은 조내 party + airline_filter 기준
  const hasAdvance = members.some((m) => m.party === "advance");
  const hasRear = members.some((m) => m.party === "rear");
  const mySchedules = schedules.filter((s) => {
    if (s.shuttle_type === "departure") return !!shuttleBus;
    if (s.shuttle_type === "return") return !!returnShuttleBus;
    const scopeOk =
      s.scope === "all" ||
      (s.scope === "advance" && hasAdvance) ||
      (s.scope === "rear" && hasRear);
    if (!scopeOk) return false;
    // airline_filter: 해당 편 탑승자가 조에 없으면 일정 숨김 (예: 접근성2(1조) 전원 티웨이 → 제주항공 카드 숨김)
    return matchesAirlineFilter(s.airline_filter, members);
  });
  const days = useMemo(
    () => Array.from(new Set(mySchedules.map((s) => s.day_number))).sort(),
    [mySchedules]
  );
  const [selectedDay, setSelectedDay] = useState(() => getDefaultDay(mySchedules));
  const daySchedules = sortSchedulesByStatus(
    mySchedules.filter((s) => s.day_number === selectedDay)
  );

  // 배너 카운트 — 선택된 일차 기준으로 필터링.
  // 카운트 0이면 배너 자체 숨김 (일차별 빈 상태 자연 대응).
  //  - trip_role: 1일차에만 카운트 (BriefingSheet 규칙과 동일)
  //  - 항공사: 해당 일차에 airline_leg=outbound/return 일정 있을 때만 카운트
  //  - 특이사항: 해당 일차에 속한 sgi/smi만
  // 배너 카운트 — 인원 수가 아닌 "항목 종류" 수로 집계
  //   roleCount: 해당 일차에 (여행역할/가는편 항공사/오는편 항공사) 각 섹션 유무로 0~3
  //   specialCount: 일정 × 안내 카테고리별 1건씩
  //                 (예: 치유의숲 활동 배정 193명 → 1건, 더클리프 메뉴 203명 → 1건)
  const { roleCount, specialCount } = useMemo(() => {
    if (!cachedBriefing) return { roleCount: 0, specialCount: 0 };

    const daySchedulesInBriefing = cachedBriefing.scheduleSummaries.filter(
      (s) => s.day_number === selectedDay
    );
    const dayScheduleIds = new Set(daySchedulesInBriefing.map((s) => s.schedule_id));
    const hasOutbound = daySchedulesInBriefing.some((s) => s.airline_leg === "outbound");
    const hasReturn = daySchedulesInBriefing.some((s) => s.airline_leg === "return");

    // roleCount — 섹션 단위 (1일차 여행역할 / 가는편 / 오는편) 최대 3건
    const tripRolesSection =
      selectedDay === 1 && cachedBriefing.roleAssignments.some((r) => r.trip_role)
        ? 1
        : 0;
    const outboundSection =
      hasOutbound && cachedBriefing.roleAssignments.some((r) => r.airline) ? 1 : 0;
    const returnSection =
      hasReturn && cachedBriefing.roleAssignments.some((r) => r.return_airline) ? 1 : 0;
    const rc = tripRolesSection + outboundSection + returnSection;

    // specialCount — 일정 × 안내 카테고리별 1건씩
    //   · 공지(notice): 일정별 1건
    //   · 조 안내(group_info): 일정 × 카테고리(group_location/note)별 1건
    //   · 개인 안내(member_info): 일정 × 카테고리(미참여/조이동/임시역할/활동/메뉴/메모)별 1건
    const specialKeys = new Set<string>();

    // 공지
    for (const s of daySchedulesInBriefing) {
      if (s.notice) specialKeys.add(`${s.schedule_id}:notice`);
    }

    // 조 안내
    for (const g of cachedBriefing.groupInfos) {
      if (!dayScheduleIds.has(g.schedule_id)) continue;
      if (g.group_location) specialKeys.add(`${g.schedule_id}:group_location`);
      if (g.note) specialKeys.add(`${g.schedule_id}:group_note`);
    }

    // 개인 안내
    for (const m of cachedBriefing.memberInfos) {
      if (!dayScheduleIds.has(m.schedule_id)) continue;
      if (m.excused_reason) specialKeys.add(`${m.schedule_id}:미참여`);
      if (m.temp_group_id) specialKeys.add(`${m.schedule_id}:조이동`);
      if (m.temp_role) specialKeys.add(`${m.schedule_id}:임시역할`);
      if (m.activity) specialKeys.add(`${m.schedule_id}:활동`);
      if (m.menu) specialKeys.add(`${m.schedule_id}:메뉴`);
      if (m.note) specialKeys.add(`${m.schedule_id}:메모`);
    }

    return { roleCount: rc, specialCount: specialKeys.size };
  }, [cachedBriefing, selectedDay]);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* 통일 헤더 */}
      <PageHeader
        title="동행체크"
        titleNode={
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              <Image src="/1.png" alt="" width={40} height={40} quality={100} className="inline-block" aria-hidden="true" priority />
              동행체크
            </span>
            <span className="flex-shrink-0 rounded-full bg-gray-900 px-1.5 py-1 font-semibold text-white text-xs leading-none">
              조장
            </span>
          </span>
        }
        rightSlot={<SettingsDropdown />}
      />

      {/* 일차 탭 + 일정 타임라인 */}
      <DayTabs days={days} selected={selectedDay} onChange={setSelectedDay} panelId="group-feed-panel" />
      <div id="group-feed-panel" role="tabpanel" className="px-4 py-4">
        {/* 조장 브리핑 배너 (DayTabs 아래, 일정 카드 위) */}
        {(roleCount > 0 || specialCount > 0) && (
          <div className="mb-3">
            <BriefingBanner
              roleCount={roleCount}
              specialCount={specialCount}
              onOpen={() => setBriefingOpen(true)}
            />
          </div>
        )}
        <div className="space-y-2">
          {daySchedules.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              members={members}
              checkIns={checkIns}
              scheduleCounts={scheduleCounts}
              scheduleAbsentCounts={scheduleAbsentCounts}
              onEnterCheckin={onEnterCheckin}
            />
          ))}
          {daySchedules.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {COPY.emptySchedule}
            </p>
          )}
        </div>
      </div>

      {/* 브리핑 바텀시트 */}
      {cachedBriefing && (
        <BriefingSheet
          open={briefingOpen}
          onClose={() => setBriefingOpen(false)}
          groupName={groupName}
          briefing={cachedBriefing}
          isFromCache={isFromCache}
          selectedDay={selectedDay}
        />
      )}

      {/* 오프라인 배너 (하단 고정) */}
      {!isOnline && (
        <div
          className="fixed bottom-0 left-1/2 w-full max-w-lg -translate-x-1/2 bg-offline-banner px-4 py-2 text-center text-sm"
          aria-live="polite"
          role="status"
        >
          {COPY.offline(pendingCount)}
        </div>
      )}
    </div>
  );
}
