"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRealtime, useBroadcast } from "@/hooks/useRealtime";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { createCheckin, deleteCheckin, markAbsent } from "@/actions/checkin";
import { submitReport } from "@/actions/report";
import MemberCard from "./MemberCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  COPY,
  CHANNEL_ADMIN,
  CHANNEL_GROUP_PREFIX,
  EVENT_CHECKIN_UPDATED,
  EVENT_GROUP_REPORTED,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Schedule, CheckIn } from "@/lib/types";

interface Member {
  id: string;
  name: string;
}

interface Props {
  currentUser: { id: string; group_id: string };
  groupName: string;
  members: Member[];
  activeSchedule: Schedule | null;
  initialCheckIns: CheckIn[];
}

export default function GroupCheckinView({
  currentUser,
  groupName,
  members,
  activeSchedule,
  initialCheckIns,
}: Props) {
  const [schedule, setSchedule] = useState(activeSchedule);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(initialCheckIns);
  const [cancelTarget, setCancelTarget] = useState<Member | null>(null);
  const [absentTarget, setAbsentTarget] = useState<Member | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const { isOnline, pendingCount, addPending, addPendingReport } = useOfflineSync();
  const { broadcast } = useBroadcast();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useRealtime(currentUser.group_id, false, {
    onScheduleActivated: () => window.location.reload(),
    onScheduleUpdated: ({ schedule_id, scheduled_time }) => {
      setSchedule((prev) =>
        prev?.id === schedule_id ? { ...prev, scheduled_time } : prev
      );
    },
    onCheckinUpdated: ({ user_id, action }) => {
      if (!schedule) return;
      setCheckIns((prev) => {
        if (action === "insert") {
          if (prev.some((c) => c.user_id === user_id)) return prev;
          return [
            ...prev,
            {
              id: `rt-${user_id}`,
              user_id,
              schedule_id: schedule.id,
              checked_at: new Date().toISOString(),
              checked_by: "self",
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

  const handleCheckin = useCallback(
    async (userId: string) => {
      if (!schedule) return;
      const temp: CheckIn = {
        id: `temp-${userId}`,
        user_id: userId,
        schedule_id: schedule.id,
        checked_at: new Date().toISOString(),
        checked_by: "leader",
        checked_by_user_id: currentUser.id,
        offline_pending: !isOnline,
        is_absent: false,
      };
      setCheckIns((prev) => [...prev.filter((c) => c.user_id !== userId), temp]);

      if (!isOnline) {
        const saved = addPending({
          user_id: userId,
          schedule_id: schedule.id,
          checked_by: "leader",
          checked_by_user_id: currentUser.id,
          checked_at: temp.checked_at,
        });
        if (!saved) {
          setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
          showToast("저장 공간이 부족해요. 기기 저장소를 확인해주세요.");
        }
        return;
      }

      startTransition(async () => {
        const res = await createCheckin(userId, schedule.id);
        if (res.ok) {
          const payload = { user_id: userId, schedule_id: schedule.id, action: "insert" as const };
          await Promise.all([
            broadcast(`${CHANNEL_GROUP_PREFIX}${currentUser.group_id}`, EVENT_CHECKIN_UPDATED, payload),
            broadcast(CHANNEL_ADMIN, EVENT_CHECKIN_UPDATED, payload),
          ]);
        } else {
          setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
          showToast(res.error ?? "체크인 처리 중 오류가 발생했어요.");
        }
      });
    },
    [schedule, isOnline, addPending, currentUser.id, currentUser.group_id, broadcast]
  );

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelTarget || !schedule) return;
    const userId = cancelTarget.id;
    setCancelTarget(null);
    setReported(false);
    setCheckIns((prev) => prev.filter((c) => c.user_id !== userId));
    startTransition(async () => {
      const res = await deleteCheckin(userId, schedule.id);
      if (res.ok) {
        const payload = { user_id: userId, schedule_id: schedule.id, action: "delete" as const };
        await Promise.all([
          broadcast(`${CHANNEL_GROUP_PREFIX}${currentUser.group_id}`, EVENT_CHECKIN_UPDATED, payload),
          broadcast(CHANNEL_ADMIN, EVENT_CHECKIN_UPDATED, payload),
        ]);
      } else {
        showToast(res.error ?? "취소 처리 중 오류가 발생했어요.");
        window.location.reload();
      }
    });
  }, [cancelTarget, schedule, currentUser.group_id, broadcast]);

  const handleAbsentConfirm = useCallback(async () => {
    if (!absentTarget || !schedule) return;
    const userId = absentTarget.id;
    setAbsentTarget(null);
    const temp: CheckIn = {
      id: `absent-${userId}`,
      user_id: userId,
      schedule_id: schedule.id,
      checked_at: new Date().toISOString(),
      checked_by: "leader",
      checked_by_user_id: currentUser.id,
      offline_pending: false,
      is_absent: true,
    };
    setCheckIns((prev) => [...prev.filter((c) => c.user_id !== userId), temp]);
    startTransition(async () => {
      const res = await markAbsent(userId, schedule.id);
      if (res.ok) {
        const payload = { user_id: userId, schedule_id: schedule.id, action: "insert" as const };
        await Promise.all([
          broadcast(`${CHANNEL_GROUP_PREFIX}${currentUser.group_id}`, EVENT_CHECKIN_UPDATED, payload),
          broadcast(CHANNEL_ADMIN, EVENT_CHECKIN_UPDATED, payload),
        ]);
      } else {
        setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
        showToast(res.error ?? "불참 처리 중 오류가 발생했어요.");
      }
    });
  }, [absentTarget, schedule, currentUser.id, currentUser.group_id, broadcast]);

  const handleReport = useCallback(async () => {
    if (!schedule) return;
    const unchecked = members.filter(
      (m) => !checkIns.some((c) => c.user_id === m.id)
    ).length;
    setReportOpen(false);

    if (!isOnline) {
      const saved = addPendingReport({
        group_id: currentUser.group_id,
        schedule_id: schedule.id,
        pending_count: unchecked,
      });
      if (saved) {
        setReported(true);
      } else {
        showToast("저장 공간이 부족해요. 기기 저장소를 확인해주세요.");
      }
      return;
    }

    startTransition(async () => {
      const res = await submitReport(currentUser.group_id, schedule.id, unchecked);
      if (res.ok) {
        setReported(true);
        await broadcast(CHANNEL_ADMIN, EVENT_GROUP_REPORTED, {
          group_id: currentUser.group_id,
          pending_count: unchecked,
        });
      } else {
        showToast(res.error ?? "보고 처리 중 오류가 발생했어요. 다시 시도해주세요.");
      }
    });
  }, [schedule, members, checkIns, currentUser.group_id, broadcast, isOnline, addPendingReport]);

  const checkedIds = new Set(checkIns.map((c) => c.user_id));
  const absentIds = new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id));
  const uncheckedCount = members.filter(
    (m) => !checkedIds.has(m.id)
  ).length;
  const allComplete = members.length > 0 && uncheckedCount === 0;
  // 정렬: 미확인 → 불참 → 완료
  const sorted = [...members].sort((a, b) => {
    const aChecked = checkedIds.has(a.id);
    const bChecked = checkedIds.has(b.id);
    const aAbsent = absentIds.has(a.id);
    const bAbsent = absentIds.has(b.id);
    // 미확인(0) < 불참(1) < 완료(2)
    const aOrder = aChecked ? (aAbsent ? 1 : 2) : 0;
    const bOrder = bChecked ? (bAbsent ? 1 : 2) : 0;
    return aOrder - bOrder;
  });

  return (
    <div className="flex flex-1 flex-col">
      {/* 상단 바 */}
      <header className="bg-white px-4 py-4 shadow-sm">
        <h1 className="text-lg font-bold">{schedule?.title ?? "대기 중"}</h1>
        {schedule?.location && (
          <p className="mt-0.5 text-sm text-muted-foreground">{schedule.location}</p>
        )}
      </header>

      {/* 이니셜 원 행 */}
      <div className="border-b bg-white">
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {sorted.map((m) => {
            const checked = checkedIds.has(m.id);
            const absent = absentIds.has(m.id);
            return (
              <div key={m.id} className="relative flex-shrink-0">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold",
                    absent
                      ? "bg-gray-200 text-gray-400"
                      : checked
                        ? "bg-main-action"
                        : "border-2 border-dashed border-gray-300 bg-gray-100"
                  )}
                  aria-label={`${m.name} ${absent ? "불참" : checked ? "탑승 완료" : "미탑승"}`}
                >
                  {m.name.charAt(0)}
                </div>
                {checked && !absent && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-complete-check"
                    aria-hidden="true"
                  >
                    <svg
                      className="h-2.5 w-2.5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p
          className="px-4 pb-2 text-sm font-medium text-muted-foreground"
          aria-live="polite"
        >
          {COPY.totalCount(members.length - uncheckedCount, members.length)}
        </p>
      </div>

      {/* 전원 완료 축하 화면 */}
      {allComplete && (
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <div className="mb-4 text-6xl" aria-hidden="true">
            🎉
          </div>
          <h2 className="mb-2 text-2xl font-bold">{COPY.allComplete(groupName)}</h2>
          <p className="text-muted-foreground">
            {reported ? "보고 완료! 수고하셨어요." : "모두 탑승했어요! 보고해주세요."}
          </p>
        </div>
      )}

      {/* 조원 카드 리스트 — 전원 완료 시에도 취소 가능하도록 항상 표시 */}
      <ul
        className="flex flex-col gap-2 px-4 pb-36 pt-3"
        aria-label="조원 탑승 현황"
      >
        {sorted.map((m) => (
          <MemberCard
            key={m.id}
            user={m}
            checkIn={checkIns.find((c) => c.user_id === m.id) ?? null}
            onCheckin={handleCheckin}
            onCancel={setCancelTarget}
            onAbsent={setAbsentTarget}
          />
        ))}
      </ul>

      {/* 오프라인 배너 (하단 고정) */}
      {!isOnline && (
        <div
          className="fixed bottom-20 left-0 right-0 bg-offline-banner px-4 py-2 text-center text-sm"
          aria-live="polite"
          role="status"
        >
          {COPY.offline(pendingCount)}
        </div>
      )}

      {/* 보고 버튼 — 항상 활성, 탭 바 위에 위치 */}
      <div className="fixed bottom-12 left-0 right-0 border-t bg-white px-4 py-3">
        <button
          onClick={() => (allComplete ? handleReport() : setReportOpen(true))}
          className={cn(
            "w-full min-h-11 rounded-2xl py-4 text-base font-bold transition-colors focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2",
            reported
              ? "bg-complete-card text-[#27500A]"
              : allComplete
                ? "bg-main-action"
                : "bg-gray-100 text-gray-700"
          )}
        >
          {reported
            ? COPY.reportButtonDone
            : allComplete
              ? COPY.reportButtonComplete
              : COPY.reportButtonPending(uncheckedCount)}
        </button>
      </div>

      {/* 에러 토스트 */}
      {toast && (
        <div
          className="fixed bottom-24 left-4 right-4 z-50 rounded-xl bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-lg"
          role="alert"
          aria-live="assertive"
        >
          {toast}
        </div>
      )}

      {/* 취소 확인 모달 */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>체크인을 취소할까요?</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            {cancelTarget?.name}님의 탑승 확인을 취소해요.
          </p>
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              아니요
            </DialogClose>
            <button
              onClick={handleCancelConfirm}
              className="min-h-11 flex-1 rounded-xl bg-red-500 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-red-500"
            >
              취소할게요
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 불참 확인 모달 */}
      <Dialog
        open={!!absentTarget}
        onOpenChange={(o) => !o && setAbsentTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>불참 처리할까요?</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            {absentTarget?.name}님을 불참 처리해요. 탑승 카운트에서 제외돼요.
          </p>
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              아니요
            </DialogClose>
            <button
              onClick={handleAbsentConfirm}
              className="min-h-11 flex-1 rounded-xl bg-gray-700 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-ring"
            >
              불참 처리
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 보고 확인 모달 (미완료 시) */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {uncheckedCount}명이 아직이에요. 그래도 보고할까요?
            </DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              취소
            </DialogClose>
            <button
              onClick={handleReport}
              className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action"
            >
              보고하기
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
