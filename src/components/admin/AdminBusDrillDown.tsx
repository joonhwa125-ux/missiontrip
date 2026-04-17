"use client";

import { useState, useTransition, useMemo } from "react";
import { useBroadcastCheckin } from "@/hooks/useBroadcastCheckin";
import { PhoneIcon, ChevronLeftIcon, CheckIcon, MinusIcon } from "@/components/ui/icons";
import { createCheckin, deleteCheckin, markAbsent } from "@/actions/checkin";
import { COPY, isLeaderRole } from "@/lib/constants";
import { formatTime } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { Schedule, AdminMember, AdminCheckIn } from "@/lib/types";

type Member = AdminMember;
type CheckIn = AdminCheckIn;

type ConfirmAction =
  | { type: "absent"; member: Member }
  | { type: "cancel"; member: Member };

interface Props {
  busName: string;
  busMembers: Member[];
  checkIns: CheckIn[];
  activeSchedule: Schedule | null;
  onBack: () => void;
  onCheckInsChange: (updater: (prev: CheckIn[]) => CheckIn[]) => void;
  showToast?: (msg: string) => void;
}

export default function AdminBusDrillDown({
  busName,
  busMembers,
  checkIns,
  activeSchedule,
  onBack,
  onCheckInsChange,
  showToast,
}: Props) {
  const [, startTransition] = useTransition();
  // 셔틀 일정: global + admin 채널만 broadcast (group 채널 불필요 — 셔틀 모드)
  const broadcastCheckin = useBroadcastCheckin(
    "",
    activeSchedule?.id,
    activeSchedule?.shuttle_type ?? null
  );
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const checkedMap = useMemo(
    () =>
      new Map(
        checkIns
          .filter((c) => busMembers.some((m) => m.id === c.user_id))
          .map((c) => [c.user_id, c])
      ),
    [checkIns, busMembers]
  );

  const absentCount = useMemo(
    () => busMembers.filter((m) => checkedMap.get(m.id)?.is_absent).length,
    [busMembers, checkedMap]
  );

  const checkedCount = useMemo(
    () =>
      busMembers.filter((m) => checkedMap.has(m.id) && !checkedMap.get(m.id)!.is_absent)
        .length,
    [busMembers, checkedMap]
  );

  const sorted = useMemo(
    () =>
      [...busMembers].sort((a, b) => {
        const aCheckin = checkedMap.get(a.id);
        const bCheckin = checkedMap.get(b.id);
        const aOrder = !aCheckin ? 0 : aCheckin.is_absent ? 1 : 2;
        const bOrder = !bCheckin ? 0 : bCheckin.is_absent ? 1 : 2;
        return aOrder - bOrder;
      }),
    [busMembers, checkedMap]
  );

  function handleCheckin(member: Member) {
    if (!activeSchedule) return;
    const temp: CheckIn = { user_id: member.id, is_absent: false, checked_at: new Date().toISOString() };
    onCheckInsChange((prev) => [...prev.filter((c) => c.user_id !== member.id), temp]);
    startTransition(async () => {
      const res = await createCheckin(member.id, activeSchedule.id, activeSchedule.shuttle_type ?? null);
      if (res.ok) {
        await broadcastCheckin(member.id, "insert");
      } else {
        onCheckInsChange((prev) => prev.filter((c) => c.user_id !== member.id));
        showToast?.(res.error ?? "체크인 처리 중 오류가 발생했어요.");
      }
    });
  }

  function handleAbsent(member: Member) {
    if (!activeSchedule) return;
    const temp: CheckIn = { user_id: member.id, is_absent: true, checked_at: new Date().toISOString() };
    onCheckInsChange((prev) => [...prev.filter((c) => c.user_id !== member.id), temp]);
    startTransition(async () => {
      const res = await markAbsent(member.id, activeSchedule.id, activeSchedule.shuttle_type ?? null);
      if (res.ok) {
        await broadcastCheckin(member.id, "insert", true);
      } else {
        onCheckInsChange((prev) => prev.filter((c) => c.user_id !== member.id));
        showToast?.(res.error ?? "불참 처리 중 오류가 발생했어요.");
      }
    });
  }

  function handleCancel(member: Member) {
    if (!activeSchedule) return;
    let removed: CheckIn | undefined;
    onCheckInsChange((prev) => {
      removed = prev.find((c) => c.user_id === member.id);
      return prev.filter((c) => c.user_id !== member.id);
    });
    startTransition(async () => {
      const res = await deleteCheckin(member.id, activeSchedule.id, activeSchedule.shuttle_type ?? null);
      if (res.ok) {
        await broadcastCheckin(member.id, "delete");
      } else {
        if (removed) onCheckInsChange((prev) => [...prev, removed!]);
        showToast?.(res.error ?? "취소 처리 중 오류가 발생했어요.");
      }
    });
  }

  function handleConfirm(action: ConfirmAction | null) {
    if (!action) return;
    setConfirm(null);
    if (action.type === "absent") handleAbsent(action.member);
    if (action.type === "cancel") handleCancel(action.member);
  }

  return (
    <>
      {/* 헤더: 뒤로 + 버스명 + 카운트 */}
      <div className="flex-shrink-0 px-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={onBack}
              className="-ml-2 flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground"
              aria-label="현황 목록으로 돌아가기"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <DialogTitle className="min-w-0 truncate text-left text-base font-semibold">
              {busName}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {checkedCount}/{busMembers.length}명 확인{absentCount > 0 && ` (불참 ${absentCount})`}
            </DialogDescription>
          </div>
          <span className="flex-shrink-0 pr-3 text-sm" aria-live="polite">
            <span className="font-bold text-gray-900">{checkedCount + absentCount}</span>
            <span className="font-normal text-gray-400">/</span>
            <span className="font-medium text-gray-900">{busMembers.length}명</span>
          </span>
        </div>
      </div>

      {/* 인원 목록 */}
      <ul className="space-y-2 overflow-y-auto px-4 pb-6">
        {sorted.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            checkin={checkedMap.get(m.id) ?? null}
            activeSchedule={activeSchedule}
            onCheckin={() => handleCheckin(m)}
            onAbsent={() => setConfirm({ type: "absent", member: m })}
            onCancel={() => setConfirm({ type: "cancel", member: m })}
          />
        ))}
      </ul>

      {/* 확인 모달 (별도 Dialog — 최상위 레이어) */}
      <ConfirmDialog
        action={confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => handleConfirm(confirm)}
      />
    </>
  );
}

// 인원 행 컴포넌트
interface MemberRowProps {
  member: Member;
  checkin: CheckIn | null;
  activeSchedule: Schedule | null;
  onCheckin: () => void;
  onAbsent: () => void;
  onCancel: () => void;
}

function MemberRow({ member, checkin, activeSchedule, onCheckin, onAbsent, onCancel }: MemberRowProps) {
  const isChecked = checkin && !checkin.is_absent;
  const isAbsent = checkin?.is_absent;
  const isLeader = isLeaderRole(member.role);
  const hasSchedule = !!activeSchedule;

  return (
    <li className="flex min-h-[3.5rem] items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate font-medium">{member.name}</span>
        {isLeader && (
          <span className="flex-shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-500">
            조장
          </span>
        )}
        {isChecked ? (
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
            <CheckIcon className="h-3 w-3" aria-hidden />
            {checkin?.checked_at ? formatTime(checkin.checked_at) : "확인"}
            <span className="sr-only">확인 완료</span>
          </span>
        ) : isAbsent ? (
          <>
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
              <MinusIcon className="h-3 w-3" aria-hidden />
              {COPY.absent}
            </span>
            {checkin?.absence_reason && (
              <span className="inline-block flex-shrink min-w-0 max-w-[8rem] truncate rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                {checkin.absence_reason.startsWith("기타:") ? checkin.absence_reason.slice(3).trim() : checkin.absence_reason}
                {checkin.absence_location ? ` · ${checkin.absence_location}` : ""}
              </span>
            )}
          </>
        ) : (
          <span className="flex-shrink-0 text-xs text-muted-foreground">{COPY.notChecked}</span>
        )}
      </div>

      {!checkin && hasSchedule && (
        <>
          <button
            onClick={onAbsent}
            className="min-h-11 flex-shrink-0 rounded-xl border border-stone-300 px-3 text-xs font-bold text-stone-700"
            aria-label={`${member.name} 불참 처리`}
          >
            {COPY.absent}
          </button>
          <button
            onClick={onCheckin}
            className="min-h-11 flex-shrink-0 rounded-xl bg-main-action px-3 text-xs font-bold"
            aria-label={`${member.name} ${COPY.checkinButton}`}
          >
            {COPY.checkinButton}
          </button>
        </>
      )}
      {isChecked && hasSchedule && (
        <button
          onClick={onCancel}
          className="min-h-11 flex-shrink-0 rounded-xl border border-rose-300 px-3 text-xs font-medium text-rose-500"
          aria-label={`${member.name} 체크인 취소`}
        >
          {COPY.cancelButton}
        </button>
      )}
      {isAbsent && hasSchedule && (
        <button
          onClick={onCancel}
          className="min-h-11 flex-shrink-0 rounded-xl border border-rose-300 px-3 text-xs font-medium text-rose-500"
          aria-label={`${member.name} 불참 취소`}
        >
          {COPY.cancelButton}
        </button>
      )}

      {member.phone && (
        <a
          href={`tel:${member.phone}`}
          className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center"
          aria-label={`${member.name}에게 전화`}
        >
          <PhoneIcon />
        </a>
      )}
    </li>
  );
}

// 확인 모달
interface ConfirmDialogProps {
  action: ConfirmAction | null;
  onClose: () => void;
  onConfirm: () => void;
}

function ConfirmDialog({ action, onClose, onConfirm }: ConfirmDialogProps) {
  if (!action) return null;

  const messages: Record<ConfirmAction["type"], { title: string; desc: string }> = {
    absent: {
      title: `${action.member.name} 불참 처리할까요?`,
      desc: "탑승 인원에서 제외돼요.",
    },
    cancel: {
      title: `${action.member.name} 체크인을 취소할까요?`,
      desc: "",
    },
  };

  const { title, desc } = messages[action.type];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        hideClose
        onEscapeKeyDown={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium"
            aria-label="취소"
          >
            취소
          </DialogClose>
          <button
            onClick={onConfirm}
            className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold"
            aria-label="확인"
          >
            확인
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
