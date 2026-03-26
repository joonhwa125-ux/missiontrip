"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRealtime } from "@/hooks/useRealtime";
import { useVisibilityRefresh } from "@/hooks/useVisibilityRefresh";
import { useToast } from "@/hooks/useToast";
import { createClient } from "@/lib/supabase/client";
import { sortSchedulesByStatus, getDefaultDay, filterMembersByScope } from "@/lib/utils";
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
import { UsersIcon, PlusIcon, SettingsIcon } from "@/components/ui/icons";
import type { Group, Schedule, AdminMember, AdminCheckIn, AdminReport, CheckIn } from "@/lib/types";

interface Props {
  currentUser: { id: string; group_id: string };
  groups: Group[];
  members: AdminMember[];
  activeSchedule: Schedule | null;
  schedules: Schedule[];
  initialCheckInsMap: Record<string, AdminCheckIn[]>;
  initialReportsMap: Record<string, AdminReport[]>;
}

/** 클라이언트에서 직접 체크인/보고 데이터 조회 (RLS email 기반 권한 통제) */
async function fetchCheckInsClient(scheduleId: string) {
  const supabase = createClient();
  const [{ data: checkIns }, { data: reports }] = await Promise.all([
    supabase
      .from("check_ins")
      .select("user_id, is_absent, checked_at")
      .eq("schedule_id", scheduleId),
    supabase
      .from("group_reports")
      .select("group_id, pending_count, reported_at")
      .eq("schedule_id", scheduleId),
  ]);
  return {
    checkIns: (checkIns ?? []).map((ci) => ({
      user_id: ci.user_id,
      is_absent: ci.is_absent ?? false,
      checked_at: ci.checked_at,
    })),
    reports: reports ?? [],
  };
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
  const { toast, showToast } = useToast();

  // 캐시 판별용 ref (useCallback 의존성 없이 최신 값 참조)
  const checkInsMapRef = useRef(checkInsMap);
  checkInsMapRef.current = checkInsMap;

  // 레이스 컨디션 방어용 ref (현재 열린 바텀시트의 schedule id 추적)
  const bottomSheetIdRef = useRef<string | null>(null);

  // 서버 prop → state 동기화 (router.refresh() / 페이지 재진입 시)
  // useState는 초기값만 사용하므로, prop이 바뀌면 수동으로 state를 갱신해야 한다.
  const prevCheckInsRef = useRef(initialCheckInsMap);
  const prevReportsRef = useRef(initialReportsMap);
  const prevSchedulesRef = useRef(initialSchedules);
  const prevMembersRef = useRef(initialMembers);

  if (prevCheckInsRef.current !== initialCheckInsMap) {
    prevCheckInsRef.current = initialCheckInsMap;
    setCheckInsMap(initialCheckInsMap);
  }
  if (prevReportsRef.current !== initialReportsMap) {
    prevReportsRef.current = initialReportsMap;
    setReportsMap(initialReportsMap);
  }
  if (prevSchedulesRef.current !== initialSchedules) {
    prevSchedulesRef.current = initialSchedules;
    setSchedules(initialSchedules);
  }
  if (prevMembersRef.current !== initialMembers) {
    prevMembersRef.current = initialMembers;
    setMembers(initialMembers);
  }

  // mount 시 + activeSchedule 변경 시 최신 체크인/보고 데이터 fetch (클라이언트 직접 SELECT)
  useEffect(() => {
    if (!activeSchedule) return;
    let cancelled = false;
    fetchCheckInsClient(activeSchedule.id)
      .then(({ checkIns, reports: freshRp }) => {
        if (cancelled) return;
        setCheckInsMap((prev) => ({ ...prev, [activeSchedule.id]: checkIns }));
        // Realtime으로 먼저 도착한 보고가 fetch 결과에 없을 수 있음 — 병합
        setReportsMap((prev) => {
          const existing = prev[activeSchedule.id] ?? [];
          const freshIds = new Set(freshRp.map((r) => r.group_id));
          const realtimeOnly = existing.filter((r) => !freshIds.has(r.group_id));
          return { ...prev, [activeSchedule.id]: [...freshRp, ...realtimeOnly] };
        });
      })
      .catch(() => {}); // 실패 시 SSR/Realtime 데이터로 fallback — 별도 알림 불필요
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSchedule?.id]);

  // 백그라운드 복귀 시 서버 데이터 갱신 (탭 전환 / 페이지 이동 후 stale 방지)
  const fetchOnVisible = useCallback(() => {
    if (!activeSchedule) return;
    fetchCheckInsClient(activeSchedule.id)
      .then(({ checkIns, reports }) => {
        setCheckInsMap((prev) => ({ ...prev, [activeSchedule.id]: checkIns }));
        setReportsMap((prev) => ({ ...prev, [activeSchedule.id]: reports }));
      })
      .catch(() => {}); // 실패 시 기존 캐시 유지 — 별도 알림 불필요
  }, [activeSchedule]);

  useVisibilityRefresh(fetchOnVisible);

  // J-2: 일차 탭 메모이제이션
  const days = useMemo(
    () => Array.from(new Set(schedules.map((s) => s.day_number))).sort(),
    [schedules]
  );
  const [selectedDay, setSelectedDay] = useState(() => getDefaultDay(schedules));

  // 바텀시트 대상 일정
  const [bottomSheetSchedule, setBottomSheetSchedule] = useState<Schedule | null>(null);
  const [bottomSheetLoading, setBottomSheetLoading] = useState(false);

  // 바텀시트 즉시 열기: 캐시 데이터 있으면 스피너 없이, 없으면 스피너 표시
  const openBottomSheet = useCallback((schedule: Schedule | null) => {
    if (!schedule) {
      setBottomSheetSchedule(null);
      bottomSheetIdRef.current = null;
      return;
    }
    const targetId = schedule.id;
    bottomSheetIdRef.current = targetId;
    setBottomSheetSchedule(schedule);

    const hasCache = targetId in checkInsMapRef.current;
    setBottomSheetLoading(!hasCache);

    fetchCheckInsClient(targetId)
      .then(({ checkIns: freshCi, reports: freshRp }) => {
        setCheckInsMap((prev) => ({ ...prev, [targetId]: freshCi }));
        // Realtime으로 먼저 도착한 보고가 fetch 결과에 없을 수 있음 — 병합
        setReportsMap((prev) => {
          const existing = prev[targetId] ?? [];
          const freshIds = new Set(freshRp.map((r) => r.group_id));
          const realtimeOnly = existing.filter((r) => !freshIds.has(r.group_id));
          return { ...prev, [targetId]: [...freshRp, ...realtimeOnly] };
        });
      })
      .catch(() => {}) // 실패 시 캐시 데이터 유지 — 별도 알림 불필요
      .finally(() => {
        // 레이스 컨디션 방어: 현재 바텀시트가 같은 일정일 때만 loading 해제
        if (bottomSheetIdRef.current === targetId) setBottomSheetLoading(false);
      });
  }, []);

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

  // 내 조 미확인 카운트 — scope 필터 적용 후, 체크인 기록이 없는 인원
  // (후발 일정 활성 시 선발 조원은 카운트 제외)
  const adminUncheckedCount = useMemo(() => {
    if (!activeSchedule) return 0;
    const scopeMembers = filterMembersByScope(adminMembers, activeSchedule.scope);
    if (scopeMembers.length === 0) return 0;
    const scopeMemberIds = new Set(scopeMembers.map((m) => m.id));
    const ciList = checkInsMap[activeSchedule.id] ?? [];
    const confirmedIds = new Set(
      ciList.filter((ci) => scopeMemberIds.has(ci.user_id)).map((ci) => ci.user_id)
    );
    return scopeMembers.filter((m) => !confirmedIds.has(m.id)).length;
  }, [activeSchedule, checkInsMap, adminMembers]);

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

  // Realtime 구독
  useRealtime(null, true, {
    onScheduleActivated: () => router.refresh(),
    onScheduleDeactivated: () => router.refresh(),
    onScheduleUpdated: ({ schedule_id, scheduled_time }) => {
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule_id ? { ...s, scheduled_time } : s))
      );
      showToast("일정 시간이 변경되었어요");
    },
    onCheckinUpdated: ({ user_id, schedule_id, action, is_absent }) => {
      const sid = schedule_id?.length ? schedule_id : activeSchedule?.id;
      if (!sid) return;
      setCheckInsMap((prev) => {
        const list = prev[sid] ?? [];
        if (action === "insert") {
          if (list.some((c) => c.user_id === user_id)) return prev;
          return { ...prev, [sid]: [...list, { user_id, is_absent: is_absent ?? false, checked_at: new Date().toISOString() }] };
        }
        return { ...prev, [sid]: list.filter((c) => c.user_id !== user_id) };
      });
    },
    onGroupReported: ({ group_id, schedule_id, pending_count }) => {
      const sid = schedule_id?.length ? schedule_id : activeSchedule?.id;
      if (!sid) return;
      setReportsMap((prev) => {
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
    onReconnected: () => {
      router.refresh();
      showToast("연결이 복구되었어요");
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

  const adminCheckinMembers = useMemo(() => {
    const filtered = filterMembersByScope(adminMembers, activeSchedule?.scope ?? "all");
    return filtered.map((m) => ({ id: m.id, name: m.name, party: m.party }));
  }, [activeSchedule?.scope, adminMembers]);

  // 내 조 Sheet 보고 상태 (reportsMap에서 파생)
  const sheetReported = useMemo(() => {
    if (!activeSchedule) return false;
    return (reportsMap[activeSchedule.id] ?? []).some(
      (r) => r.group_id === currentUser.group_id
    );
  }, [activeSchedule, reportsMap, currentUser.group_id]);

  // B-3: 내 조 Sheet 보고 시 reportsMap 즉시 반영
  const handleSheetReported = useCallback(() => {
    if (!activeSchedule) return;
    const sid = activeSchedule.id;
    setReportsMap((prev) => {
      const list = prev[sid] ?? [];
      if (list.some((r) => r.group_id === currentUser.group_id)) return prev;
      return {
        ...prev,
        [sid]: [...list, {
          group_id: currentUser.group_id,
          pending_count: 0,
          reported_at: new Date().toISOString(),
        }],
      };
    });
  }, [activeSchedule, currentUser.group_id]);

  // 내 조 Sheet 보고 무효화 (체크인 취소 시)
  const handleSheetReportReset = useCallback(() => {
    if (!activeSchedule) return;
    const sid = activeSchedule.id;
    setReportsMap((prev) => {
      const list = prev[sid] ?? [];
      const next = list.filter((r) => r.group_id !== currentUser.group_id);
      if (next.length === list.length) return prev;
      return { ...prev, [sid]: next };
    });
  }, [activeSchedule, currentUser.group_id]);

  return (
    <div className="flex min-h-full flex-col">
      {/* 통일 헤더 + 액션 아이콘 */}
      <PageHeader
        superTitle="2026 링키지랩 미션트립"
        title="혼디모영"
        titleNode={
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span>🍊 혼디모영</span>
            <span className="flex-shrink-0 rounded-full bg-gray-900 px-2 py-0.5 font-semibold text-white text-[clamp(0.6875rem,2.5vw,0.875rem)]">
              관리자
            </span>
          </span>
        }
        rightSlot={
          <div className="-mr-2 flex items-center">
            {activeSchedule && adminCheckinMembers.length > 0 && (
              <button
                onClick={openCheckinSheet}
                className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900"
                aria-label={`${adminGroupName} 체크인 — 미확인 ${adminUncheckedCount}명`}
              >
                <UsersIcon className="h-6 w-6" aria-hidden />
                {adminUncheckedCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[0.625rem] font-bold leading-none text-white">
                    {adminUncheckedCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setAddOpen(true)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900"
              aria-label="일정 추가"
            >
              <PlusIcon className="h-6 w-6" aria-hidden />
            </button>
            <Link
              href="/setup"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900"
              aria-label="설정"
            >
              <SettingsIcon className="h-6 w-6" aria-hidden />
            </Link>
          </div>
        }
      />

      {schedules.length === 0 ? (
        /* 일정 없음 — 초기화 직후 또는 첫 접속 */
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
          <p className="text-base font-medium text-gray-500">
            등록된 일정이 없어요
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            설정에서 데이터를 업로드하거나,{" "}
            <button
              onClick={() => setAddOpen(true)}
              className="inline font-medium text-gray-900 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-main-action"
            >
              일정을 추가
            </button>
            해주세요
          </p>
        </div>
      ) : (
        <>
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
              members={members}
              activeSchedule={activeSchedule}
              onBottomSheet={openBottomSheet}
              onTimeEdit={setTimeEditTarget}
              onToast={showToast}
            />
          </div>
        </>
      )}

      {/* 바텀시트 — 전체 현황 */}
      <AdminBottomSheet
        schedule={bottomSheetSchedule}
        groups={groups}
        members={members}
        checkIns={bottomSheetSchedule ? (checkInsMap[bottomSheetSchedule.id] ?? []) : []}
        reports={bottomSheetSchedule ? (reportsMap[bottomSheetSchedule.id] ?? []) : []}
        isReadOnly={isBottomSheetReadOnly}
        loading={bottomSheetLoading}
        onClose={() => { setBottomSheetSchedule(null); bottomSheetIdRef.current = null; }}
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

      {/* 내 조 체크인 Sheet (풀스크린 다이얼로그) */}
      <Dialog open={checkinSheetOpen} onOpenChange={(open) => { if (!open) closeCheckinSheet(); }}>
        <DialogContent hideClose className="flex h-[100dvh] max-h-[100dvh] w-full max-w-lg flex-col gap-0 overflow-hidden rounded-none border-none p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{adminGroupName} 체크인 다이얼로그</DialogTitle>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <GroupCheckinView
              currentUser={currentUser}
              groupName={adminGroupName}
              members={adminCheckinMembers}
              activeSchedule={activeSchedule}
              checkIns={sheetCheckIns}
              setCheckIns={setSheetCheckIns}
              onBack={closeCheckinSheet}
              showToast={showToast}
              reported={sheetReported}
              onReported={handleSheetReported}
              onReportReset={handleSheetReportReset}
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
