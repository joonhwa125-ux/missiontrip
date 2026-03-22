"use client";

import { useState, useCallback, useEffect } from "react";
import { useRealtime } from "@/hooks/useRealtime";
import GroupFeedView from "./GroupFeedView";
import GroupCheckinView from "./GroupCheckinView";
import type { Schedule, CheckIn, Group } from "@/lib/types";

interface Member {
  id: string;
  name: string;
}

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
}: Props) {
  const [view, setView] = useState<ViewMode>("feed");
  const [schedules, setSchedules] = useState(initialSchedules);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialCheckIns);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  // Realtime 구독 — GroupView 레벨 (feed <-> checkin 전환 시에도 유지)
  useRealtime(currentUser.group_id, false, {
    onScheduleActivated: ({ title }) => {
      if (view === "checkin") {
        showToast(`새로운 일정이 시작되었어요: ${title}`);
      } else {
        window.location.reload();
      }
    },
    onScheduleUpdated: ({ schedule_id, scheduled_time }) => {
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule_id ? { ...s, scheduled_time } : s))
      );
      showToast("일정 시간이 변경되었어요");
    },
    onCheckinUpdated: ({ user_id, action }) => {
      if (!activeSchedule) return;
      setCheckIns((prev) => {
        if (action === "insert") {
          if (prev.some((c) => c.user_id === user_id)) return prev;
          return [
            ...prev,
            {
              id: `rt-${user_id}`,
              user_id,
              schedule_id: activeSchedule.id,
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

  const handleEnterCheckin = useCallback(() => setView("checkin"), []);

  const handleBack = useCallback(() => {
    setView("feed");
    // 피드 복귀 시 일정 전환 등 반영을 위해 reload
    if (toast) window.location.reload();
  }, [toast]);

  return (
    <div className="flex min-h-full flex-col">
      {view === "feed" ? (
        <GroupFeedView
          schedules={schedules}
          activeSchedule={activeSchedule}
          members={members}
          checkIns={checkIns}
          scheduleCounts={scheduleCounts}
          allGroups={allGroups}
          allCheckIns={allCheckIns}
          allMembers={allMembers}
          onEnterCheckin={handleEnterCheckin}
        />
      ) : (
        <GroupCheckinView
          currentUser={currentUser}
          groupName={groupName}
          members={members}
          activeSchedule={activeSchedule}
          checkIns={checkIns}
          setCheckIns={setCheckIns}
          onBack={handleBack}
          showToast={showToast}
        />
      )}

      {/* 토스트 */}
      {toast && (
        <div
          className="fixed bottom-[max(1.5rem,_env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-xl bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toast}
          {view === "checkin" && toast.includes("일정이 시작되었어요") && (
            <button
              onClick={() => setView("feed")}
              className="ml-2 min-h-11 font-medium underline focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="피드 화면으로 이동"
            >
              피드로 이동
            </button>
          )}
        </div>
      )}
    </div>
  );
}
