"use client";

import { COPY } from "@/lib/constants";
import { formatTime, cn } from "@/lib/utils";
import { CheckIcon } from "@/components/ui/icons";
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
      <div className="min-w-0">
        <p className={cn("text-base font-medium truncate", (isChecked || isAbsent) && "text-muted-foreground")}>{user.name}</p>
        {isChecked ? (
          <p className="flex items-center gap-1 text-sm">
            <CheckIcon className="h-3.5 w-3.5 text-complete-check" aria-hidden />
            <span className="font-medium text-complete-check">{formatTime(checkIn.checked_at)}</span>
            <span className="text-muted-foreground">탑승 완료</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isAbsent ? COPY.absent : COPY.notChecked}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {isAbsent ? (
          <button
            onClick={() => onCancel(user)}
            className="min-h-11 min-w-16 rounded-xl border border-gray-500 bg-gray-200 px-3 text-sm font-medium text-gray-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`${user.name} 불참 취소`}
          >
            {COPY.cancelButton}
          </button>
        ) : isChecked ? (
          <button
            onClick={() => onCancel(user)}
            className="min-h-11 min-w-16 rounded-xl border border-gray-500 bg-gray-100 px-3 text-sm font-medium text-gray-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`${user.name} 체크인 취소`}
          >
            {COPY.cancelButton}
          </button>
        ) : (
          <>
            <button
              onClick={() => onAbsent(user)}
              className="min-h-11 min-w-11 rounded-xl border border-stone-300 bg-stone-50 px-3 text-sm font-medium text-stone-600 focus-visible:ring-2 focus-visible:ring-stone-300 focus-visible:ring-offset-2"
              aria-label={`${user.name} 불참 처리`}
            >
              {COPY.absent}
            </button>
            <button
              onClick={() => onCheckin(user.id)}
              className="min-h-11 min-w-[4.5rem] rounded-xl bg-main-action px-3 text-sm font-bold shadow-sm focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2"
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
