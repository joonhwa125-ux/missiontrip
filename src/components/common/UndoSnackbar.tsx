"use client";

import { useEffect, useRef, useState } from "react";
import { XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  /** 표시 메시지 (예: "삭제했어요 · 5초 안에 되돌릴 수 있어요") */
  message: string;
  /** 되돌리기 버튼 라벨 — 기본 "되돌리기" */
  undoLabel?: string;
  /** 되돌리기 클릭 시 호출. 처리 중이면 버튼 비활성 */
  onUndo: () => Promise<void> | void;
  /** 타임아웃 만료 or 닫기 버튼 클릭 시 호출 (부모가 snackbar 제거) */
  onClose: () => void;
  /** 자동 사라지는 시간(ms) — 기본 5000 */
  durationMs?: number;
}

/**
 * 되돌리기 스낵바 — WCAG 2.2 상태 메시지(role=status, aria-live=polite).
 * 하단 중앙 고정, 모바일 safe-area 대응.
 *
 * 사용 예시:
 *   const [undo, setUndo] = useState<{ message, restore } | null>(null);
 *   // 삭제 성공 시: setUndo({ message: "...", restore: () => upsertAction(...) })
 *   {undo && <UndoSnackbar message={undo.message} onUndo={undo.restore} onClose={() => setUndo(null)} />}
 */
export default function UndoSnackbar({
  message,
  undoLabel = "되돌리기",
  onUndo,
  onClose,
  durationMs = 5000,
}: Props) {
  const [busy, setBusy] = useState(false);
  // "이미 onClose가 호출되었는가" — 중복 호출 방지
  const closedRef = useRef(false);

  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  };

  useEffect(() => {
    const timer = setTimeout(close, durationMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  const handleUndo = async () => {
    if (busy || closedRef.current) return;
    setBusy(true);
    try {
      await onUndo();
    } finally {
      setBusy(false);
      close();
    }
  };

  return (
    <div
      className="fixed bottom-[max(5rem,calc(3.5rem+env(safe-area-inset-bottom)))] left-1/2 z-[60] w-full max-w-lg -translate-x-1/2 px-4"
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-sm text-white shadow-lg"
        )}
      >
        <span className="flex-1 truncate">{message}</span>
        <button
          type="button"
          onClick={handleUndo}
          disabled={busy}
          className={cn(
            "min-h-11 flex-shrink-0 rounded-lg px-3 font-semibold outline-none",
            "text-yellow-300 focus-visible:ring-2 focus-visible:ring-yellow-300",
            busy && "opacity-50"
          )}
          aria-label={undoLabel}
        >
          {busy ? "되돌리는 중..." : undoLabel}
        </button>
        <button
          type="button"
          onClick={close}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          aria-label="알림 닫기"
        >
          <XIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
