"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 백그라운드 복귀 시 서버 데이터 자동 갱신.
 * hiddenThreshold(기본 3초) 이상 숨겨졌다 돌아오면
 * router.refresh() + onVisible 콜백 호출.
 */
export function useVisibilityRefresh(
  onVisible?: () => void,
  hiddenThreshold = 3000
) {
  const router = useRouter();

  useEffect(() => {
    let hiddenAt = 0;
    const handler = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > hiddenThreshold) {
        router.refresh();
        onVisible?.();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [router, onVisible, hiddenThreshold]);
}
