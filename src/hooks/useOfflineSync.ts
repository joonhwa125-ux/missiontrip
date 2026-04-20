"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getPendingCheckins,
  savePendingCheckin,
  clearPendingCheckins,
  getPendingReports,
  savePendingReport,
  clearPendingReports,
} from "@/utils/offline";
import { syncOfflineCheckins } from "@/actions/checkin";
import { submitReport, submitShuttleReport } from "@/actions/report";
import { OFFLINE_PENDING_REPORTS_KEY } from "@/lib/constants";
import type { OfflinePendingCheckin, OfflinePendingReport } from "@/lib/types";

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

    // 2. 보고 sync (체크인 완료 후) — 성공 항목만 제거, 재시도 가능한 실패만 유지
    // M-2 수정 (2026-04-20):
    //   - 유효 키 없는 항목(group_id·shuttle_bus 모두 null)은 영구 재시도 루프 방지를 위해 **즉시 discard**
    //   - 서버가 "진행 중인 일정이 아니에요" 오류 반환 시(= 일정이 종료됨) 재시도 불가능이므로 discard
    //   - 네트워크·일시적 오류만 failedReports에 재큐잉
    const pendingReports = getPendingReports();
    if (pendingReports.length > 0) {
      const failedReports: OfflinePendingReport[] = [];
      for (const report of pendingReports) {
        // 무효 키: 영구 실패로 판정, 재시도 안 함
        if (!report.shuttle_bus && !report.group_id) continue;

        let res;
        if (report.shuttle_bus) {
          res = await submitShuttleReport(report.shuttle_bus, report.schedule_id, report.pending_count);
        } else {
          res = await submitReport(report.group_id!, report.schedule_id, report.pending_count);
        }
        if (res.ok) continue;
        // 서버가 비활성 일정으로 거부 → 재시도 불가. 네트워크 오류만 재큐잉.
        if (res.error && res.error.startsWith("진행 중인 일정이 아니에요")) continue;
        failedReports.push(report);
      }
      clearPendingReports();
      if (failedReports.length > 0) {
        localStorage.setItem(OFFLINE_PENDING_REPORTS_KEY, JSON.stringify(failedReports));
      }
    }

    setPendingCount(getPendingCheckins().length + getPendingReports().length);
  }, []);

  // 온라인 상태에서 pending 항목이 남아있으면 30초마다 재시도
  useEffect(() => {
    if (!isOnline || pendingCount === 0) return;
    const timer = setInterval(() => syncPending(), 30_000);
    return () => clearInterval(timer);
  }, [isOnline, pendingCount, syncPending]);

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

  return {
    isOnline,
    pendingCount,
    addPending,
    addPendingReport,
    syncPending,
  };
}
