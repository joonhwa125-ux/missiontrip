"use client";

import { COPY } from "@/lib/constants";
import { formatTime, cn } from "@/lib/utils";
import type { CheckIn } from "@/lib/types";

interface Member {
  id: string;
  name: string;
}

interface Props {
  user: Member;
  checkIn: CheckIn | null;
  onCheckin: (userId: string) => void;
  onCancel: (user: Member) => void;
}

export default function MemberCard({ user, checkIn, onCheckin, onCancel }: Props) {
  return (
    <li
      className={cn(
        "flex min-h-[4.5rem] items-center justify-between rounded-2xl px-4 transition-colors",
        checkIn ? "bg-complete-card" : "bg-white"
      )}
    >
      <div className="flex items-center gap-3">
        {checkIn ? (
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-complete-check"
            aria-hidden="true"
          >
            <svg
              className="h-4 w-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div
            className="h-8 w-8 flex-shrink-0 rounded-full border-2 border-dashed border-gray-300"
            aria-hidden="true"
          />
        )}
        <div>
          <p className="text-base font-medium">{user.name}</p>
          <p
            className={cn(
              "text-sm",
              checkIn ? "text-[#27500A]" : "text-muted-foreground"
            )}
          >
            {checkIn ? COPY.checked(formatTime(checkIn.checked_at)) : COPY.notChecked}
          </p>
        </div>
      </div>

      {checkIn ? (
        <button
          onClick={() => onCancel(user)}
          className="min-h-11 min-w-16 rounded-xl bg-gray-100 px-3 text-sm font-medium text-gray-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`${user.name} 체크인 취소`}
        >
          {COPY.cancelButton}
        </button>
      ) : (
        <button
          onClick={() => onCheckin(user.id)}
          className="min-h-11 min-w-[4.5rem] rounded-xl bg-main-action px-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2"
          aria-label={`${user.name} 탑승 확인`}
        >
          {COPY.checkinButton}
        </button>
      )}
    </li>
  );
}
