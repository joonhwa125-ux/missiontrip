"use client";

import { useEffect, useRef, useState } from "react";
import { BRIEFING_CACHE_PREFIX } from "@/lib/constants";
import type { BriefingData } from "@/lib/types";

/**
 * 조장 브리핑 데이터 캐시 훅
 *
 * 동작:
 *  1) 마운트 시 localStorage에서 groupId별 캐시 즉시 복원 (오프라인 대응)
 *  2) 서버에서 새 데이터(`serverData`)가 내려오면 상태/localStorage 업데이트
 *  3) serverData가 null이어도 캐시가 있으면 캐시를 유지 — 네트워크 실패/로그인 직후 flash 방지
 *
 * 주의:
 *  - groupId가 바뀌면 (조 이동 등) 캐시 키가 바뀌므로 자동으로 새 캐시를 읽는다.
 *  - SSR에서 localStorage 접근 불가 → 초기값은 항상 serverData 기반, 이후 effect에서 덮어쓴다.
 */
export function useBriefingCache(
  groupId: string,
  serverData: BriefingData | null
): { briefing: BriefingData | null; isFromCache: boolean } {
  const [briefing, setBriefing] = useState<BriefingData | null>(serverData);
  const [isFromCache, setIsFromCache] = useState(false);
  const key = `${BRIEFING_CACHE_PREFIX}${groupId}`;

  // 서버 데이터 변경 추적 — 중복 set 방지
  const lastServerRef = useRef<BriefingData | null>(serverData);

  // (1) 마운트 / groupId 변경 시 localStorage에서 복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as BriefingData;
        // 서버 데이터가 이미 있으면 서버 데이터 우선, 아니면 캐시 사용
        if (!lastServerRef.current) {
          setBriefing(parsed);
          setIsFromCache(true);
        }
      }
    } catch {
      // JSON 파싱 실패는 조용히 무시 (스키마 변경 대응)
    }
    // key는 groupId 파생, serverData는 별도 effect에서 처리 — deps에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // (2) 서버 데이터 수신 시 상태/캐시 갱신
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (serverData === lastServerRef.current) return;
    lastServerRef.current = serverData;

    if (serverData) {
      setBriefing(serverData);
      setIsFromCache(false);
      try {
        localStorage.setItem(key, JSON.stringify(serverData));
      } catch {
        // QuotaExceeded 등 저장 실패 — 무시 (UI는 정상 동작)
      }
    }
    // serverData가 null로 내려오더라도 기존 briefing 유지 (flash 방지)
  }, [serverData, key]);

  return { briefing, isFromCache };
}
