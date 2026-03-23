"use client";

import { useState, useCallback, useEffect, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/hooks/useRealtime";
import { sortSchedulesByStatus, getDefaultDay } from "@/lib/utils";
import DayTabs from "@/components/common/DayTabs";
import AdminScheduleList from "./AdminScheduleList";
import AdminBottomSheet from "./AdminBottomSheet";
import ScheduleAddDialog from "./ScheduleAddDialog";
import TimeEditDialog from "./TimeEditDialog";
import type { Group, Schedule, AdminMember, AdminCheckIn, AdminReport } from "@/lib/types";

type Report = AdminReport;

interface Props {
  groups: Group[];
  members: AdminMember[];
  activeSchedule: Schedule | null;
  schedules: Schedule[];
  initialCheckInsMap: Record<string, AdminCheckIn[]>;
  initialReportsMap: Record<string, Report[]>;
}

export default function AdminView({
  groups,
  members: initialMembers,
  activeSchedule,
  schedules: initialSchedules,
  initialCheckInsMap,
  initialReportsMap,
}: Props) {
  const router = useRouter();
  const [schedules, setSchedules] = useState(initialSchedules);
  const [members, setMembers] = useState(initialMembers);
  const [checkInsMap, setCheckInsMap] = useState(initialCheckInsMap);
  const [reportsMap, setReportsMap] = useState(initialReportsMap);
  const [toast, setToast] = useState<string | null>(null);

  // 일차 탭
  const days = Array.from(new Set(schedules.map((s) => s.day_number))).sort();
  const [selectedDay, setSelectedDay] = useState(() => getDefaultDay(schedules));

  // 바텀시트 대상 일정
  const [bottomSheetSchedule, setBottomSheetSchedule] = useState<Schedule | null>(null);

  // 다이얼로그
  const [addOpen, setAddOpen] = useState(false);
  const [timeEditTarget, setTimeEditTarget] = useState<Schedule | null>(null);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Realtime 구독
  useRealtime(null, true, {
    onScheduleActivated: () => router.refresh(),
    onScheduleUpdated: ({ schedule_id, scheduled_time }) => {
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule_id ? { ...s, scheduled_time } : s))
      );
      showToast("일정 시간이 변경되었어요");
    },
    onCheckinUpdated: ({ user_id, action }) => {
      if (!activeSchedule) return;
      setCheckInsMap((prev) => {
        const sid = activeSchedule.id;
        const list = prev[sid] ?? [];
        if (action === "insert") {
          if (list.some((c) => c.user_id === user_id)) return prev;
          return { ...prev, [sid]: [...list, { user_id, is_absent: false, checked_at: new Date().toISOString() }] };
        }
        return { ...prev, [sid]: list.filter((c) => c.user_id !== user_id) };
      });
    },
    onGroupReported: ({ group_id, pending_count }) => {
      if (!activeSchedule) return;
      setReportsMap((prev) => {
        const sid = activeSchedule.id;
        const list = prev[sid] ?? [];
        const newReport = { group_id, pending_count, reported_at: new Date().toISOString() };
        const idx = list.findIndex((r) => r.group_id === group_id);
        if (idx >= 0) {
          const updated = [...list];
          updated[idx] = newReport;
          return { ...prev, [sid]: updated };
        }
        return { ...prev, [sid]: [...list, newReport] };
      });
    },
  });

  // 현재 일차의 정렬된 일정
  const daySchedules = sortSchedulesByStatus(
    schedules.filter((s) => s.day_number === selectedDay)
  );

  // 바텀시트용 checkIns 업데이터 (특정 schedule_id)
  const handleBottomSheetCheckInsChange = useCallback(
    (action: SetStateAction<AdminCheckIn[]>) => {
      if (!bottomSheetSchedule) return;
      const sid = bottomSheetSchedule.id;
      setCheckInsMap((prev) => {
        const current = prev[sid] ?? [];
        const next = typeof action === "function" ? action(current) : action;
        return { ...prev, [sid]: next };
      });
    },
    [bottomSheetSchedule]
  );

  const isBottomSheetReadOnly = bottomSheetSchedule
    ? !bottomSheetSchedule.is_active
    : false;

  return (
    <div className="flex min-h-full flex-col">
      {/* 일차 탭 (제목 헤더 없음 — HTML <title>로 접근성 충족) */}
      <div className="bg-main-action">
        <DayTabs days={days} selected={selectedDay} onChange={setSelectedDay} panelId="admin-schedule-panel" />
      </div>

      {/* 일정 카드 목록 */}
      <div id="admin-schedule-panel" role="tabpanel" className="flex-1">
        <AdminScheduleList
          schedules={daySchedules}
          allSchedules={schedules}
          checkInsMap={checkInsMap}
          reportsMap={reportsMap}
          groups={groups}
          members={members}
          activeSchedule={activeSchedule}
          onBottomSheet={setBottomSheetSchedule}
          onTimeEdit={setTimeEditTarget}
          onToast={showToast}
          onRefresh={() => router.refresh()}
          onAddOpen={() => setAddOpen(true)}
        />
      </div>

      {/* 바텀시트 — 전체 현황 */}
      <AdminBottomSheet
        schedule={bottomSheetSchedule}
        groups={groups}
        members={members}
        checkIns={bottomSheetSchedule ? (checkInsMap[bottomSheetSchedule.id] ?? []) : []}
        reports={bottomSheetSchedule ? (reportsMap[bottomSheetSchedule.id] ?? []) : []}
        isReadOnly={isBottomSheetReadOnly}
        onClose={() => setBottomSheetSchedule(null)}
        onMembersChange={setMembers}
        onCheckInsChange={handleBottomSheetCheckInsChange}
      />

      {/* 일정 추가 다이얼로그 */}
      <ScheduleAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        schedules={schedules}
        onRefresh={() => router.refresh()}
      />

      {/* 시간 수정 다이얼로그 */}
      <TimeEditDialog
        schedule={timeEditTarget}
        onClose={() => setTimeEditTarget(null)}
        onSchedulesChange={(updater) => setSchedules(updater)}
        onToast={showToast}
      />

      {/* 토스트 */}
      {toast && (
        <div
          className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-xl bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
