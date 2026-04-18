"use client";

import { cn } from "@/lib/utils";

interface Props {
  roleCount: number;
  specialCount: number;
  onOpen: () => void;
}

/**
 * 조장 브리핑 1줄 배너 — 탭 시 바텀시트 오픈
 *
 * - 카운트 0이면 null (부모에서도 선별 렌더하지만 방어적으로 한 번 더)
 * - KWCAG 2.5.5: 전체 영역 min-h-11
 * - 닫기 기능 없음 — 브리핑은 하루 내내 참조 대상이라 dismiss 개념 부적합
 */
export default function BriefingBanner({ roleCount, specialCount, onOpen }: Props) {
  const total = roleCount + specialCount;
  if (total === 0) return null;

  return (
    <div
      className={cn(
        "rounded-xl border-2 border-stone-300",
        "bg-white text-sm text-stone-900 shadow-sm"
      )}
      role="region"
      aria-label="조장 브리핑"
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left",
          "outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
        )}
        aria-label={`오늘의 브리핑 열기 · ${total}건`}
      >
        <span className="text-sm font-semibold text-stone-900">오늘의 브리핑</span>
        <span
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-900 px-1.5 text-xs font-bold text-white"
          aria-hidden="true"
        >
          {total}
        </span>
      </button>
    </div>
  );
}
