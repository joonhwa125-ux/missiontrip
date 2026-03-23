"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/hooks/useRealtime";
import GroupFeedView from "./GroupFeedView";
import GroupCheckinView from "./GroupCheckinView";
import type { Schedule, CheckIn, Group, GroupMember } from "@/lib/types";

type Member = GroupMember;

interface AllMember {
  id: string;
  group_id: string;
}

interface Props {
  currentUser: { id: string; group_id: string };
  groupName: string;
  members: Member[];
  activeSchedule: Schedule | null;
  initialCheckIns: CheckIn[];
  schedules: Schedule[];
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
  allMembers: AllMember[];
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
  scheduleCounts,
  initialReported,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("feed");
  const [schedules, setSchedules] = useState(initialSchedules);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialCheckIns);
  const [allCheckInsState, setAllCheckInsState] = useState(allCheckIns);
  const [toast, setToast] = useState<string | null>(null);
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

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((msg: string) => setToast(msg), []);

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
    onCheckinUpdated: ({ user_id, action }) => {
      // 전체 현황 바텀시트용 allCheckIns 업데이트 (모든 조)
      setAllCheckInsState((prev) => {
        if (action === "insert") {
          if (prev.some((c) => c.user_id === user_id)) return prev;
          return [...prev, { user_id, is_absent: false }];
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
              checked_by: "self" as const,
              checked_by_user_id: null,
              offline_pending: false,
              is_absent: false,
            },
          ];
        }
        return prev.filter((c) => c.user_id !== user_id);
      });
    },
  });

  // scope 기반 멤버 필터링: 선발/후발 일정이면 해당 party 멤버만
  const checkinMembers = useMemo(() => {
    const scope = currentSchedule?.scope;
    if (!scope || scope === "all") return members;
    return members.filter((m) => m.party === scope);
  }, [members, currentSchedule?.scope]);

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
          initialReported={initialReported}
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
