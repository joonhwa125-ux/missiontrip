"use client";

import { useState, useCallback, useTransition, useMemo, type Dispatch, type SetStateAction } from "react";
import { useBroadcast } from "@/hooks/useRealtime";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { createCheckin, deleteCheckin, markAbsent } from "@/actions/checkin";
import { submitReport } from "@/actions/report";
import MemberCard from "./MemberCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  COPY,
  CHANNEL_GLOBAL,
  CHANNEL_ADMIN,
  CHANNEL_GROUP_PREFIX,
  EVENT_CHECKIN_UPDATED,
  EVENT_GROUP_REPORTED,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Schedule, CheckIn, GroupMember } from "@/lib/types";

type Member = GroupMember;

interface Props {
  currentUser: { id: string; group_id: string };
  groupName: string;
  members: Member[];
  activeSchedule: Schedule | null;
  checkIns: CheckIn[];
  setCheckIns: Dispatch<SetStateAction<CheckIn[]>>;
  onBack: () => void;
  showToast: (msg: string) => void;
  initialReported?: boolean;
  onReported?: () => void;
}

export default function GroupCheckinView({
  currentUser,
  groupName,
  members,
  activeSchedule,
  checkIns,
  setCheckIns,
  onBack,
  showToast,
  initialReported = false,
  onReported,
}: Props) {
  const [cancelTarget, setCancelTarget] = useState<{ member: Member; isAbsent: boolean } | null>(null);
  const [absentTarget, setAbsentTarget] = useState<Member | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(initialReported);
  const [, startTransition] = useTransition();

  const { isOnline, pendingCount, addPending, addPendingReport } = useOfflineSync();
  const { broadcast } = useBroadcast();

  const broadcastCheckin = useCallback(
    async (userId: string, action: "insert" | "delete", isAbsent = false) => {
      const payload = { user_id: userId, schedule_id: activeSchedule?.id ?? "", action, is_absent: isAbsent };
      await Promise.all([
        broadcast(CHANNEL_GLOBAL, EVENT_CHECKIN_UPDATED, payload),
        broadcast(`${CHANNEL_GROUP_PREFIX}${currentUser.group_id}`, EVENT_CHECKIN_UPDATED, payload),
        broadcast(CHANNEL_ADMIN, EVENT_CHECKIN_UPDATED, payload),
      ]);
    },
    [activeSchedule, currentUser.group_id, broadcast]
  );

  const handleCheckin = useCallback(
    async (userId: string) => {
      if (!activeSchedule) return;
      const temp: CheckIn = {
        id: `temp-${userId}`,
        user_id: userId,
        schedule_id: activeSchedule.id,
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
          schedule_id: activeSchedule.id,
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
        try {
          const res = await createCheckin(userId, activeSchedule.id);
          if (res.ok) {
            await broadcastCheckin(userId, "insert");
          } else {
            setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
            showToast(res.error ?? "체크인 처리 중 오류가 발생했어요.");
          }
        } catch {
          setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
          showToast("서버 연결에 실패했어요. 다시 시도해주세요.");
        }
      });
    },
    [activeSchedule, isOnline, addPending, currentUser.id, broadcastCheckin, setCheckIns, showToast]
  );

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelTarget || !activeSchedule) return;
    const userId = cancelTarget.member.id;
    setCancelTarget(null);
    setReported(false);
    // 낙관적 제거 전 백업 (롤백용)
    let removed: CheckIn | undefined;
    setCheckIns((prev) => {
      removed = prev.find((c) => c.user_id === userId);
      return prev.filter((c) => c.user_id !== userId);
    });
    startTransition(async () => {
      try {
        const res = await deleteCheckin(userId, activeSchedule.id);
        if (res.ok) {
          await broadcastCheckin(userId, "delete");
        } else {
          if (removed) setCheckIns((prev) => [...prev, removed!]);
          showToast(res.error ?? "취소 처리 중 오류가 발생했어요.");
        }
      } catch {
        if (removed) setCheckIns((prev) => [...prev, removed!]);
        showToast("서버 연결에 실패했어요. 다시 시도해주세요.");
      }
    });
  }, [cancelTarget, activeSchedule, broadcastCheckin, setCheckIns, showToast]);

  const handleAbsentConfirm = useCallback(async () => {
    if (!absentTarget || !activeSchedule) return;
    const userId = absentTarget.id;
    setAbsentTarget(null);
    const temp: CheckIn = {
      id: `absent-${userId}`,
      user_id: userId,
      schedule_id: activeSchedule.id,
      checked_at: new Date().toISOString(),
      checked_by: "leader",
      checked_by_user_id: currentUser.id,
      offline_pending: false,
      is_absent: true,
    };
    setCheckIns((prev) => [...prev.filter((c) => c.user_id !== userId), temp]);
    startTransition(async () => {
      try {
        const res = await markAbsent(userId, activeSchedule.id);
        if (res.ok) {
          await broadcastCheckin(userId, "insert", true);
        } else {
          setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
          showToast(res.error ?? "불참 처리 중 오류가 발생했어요.");
        }
      } catch {
        setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
        showToast("서버 연결에 실패했어요. 다시 시도해주세요.");
      }
    });
  }, [absentTarget, activeSchedule, currentUser.id, broadcastCheckin, setCheckIns, showToast]);

  const handleReport = useCallback(async () => {
    if (!activeSchedule) return;
    const unchecked = members.filter(
      (m) => !checkIns.some((c) => c.user_id === m.id)
    ).length;
    setReportOpen(false);

    if (!isOnline) {
      const saved = addPendingReport({
        group_id: currentUser.group_id,
        schedule_id: activeSchedule.id,
        pending_count: unchecked,
      });
      if (saved) {
        setReported(true);
        showToast(COPY.reportButtonDone);
      } else {
        showToast("저장 공간이 부족해요. 기기 저장소를 확인해주세요.");
      }
      return;
    }

    startTransition(async () => {
      try {
        const res = await submitReport(currentUser.group_id, activeSchedule.id, unchecked);
        if (res.ok) {
          setReported(true);
          onReported?.();
          showToast(COPY.reportButtonDone);
          const reportPayload = {
            group_id: currentUser.group_id,
            schedule_id: activeSchedule.id,
            pending_count: unchecked,
          };
          await Promise.all([
            broadcast(CHANNEL_GLOBAL, EVENT_GROUP_REPORTED, reportPayload),
            broadcast(CHANNEL_ADMIN, EVENT_GROUP_REPORTED, reportPayload),
          ]);
        } else {
          showToast(res.error ?? "보고 처리 중 오류가 발생했어요. 다시 시도해주세요.");
        }
      } catch {
        showToast("서버 연결에 실패했어요. 다시 시도해주세요.");
      }
    });
  }, [activeSchedule, members, checkIns, currentUser.group_id, broadcast, isOnline, addPendingReport, showToast]);

  // CR-005: checkIns → 불참/확인/미확인 정확히 분리
  const checkedIds = useMemo(() => new Set(checkIns.map((c) => c.user_id)), [checkIns]);
  const absentIds = useMemo(() => new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id)), [checkIns]);
  const checkedCount = useMemo(() => checkIns.filter((c) => !c.is_absent).length, [checkIns]);
  // 미확인 = 체크인도 불참도 아닌 순수 미처리 인원
  const uncheckedCount = members.filter((m) => !checkedIds.has(m.id)).length;
  // 탑승 카운트용 전체 = 불참 제외
  const effectiveTotal = members.length - absentIds.size;
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
      {/* 상단 바 (뒤로 가기 포함) */}
      <header className="bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-main-action"
            aria-label="일정 피드로 돌아가기"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold">{groupName} 체크인</h1>
            <p className="text-sm text-muted-foreground">
              {activeSchedule?.location ?? activeSchedule?.title ?? "대기 중"}
            </p>
          </div>
        </div>
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
                      ? "bg-gray-200 text-gray-500"
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
          {COPY.totalCount(checkedCount, effectiveTotal)}
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
        className="flex flex-col gap-2 px-4 pb-28 pt-3"
        aria-label="조원 탑승 현황"
      >
        {sorted.map((m) => (
          <MemberCard
            key={m.id}
            user={m}
            checkIn={checkIns.find((c) => c.user_id === m.id) ?? null}
            onCheckin={handleCheckin}
            onCancel={(m) => {
              const ci = checkIns.find((c) => c.user_id === m.id);
              setCancelTarget({ member: m, isAbsent: ci?.is_absent ?? false });
            }}
            onAbsent={setAbsentTarget}
          />
        ))}
      </ul>

      {/* CR-006+016: 보고 버튼 + 오프라인 배너를 하나의 fixed 컨테이너로 통합 */}
      <div className="fixed bottom-0 left-1/2 w-full max-w-lg -translate-x-1/2 border-t bg-white px-4 py-3 pb-safe">
        {/* 오프라인 배너 — 보고 버튼 위에 인라인 표시 */}
        {!isOnline && (
          <div
            className="mb-2 rounded-lg bg-offline-banner px-3 py-2 text-center text-sm"
            aria-live="polite"
            role="status"
          >
            {COPY.offline(pendingCount)}
          </div>
        )}
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

      {/* 취소 확인 모달 */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {cancelTarget?.isAbsent ? COPY.absentCancel : "체크인을 취소할까요?"}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-center">
            {cancelTarget?.member.name}님의 {cancelTarget?.isAbsent ? "불참" : "탑승 확인"}을 취소해요.
          </DialogDescription>
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
          <DialogDescription className="text-center">
            {absentTarget?.name}님을 불참 처리해요. 탑승 카운트에서 제외돼요.
          </DialogDescription>
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
            <DialogDescription className="sr-only">미완료 인원이 있는 상태에서 보고 여부를 확인합니다.</DialogDescription>
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
