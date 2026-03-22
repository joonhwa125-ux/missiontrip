import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Schedule, ScheduleStatus } from "./types";

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

// HH:MM 입력을 KST 기준 ISO 문자열로 변환
export function parseKSTTime(hhmm: string, referenceDate?: string | null): string {
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = referenceDate ? new Date(referenceDate) : new Date();
  d.setUTCHours(hh - 9, mm, 0, 0);
  return d.toISOString();
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
    return diff !== 0 ? diff : a.sort_order - b.sort_order;
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
