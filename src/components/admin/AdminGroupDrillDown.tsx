"use client";

import { useState, useTransition, useMemo } from "react";
import { useBroadcastCheckin } from "@/hooks/useBroadcastCheckin";
import { PhoneIcon, ChevronDownIcon } from "@/components/ui/icons";
import { createCheckin, deleteCheckin, markAbsent } from "@/actions/checkin";
import { updateUserRole } from "@/actions/setup";
import { COPY } from "@/lib/constants";
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
  | { type: "cancel"; member: Member }
  | { type: "promote"; member: Member }
  | { type: "demote"; member: Member };

interface Props {
  group: Group | null;
  members: Member[];
  checkIns: CheckIn[];
  activeSchedule: Schedule | null;
  onClose: () => void;
  onMembersChange: (members: Member[]) => void;
  onCheckInsChange: (updater: (prev: CheckIn[]) => CheckIn[]) => void;
}

export default function AdminGroupDrillDown({
  group,
  members,
  checkIns,
  activeSchedule,
  onClose,
  onMembersChange,
  onCheckInsChange,
}: Props) {
  const [, startTransition] = useTransition();
  const broadcastCheckin = useBroadcastCheckin(group?.id ?? "", activeSchedule?.id);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const groupMembers = useMemo(
    () => group ? members.filter((m) => m.group_id === group.id) : [],
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
  const totalCount = groupMembers.length - absentCount;
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

  if (!group) return null;

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

  function handleRoleChange(member: Member, newRole: "member" | "leader") {
    startTransition(async () => {
      const res = await updateUserRole(member.id, newRole);
      if (res.ok) {
        onMembersChange(
          members.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
        );
      }
    });
  }

  function handleConfirm(action: ConfirmAction | null) {
    if (!action) return;
    setConfirm(null);

    if (action.type === "absent") handleAbsent(action.member);
    if (action.type === "cancel") handleCancel(action.member);
    if (action.type === "promote") handleRoleChange(action.member, "leader");
    if (action.type === "demote") handleRoleChange(action.member, "member");
  }


  return (
    <>
      <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden p-0">
          <div className="flex-shrink-0 px-6 pt-6">
            <DialogHeader>
              <DialogTitle>{group.name}</DialogTitle>
            </DialogHeader>
            <DialogDescription aria-live="polite">
              {checkedCount}/{totalCount}명 확인
            </DialogDescription>
          </div>
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
                onPromote={() => setConfirm({ type: "promote", member: m })}
                onDemote={() => setConfirm({ type: "demote", member: m })}
              />
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* 확인 모달 */}
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
  onPromote: () => void;
  onDemote: () => void;
}

function MemberRow({
  member,
  checkin,
  activeSchedule,
  onCheckin,
  onAbsent,
  onCancel,
  onPromote,
  onDemote,
}: MemberRowProps) {
  const isChecked = checkin && !checkin.is_absent;
  const isAbsent = checkin?.is_absent;
  const isLeader = member.role === "leader" || member.role === "admin_leader";
  const hasSchedule = !!activeSchedule;

  const roleBadgeClass = isLeader
    ? "flex items-center gap-0.5 rounded-lg border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 min-h-11 flex-shrink-0 focus-visible:ring-2 focus-visible:ring-blue-300"
    : "flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 min-h-11 flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <li className="rounded-xl bg-gray-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-medium">{member.name}</span>

        {/* 역할 배지-버튼 */}
        <button
          onClick={isLeader ? onDemote : onPromote}
          className={roleBadgeClass}
          aria-label={isLeader ? `${member.name} 조장 해제` : `${member.name} 조장 지정`}
        >
          {isLeader ? "조장" : "조원"}
          <ChevronDownIcon aria-hidden />
        </button>

        {/* 체크인 액션 */}
        {!checkin && hasSchedule && (
          <>
            <button
              onClick={onAbsent}
              className="min-h-11 flex-shrink-0 rounded-xl border border-red-200 px-3 text-xs font-medium text-red-600 focus-visible:ring-2 focus-visible:ring-red-300"
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
        {isChecked && (
          <>
            {checkin?.checked_at && (
              <span className="flex-shrink-0 text-xs text-complete-check font-medium">
                {formatTime(checkin.checked_at)} 확인
              </span>
            )}
            {hasSchedule && (
              <button
                onClick={onCancel}
                className="min-h-11 flex-shrink-0 rounded-xl border border-gray-300 px-3 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${member.name} 체크인 취소`}
              >
                {COPY.cancelButton}
              </button>
            )}
          </>
        )}
        {isAbsent && (
          <>
            <span className="flex-shrink-0 text-xs text-muted-foreground font-medium">
              {COPY.absent}
            </span>
            {hasSchedule && (
              <button
                onClick={onCancel}
                className="min-h-11 flex-shrink-0 rounded-xl border border-gray-300 px-3 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${member.name} 불참 취소`}
              >
                {COPY.cancelButton}
              </button>
            )}
          </>
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
      </div>
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
      title: "불참 처리할까요?",
      desc: `${action.member.name}님을 불참 처리해요.`,
    },
    cancel: {
      title: "체크인을 취소할까요?",
      desc: `${action.member.name}님의 체크인을 취소해요.`,
    },
    promote: {
      title: `${action.member.name}을(를) 조장으로 지정할까요?`,
      desc: "조장 권한이 부여됩니다.",
    },
    demote: {
      title: `${action.member.name}의 조장 권한을 해제할까요?`,
      desc: "조원으로 변경됩니다.",
    },
  };

  const { title, desc } = messages[action.type];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{desc}</DialogDescription>
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
