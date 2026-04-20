"use client";

import { COPY } from "@/lib/constants";
import { formatTime, cn } from "@/lib/utils";
import { CheckIcon, MinusIcon } from "@/components/ui/icons";
import type { CheckIn, GroupMember, ScheduleMemberInfo } from "@/lib/types";

type Member = GroupMember;

interface Props {
  user: Member;
  checkIn: CheckIn | null;
  onCheckin: (userId: string) => void;
  onCancel: (user: Member) => void;
  onAbsent: (user: Member) => void;
  /** v2 Phase F: 다른 조에서 합류한 조원이면 원래 조명 — "합류" 배지 표시 */
  joinedFrom?: string | null;
  /** Phase B: 편집 가능 여부. false면 버튼 aria-disabled + 클릭 무시 (대기/완료 일정) */
  isEditable?: boolean;
  /** Phase C Tier 1: 이 일정 한정 특이사항 — 임시조장 배지 + 메모 표시 */
  memberInfo?: ScheduleMemberInfo | null;
}

export default function MemberCard({ user, checkIn, onCheckin, onCancel, onAbsent, joinedFrom, isEditable = true, memberInfo }: Props) {
  const isTempLeader = memberInfo?.temp_role === "leader";
  const noteText = memberInfo?.note?.trim() || null;
  const isAbsent = checkIn?.is_absent === true;
  const isChecked = checkIn && !isAbsent;
  // v2: 불참 사유 표시용 — "기타: ..." 형식이면 prefix 제거하고 본문만 노출
  const absenceReasonShort = isAbsent && checkIn?.absence_reason
    ? checkIn.absence_reason.startsWith("기타:")
      ? checkIn.absence_reason.slice(3).trim()
      : checkIn.absence_reason
    : null;

  return (
    <li
      className={cn(
        "rounded-2xl border transition-colors",
        isAbsent
          ? "border-[#EBE8E3] bg-gray-100"
          : isChecked
          ? "border-[#EBE8E3] bg-white/60"
          : "border-[#E0DDD8] bg-white"
      )}
    >
      <div className="flex min-h-[4.5rem] items-center justify-between px-4">
      <div className={cn("min-w-0", (isChecked || isAbsent || joinedFrom || isTempLeader) && "flex items-center gap-2 flex-wrap")}>
        <p className={cn("min-w-0 text-base font-medium truncate", (isChecked || isAbsent) && "text-muted-foreground")}>{user.name}</p>
        {isTempLeader && (
          <span
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800"
            aria-label="이 일정 임시 조장"
          >
            <span aria-hidden>★</span>
            임시조장
          </span>
        )}
        {joinedFrom && (
          <span
            className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800"
            aria-label={`${joinedFrom}에서 합류`}
          >
            ⇢ {joinedFrom}
          </span>
        )}
        {isChecked ? (
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
            <CheckIcon className="h-3 w-3" aria-hidden />
            {formatTime(checkIn.checked_at)}
            <span className="sr-only">탑승 완료</span>
          </span>
        ) : isAbsent ? (
          <>
            <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
              <MinusIcon className="h-3 w-3" aria-hidden />
              {COPY.absent}
            </span>
            {absenceReasonShort && (
              <span className="inline-block max-w-[10rem] truncate rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                {absenceReasonShort}
                {checkIn?.absence_location ? ` · ${checkIn.absence_location}` : ""}
              </span>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {COPY.notChecked}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {isAbsent ? (
          <button
            onClick={isEditable ? () => onCancel(user) : undefined}
            aria-disabled={!isEditable}
            className={cn(
              "min-h-11 min-w-16 rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              isEditable
                ? "border-rose-300 text-rose-500 focus-visible:ring-rose-500"
                : "border-stone-200 text-stone-500 cursor-not-allowed focus-visible:ring-stone-400"
            )}
            aria-label={`${user.name} 불참 취소`}
          >
            {COPY.cancelButton}
          </button>
        ) : isChecked ? (
          <button
            onClick={isEditable ? () => onCancel(user) : undefined}
            aria-disabled={!isEditable}
            className={cn(
              "min-h-11 min-w-16 rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              isEditable
                ? "border-rose-300 text-rose-500 focus-visible:ring-rose-500"
                : "border-stone-200 text-stone-500 cursor-not-allowed focus-visible:ring-stone-400"
            )}
            aria-label={`${user.name} 체크인 취소`}
          >
            {COPY.cancelButton}
          </button>
        ) : (
          <>
            <button
              onClick={isEditable ? () => onAbsent(user) : undefined}
              aria-disabled={!isEditable}
              className={cn(
                "min-h-11 min-w-11 rounded-xl border px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                isEditable
                  ? "border-stone-300 text-stone-700 focus-visible:ring-stone-500"
                  : "border-stone-200 text-stone-500 cursor-not-allowed focus-visible:ring-stone-400"
              )}
              aria-label={`${user.name} 불참 처리`}
            >
              {COPY.absent}
            </button>
            <button
              onClick={isEditable ? () => onCheckin(user.id) : undefined}
              aria-disabled={!isEditable}
              className={cn(
                "min-h-11 min-w-[4.5rem] rounded-xl px-3 text-sm font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                isEditable
                  ? "bg-main-action focus-visible:ring-amber-600"
                  : "bg-stone-100 text-stone-500 cursor-not-allowed focus-visible:ring-stone-400"
              )}
              aria-label={`${user.name} 탑승 확인`}
            >
              {COPY.checkinButton}
            </button>
          </>
        )}
      </div>
      </div>
      {noteText && (
        <div
          className="flex items-start gap-1.5 border-t border-stone-200/70 bg-stone-50/60 px-4 py-2 text-xs text-stone-700"
          aria-label={`${user.name} 메모`}
        >
          <span aria-hidden className="flex-shrink-0 pt-0.5 text-sm leading-none">📌</span>
          <span className="min-w-0 whitespace-pre-wrap break-words">{noteText}</span>
        </div>
      )}
    </li>
  );
}
