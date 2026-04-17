"use client";

import { useEffect, useState } from "react";
import { XIcon } from "@/components/ui/icons";
import { BRIEFING_DISMISSED_PREFIX } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  roleCount: number;
  specialCount: number;
  onOpen: () => void;
}

/** KST 기준 오늘 날짜 (YYYY-MM-DD) — dismiss 키값으로 사용 */
function getKstDateKey(): string {
  return new Date().toLocaleDateString("sv", { timeZone: "Asia/Seoul" });
}

/**
 * 조장 브리핑 1줄 배너 (카카오톡 공지 스타일)
 *
 * - 전체 영역 탭 → 바텀시트 오픈
 * - 우측 X 버튼 → 오늘 하루 숨김 (sessionStorage, KST 일자 기준)
 * - 카운트가 모두 0이면 null 반환 (부모 측에서 판정한 값을 그대로 전달받음)
 * - KWCAG 2.5.5: 전체 영역 min-h-11, X 버튼 별도 44x44 터치 타겟
 */
export default function BriefingBanner({
  userId,
  roleCount,
  specialCount,
  onOpen,
}: Props) {
  const dismissKey = `${BRIEFING_DISMISSED_PREFIX}${userId}`;
  // mount 전에는 항상 숨김 (SSR hydration mismatch 방지)
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = sessionStorage.getItem(dismissKey);
      if (saved === getKstDateKey()) {
        setDismissed(true);
      }
    } catch {
      // sessionStorage 접근 실패 — 항상 표시
    }
  }, [dismissKey]);

  if (!mounted) return null;
  if (dismissed) return null;
  if (roleCount === 0 && specialCount === 0) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    try {
      sessionStorage.setItem(dismissKey, getKstDateKey());
    } catch {
      // 저장 실패해도 현재 세션에선 숨겨진 상태 유지
    }
  };

  const parts: string[] = [];
  if (roleCount > 0) parts.push(`역할 ${roleCount}건`);
  if (specialCount > 0) parts.push(`특이사항 ${specialCount}건`);
  const summary = parts.join(" · ");

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-xl border border-indigo-200",
        "bg-indigo-50 px-3 py-2.5 text-sm text-indigo-900 shadow-sm"
      )}
      role="region"
      aria-label="조장 브리핑"
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-h-11 flex-1 items-center gap-2 text-left",
          "rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        )}
        aria-label={`브리핑 열기: ${summary}`}
      >
        <span className="flex-shrink-0 text-base" aria-hidden="true">📋</span>
        <span className="flex flex-col">
          <span className="text-xs font-semibold text-indigo-700">오늘의 브리핑</span>
          <span className="text-sm font-medium text-indigo-900">{summary}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        className={cn(
          "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full",
          "text-indigo-500 outline-none transition-colors",
          "hover:bg-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-500"
        )}
        aria-label="오늘 하루 브리핑 숨기기"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
