"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getPendingCheckins,
  savePendingCheckin,
  clearPendingCheckins,
  getPendingReports,
  savePendingReport,
  clearPendingReports,
  cacheActiveSchedule,
  getCachedActiveSchedule,
} from "@/utils/offline";
import { syncOfflineCheckins } from "@/actions/checkin";
import { submitReport } from "@/actions/report";
import type { OfflinePendingCheckin, OfflinePendingReport, Schedule } from "@/lib/types";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);

  // 대기 중 동기화: 체크인 → 보고 순서
  const syncPending = useCallback(async () => {
    // 1. 체크인 sync
    const pendingCheckins = getPendingCheckins();
    if (pendingCheckins.length > 0) {
      const result = await syncOfflineCheckins(pendingCheckins);
      if (result.ok) {
        clearPendingCheckins();
      }
    }

    // 2. 보고 sync (체크인 완료 후)
    const pendingReports = getPendingReports();
    if (pendingReports.length > 0) {
      let allOk = true;
      for (const report of pendingReports) {
        const res = await submitReport(report.group_id, report.schedule_id, report.pending_count);
        if (!res.ok) allOk = false;
      }
      if (allOk) {
        clearPendingReports();
      }
    }

    setPendingCount(getPendingCheckins().length + getPendingReports().length);
  }, []);

  // 온라인/오프라인 상태 감지
  useEffect(() => {
    setIsOnline(navigator.onLine);
    setPendingCount(getPendingCheckins().length + getPendingReports().length);

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
  const addPending = useCallback((item: OfflinePendingCheckin): boolean => {
    const saved = savePendingCheckin(item);
    setPendingCount(getPendingCheckins().length + getPendingReports().length);
    return saved;
  }, []);

  // 오프라인 보고 저장
  const addPendingReport = useCallback((item: OfflinePendingReport): boolean => {
    const saved = savePendingReport(item);
    setPendingCount(getPendingCheckins().length + getPendingReports().length);
    return saved;
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
    addPendingReport,
    syncPending,
    cacheSchedule,
    getCachedSchedule,
  };
}
