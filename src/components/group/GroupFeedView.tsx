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
  onEnterCheckin: () => void;
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
  const { roleCount, specialCount } = useMemo(() => {
    if (!cachedBriefing) return { roleCount: 0, specialCount: 0 };

    const daySchedulesInBriefing = cachedBriefing.scheduleSummaries.filter(
      (s) => s.day_number === selectedDay
    );
    const dayScheduleIds = new Set(daySchedulesInBriefing.map((s) => s.schedule_id));
    const hasOutbound = daySchedulesInBriefing.some((s) => s.airline_leg === "outbound");
    const hasReturn = daySchedulesInBriefing.some((s) => s.airline_leg === "return");

    const tripRoles = selectedDay === 1
      ? cachedBriefing.roleAssignments.filter((r) => r.trip_role).length
      : 0;
    const outboundAirlines = hasOutbound
      ? new Set(
          cachedBriefing.roleAssignments
            .filter((r) => r.airline)
            .map((r) => r.airline)
        ).size
      : 0;
    const returnAirlines = hasReturn
      ? new Set(
          cachedBriefing.roleAssignments
            .filter((r) => r.return_airline)
            .map((r) => r.return_airline)
        ).size
      : 0;
    const rc = tripRoles + outboundAirlines + returnAirlines;

    const sgSpecials = cachedBriefing.groupInfos.filter(
      (g) =>
        dayScheduleIds.has(g.schedule_id) &&
        !!(g.group_location || g.note)
    ).length;
    const smSpecials = cachedBriefing.memberInfos.filter(
      (m) =>
        dayScheduleIds.has(m.schedule_id) &&
        !!(m.note || m.excused_reason || m.activity || m.menu || m.temp_role || m.temp_group_id)
    ).length;
    return { roleCount: rc, specialCount: sgSpecials + smSpecials };
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
