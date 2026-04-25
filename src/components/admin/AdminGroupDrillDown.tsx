"use client";

import { useState, useTransition, useMemo } from "react";
import { useBroadcast } from "@/hooks/useRealtime";
import { useBroadcastCheckin } from "@/hooks/useBroadcastCheckin";
import { PhoneIcon, ChevronLeftIcon, CheckIcon, MinusIcon } from "@/components/ui/icons";
import { createCheckin, deleteCheckin, markAbsent } from "@/actions/checkin";
import { COPY, CHANNEL_GLOBAL, CHANNEL_ADMIN, EVENT_REPORT_INVALIDATED, isLeaderRole } from "@/lib/constants";
import { formatTime } from "@/lib/utils";
import { computeEffectiveGroupMembers } from "@/lib/rosterClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { Group, Schedule, AdminMember, AdminCheckIn, ScheduleMemberInfo } from "@/lib/types";

type Member = AdminMember;
type CheckIn = AdminCheckIn;

type ConfirmAction =
  | { type: "absent"; member: Member }
  | { type: "cancel"; member: Member };

interface Props {
  group: Group;
  members: Member[];
  /** Phase J: 이 schedule의 schedule_member_info (effective roster + 임시 조장 표시) */
  memberInfos: ScheduleMemberInfo[];
  checkIns: CheckIn[];
  activeSchedule: Schedule | null;
  onBack: () => void;
  onCheckInsChange: (updater: (prev: CheckIn[]) => CheckIn[]) => void;
  showToast?: (msg: string) => void;
}

export default function AdminGroupDrillDown({
  group,
  members,
  memberInfos,
  checkIns,
  activeSchedule,
  onBack,
  onCheckInsChange,
  showToast,
}: Props) {
  const [, startTransition] = useTransition();
  const broadcastCheckin = useBroadcastCheckin(group.id, activeSchedule?.id);
  const { broadcast } = useBroadcast();
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  // Phase J: effective roster — 일반 일정만 적용. 셔틀 일정은 기존 current group 기준 유지.
  const groupMembers = useMemo(() => {
    if (activeSchedule?.shuttle_type) {
      return members.filter((m) => m.group_id === group.id);
    }
    return computeEffectiveGroupMembers(group.id, members, memberInfos);
  }, [members, memberInfos, group.id, activeSchedule?.shuttle_type]);

  // Phase J: 이 일정에서 임시 조장 user_id 집합 (MemberRow에서 배지 표시)
  const tempLeaderIds = useMemo(
    () =>
      new Set(
        memberInfos.filter((s) => s.temp_role === "leader").map((s) => s.user_id)
      ),
    [memberInfos]
  );
  // Phase J: 합류 인원 (transferredIn) — 원래 조가 다른데 이 조로 이동된 사람
  const joinedFromMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const smi of memberInfos) {
      if (smi.temp_group_id === group.id) {
        const u = members.find((m) => m.id === smi.user_id);
        if (u && u.group_id !== group.id) {
          // 원래 조의 이름을 표시하기 위해 group_id만 저장 (group 이름은 drill-down 차원에선 생략)
          map.set(u.id, u.group_id);
        }
      }
    }
    return map;
  }, [memberInfos, members, group.id]);
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
    onCheckInsChange((prev) => [...prev.filter((c) => c.user_id !== member.id), temp]);
    startTransition(async () => {
      const res = await createCheckin(member.id, activeSchedule.id, activeSchedule.shuttle_type ?? null);
      if (res.ok) {
        // 근본 수정: 서버 응답으로 진짜 row 교체 (prop sync race 차단).
        // Issue #2 fix: AdminCheckIn 필드만 명시 추출 — 전체 CheckIn 객체가
        // 경량 state로 흘러들어가는 타입 누수 차단.
        if (res.data) {
          const adminRow: CheckIn = {
            user_id: res.data.user_id,
            is_absent: res.data.is_absent,
            checked_at: res.data.checked_at,
            absence_reason: res.data.absence_reason,
            absence_location: res.data.absence_location,
          };
          onCheckInsChange((prev) => prev.map((c) => (c.user_id === member.id ? adminRow : c)));
        }
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
        if (res.data) {
          const adminRow: CheckIn = {
            user_id: res.data.user_id,
            is_absent: res.data.is_absent,
            checked_at: res.data.checked_at,
            absence_reason: res.data.absence_reason,
            absence_location: res.data.absence_location,
          };
          onCheckInsChange((prev) => prev.map((c) => (c.user_id === member.id ? adminRow : c)));
        }
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
        // M-5: 보고 무효화 broadcast (Server Action이 DB 삭제, 클라이언트 상태 동기화)
        const p = { group_id: group.id, schedule_id: activeSchedule.id };
        await Promise.allSettled([
          broadcast(CHANNEL_GLOBAL, EVENT_REPORT_INVALIDATED, p),
          broadcast(CHANNEL_ADMIN, EVENT_REPORT_INVALIDATED, p),
        ]);
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
      {/* 헤더: 뒤로 + 조 이름 + 카운트 */}
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
              {group.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {checkedCount}/{groupMembers.length}명 확인{absentCount > 0 && ` (불참 ${absentCount})`}
            </DialogDescription>
          </div>
          <span className="flex-shrink-0 pr-3 text-sm" aria-live="polite">
            <span className="font-bold text-gray-900">{checkedCount + absentCount}</span>
            <span className="font-normal text-gray-400">/</span>
            <span className="font-medium text-gray-900">{groupMembers.length}명</span>
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
            isTempLeader={tempLeaderIds.has(m.id)}
            isJoined={joinedFromMap.has(m.id)}
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
  /** Phase J: 임시 조장 (smi.temp_role='leader')이면 true */
  isTempLeader?: boolean;
  /** Phase J: 이 조에 다른 조에서 합류한 경우 true */
  isJoined?: boolean;
  onCheckin: () => void;
  onAbsent: () => void;
  onCancel: () => void;
}

function MemberRow({
  member,
  checkin,
  activeSchedule,
  isTempLeader,
  isJoined,
  onCheckin,
  onAbsent,
  onCancel,
}: MemberRowProps) {
  const isChecked = checkin && !checkin.is_absent;
  const isAbsent = checkin?.is_absent;
  const isLeader = isLeaderRole(member.role);
  const hasSchedule = !!activeSchedule;

  return (
    <li className="flex min-h-[3.5rem] items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
      {/* 이름 + 배지 (한 줄) */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate font-medium">{member.name}</span>
        {isLeader && !isTempLeader && (
          <span className="flex-shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-500">
            조장
          </span>
        )}
        {isTempLeader && (
          <span className="flex-shrink-0 rounded-md bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-800">
            임시 조장
          </span>
        )}
        {isJoined && (
          <span
            className="flex-shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-indigo-700"
            aria-label="다른 조에서 합류"
          >
            합류
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

      {/* 체크인 액션 */}
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
