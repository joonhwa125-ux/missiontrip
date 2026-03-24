"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/hooks/useRealtime";
import { useVisibilityRefresh } from "@/hooks/useVisibilityRefresh";
import { useToast } from "@/hooks/useToast";
import { filterMembersByScope } from "@/lib/utils";
import GroupFeedView from "./GroupFeedView";
import GroupCheckinView from "./GroupCheckinView";
import type { Schedule, CheckIn, Group, GroupMember, GroupMemberBrief } from "@/lib/types";

type Member = GroupMember;

interface Props {
  currentUser: { id: string; group_id: string };
  groupName: string;
  members: Member[];
  activeSchedule: Schedule | null;
  initialCheckIns: CheckIn[];
  schedules: Schedule[];
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
  allMembers: GroupMemberBrief[];
  allReports: { group_id: string }[];
  scheduleCounts: Record<string, number>;
  initialReported: boolean;
}

type ViewMode = "feed" | "checkin";

export default function GroupView({
  currentUser,
  groupName,
  members,
  activeSchedule,
  initialCheckIns,
  schedules: initialSchedules,
  allGroups,
  allCheckIns,
  allMembers,
  allReports: initialReports,
  scheduleCounts,
  initialReported,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("feed");
  const [schedules, setSchedules] = useState(initialSchedules);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialCheckIns);
  const [allCheckInsState, setAllCheckInsState] = useState(allCheckIns);
  const [allReportsState, setAllReportsState] = useState(initialReports);
  const [reported, setReported] = useState(initialReported);
  const { toast, showToast } = useToast();
  // CR-009: activeSchedule을 state로 관리 — 체크인 뷰에서도 Realtime 갱신 반영
  const [currentSchedule, setCurrentSchedule] = useState(activeSchedule);

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

  // 백그라운드 복귀 시 서버 데이터 갱신 (탭 전환 후 stale 방지)
  useVisibilityRefresh();

  // Realtime 구독 — GroupView 레벨 (feed <-> checkin 전환 시에도 유지)
  useRealtime(currentUser.group_id, false, {
    onScheduleActivated: ({ schedule_id, title }) => {
      if (viewRef.current === "checkin") {
        showToast(`새로운 일정이 시작되었어요: ${title}`);
        setCurrentSchedule((prev) => ({
          id: schedule_id,
          title,
          location: prev?.location ?? null,
          day_number: prev?.day_number ?? 1,
          sort_order: prev?.sort_order ?? 0,
          scheduled_time: prev?.scheduled_time ?? null,
          scope: prev?.scope ?? "all",
          is_active: true,
          activated_at: new Date().toISOString(),
          created_at: prev?.created_at ?? new Date().toISOString(),
        }));
      } else {
        router.refresh();
      }
    },
    onScheduleUpdated: ({ schedule_id, scheduled_time }) => {
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule_id ? { ...s, scheduled_time } : s))
      );
      showToast("일정 시간이 변경되었어요");
    },
    onGroupReported: ({ group_id }) => {
      setAllReportsState((prev) =>
        prev.some((r) => r.group_id === group_id)
          ? prev
          : [...prev, { group_id }]
      );
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

  const checkinMembers = useMemo(() => {
    return filterMembersByScope(members, currentSchedule?.scope ?? "all");
  }, [members, currentSchedule?.scope]);

  // 보고 완료 시 allReportsState에 즉시 반영 (self-echo 미도달 대응)
  const handleReported = useCallback(() => {
    setReported(true);
    setAllReportsState((prev) =>
      prev.some((r) => r.group_id === currentUser.group_id)
        ? prev
        : [...prev, { group_id: currentUser.group_id }]
    );
  }, [currentUser.group_id]);

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
          groupName={groupName}
          schedules={schedules}
          activeSchedule={currentSchedule}
          members={members}
          checkIns={checkIns}
          scheduleCounts={scheduleCounts}
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
          members={checkinMembers}
          activeSchedule={currentSchedule}
          checkIns={checkIns}
          setCheckIns={setCheckIns}
          onBack={handleBack}
          showToast={showToast}
          initialReported={reported}
          onReported={handleReported}
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
