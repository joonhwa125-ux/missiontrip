"use client";

import { useState, useTransition, useMemo } from "react";
import { useBroadcastCheckin } from "@/hooks/useBroadcastCheckin";
import { PhoneIcon, ChevronLeftIcon } from "@/components/ui/icons";
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
import type { Group, Schedule, AdminMember, AdminCheckIn } from "@/lib/types";

type Member = AdminMember;
type CheckIn = AdminCheckIn;

type ConfirmAction =
  | { type: "absent"; member: Member }
  | { type: "cancel"; member: Member };

interface Props {
  group: Group;
  members: Member[];
  checkIns: CheckIn[];
  activeSchedule: Schedule | null;
  onBack: () => void;
  onCheckInsChange: (updater: (prev: CheckIn[]) => CheckIn[]) => void;
}

export default function AdminGroupDrillDown({
  group,
  members,
  checkIns,
  activeSchedule,
  onBack,
  onCheckInsChange,
}: Props) {
  const [, startTransition] = useTransition();
  const broadcastCheckin = useBroadcastCheckin(group.id, activeSchedule?.id);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const groupMembers = useMemo(
    () => members.filter((m) => m.group_id === group.id),
    [members, group]
  );
  const checkedMap = useMemo(
    () => new Map(
      checkIns.filter((c) => groupMembers.some((m) => m.id === c.user_id))
        .map((c) => [c.user_id, c])
    ),
    [checkIns, groupMembers]
  );

  const absentCount = useMemo(
    () => groupMembers.filter((m) => checkedMap.get(m.id)?.is_absent).length,
    [groupMembers, checkedMap]
  );
  const checkedCount = useMemo(
    () => groupMembers.filter((m) => checkedMap.has(m.id) && !checkedMap.get(m.id)!.is_absent).length,
    [groupMembers, checkedMap]
  );

  const sorted = useMemo(() => [...groupMembers].sort((a, b) => {
    const aCheckin = checkedMap.get(a.id);
    const bCheckin = checkedMap.get(b.id);
    const aOrder = !aCheckin ? 0 : aCheckin.is_absent ? 1 : 2;
    const bOrder = !bCheckin ? 0 : bCheckin.is_absent ? 1 : 2;
    return aOrder - bOrder;
  }), [groupMembers, checkedMap]);

  function handleCheckin(member: Member) {
    if (!activeSchedule) return;
    const temp: CheckIn = { user_id: member.id, is_absent: false, checked_at: new Date().toISOString() };
    onCheckInsChange((prev) => [...prev, temp]);
    startTransition(async () => {
      const res = await createCheckin(member.id, activeSchedule.id);
      if (res.ok) {
        await broadcastCheckin(member.id, "insert");
      } else {
        onCheckInsChange((prev) => prev.filter((c) => c.user_id !== member.id));
      }
    });
  }

  function handleAbsent(member: Member) {
    if (!activeSchedule) return;
    const temp: CheckIn = { user_id: member.id, is_absent: true, checked_at: new Date().toISOString() };
    onCheckInsChange((prev) => [...prev.filter((c) => c.user_id !== member.id), temp]);
    startTransition(async () => {
      const res = await markAbsent(member.id, activeSchedule.id);
      if (res.ok) {
        await broadcastCheckin(member.id, "insert", true);
      } else {
        onCheckInsChange((prev) => prev.filter((c) => c.user_id !== member.id));
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
      const res = await deleteCheckin(member.id, activeSchedule.id);
      if (res.ok) {
        await broadcastCheckin(member.id, "delete");
      } else if (removed) {
        onCheckInsChange((prev) => [...prev, removed!]);
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
      {/* 헤더: 뒤로 + 조 이름 + 카운트 */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1">
        <div className="flex items-center gap-1">
          <button
            onClick={onBack}
            className="-ml-2 flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground focus-visible:ring-2 focus-visible:ring-main-action"
            aria-label="현황 목록으로 돌아가기"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <DialogTitle className="text-left text-base font-semibold">
              {group.name}
            </DialogTitle>
            <DialogDescription
              aria-live="polite"
              className="mt-0.5 text-left text-sm text-muted-foreground"
            >
              {checkedCount}/{groupMembers.length}명 확인{absentCount > 0 && ` (불참 ${absentCount})`}
            </DialogDescription>
          </div>
        </div>
      </div>

      {/* 인원 목록 */}
      <ul className="space-y-2 overflow-y-auto px-6 pb-6">
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

function MemberRow({
  member,
  checkin,
  activeSchedule,
  onCheckin,
  onAbsent,
  onCancel,
}: MemberRowProps) {
  const isChecked = checkin && !checkin.is_absent;
  const isAbsent = checkin?.is_absent;
  const isLeader = isLeaderRole(member.role);
  const hasSchedule = !!activeSchedule;

  // 상태 텍스트: 모든 상태에 명시적 레이블 (KWCAG 1.3.3 감각적 특성)
  const statusText = isAbsent
    ? COPY.absent
    : isChecked
    ? checkin?.checked_at
      ? `${formatTime(checkin.checked_at)} 확인`
      : "확인 완료"
    : COPY.notChecked;

  const statusTextClass = isChecked
    ? "text-complete-check"
    : "text-muted-foreground";

  return (
    <li className="flex min-h-[3.5rem] items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
      {/* 이름 + 상태 텍스트 (세로 2줄) */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{member.name}</span>
          {isLeader && (
            <span className="flex-shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-500">
              조장
            </span>
          )}
        </div>
        {/* 상태 텍스트: 색상 + 텍스트 이중 표현 (KWCAG 1.3.3) */}
        <span className={`text-xs ${statusTextClass}`}>
          {statusText}
        </span>
      </div>

      {/* 체크인 액션 */}
      {!checkin && hasSchedule && (
        <>
          <button
            onClick={onAbsent}
            className="min-h-11 flex-shrink-0 rounded-xl border border-red-200 px-3 text-xs font-medium text-red-700 focus-visible:ring-2 focus-visible:ring-red-300"
            aria-label={`${member.name} 불참 처리`}
          >
            {COPY.absent}
          </button>
          <button
            onClick={onCheckin}
            className="min-h-11 flex-shrink-0 rounded-xl bg-main-action px-3 text-xs font-bold focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${member.name} ${COPY.checkinButton}`}
          >
            {COPY.checkinButton}
          </button>
        </>
      )}
      {isChecked && hasSchedule && (
        <button
          onClick={onCancel}
          className="min-h-11 flex-shrink-0 rounded-xl border border-gray-300 px-3 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${member.name} 체크인 취소`}
        >
          {COPY.cancelButton}
        </button>
      )}
      {isAbsent && hasSchedule && (
        <button
          onClick={onCancel}
          className="min-h-11 flex-shrink-0 rounded-xl border border-gray-300 px-3 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${member.name} 불참 취소`}
        >
          {COPY.cancelButton}
        </button>
      )}

      {/* 전화 */}
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
            className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="확인"
          >
            확인
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
