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
  if (roleCount === 0 && specialCount === 0) return null;

  const parts: string[] = [];
  if (roleCount > 0) parts.push(`역할 ${roleCount}건`);
  if (specialCount > 0) parts.push(`특이사항 ${specialCount}건`);
  const summary = parts.join(" · ");

  return (
    <div
      className={cn(
        "rounded-xl border border-indigo-200",
        "bg-indigo-50 text-sm text-indigo-900 shadow-sm"
      )}
      role="region"
      aria-label="조장 브리핑"
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left",
          "outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        )}
        aria-label={`브리핑 열기: ${summary}`}
      >
        <span className="flex flex-col">
          <span className="text-xs font-semibold text-indigo-700">오늘의 브리핑</span>
          <span className="text-sm font-medium text-indigo-900">{summary}</span>
        </span>
      </button>
    </div>
  );
}
