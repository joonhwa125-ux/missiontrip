"use client";

import { useState, useCallback, useTransition } from "react";
import { useRealtime, useBroadcast } from "@/hooks/useRealtime";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { createCheckin, deleteCheckin } from "@/actions/checkin";
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
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Member | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [, startTransition] = useTransition();

  const { isOnline, pendingCount, addPending } = useOfflineSync();
  const { broadcast } = useBroadcast();

  useRealtime(currentUser.group_id, false, {
    onScheduleActivated: () => window.location.reload(),
    onScheduleUpdated: ({ schedule_id, scheduled_time }) => {
      setSchedule((prev) =>
        prev?.id === schedule_id ? { ...prev, scheduled_time } : prev
      );
    },
    onNotice: ({ message }) => setNotice(message),
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
      };
      setCheckIns((prev) => [...prev.filter((c) => c.user_id !== userId), temp]);

      if (!isOnline) {
        addPending({
          user_id: userId,
          schedule_id: schedule.id,
          checked_by: "leader",
          checked_by_user_id: currentUser.id,
          checked_at: temp.checked_at,
        });
        return;
      }

      startTransition(async () => {
        const res = await createCheckin(userId, schedule.id);
        if (!res.ok) setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
      });
    },
    [schedule, isOnline, addPending, currentUser.id]
  );

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelTarget || !schedule) return;
    const userId = cancelTarget.id;
    setCancelTarget(null);
    setCheckIns((prev) => prev.filter((c) => c.user_id !== userId));
    startTransition(async () => {
      const res = await deleteCheckin(userId, schedule.id);
      if (!res.ok) window.location.reload();
    });
  }, [cancelTarget, schedule]);

  const handleReport = useCallback(async () => {
    if (!schedule) return;
    const unchecked = members.filter(
      (m) => !checkIns.some((c) => c.user_id === m.id)
    ).length;
    setReportOpen(false);
    startTransition(async () => {
      const res = await submitReport(currentUser.group_id, schedule.id, unchecked);
      if (res.ok) {
        await broadcast(CHANNEL_ADMIN, EVENT_GROUP_REPORTED, {
          group_id: currentUser.group_id,
          pending_count: unchecked,
        });
      }
    });
  }, [schedule, members, checkIns, currentUser.group_id, broadcast]);

  const checkedIds = new Set(checkIns.map((c) => c.user_id));
  const uncheckedCount = members.filter((m) => !checkedIds.has(m.id)).length;
  const allComplete = members.length > 0 && uncheckedCount === 0;
  const sorted = [...members].sort(
    (a, b) => Number(checkedIds.has(a.id)) - Number(checkedIds.has(b.id))
  );

  return (
    <div className="flex min-h-screen flex-col bg-app-bg">
      {/* 공지 배너 */}
      {notice && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2 bg-notice-banner px-4 py-3"
        >
          <p className="flex-1 text-sm">{notice}</p>
          <button
            onClick={() => setNotice(null)}
            className="flex min-h-11 min-w-11 items-center justify-center text-lg"
            aria-label="공지 닫기"
          >
            ✕
          </button>
        </div>
      )}

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
            return (
              <div key={m.id} className="relative flex-shrink-0">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold",
                    checked
                      ? "bg-main-action"
                      : "border-2 border-dashed border-gray-300 bg-gray-100"
                  )}
                  aria-label={`${m.name} ${checked ? "탑승 완료" : "미탑승"}`}
                >
                  {m.name.charAt(0)}
                </div>
                {checked && (
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
      {allComplete ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-4 text-6xl" aria-hidden="true">
            🎉
          </div>
          <h2 className="mb-2 text-2xl font-bold">{COPY.allComplete(groupName)}</h2>
          <p className="mb-8 text-muted-foreground">모두 탑승했어요! 보고해주세요.</p>
        </div>
      ) : (
        /* 조원 카드 리스트 */
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
            />
          ))}
        </ul>
      )}

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

      {/* 보고 버튼 — 항상 활성 */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4">
        <button
          onClick={() => (allComplete ? handleReport() : setReportOpen(true))}
          className={cn(
            "w-full min-h-11 rounded-2xl py-4 text-base font-bold transition-colors focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2",
            allComplete ? "bg-main-action" : "bg-gray-100 text-gray-700"
          )}
        >
          {allComplete
            ? COPY.reportButtonComplete
            : COPY.reportButtonPending(uncheckedCount)}
        </button>
      </div>

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
