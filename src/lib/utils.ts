import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Schedule, ScheduleStatus, GroupBadgeStatus, GroupParty, ScheduleScope } from "./types";

// shadcn/ui 표준 cn 유틸
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 시각 포매팅 (HH:MM, KST 고정)
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// 시간 문자열을 KST 기준 ISO 문자열로 변환
// 지원 형식:
//   "HH:MM"              → referenceDate 날짜 사용 (없으면 오늘 KST)
//   "MM-DD HH:MM"        → 현재 연도 + 지정 날짜
//   "YYYY-MM-DD HH:MM"   → 지정 날짜
export function parseKSTTime(input: string, referenceDate?: string | null): string {
  const fullMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (fullMatch) {
    const [, yyyy, mo, dd, hh, mi] = fullMatch;
    return new Date(`${yyyy}-${mo}-${dd}T${hh}:${mi}:00+09:00`).toISOString();
  }

  const mmddMatch = input.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (mmddMatch) {
    const [, mo, dd, hh, mi] = mmddMatch;
    const year = new Date().toLocaleDateString("sv", { timeZone: "Asia/Seoul" }).slice(0, 4);
    return new Date(`${year}-${mo}-${dd}T${hh}:${mi}:00+09:00`).toISOString();
  }

  const hhmmMatch = input.match(/^(\d{2}):(\d{2})$/);
  if (hhmmMatch) {
    const [, hh, mi] = hhmmMatch;
    const base = referenceDate
      ? new Date(referenceDate).toLocaleDateString("sv", { timeZone: "Asia/Seoul" })
      : new Date().toLocaleDateString("sv", { timeZone: "Asia/Seoul" });
    return new Date(`${base}T${hh}:${mi}:00+09:00`).toISOString();
  }

  return input; // 이미 ISO 형식
}

// 경과 시간 (분 단위)
export function getElapsedMinutes(from: string): number {
  return Math.floor((Date.now() - new Date(from).getTime()) / 60000);
}

// 이니셜 추출 (한글 이름 → 첫 글자)
export function getInitial(name: string): string {
  return name.charAt(0);
}

// 일정 상태 판별
export function getScheduleStatus(schedule: Schedule): ScheduleStatus {
  if (schedule.is_active) return "active";
  if (schedule.activated_at) return "completed";
  return "waiting";
}

// 일정을 상태별 정렬: active(0) > waiting(1) > completed(2), 동일 상태면 sort_order
const STATUS_ORDER: Record<ScheduleStatus, number> = { active: 0, waiting: 1, completed: 2 };

export function sortSchedulesByStatus(schedules: Schedule[]): Schedule[] {
  return [...schedules].sort((a, b) => {
    const diff = STATUS_ORDER[getScheduleStatus(a)] - STATUS_ORDER[getScheduleStatus(b)];
    if (diff !== 0) return diff;
    // 둘 다 scheduled_time이 있으면 시간순, 없으면 sort_order 유지
    if (a.scheduled_time && b.scheduled_time) {
      return new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime();
    }
    return a.sort_order - b.sort_order;
  });
}

// 활성 일정의 day_number 반환 (없으면 가장 최근 활성화된 일정, 그것도 없으면 1)
export function getDefaultDay(schedules: Schedule[]): number {
  const active = schedules.find((s) => s.is_active);
  if (active) return active.day_number;
  const lastActivated = [...schedules]
    .filter((s) => s.activated_at)
    .sort((a, b) => new Date(b.activated_at!).getTime() - new Date(a.activated_at!).getTime());
  return lastActivated[0]?.day_number ?? 1;
}

// 조 배지 상태 판별
export function getGroupBadgeStatus(total: number, checked: number, hasReport: boolean): GroupBadgeStatus {
  if (total === 0 || checked === 0) return "not_started";
  if (checked < total) return "in_progress";
  if (hasReport) return "reported";
  return "all_checked";
}

// scope 기반 멤버 필터링 (선발/후발 일정 → 해당 party만)
export function filterMembersByScope<T extends { party: GroupParty | null }>(
  members: T[],
  scope: ScheduleScope
): T[] {
  if (scope === "all") return members;
  return members.filter((m) => m.party === scope);
}
