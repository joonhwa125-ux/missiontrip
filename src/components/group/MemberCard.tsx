"use client";

import { COPY } from "@/lib/constants";
import { formatTime, cn } from "@/lib/utils";
import { CheckIcon, MinusIcon } from "@/components/ui/icons";
import type { CheckIn, GroupMember } from "@/lib/types";

type Member = GroupMember;

interface Props {
  user: Member;
  checkIn: CheckIn | null;
  onCheckin: (userId: string) => void;
  onCancel: (user: Member) => void;
  onAbsent: (user: Member) => void;
}

export default function MemberCard({ user, checkIn, onCheckin, onCancel, onAbsent }: Props) {
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
        "flex min-h-[4.5rem] items-center justify-between rounded-2xl border px-4 transition-colors",
        isAbsent
          ? "border-[#EBE8E3] bg-gray-100"
          : isChecked
          ? "border-[#EBE8E3] bg-white/60"
          : "border-[#E0DDD8] bg-white"
      )}
    >
      <div className={cn("min-w-0", (isChecked || isAbsent) && "flex items-center gap-2 flex-wrap")}>
        <p className={cn("min-w-0 text-base font-medium truncate", (isChecked || isAbsent) && "text-muted-foreground")}>{user.name}</p>
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
            onClick={() => onCancel(user)}
            className="min-h-11 min-w-16 rounded-xl border border-rose-300 px-3 text-sm font-medium text-rose-500"
            aria-label={`${user.name} 불참 취소`}
          >
            {COPY.cancelButton}
          </button>
        ) : isChecked ? (
          <button
            onClick={() => onCancel(user)}
            className="min-h-11 min-w-16 rounded-xl border border-rose-300 px-3 text-sm font-medium text-rose-500"
            aria-label={`${user.name} 체크인 취소`}
          >
            {COPY.cancelButton}
          </button>
        ) : (
          <>
            <button
              onClick={() => onAbsent(user)}
              className="min-h-11 min-w-11 rounded-xl border border-stone-300 px-3 text-sm font-bold text-stone-700"
              aria-label={`${user.name} 불참 처리`}
            >
              {COPY.absent}
            </button>
            <button
              onClick={() => onCheckin(user.id)}
              className="min-h-11 min-w-[4.5rem] rounded-xl bg-main-action px-3 text-sm font-bold shadow-sm"
              aria-label={`${user.name} 탑승 확인`}
            >
              {COPY.checkinButton}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
