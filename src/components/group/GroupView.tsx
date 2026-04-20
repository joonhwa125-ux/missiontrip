"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/hooks/useRealtime";
import { useVisibilityRefresh } from "@/hooks/useVisibilityRefresh";
import { useToast } from "@/hooks/useToast";
import { useAutoActivate } from "@/hooks/useAutoActivate";
import { COPY } from "@/lib/constants";
import { filterMembersByScope } from "@/lib/utils";
import { memberMatchesAirlineFilter } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import GroupFeedView from "./GroupFeedView";
import GroupCheckinView from "./GroupCheckinView";
import type {
  Schedule,
  CheckIn,
  GroupMember,
  BriefingData,
  EffectiveRosterClient,
  ScheduleMemberInfo,
  ScheduleGroupInfo,
} from "@/lib/types";

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
  scheduleCounts: Record<string, number>;
  scheduleAbsentCounts: Record<string, number>;
  initialReported: boolean;
  briefing: BriefingData | null;
  /** v2 Phase F: 활성 일정의 effective roster (non-shuttle일 때만 null 아님) */
  effectiveRoster: EffectiveRosterClient | null;
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
  scheduleCounts,
  scheduleAbsentCounts,
  initialReported,
  briefing,
  effectiveRoster,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("feed");
  const [schedules, setSchedules] = useState(initialSchedules);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialCheckIns);
  // Phase G 후속 fix: briefing을 state로 lift → onMemberUpdated 시 클라이언트 refetch로
  //                  0-flash 업데이트. 서버 router.refresh()도 병행되지만 briefingState가
  //                  먼저 최신화되어 깜빡임 해소.
  const [briefingState, setBriefingState] = useState<BriefingData | null>(briefing);
  // briefingState 초기화 여부 — fetchLatestBriefing deps 고정용(briefingState 직접 의존 제거)
  const briefingInitializedRef = useRef(briefing !== null);

  // prop→state 동기화 (router.refresh() 시 서버에서 새 props가 올 때 state도 갱신)
  const prevSchedulesRef = useRef(initialSchedules);
  const prevCheckInsRef = useRef(initialCheckIns);
  const prevBriefingRef = useRef(briefing);

  if (prevSchedulesRef.current !== initialSchedules) {
    prevSchedulesRef.current = initialSchedules;
    setSchedules(initialSchedules);
  }
  if (prevCheckInsRef.current !== initialCheckIns) {
    prevCheckInsRef.current = initialCheckIns;
    if (initialCheckIns.length > 0 || checkIns.length === 0) {
      setCheckIns(initialCheckIns);
    }
  }
  if (prevBriefingRef.current !== briefing) {
    prevBriefingRef.current = briefing;
    if (briefing) {
      setBriefingState(briefing);
      briefingInitializedRef.current = true;
    }
  }
  // reported 초기값: DB 보고 이력 AND 현재 전원 확인 완료 시에만 true
  // → 세션 중 체크인한 경우 수동 보고 필수
  const [reported, setReported] = useState(() => {
    if (!initialReported) return false;
    const scope = activeSchedule?.scope ?? "all";
    const byScope = filterMembersByScope(members, scope);
    const filtered = activeSchedule?.shuttle_type
      ? byScope
      : byScope.filter((m) => memberMatchesAirlineFilter(activeSchedule?.airline_filter ?? null, m));
    const ids = new Set(initialCheckIns.map((c) => c.user_id));
    return filtered.length > 0 && filtered.every((m) => ids.has(m.id));
  });
  const { toast, showToast } = useToast();
  // CR-009: activeSchedule을 state로 관리 — 체크인 뷰에서도 Realtime 갱신 반영
  const [currentSchedule, setCurrentSchedule] = useState(activeSchedule);
  // 운영 버그 수정: router.refresh로 새 activeSchedule prop이 도착해도
  //                currentSchedule state가 동기화되지 않아 일정 카드가 stale로 표시되던 문제.
  //                다른 prop들과 동일한 prop→state 패턴 적용.
  const prevActiveScheduleRef = useRef(activeSchedule);
  if (prevActiveScheduleRef.current !== activeSchedule) {
    prevActiveScheduleRef.current = activeSchedule;
    setCurrentSchedule(activeSchedule);
  }

  // Phase B: 조장이 탭한 일정 (활성/대기/완료 모두 가능).
  // null이면 feed 뷰. non-null이면 checkin 뷰가 이 일정을 대상으로 렌더.
  // currentSchedule(DB 활성)과는 독립 — 조장은 대기·완료 일정도 열람 가능.
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

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
        // Phase B: feed 복귀 시 selectedSchedule도 정리 — view ↔ selected 상태 불일치 방지
        setSelectedSchedule(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Phase B: 현재 뷰가 바라보는 일정. feed 뷰는 currentSchedule(DB 활성),
  //          checkin 뷰는 selectedSchedule(조장이 탭한 일정). checkIns state는 이 일정 기준.
  const viewSchedule = view === "checkin" ? selectedSchedule : currentSchedule;

  // 타겟 fetch: viewSchedule의 체크인을 클라이언트에서 직접 조회
  const fetchLatestCheckIns = useCallback(async () => {
    if (!viewSchedule) return;
    const supabase = createClient();
    // 탭 복귀 시 auth 세션 복원 보장 (RLS 쿼리 전 필수)
    await supabase.auth.getSession();
    const { data } = await supabase
      .from("check_ins")
      .select("id, user_id, schedule_id, checked_at, checked_by, checked_by_user_id, offline_pending, is_absent")
      .eq("schedule_id", viewSchedule.id);
    if (!data) return;
    // 빈 결과이고 기존 데이터가 있으면 덮어쓰지 않기 (auth 미복원 방어)
    if (data.length === 0 && checkIns.length > 0) return;
    const memberIdSet = new Set(members.map((m) => m.id));
    setCheckIns(data.filter((ci) => memberIdSet.has(ci.user_id)) as CheckIn[]);
  }, [viewSchedule, members, checkIns.length]);

  // 백그라운드 복귀 시 타겟 fetch (router.refresh() 대신 — 0-flash 방지)
  useVisibilityRefresh(fetchLatestCheckIns);

  // Phase A: 조장 분산 타이머 — 관리자 탭 부재 시에도 일정 시각이 되면
  //          자동으로 활성화되도록 조장 18명이 분산 수행.
  //          서버 RPC가 시각·상태를 원자적 검증하므로 중복·조작 안전.
  useAutoActivate(schedules);

  // Phase G 후속 fix: 브리핑 데이터 타겟 fetch — schedule_group_info + schedule_member_info만 조회
  // onMemberUpdated에서 router.refresh보다 먼저 호출되어 클라이언트가 즉시 최신 브리핑을 표시.
  // RLS는 permanent leader/admin 기준으로 설계되어 있으므로 해당 역할에서는 정상 동작한다
  // (temp_leader edge case는 병행 router.refresh로 커버됨).
  const fetchLatestBriefing = useCallback(async () => {
    if (!briefingInitializedRef.current) return; // 초기 null일 때는 스킵 (서버 props 도착 후 sync)
    const supabase = createClient();
    await supabase.auth.getSession();

    const baseMemberIds = members.map((m) => m.id);
    const [sgiRes, smiByUserRes, smiByTempRes] = await Promise.all([
      supabase
        .from("schedule_group_info")
        .select("id, schedule_id, group_id, group_location, note, created_at, updated_at, updated_by")
        .eq("group_id", currentUser.group_id),
      baseMemberIds.length > 0
        ? supabase
            .from("schedule_member_info")
            .select("id, schedule_id, user_id, temp_group_id, temp_role, excused_reason, activity, menu, note, caused_by_smi_id, created_at, updated_at, updated_by")
            .in("user_id", baseMemberIds)
        : Promise.resolve({ data: [] as ScheduleMemberInfo[] }),
      supabase
        .from("schedule_member_info")
        .select("id, schedule_id, user_id, temp_group_id, temp_role, excused_reason, activity, menu, note, caused_by_smi_id, created_at, updated_at, updated_by")
        .eq("temp_group_id", currentUser.group_id),
    ]);

    const smiById = new Map<string, ScheduleMemberInfo>();
    for (const row of (smiByUserRes.data ?? []) as ScheduleMemberInfo[]) smiById.set(row.id, row);
    for (const row of (smiByTempRes.data ?? []) as ScheduleMemberInfo[]) smiById.set(row.id, row);
    const smiRows = Array.from(smiById.values());
    const sgiRows = (sgiRes.data ?? []) as ScheduleGroupInfo[];

    // 브리핑에 등장하는 일정만 scheduleSummaries에 포함 (서버 로직과 동일)
    // airline_leg 또는 notice가 있는 일정도 포함 (항공사 섹션 · 공지 섹션 트리거)
    const briefingScheduleIds = new Set<string>();
    for (const s of sgiRows) briefingScheduleIds.add(s.schedule_id);
    for (const s of smiRows) briefingScheduleIds.add(s.schedule_id);
    for (const s of schedules) {
      if (s.airline_leg || s.notice) briefingScheduleIds.add(s.id);
    }
    const newScheduleSummaries = schedules
      .filter((s) => briefingScheduleIds.has(s.id))
      .map((s) => ({
        schedule_id: s.id,
        title: s.title,
        location: s.location,
        day_number: s.day_number,
        sort_order: s.sort_order,
        scheduled_time: s.scheduled_time,
        airline_leg: s.airline_leg,
        notice: s.notice,
      }))
      .sort((a, b) => a.day_number - b.day_number || a.sort_order - b.sort_order);

    setBriefingState((prev) => {
      if (!prev) return prev;
      // RLS/네트워크 빈 응답 방어: 기존에 데이터가 있었고 이번 응답만 빈 경우 덮어쓰지 않음
      const prevHadData = prev.groupInfos.length > 0 || prev.memberInfos.length > 0;
      if (sgiRows.length === 0 && smiRows.length === 0 && prevHadData) return prev;
      return {
        ...prev,
        groupInfos: sgiRows,
        memberInfos: smiRows,
        scheduleSummaries: newScheduleSummaries,
        cachedAt: new Date().toISOString(),
      };
    });
  }, [members, currentUser.group_id, schedules]);

  // Phase B: viewSchedule 전환 시(feed↔checkin 진입, 다른 일정 탭 등) 체크인 상태 리셋 + fetch
  const prevViewScheduleIdRef = useRef(viewSchedule?.id);
  useEffect(() => {
    if (prevViewScheduleIdRef.current === viewSchedule?.id) return;
    prevViewScheduleIdRef.current = viewSchedule?.id;
    // 즉시 리셋 (이전 일정 데이터 잔류 방지)
    setCheckIns([]);
    setReported(false);
    // 새 일정 데이터 fetch
    fetchLatestCheckIns();
  }, [viewSchedule?.id, fetchLatestCheckIns]);

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
          setSelectedSchedule(null); // Phase B: view ↔ selected 정합성
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
          airline_leg: prev?.airline_leg ?? null,
          airline_filter: prev?.airline_filter ?? null,
          notice: prev?.notice ?? null,
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
        setSelectedSchedule(null); // Phase B: view ↔ selected 정합성
        // history.pushState로 추가된 엔트리 정리 — stale 히스토리 방지
        history.replaceState(null, "");
      }
      router.refresh();
    },
    onMemberUpdated: () => {
      // Phase G 후속 fix: 브리핑은 클라이언트에서 즉시 refetch → 깜빡임 방지.
      //                  effectiveRoster / shuttleMembers 등은 서버 refresh로 커버.
      fetchLatestBriefing();
      router.refresh();
    },
    onScheduleUpdated: ({ schedule_id, scheduled_time }) => {
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule_id ? { ...s, scheduled_time } : s))
      );
      showToast("일정 시간이 변경되었어요");
    },
    onReportInvalidated: ({ group_id }) => {
      // 내 조 보고 무효화 시 reported + ref 리셋
      if (group_id === currentUser.group_id) {
        setReported(false);
        reportInvalidatedRef.current = true;
      }
    },
    onCheckinUpdated: ({ user_id, action, is_absent }) => {
      // 내 조 체크인 상세 업데이트 — 활성 일정 기준으로만 발생
      // Phase B: 조장이 과거/대기 일정 열람 중이면 반영 금지 (체크인 목록 오염 방지)
      if (!currentSchedule) return;
      if (viewSchedule?.id !== currentSchedule.id) return;
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
              absence_reason: null,
              absence_location: null,
              group_id_at_checkin: null,
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

  // Phase B: 현재 뷰 일정이 DB 활성 일정과 같을 때만 effectiveRoster(transfer/excused) 적용.
  //          대기/완료 일정 열람 시에는 base members 사용 (server effectiveRoster는 active 전용).
  const isViewingActive = viewSchedule !== null && viewSchedule.id === currentSchedule?.id;

  // 셔틀 일정: 해당 버스 인원 / 일반 일정: 조 인원 scope 필터
  // Phase F: active 일정 + effectiveRoster 주어진 경우 roster.activeMembers 사용 (이동 반영)
  //         대기/완료 일정은 base members 사용
  const effectiveMembers = useMemo(() => {
    if (viewSchedule?.shuttle_type === "departure") return shuttleMembers;
    if (viewSchedule?.shuttle_type === "return") return returnShuttleMembers;
    const rosterSource = (isViewingActive && effectiveRoster?.activeMembers) ? effectiveRoster.activeMembers : members;
    const byScope = filterMembersByScope(rosterSource, viewSchedule?.scope ?? "all");
    // airline_filter: 해당 편 탑승자만 체크인 대상 (예: 티웨이 일정엔 티웨이 탑승자만)
    return byScope.filter((m) => memberMatchesAirlineFilter(viewSchedule?.airline_filter ?? null, m));
  }, [viewSchedule?.shuttle_type, viewSchedule?.scope, viewSchedule?.airline_filter, members, shuttleMembers, returnShuttleMembers, effectiveRoster, isViewingActive]);

  // Phase F: 제외 인원 (scope + airline_filter 적용) — 체크인 카운트에서 제외하고 별도 섹션에 표시
  // Phase B: active 일정만 effectiveRoster 사용. 대기/완료는 제외 정보 없음.
  const scopedExcused = useMemo(() => {
    if (!isViewingActive || !effectiveRoster || viewSchedule?.shuttle_type) return [];
    const byScope = filterMembersByScope(effectiveRoster.excusedMembers, viewSchedule?.scope ?? "all");
    return byScope.filter((m) => memberMatchesAirlineFilter(viewSchedule?.airline_filter ?? null, m));
  }, [effectiveRoster, viewSchedule?.scope, viewSchedule?.airline_filter, viewSchedule?.shuttle_type, isViewingActive]);

  // Phase F: main roster = effectiveMembers - 제외
  const excusedIdSet = useMemo(() => new Set(scopedExcused.map((m) => m.id)), [scopedExcused]);
  const mainMembers = useMemo(
    () => effectiveMembers.filter((m) => !excusedIdSet.has(m.id)),
    [effectiveMembers, excusedIdSet]
  );

  // Phase F: transferredIn 배지용 (user_id → origin_group_name)
  // Phase B: active 일정만 roster 적용
  const transferredInMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!isViewingActive || !effectiveRoster) return map;
    for (const t of effectiveRoster.transferredIn) map.set(t.id, t.origin_group_name);
    return map;
  }, [effectiveRoster, isViewingActive]);

  // Phase F: memberInfoMap — 섹션 헤더 그루핑 (activity/excused_reason 조회용)
  // Phase B: active 일정은 effectiveRoster 사용.
  // Phase C Tier 1: 대기/완료 일정도 briefingState.memberInfos에서 fallback 조회
  //                 → 임시조장 배지 · 메모가 일정 상태와 무관하게 일관 표시.
  const memberInfoMap = useMemo(() => {
    const map = new Map<string, ScheduleMemberInfo>();
    if (!viewSchedule) return map;
    if (isViewingActive && effectiveRoster) {
      for (const info of effectiveRoster.memberInfos) map.set(info.user_id, info);
      return map;
    }
    // 대기/완료 일정: briefing 데이터에서 해당 schedule_id 필터링
    if (briefingState) {
      for (const info of briefingState.memberInfos) {
        if (info.schedule_id === viewSchedule.id) {
          map.set(info.user_id, info);
        }
      }
    }
    return map;
  }, [viewSchedule, isViewingActive, effectiveRoster, briefingState]);

  // 체크인 취소 시 reported 자동 리셋 — 전원 미완료가 되면 보고 무효화
  // Phase F: 제외 인원은 보고 완료 판정에서 제외 (mainMembers 기준)
  const checkinComplete = useMemo(() => {
    const ids = new Set(checkIns.map((c) => c.user_id));
    return mainMembers.length > 0 && mainMembers.every((m) => ids.has(m.id));
  }, [checkIns, mainMembers]);

  useEffect(() => {
    const wasComplete = prevCheckinCompleteRef.current;
    prevCheckinCompleteRef.current = checkinComplete;

    // 전원완료→미완료 전환 시에만 무효화 (초기 마운트 시 wasComplete=false → 스킵)
    if (wasComplete && !checkinComplete) {
      reportInvalidatedRef.current = true;
      setReported(false);
    } else if (checkinComplete) {
      reportInvalidatedRef.current = false;
    }
  }, [checkinComplete]);

  const handleReported = useCallback(() => {
    setReported(true);
  }, []);

  // 보고 무효화 (체크인 취소 시) — reported + ref 리셋
  const handleReportReset = useCallback(() => {
    setReported(false);
    reportInvalidatedRef.current = true;
  }, []);

  // Phase B: 체크인 진입 — 탭된 일정을 selectedSchedule로 설정
  const handleEnterCheckin = useCallback((schedule: Schedule) => {
    setSelectedSchedule(schedule);
    history.pushState(null, "");
    setView("checkin");
  }, []);

  // CR-010: 뒤로가기 시 히스토리 pop. popstate 리스너가 view="feed"로 복귀시킴
  const handleBack = useCallback(() => {
    history.back();
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      {view === "feed" || !selectedSchedule ? (
        <GroupFeedView
          schedules={schedules}
          members={members}
          shuttleBus={currentUser.shuttle_bus}
          returnShuttleBus={currentUser.return_shuttle_bus}
          checkIns={checkIns}
          scheduleCounts={scheduleCounts}
          scheduleAbsentCounts={scheduleAbsentCounts}
          onEnterCheckin={handleEnterCheckin}
          groupId={currentUser.group_id}
          groupName={groupName}
          briefing={briefingState}
        />
      ) : (
        <GroupCheckinView
          currentUser={currentUser}
          groupName={groupName}
          members={mainMembers}
          excusedMembers={scopedExcused}
          transferredInMap={transferredInMap}
          memberInfoMap={memberInfoMap}
          schedule={selectedSchedule}
          isEditable={selectedSchedule.is_active}
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
                  setSelectedSchedule(null); // Phase B: view ↔ selected 정합성
                  showToast("");
                }}
                className="ml-2 min-h-11 font-medium underline"
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
