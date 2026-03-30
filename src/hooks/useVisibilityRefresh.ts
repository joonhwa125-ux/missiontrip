"use client";

import { useEffect } from "react";

/**
 * 백그라운드 복귀 시 콜백 실행.
 * hiddenThreshold(기본 3초) 이상 숨겨졌다 돌아오면 onVisible 콜백만 호출.
 * router.refresh()는 사용하지 않음 — 전체 rehydration으로 인한 상태 플래시 방지.
 */
export function useVisibilityRefresh(
  onVisible?: () => void,
  hiddenThreshold = 3000
) {
  useEffect(() => {
    let hiddenAt = 0;
    const handler = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > hiddenThreshold) {
        onVisible?.();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [onVisible, hiddenThreshold]);
}
