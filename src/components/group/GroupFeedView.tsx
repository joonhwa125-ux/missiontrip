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
import GroupStatusGrid from "./GroupStatusGrid";
import BriefingBanner from "./BriefingBanner";
import BriefingSheet from "./BriefingSheet";
import { COPY } from "@/lib/constants";
import type {
  Schedule,
  CheckIn,
  Group,
  GroupMember,
  GroupMemberBrief,
  BriefingData,
} from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Member = GroupMember;

interface Props {
  schedules: Schedule[];
  activeSchedule: Schedule | null;
  members: Member[];
  shuttleBus?: string | null;
  returnShuttleBus?: string | null;
  checkIns: CheckIn[];
  scheduleCounts: Record<string, number>;
  scheduleAbsentCounts: Record<string, number>;
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
  allMembers: GroupMemberBrief[];
  allReports: { group_id: string }[];
  onEnterCheckin: () => void;
  /** 조장 브리핑 (v2 Phase E) — null이면 배너 숨김 */
  briefing: BriefingData | null;
  groupId: string;
  userId: string;
  groupName: string;
}

export default function GroupFeedView({
  schedules,
  activeSchedule,
  members,
  shuttleBus,
  returnShuttleBus,
  checkIns,
  scheduleCounts,
  scheduleAbsentCounts,
  allGroups,
  allCheckIns,
  allMembers,
  allReports,
  onEnterCheckin,
  briefing,
  groupId,
  userId,
  groupName,
}: Props) {
  const { isOnline, pendingCount } = useOfflineSync();
  const [statusOpen, setStatusOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const { briefing: cachedBriefing, isFromCache } = useBriefingCache(groupId, briefing);

  // 배너 카운트 — 역할/특이사항
  const { roleCount, specialCount } = useMemo(() => {
    if (!cachedBriefing) return { roleCount: 0, specialCount: 0 };
    const rc = cachedBriefing.roleAssignments.length;
    const sgSpecials = cachedBriefing.groupInfos.filter(
      (g) => !!(g.location_detail || g.rotation || g.sub_location || g.note)
    ).length;
    const smSpecials = cachedBriefing.memberInfos.filter(
      (m) =>
        !!(m.note || m.excused_reason || m.activity || m.menu || m.temp_role || m.temp_group_id)
    ).length;
    return { roleCount: rc, specialCount: sgSpecials + smSpecials };
  }, [cachedBriefing]);

  // scope 필터: 셔틀 일정은 버스 배정자만, 일반 일정은 조내 party 기준
  const hasAdvance = members.some((m) => m.party === "advance");
  const hasRear = members.some((m) => m.party === "rear");
  const mySchedules = schedules.filter((s) => {
    if (s.shuttle_type === "departure") return !!shuttleBus;
    if (s.shuttle_type === "return") return !!returnShuttleBus;
    return (
      s.scope === "all" ||
      (s.scope === "advance" && hasAdvance) ||
      (s.scope === "rear" && hasRear)
    );
  });
  const days = useMemo(
    () => Array.from(new Set(mySchedules.map((s) => s.day_number))).sort(),
    [mySchedules]
  );
  const [selectedDay, setSelectedDay] = useState(() => getDefaultDay(mySchedules));
  const daySchedules = sortSchedulesByStatus(
    mySchedules.filter((s) => s.day_number === selectedDay)
  );

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
              userId={userId}
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
              onStatusOpen={() => setStatusOpen(true)}
            />
          ))}
          {daySchedules.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {COPY.emptySchedule}
            </p>
          )}
        </div>
      </div>

      {/* 전체 조 현황 바텀시트 */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden p-0">
          <div className="flex-shrink-0 px-6 pt-4">
            <DialogHeader>
              <DialogTitle>전체 현황</DialogTitle>
              <DialogDescription>
                {activeSchedule?.location ?? activeSchedule?.title ?? "대기 중"} 기준
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="overflow-y-auto px-6 pb-6">
            <GroupStatusGrid
              allGroups={allGroups}
              allCheckIns={allCheckIns}
              allMembers={allMembers}
              allReports={allReports}
              scope={activeSchedule?.scope ?? "all"}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 브리핑 바텀시트 */}
      {cachedBriefing && (
        <BriefingSheet
          open={briefingOpen}
          onClose={() => setBriefingOpen(false)}
          groupName={groupName}
          briefing={cachedBriefing}
          isFromCache={isFromCache}
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
