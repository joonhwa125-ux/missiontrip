"use client";

import { COPY } from "@/lib/constants";
import { formatTime, cn } from "@/lib/utils";
// 상태는 카드 배경색 + 텍스트로 표현 (아이콘 원 제거)
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
        "flex min-h-[4.75rem] items-center justify-between rounded-2xl border px-4 py-3 transition-all",
        isAbsent
          ? "border-stone-200 bg-stone-100"
          : isChecked
          ? "border-emerald-100 bg-status-complete-bg/40"
          : "border-stone-200 bg-white shadow-sm"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn(
          "text-base font-semibold truncate",
          isAbsent ? "text-stone-400" : isChecked ? "text-stone-600" : "text-stone-900"
        )}>
          {user.name}
        </p>
        <p className={cn(
          "text-sm mt-0.5",
          isAbsent ? "text-stone-400" : isChecked ? "text-complete-check font-medium" : "text-stone-500"
        )}>
          {isAbsent
            ? COPY.absent
            : isChecked
              ? COPY.checked(formatTime(checkIn.checked_at))
              : COPY.notChecked}
        </p>
      </div>

      <div className="flex items-center gap-2 ml-3">
        {isAbsent ? (
          <button
            onClick={() => onCancel(user)}
            className="min-h-11 min-w-16 rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`${user.name} 불참 취소`}
          >
            {COPY.cancelButton}
          </button>
        ) : isChecked ? (
          <button
            onClick={() => onCancel(user)}
            className="min-h-11 min-w-16 rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`${user.name} 체크인 취소`}
          >
            {COPY.cancelButton}
          </button>
        ) : (
          <>
            <button
              onClick={() => onAbsent(user)}
              className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-300 focus-visible:ring-offset-2"
              aria-label={`${user.name} 불참 처리`}
            >
              {COPY.absent}
            </button>
            <button
              onClick={() => onCheckin(user.id)}
              className="min-h-11 min-w-[5rem] rounded-xl bg-main-action px-4 text-sm font-bold text-stone-900 shadow-sm transition-all hover:brightness-105 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2"
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
