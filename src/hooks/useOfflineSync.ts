"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getPendingCheckins,
  savePendingCheckin,
  clearPendingCheckins,
  cacheActiveSchedule,
  getCachedActiveSchedule,
} from "@/utils/offline";
import { syncOfflineCheckins } from "@/actions/checkin";
import type { OfflinePendingCheckin, Schedule } from "@/lib/types";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // 대기 중 체크인 동기화 — useEffect보다 먼저 선언해야 의존성 참조 가능
  const syncPending = useCallback(async () => {
    const pending = getPendingCheckins();
    if (pending.length === 0) return;

    const result = await syncOfflineCheckins(pending);
    if (result.ok) {
      clearPendingCheckins();
      setPendingCount(0);
    }
  }, []);

  // 온라인/오프라인 상태 감지
  useEffect(() => {
    setIsOnline(navigator.onLine);
    setPendingCount(getPendingCheckins().length);

    function handleOnline() {
      setIsOnline(true);
      syncPending();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPending]);

  // 오프라인 체크인 저장
  const addPending = useCallback((item: OfflinePendingCheckin) => {
    savePendingCheckin(item);
    setPendingCount(getPendingCheckins().length);
  }, []);

  // 활성 일정 캐싱/복원
  const cacheSchedule = useCallback((schedule: Schedule) => {
    cacheActiveSchedule(schedule);
  }, []);

  const getCachedSchedule = useCallback((): Schedule | null => {
    return getCachedActiveSchedule();
  }, []);

  return {
    isOnline,
    pendingCount,
    addPending,
    syncPending,
    cacheSchedule,
    getCachedSchedule,
  };
}
