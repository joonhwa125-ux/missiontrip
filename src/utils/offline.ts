import { OFFLINE_PENDING_KEY, OFFLINE_PENDING_REPORTS_KEY, ACTIVE_SCHEDULE_KEY } from "@/lib/constants";
import type { OfflinePendingCheckin, OfflinePendingReport, Schedule } from "@/lib/types";

// 오프라인 대기 체크인 저장 — 성공 시 true, localStorage 용량 초과 등 실패 시 false
export function savePendingCheckin(item: OfflinePendingCheckin): boolean {
  try {
    const existing = getPendingCheckins();
    // 중복 방지
    const isDuplicate = existing.some(
      (e) => e.user_id === item.user_id && e.schedule_id === item.schedule_id
    );
    if (!isDuplicate) {
      localStorage.setItem(
        OFFLINE_PENDING_KEY,
        JSON.stringify([...existing, item])
      );
    }
    return true;
  } catch {
    // QuotaExceededError 등 저장 실패
    return false;
  }
}

// 오프라인 대기 체크인 전체 조회
export function getPendingCheckins(): OfflinePendingCheckin[] {
  try {
    const raw = localStorage.getItem(OFFLINE_PENDING_KEY);
    return raw ? (JSON.parse(raw) as OfflinePendingCheckin[]) : [];
  } catch {
    return [];
  }
}

// 동기화 완료 후 대기 목록 비우기
export function clearPendingCheckins(): void {
  localStorage.removeItem(OFFLINE_PENDING_KEY);
}

// 오프라인 대기 보고 저장
export function savePendingReport(item: OfflinePendingReport): boolean {
  try {
    const existing = getPendingReports();
    // 같은 조+일정 중복 방지 (최신으로 교체)
    const filtered = existing.filter(
      (e) => !(e.group_id === item.group_id && e.schedule_id === item.schedule_id)
    );
    localStorage.setItem(
      OFFLINE_PENDING_REPORTS_KEY,
      JSON.stringify([...filtered, item])
    );
    return true;
  } catch {
    return false;
  }
}

// 오프라인 대기 보고 전체 조회
export function getPendingReports(): OfflinePendingReport[] {
  try {
    const raw = localStorage.getItem(OFFLINE_PENDING_REPORTS_KEY);
    return raw ? (JSON.parse(raw) as OfflinePendingReport[]) : [];
  } catch {
    return [];
  }
}

// 동기화 완료 후 대기 보고 비우기
export function clearPendingReports(): void {
  localStorage.removeItem(OFFLINE_PENDING_REPORTS_KEY);
}

// 활성 일정 캐싱
export function cacheActiveSchedule(schedule: Schedule): void {
  localStorage.setItem(ACTIVE_SCHEDULE_KEY, JSON.stringify(schedule));
}

export function getCachedActiveSchedule(): Schedule | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SCHEDULE_KEY);
    return raw ? (JSON.parse(raw) as Schedule) : null;
  } catch {
    return null;
  }
}
