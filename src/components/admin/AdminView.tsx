"use client";

import { useState, useCallback, useEffect, useMemo, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRealtime } from "@/hooks/useRealtime";
import { sortSchedulesByStatus, getDefaultDay } from "@/lib/utils";
import PageHeader from "@/components/common/PageHeader";
import DayTabs from "@/components/common/DayTabs";
import AdminScheduleList from "./AdminScheduleList";
import AdminBottomSheet from "./AdminBottomSheet";
import ScheduleAddDialog from "./ScheduleAddDialog";
import TimeEditDialog from "./TimeEditDialog";
import GroupCheckinView from "@/components/group/GroupCheckinView";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Group, Schedule, AdminMember, AdminCheckIn, AdminReport, CheckIn } from "@/lib/types";

type Report = AdminReport;

interface Props {
  currentUser: { id: string; group_id: string };
  groups: Group[];
  members: AdminMember[];
  activeSchedule: Schedule | null;
  schedules: Schedule[];
  initialCheckInsMap: Record<string, AdminCheckIn[]>;
  initialReportsMap: Record<string, Report[]>;
}

export default function AdminView({
  currentUser,
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

  // 내 조 체크인 Sheet
  const [checkinSheetOpen, setCheckinSheetOpen] = useState(false);
  const [sheetCheckIns, setSheetCheckIns] = useState<CheckIn[]>([]);

  // 내 조 정보 파생
  const adminGroupName = useMemo(
    () => groups.find((g) => g.id === currentUser.group_id)?.name ?? "내 조",
    [groups, currentUser.group_id]
  );
  const adminMembers = useMemo(
    () => members.filter((m) => m.group_id === currentUser.group_id),
    [members, currentUser.group_id]
  );
  const adminMemberIds = useMemo(
    () => new Set(adminMembers.map((m) => m.id)),
    [adminMembers]
  );

  // 내 조 체크인 카운트 (하단 바 표시용)
  const adminCheckedCount = useMemo(() => {
    if (!activeSchedule) return 0;
    const ciList = checkInsMap[activeSchedule.id] ?? [];
    return ciList.filter((ci) => adminMemberIds.has(ci.user_id) && !ci.is_absent).length;
  }, [activeSchedule, checkInsMap, adminMemberIds]);

  // Sheet 열 때 현재 체크인 데이터로 초기화
  const openCheckinSheet = useCallback(() => {
    if (!activeSchedule) return;
    const ciList = checkInsMap[activeSchedule.id] ?? [];
    const myCheckIns: CheckIn[] = ciList
      .filter((ci) => adminMemberIds.has(ci.user_id))
      .map((ci) => ({
        id: `admin-ci-${ci.user_id}`,
        user_id: ci.user_id,
        schedule_id: activeSchedule.id,
        checked_at: ci.checked_at ?? new Date().toISOString(),
        checked_by: "admin" as const,
        checked_by_user_id: currentUser.id,
        offline_pending: false,
        is_absent: ci.is_absent,
      }));
    setSheetCheckIns(myCheckIns);
    setCheckinSheetOpen(true);
  }, [activeSchedule, checkInsMap, adminMemberIds, currentUser.id]);

  // Sheet 체크인 변경 → checkInsMap 실시간 동기화
  // (sheetCheckIns는 격리된 state이므로 변경 시마다 checkInsMap에 반영)
  useEffect(() => {
    if (!checkinSheetOpen || !activeSchedule) return;
    const sid = activeSchedule.id;
    setCheckInsMap((prev) => {
      const prevList = prev[sid] ?? [];
      const nonAdminCIs = prevList.filter((ci) => !adminMemberIds.has(ci.user_id));
      const adminCIs: AdminCheckIn[] = sheetCheckIns.map((ci) => ({
        user_id: ci.user_id,
        is_absent: ci.is_absent,
        checked_at: ci.checked_at,
      }));
      return { ...prev, [sid]: [...nonAdminCIs, ...adminCIs] };
    });
  }, [checkinSheetOpen, activeSchedule, adminMemberIds, sheetCheckIns]);

  const closeCheckinSheet = useCallback(() => {
    setCheckinSheetOpen(false);
    // checkInsMap은 sync useEffect에서 이미 갱신됨
    // router.refresh()는 서버 prop(activeSchedule 등)을 최신화하기 위한 호출
    router.refresh();
  }, [router]);

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
      {/* 통일 헤더 + 설정 아이콘 */}
      <PageHeader
        title="미션트립"
        rightSlot={
          <Link
            href="/setup"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900"
            aria-label="설정"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </Link>
        }
      />

      {/* 일차 탭 */}
      <DayTabs
        days={days}
        selected={selectedDay}
        onChange={setSelectedDay}
        panelId="admin-schedule-panel"
      />

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

      {/* 내 조 체크인 하단 바 (활성 일정 있을 때만) */}
      {activeSchedule && (
        <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 border-t bg-white px-4 py-3 pb-safe">
          <button
            onClick={openCheckinSheet}
            className="flex w-full min-h-11 items-center justify-between rounded-2xl bg-main-action px-4 py-3 font-bold focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            <span className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              <span>{adminGroupName} 체크인</span>
            </span>
            <span className="text-sm font-medium text-gray-700">
              {adminCheckedCount}/{adminMembers.length}명
            </span>
          </button>
        </div>
      )}

      {/* 내 조 체크인 Sheet (풀스크린 다이얼로그) */}
      <Dialog open={checkinSheetOpen} onOpenChange={(open) => { if (!open) closeCheckinSheet(); }}>
        <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-lg flex-col gap-0 overflow-hidden rounded-none border-none p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">내 조 체크인</DialogTitle>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <GroupCheckinView
              currentUser={currentUser}
              groupName={adminGroupName}
              members={(() => {
                const scope = activeSchedule?.scope;
                const filtered = (!scope || scope === "all")
                  ? adminMembers
                  : adminMembers.filter((m) => m.party === scope);
                return filtered.map((m) => ({ id: m.id, name: m.name, party: m.party }));
              })()}
              activeSchedule={activeSchedule}
              checkIns={sheetCheckIns}
              setCheckIns={setSheetCheckIns}
              onBack={closeCheckinSheet}
              showToast={showToast}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 토스트 */}
      {toast && (
        <div
          className="fixed bottom-[max(5rem,calc(3.5rem+env(safe-area-inset-bottom)))] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4"
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
