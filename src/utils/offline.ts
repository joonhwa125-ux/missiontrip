import { OFFLINE_PENDING_KEY, ACTIVE_SCHEDULE_KEY } from "@/lib/constants";
import type { OfflinePendingCheckin, Schedule } from "@/lib/types";

// 오프라인 대기 체크인 저장
export function savePendingCheckin(item: OfflinePendingCheckin): void {
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
