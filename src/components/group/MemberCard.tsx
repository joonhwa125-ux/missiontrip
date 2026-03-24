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
        "flex min-h-[4.5rem] items-center justify-between rounded-2xl border px-4 transition-colors",
        isAbsent
          ? "border-[#EBE8E3] bg-gray-100"
          : isChecked
          ? "border-[#EBE8E3] bg-app-bg"
          : "border-[#E0DDD8] bg-white"
      )}
    >
      <div className="min-w-0">
        <p className={cn("text-base font-medium truncate", (isChecked || isAbsent) && "text-muted-foreground")}>{user.name}</p>
        <p className="text-sm text-muted-foreground">
          {isAbsent
            ? COPY.absent
            : isChecked
              ? COPY.checked(formatTime(checkIn.checked_at))
              : COPY.notChecked}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {isAbsent ? (
          <button
            onClick={() => onCancel(user)}
            className="min-h-11 min-w-16 rounded-xl bg-gray-200 px-3 text-sm font-medium text-gray-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`${user.name} 불참 취소`}
          >
            {COPY.cancelButton}
          </button>
        ) : isChecked ? (
          <button
            onClick={() => onCancel(user)}
            className="min-h-11 min-w-16 rounded-xl bg-gray-100 px-3 text-sm font-medium text-gray-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`${user.name} 체크인 취소`}
          >
            {COPY.cancelButton}
          </button>
        ) : (
          <>
            <button
              onClick={() => onAbsent(user)}
              className="min-h-11 rounded-xl border border-red-200 px-3 text-sm font-medium text-red-600 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
              aria-label={`${user.name} 불참 처리`}
            >
              {COPY.absent}
            </button>
            <button
              onClick={() => onCheckin(user.id)}
              className="min-h-11 min-w-[4.5rem] rounded-xl bg-main-action px-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2"
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
