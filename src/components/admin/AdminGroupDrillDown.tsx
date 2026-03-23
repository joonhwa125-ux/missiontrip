"use client";

import { useState, useTransition, useMemo } from "react";
import { useBroadcast } from "@/hooks/useRealtime";
import { createCheckin, deleteCheckin, markAbsent } from "@/actions/checkin";
import { updateUserRole } from "@/actions/setup";
import {
  CHANNEL_GROUP_PREFIX,
  CHANNEL_ADMIN,
  EVENT_CHECKIN_UPDATED,
  COPY,
} from "@/lib/constants";
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
  const { broadcast } = useBroadcast();
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

  const totalCount = groupMembers.length;
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
        await broadcastCheckin(member.group_id, member.id, "insert");
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
        await broadcastCheckin(member.group_id, member.id, "insert");
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
        await broadcastCheckin(member.group_id, member.id, "delete");
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

  async function broadcastCheckin(groupId: string, userId: string, action: "insert" | "delete") {
    const payload = {
      user_id: userId,
      schedule_id: activeSchedule?.id ?? "",
      action,
    };
    await Promise.all([
      broadcast(`${CHANNEL_GROUP_PREFIX}${groupId}`, EVENT_CHECKIN_UPDATED, payload),
      broadcast(CHANNEL_ADMIN, EVENT_CHECKIN_UPDATED, payload),
    ]);
  }

  return (
    <>
      <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{group.name}</DialogTitle>
          </DialogHeader>
          <DialogDescription aria-live="polite">
            {checkedCount}/{totalCount}명 확인
          </DialogDescription>
          <ul className="space-y-2">
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
  const isLeader = member.role === "leader";
  const hasSchedule = !!activeSchedule;

  return (
    <li className="rounded-xl bg-gray-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        {/* 왼쪽: 이름 + 역할 배지 + 전화 */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-medium">{member.name}</span>
          <span
            className={
              isLeader
                ? "flex-shrink-0 rounded-full bg-main-action px-1.5 py-0.5 text-xs font-medium"
                : "flex-shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-muted-foreground"
            }
          >
            {isLeader ? "조장" : "조원"}
          </span>
          {member.phone && (
            <a
              href={`tel:${member.phone}`}
              className="flex min-h-11 min-w-11 items-center justify-center"
              aria-label={`${member.name}에게 전화`}
            >
              <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </a>
          )}
        </div>

        {/* 오른쪽: 상태/액션 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!checkin && hasSchedule && (
            <>
              <button
                onClick={onCheckin}
                className="min-h-11 rounded-xl bg-main-action px-3 text-xs font-bold focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${member.name} ${COPY.checkinButton}`}
              >
                {COPY.checkinButton}
              </button>
              <button
                onClick={onAbsent}
                className="min-h-11 min-w-11 rounded-xl px-2 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${member.name} 불참 처리`}
              >
                {COPY.absent}
              </button>
            </>
          )}
          {isChecked && checkin?.checked_at && (
            <span className="text-xs text-complete-check font-medium">
              {formatTime(checkin.checked_at)} 확인
            </span>
          )}
          {isAbsent && (
            <>
              <span className="text-xs text-muted-foreground font-medium">
                {COPY.absent}
              </span>
              {hasSchedule && (
                <button
                  onClick={onCancel}
                  className="min-h-11 min-w-11 rounded-xl px-2 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${member.name} 불참 취소`}
                >
                  {COPY.cancelButton}
                </button>
              )}
            </>
          )}
          {(isChecked && hasSchedule) && (
            <button
              onClick={onCancel}
              className="min-h-11 min-w-11 rounded-xl px-2 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${member.name} 체크인 취소`}
            >
              {COPY.cancelButton}
            </button>
          )}
        </div>
      </div>

      {/* 조장 권한 변경 */}
      <div className="mt-1 flex justify-end">
        {isLeader ? (
          <button
            onClick={onDemote}
            className="min-h-11 rounded-lg px-2 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${member.name} 조장 해제`}
          >
            조장 해제
          </button>
        ) : (
          <button
            onClick={onPromote}
            className="min-h-11 rounded-lg px-2 text-xs text-blue-600 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${member.name} 조장 지정`}
          >
            조장 지정
          </button>
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
      <DialogContent>
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
