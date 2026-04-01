"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { sortSchedulesByStatus, getDefaultDay, filterMembersByScope } from "@/lib/utils";
import PageHeader from "@/components/common/PageHeader";
import SettingsDropdown from "@/components/common/SettingsDropdown";
import DayTabs from "@/components/common/DayTabs";
import ScheduleCard from "./ScheduleCard";
import GroupStatusGrid from "./GroupStatusGrid";
import { COPY } from "@/lib/constants";
import type { Schedule, CheckIn, Group, GroupMember, GroupMemberBrief } from "@/lib/types";
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
}: Props) {
  const { isOnline, pendingCount } = useOfflineSync();
  const [statusOpen, setStatusOpen] = useState(false);

  // 진행중 일반 일정의 차량 보고 현황 (셔틀 일정 제외)
  // 차량(bus_name) 단위: 같은 bus_name의 조 중 1개라도 보고하면 해당 차량 보고 완료
  const reportInfo = useMemo(() => {
    if (!activeSchedule || activeSchedule.shuttle_type) return undefined;
    const scopeGroupIds = new Set(
      filterMembersByScope(allMembers, activeSchedule.scope).map((m) => m.group_id)
    );
    const reportedGroupIds = new Set(
      allReports.filter((r) => scopeGroupIds.has(r.group_id)).map((r) => r.group_id)
    );
    // bus_name 기준 고유 차량 집합
    const scopeBusNames = new Set(
      allGroups.filter((g) => scopeGroupIds.has(g.id)).map((g) => g.bus_name ?? g.name)
    );
    // 보고된 조가 속한 차량 집합
    const reportedBusNames = new Set(
      allGroups.filter((g) => reportedGroupIds.has(g.id)).map((g) => g.bus_name ?? g.name)
    );
    return { reported: reportedBusNames.size, total: scopeBusNames.size, unit: "대" as const };
  }, [activeSchedule, allMembers, allReports, allGroups]);

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
              reportInfo={s.is_active ? reportInfo : undefined}
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
