"use client";

import { ClipboardList, ChevronRight } from "lucide-react";
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
 *
 * 시각 위계: 다크 배너 스타일로 일정 카드(흰 배경)와 명확히 구분 → "오늘 꼭 확인할 지시문서" 강조
 */
export default function BriefingBanner({ roleCount, specialCount, onOpen }: Props) {
  const total = roleCount + specialCount;
  if (total === 0) return null;

  return (
    <div
      className={cn(
        "rounded-xl bg-gray-900 text-sm text-white",
        "shadow-[0_4px_12px_rgba(17,24,39,0.12)]"
      )}
      role="region"
      aria-label="조장 브리핑"
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left",
          "outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        )}
        aria-label={`오늘의 브리핑 열기 · ${total}건`}
      >
        <span className="inline-flex items-center gap-2">
          <ClipboardList className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold">오늘의 브리핑</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FEE500] px-1.5 text-xs font-bold text-gray-900"
            aria-hidden="true"
          >
            {total}
          </span>
          <ChevronRight className="h-4 w-4 text-white/70" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
