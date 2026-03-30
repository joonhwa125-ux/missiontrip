"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/hooks/useRealtime";
import { useVisibilityRefresh } from "@/hooks/useVisibilityRefresh";
import { useToast } from "@/hooks/useToast";
import { COPY } from "@/lib/constants";
import { filterMembersByScope } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import GroupFeedView from "./GroupFeedView";
import GroupCheckinView from "./GroupCheckinView";
import type { Schedule, CheckIn, Group, GroupMember, GroupMemberBrief } from "@/lib/types";

type Member = GroupMember;

interface Props {
  currentUser: { id: string; group_id: string; shuttle_bus: string | null; return_shuttle_bus: string | null };
  groupName: string;
  members: Member[];
  shuttleMembers: Member[];
  returnShuttleMembers: Member[];
  activeSchedule: Schedule | null;
  initialCheckIns: CheckIn[];
  schedules: Schedule[];
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
  allMembers: GroupMemberBrief[];
  allReports: { group_id: string }[];
  scheduleCounts: Record<string, number>;
  scheduleAbsentCounts: Record<string, number>;
  initialReported: boolean;
}

type ViewMode = "feed" | "checkin";

export default function GroupView({
  currentUser,
  groupName,
  members,
  shuttleMembers,
  returnShuttleMembers,
  activeSchedule,
  initialCheckIns,
  schedules: initialSchedules,
  allGroups,
  allCheckIns,
  allMembers,
  allReports: initialReports,
  scheduleCounts,
  scheduleAbsentCounts,
  initialReported,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("feed");
  const [schedules, setSchedules] = useState(initialSchedules);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialCheckIns);
  const [allCheckInsState, setAllCheckInsState] = useState(allCheckIns);
  const [allReportsState, setAllReportsState] = useState(initialReports);
  // reported 초기값: DB 보고 이력 AND 현재 전원 확인 완료 시에만 true
  // → 세션 중 체크인한 경우 수동 보고 필수
  const [reported, setReported] = useState(() => {
    if (!initialReported) return false;
    const scope = activeSchedule?.scope ?? "all";
    const filtered = filterMembersByScope(members, scope);
    const ids = new Set(initialCheckIns.map((c) => c.user_id));
    return filtered.length > 0 && filtered.every((m) => ids.has(m.id));
  });
  const { toast, showToast } = useToast();
  // CR-009: activeSchedule을 state로 관리 — 체크인 뷰에서도 Realtime 갱신 반영
  const [currentSchedule, setCurrentSchedule] = useState(activeSchedule);

  // W-3: 보고 무효화 중 self-echo 차단용 ref (취소→재체크인 사이에만 true)
  const reportInvalidatedRef = useRef(false);
  // F-4: 전원완료→미완료 전환만 감지 (초기 마운트 스킵)
  const prevCheckinCompleteRef = useRef(false);

  // CR-010: 뒤로가기 히스토리 관리
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const handlePopState = () => {
      if (viewRef.current === "checkin") {
        setView("feed");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 타겟 fetch: 현재 일정의 체크인만 클라이언트에서 직접 조회 (router.refresh() 대신)
  const fetchLatestCheckIns = useCallback(async () => {
    if (!currentSchedule) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("check_ins")
      .select("*")
      .eq("schedule_id", currentSchedule.id);
    if (!data) return;
    const memberIdSet = new Set(members.map((m) => m.id));
    setCheckIns(data.filter((ci) => memberIdSet.has(ci.user_id)) as CheckIn[]);
    setAllCheckInsState(data.map((ci) => ({ user_id: ci.user_id, is_absent: ci.is_absent })));
  }, [currentSchedule, members]);

  // 백그라운드 복귀 시 타겟 fetch (router.refresh() 대신 — 0-flash 방지)
  useVisibilityRefresh(fetchLatestCheckIns);

  // 일정 전환 시 체크인 상태 리셋 + 최신 데이터 fetch (key prop 제거 대응)
  const prevScheduleIdRef = useRef(currentSchedule?.id);
  useEffect(() => {
    if (prevScheduleIdRef.current === currentSchedule?.id) return;
    prevScheduleIdRef.current = currentSchedule?.id;
    // 즉시 리셋 (이전 일정 데이터 잔류 방지)
    setCheckIns([]);
    setAllCheckInsState([]);
    setAllReportsState([]);
    setReported(false);
    // 새 일정 데이터 fetch
    fetchLatestCheckIns();
  }, [currentSchedule?.id, fetchLatestCheckIns]);

  // Realtime 구독 — GroupView 레벨 (feed <-> checkin 전환 시에도 유지)
  useRealtime(currentUser.group_id, false, {
    onScheduleActivated: ({ schedule_id, title, scope, location, day_number, scheduled_time, shuttle_type }) => {
      if (viewRef.current === "checkin") {
        // 셔틀 일정 활성화 + 해당 버스 미배정 → 체크인 뷰에서 즉시 피드로 복귀
        const hasShuttle = shuttle_type === "departure"
          ? !!currentUser.shuttle_bus
          : shuttle_type === "return"
            ? !!currentUser.return_shuttle_bus
            : false;
        if (shuttle_type && !hasShuttle) {
          showToast(`새로운 일정이 시작되었어요: ${title}`);
          setView("feed");
          history.replaceState(null, "");
          router.refresh();
          return;
        }
        showToast(`새로운 일정이 시작되었어요: ${title}`);
        setCurrentSchedule((prev) => ({
          id: schedule_id,
          title,
          location: location ?? prev?.location ?? null,
          day_number: day_number ?? prev?.day_number ?? 1,
          sort_order: prev?.sort_order ?? 0,
          scheduled_time: scheduled_time ?? prev?.scheduled_time ?? null,
          scope: scope ?? "all",
          is_active: true,
          shuttle_type: shuttle_type ?? null,
          activated_at: new Date().toISOString(),
          created_at: prev?.created_at ?? new Date().toISOString(),
        }));
      } else {
        router.refresh();
      }
    },
    onScheduleDeactivated: () => {
      if (viewRef.current === "checkin") {
        showToast(COPY.scheduleDeactivated);
        setView("feed");
        // history.pushState로 추가된 엔트리 정리 — stale 히스토리 방지
        history.replaceState(null, "");
      }
      router.refresh();
    },
    onScheduleUpdated: ({ schedule_id, scheduled_time }) => {
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule_id ? { ...s, scheduled_time } : s))
      );
      showToast("일정 시간이 변경되었어요");
    },
    onGroupReported: ({ group_id }) => {
      // W-3: 보고 무효화 중(취소→재체크인) self-echo만 차단, 평소에는 통과 (multi-tab 호환)
      if (group_id === currentUser.group_id && reportInvalidatedRef.current) return;
      setAllReportsState((prev) =>
        prev.some((r) => r.group_id === group_id)
          ? prev
          : [...prev, { group_id }]
      );
    },
    onReportInvalidated: ({ group_id }) => {
      // 체크인 취소 → 보고 무효화: allReportsState에서 제거
      setAllReportsState((prev) => {
        const next = prev.filter((r) => r.group_id !== group_id);
        return next.length === prev.length ? prev : next;
      });
      // 내 조 보고 무효화 시 reported + ref도 리셋
      if (group_id === currentUser.group_id) {
        setReported(false);
        reportInvalidatedRef.current = true;
      }
    },
    onCheckinUpdated: ({ user_id, action, is_absent }) => {
      // 전체 현황 바텀시트용 allCheckIns 업데이트 (모든 조)
      setAllCheckInsState((prev) => {
        if (action === "insert") {
          if (prev.some((c) => c.user_id === user_id)) return prev;
          return [...prev, { user_id, is_absent: is_absent ?? false }];
        }
        return prev.filter((c) => c.user_id !== user_id);
      });

      // 내 조 체크인 상세 업데이트
      if (!currentSchedule) return;
      setCheckIns((prev) => {
        if (action === "insert") {
          if (prev.some((c) => c.user_id === user_id)) return prev;
          return [
            ...prev,
            {
              id: `rt-${user_id}`,
              user_id,
              schedule_id: currentSchedule.id,
              checked_at: new Date().toISOString(),
              checked_by: "leader" as const,
              checked_by_user_id: null,
              offline_pending: false,
              is_absent: is_absent ?? false,
            },
          ];
        }
        return prev.filter((c) => c.user_id !== user_id);
      });
    },
    onReconnected: () => {
      fetchLatestCheckIns();
      showToast("연결이 복구되었어요");
    },
  });

  // 내 조 checkIns 변경 → allCheckInsState에 동기화
  // (useBroadcast와 useRealtime이 별도 채널 인스턴스를 사용하므로 self-echo가 도달하지 않음)
  useEffect(() => {
    const myMemberIds = new Set(members.map((m) => m.id));
    setAllCheckInsState((prev) => {
      const withoutMyGroup = prev.filter((c) => !myMemberIds.has(c.user_id));
      const myCheckIns = checkIns.map((c) => ({ user_id: c.user_id, is_absent: c.is_absent }));
      return [...withoutMyGroup, ...myCheckIns];
    });
  }, [checkIns, members]);

  // 셔틀 일정: 해당 버스 인원 / 일반 일정: 조 인원 scope 필터
  const effectiveMembers = useMemo(() => {
    if (currentSchedule?.shuttle_type === "departure") return shuttleMembers;
    if (currentSchedule?.shuttle_type === "return") return returnShuttleMembers;
    return filterMembersByScope(members, currentSchedule?.scope ?? "all");
  }, [currentSchedule?.shuttle_type, currentSchedule?.scope, members, shuttleMembers, returnShuttleMembers]);

  // 체크인 취소 시 reported 자동 리셋 — 전원 미완료가 되면 보고 무효화
  const checkinComplete = useMemo(() => {
    const ids = new Set(checkIns.map((c) => c.user_id));
    return effectiveMembers.length > 0 && effectiveMembers.every((m) => ids.has(m.id));
  }, [checkIns, effectiveMembers]);

  useEffect(() => {
    const wasComplete = prevCheckinCompleteRef.current;
    prevCheckinCompleteRef.current = checkinComplete;

    // 전원완료→미완료 전환 시에만 무효화 (초기 마운트 시 wasComplete=false → 스킵)
    if (wasComplete && !checkinComplete) {
      reportInvalidatedRef.current = true;
      setReported(false);
      setAllReportsState((prev) => {
        const next = prev.filter((r) => r.group_id !== currentUser.group_id);
        return next.length === prev.length ? prev : next;
      });
    } else if (checkinComplete) {
      reportInvalidatedRef.current = false;
    }
  }, [checkinComplete, currentUser.group_id]);

  // 보고 완료 시 allReportsState에 즉시 반영 (self-echo 미도달 대응)
  // 셔틀 일정은 group_id 기반 allReportsState 업데이트 불필요
  const handleReported = useCallback(() => {
    setReported(true);
    if (!currentSchedule?.shuttle_type) {
      setAllReportsState((prev) =>
        prev.some((r) => r.group_id === currentUser.group_id)
          ? prev
          : [...prev, { group_id: currentUser.group_id }]
      );
    }
  }, [currentUser.group_id, currentSchedule?.shuttle_type]);

  // 보고 무효화 (체크인 취소 시) — reported + allReportsState + ref 일괄 처리
  const handleReportReset = useCallback(() => {
    setReported(false);
    reportInvalidatedRef.current = true;
    if (!currentSchedule?.shuttle_type) {
      setAllReportsState((prev) => {
        const next = prev.filter((r) => r.group_id !== currentUser.group_id);
        return next.length === prev.length ? prev : next;
      });
    }
  }, [currentUser.group_id, currentSchedule?.shuttle_type]);

  // CR-010: 체크인 진입 시 히스토리 푸시
  const handleEnterCheckin = useCallback(() => {
    history.pushState(null, "");
    setView("checkin");
  }, []);

  // CR-010: 뒤로가기 시 히스토리 pop
  const handleBack = useCallback(() => {
    history.back();
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      {view === "feed" ? (
        <GroupFeedView
          schedules={schedules}
          activeSchedule={currentSchedule}
          members={members}
          shuttleBus={currentUser.shuttle_bus}
          returnShuttleBus={currentUser.return_shuttle_bus}
          checkIns={checkIns}
          scheduleCounts={scheduleCounts}
          scheduleAbsentCounts={scheduleAbsentCounts}
          allGroups={allGroups}
          allCheckIns={allCheckInsState}
          allMembers={allMembers}
          allReports={allReportsState}
          onEnterCheckin={handleEnterCheckin}
        />
      ) : (
        <GroupCheckinView
          currentUser={currentUser}
          groupName={groupName}
          members={effectiveMembers}
          activeSchedule={currentSchedule}
          checkIns={checkIns}
          setCheckIns={setCheckIns}
          onBack={handleBack}
          showToast={showToast}
          reported={reported}
          onReported={handleReported}
          onReportReset={handleReportReset}
        />
      )}

      {/* CR-016: 토스트에 max-w-lg 적용 */}
      {toast && (
        <div
          className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-xl bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-lg">
            {toast}
            {view === "checkin" && toast.includes("일정이 시작되었어요") && (
              <button
                onClick={() => {
                  setView("feed");
                  showToast("");
                }}
                className="ml-2 min-h-11 font-medium underline focus-visible:ring-2 focus-visible:ring-main-action"
                aria-label="피드 화면으로 이동"
              >
                피드로 이동
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
