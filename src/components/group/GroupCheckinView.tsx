"use client";

import { useState, useCallback, useTransition, useMemo, type Dispatch, type SetStateAction } from "react";
import { useBroadcast } from "@/hooks/useRealtime";
import { useBroadcastCheckin } from "@/hooks/useBroadcastCheckin";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { createCheckin, deleteCheckin, markAbsent } from "@/actions/checkin";
import { submitReport } from "@/actions/report";
import Image from "next/image";
import MemberCard from "./MemberCard";
import { CancelCheckinDialog, MarkAbsentDialog } from "./CheckinDialogs";
import { CheckIcon, ChevronLeftIcon, XIcon } from "@/components/ui/icons";
import {
  COPY,
  CHANNEL_GLOBAL,
  CHANNEL_ADMIN,
  EVENT_GROUP_REPORTED,
  EVENT_REPORT_INVALIDATED,
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
  /** true이면 닫기(X) 아이콘, false/생략이면 뒤로(<) 아이콘 */
  closeMode?: boolean;
  showToast: (msg: string) => void;
  reported: boolean;
  onReported: () => void;
  onReportReset: () => void;
}

export default function GroupCheckinView({
  currentUser,
  groupName,
  members,
  activeSchedule,
  checkIns,
  setCheckIns,
  onBack,
  closeMode,
  showToast,
  reported,
  onReported,
  onReportReset,
}: Props) {
  const [cancelTarget, setCancelTarget] = useState<{ member: Member; isAbsent: boolean } | null>(null);
  const [absentTarget, setAbsentTarget] = useState<Member | null>(null);
  const [, startTransition] = useTransition();

  const { isOnline, pendingCount, addPending, addPendingReport } = useOfflineSync();
  const { broadcast } = useBroadcast();
  const broadcastCheckin = useBroadcastCheckin(currentUser.group_id, activeSchedule?.id);

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
    onReportReset();
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
          // 보고 무효화 브로드캐스트 (DB에서도 삭제됨 — 다른 뷰 동기화)
          const invalidatePayload = { group_id: currentUser.group_id, schedule_id: activeSchedule.id };
          await Promise.allSettled([
            broadcast(CHANNEL_GLOBAL, EVENT_REPORT_INVALIDATED, invalidatePayload),
            broadcast(CHANNEL_ADMIN, EVENT_REPORT_INVALIDATED, invalidatePayload),
          ]);
        } else {
          if (removed) setCheckIns((prev) => [...prev, removed!]);
          showToast(res.error ?? "취소 처리 중 오류가 발생했어요.");
        }
      } catch {
        if (removed) setCheckIns((prev) => [...prev, removed!]);
        showToast("서버 연결에 실패했어요. 다시 시도해주세요.");
      }
    });
  }, [cancelTarget, activeSchedule, broadcastCheckin, setCheckIns, showToast, onReportReset, currentUser.group_id, broadcast]);

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

    if (!isOnline) {
      const saved = addPendingReport({
        group_id: currentUser.group_id,
        schedule_id: activeSchedule.id,
        pending_count: unchecked,
      });
      if (saved) {
        onReported();
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
          onReported();
          showToast(COPY.reportButtonDone);
          const reportPayload = {
            group_id: currentUser.group_id,
            schedule_id: activeSchedule.id,
            pending_count: unchecked,
          };
          // broadcast 실패는 DB 보고 성공에 영향 없음 — 각자 독립 처리
          await Promise.allSettled([
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
  }, [activeSchedule, members, checkIns, currentUser.group_id, broadcast, isOnline, addPendingReport, showToast, onReported]);

  // CR-005: checkIns → 불참/확인/미확인 정확히 분리
  const checkedIds = useMemo(() => new Set(checkIns.map((c) => c.user_id)), [checkIns]);
  const absentIds = useMemo(() => new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id)), [checkIns]);
  const checkedCount = useMemo(() => checkIns.filter((c) => !c.is_absent).length, [checkIns]);
  // 미확인 = 체크인도 불참도 아닌 순수 미처리 인원
  const uncheckedCount = members.filter((m) => !checkedIds.has(m.id)).length;
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
        {closeMode ? (
          /* closeMode: 모달 패턴 — 타이틀 중앙, X 우측 */
          <div className="relative flex items-center justify-center min-h-11">
            <div className="text-center">
              <h1 className="text-lg font-bold">
                {activeSchedule?.location ?? activeSchedule?.title ?? "대기 중"}
              </h1>
              <div className="flex items-center justify-center gap-2">
                <p className="text-sm text-muted-foreground">{groupName}</p>
                {members.length > 0 && (
                  <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    {checkedCount + absentIds.size}/{members.length}명 완료
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onBack}
              className="absolute right-0 flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="닫기"
            >
              <XIcon className="h-5 w-5" aria-hidden />
            </button>
          </div>
        ) : (
          /* 조장 뷰: 뒤로(<) 좌측, 타이틀 좌측 정렬 */
          <div className="flex items-start gap-2">
            <button
              onClick={onBack}
              className="flex min-h-11 min-w-11 flex-shrink-0 items-start justify-center rounded-lg pt-0.5 focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="일정 피드로 돌아가기"
            >
              <ChevronLeftIcon aria-hidden />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold">
                {activeSchedule?.location ?? activeSchedule?.title ?? "대기 중"}
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">{groupName}</p>
                {members.length > 0 && (
                  <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    {checkedCount + absentIds.size}/{members.length}명 완료
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 이니셜 원 행 */}
      <div className="border-b bg-white">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
          {sorted.map((m) => {
            const checked = checkedIds.has(m.id);
            const absent = absentIds.has(m.id);
            return (
              <div key={m.id} className="relative flex-shrink-0">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full text-[0.625rem] font-bold",
                    absent
                      ? "bg-gray-200 text-gray-500"
                      : checked
                        ? "bg-main-action shadow-sm"
                        : "border-2 border-dashed border-gray-300 bg-gray-100"
                  )}
                  aria-label={`${m.name} ${absent ? "불참" : checked ? "탑승 완료" : "미탑승"}`}
                >
                  {m.name.slice(0, 3)}
                </div>
                {checked && !absent && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 ring-2 ring-white"
                    aria-hidden="true"
                  >
                    <CheckIcon className="h-2.5 w-2.5 text-white" aria-hidden />
                  </span>
                )}
                {absent && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-stone-400 ring-2 ring-white"
                    aria-hidden="true"
                  >
                    <XIcon className="h-2.5 w-2.5 text-white" aria-hidden />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 전원 완료 축하 화면 */}
      {allComplete && (
        <div className={cn(
          "flex flex-col items-center bg-gradient-to-b px-6 py-8 text-center",
          reported ? "from-sky-50/60" : "from-orange-50/50"
        )}>
          <div className="mb-4 animate-bounce" aria-hidden="true">
            <Image src="/horse.png" alt="" width={120} height={120} />
          </div>
          <h2 className="mb-2 text-2xl font-bold">
            {reported ? COPY.allCompleteReported : COPY.allComplete}
          </h2>
          <p className="whitespace-pre-line text-lg font-medium text-stone-600">
            {reported ? COPY.celebrationReported : COPY.celebrationSubtitle}
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
        {reported ? (
          <button
            className="flex w-full items-center justify-center gap-2 min-h-11 rounded-xl border border-[#EBE8E3] bg-app-bg py-4 text-base font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2"
          >
            <CheckIcon className="h-5 w-5 text-complete-check" aria-hidden />
            {COPY.reportButtonDone}
          </button>
        ) : (
          <button
            aria-disabled={!allComplete}
            onClick={allComplete ? handleReport : undefined}
            className={cn(
              "w-full min-h-11 rounded-xl py-4 text-base transition-colors focus-visible:ring-2 focus-visible:ring-offset-2",
              allComplete
                ? "bg-main-action font-bold focus-visible:ring-main-action"
                : "bg-gray-200 text-gray-400 font-medium focus-visible:ring-gray-300"
            )}
          >
            {allComplete ? COPY.reportButtonComplete : COPY.reportButtonPending(uncheckedCount)}
          </button>
        )}
      </div>

      <CancelCheckinDialog
        open={!!cancelTarget}
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirm}
      />
      <MarkAbsentDialog
        open={!!absentTarget}
        target={absentTarget}
        onClose={() => setAbsentTarget(null)}
        onConfirm={handleAbsentConfirm}
      />
    </div>
  );
}
