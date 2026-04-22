import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Schedule, ScheduleStatus, GroupBadgeStatus, GroupParty, ScheduleScope } from "./types";

// shadcn/ui 표준 cn 유틸
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 공지(notice) 텍스트 정규화 — DB 쓰기 직전에 호출.
 *
 * 배경: notice는 " · " / "\n"을 bullet 구분자로 사용하고, 클라이언트
 *       (BriefingSheet)에서 이 규칙대로 split한다. 그런데 Google Sheets
 *       원본 셀에서 사용자가 **괄호 안에서** Alt+Enter로 줄바꿈을 넣으면
 *       "카드키(1방 6매\n2끼분\n포함) 배부" 같은 형태가 되고, 이 상태로
 *       split하면 한 문장이 여러 bullet로 쪼개진다.
 *
 * 처리: 괄호 `(...)` 내부의 개행문자(\n, \r, \r\n)를 공백으로 치환.
 *       괄호 밖의 개행은 bullet 구분자 의미로 유지한다.
 *       중첩/엇갈린 괄호 대응을 위해 depth 카운터 사용.
 *       닫힘 괄호가 열림보다 많이 들어오면 depth를 0으로 clamp.
 *
 * 입력이 비어있거나 null이면 그대로 반환.
 */
export function normalizeNoticeText(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  let depth = 0;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") {
      depth++;
      out += c;
      continue;
    }
    if (c === ")") {
      depth = Math.max(0, depth - 1);
      out += c;
      continue;
    }
    // 괄호 내부의 개행 → 공백. 연속 \r\n도 공백 하나로.
    if (depth > 0 && (c === "\n" || c === "\r")) {
      // 뒤에 바로 \n이 오면 같이 스킵 (\r\n 한 쌍)
      if (c === "\r" && text[i + 1] === "\n") i++;
      // 직전 문자가 이미 공백이면 중복 공백 방지
      if (!out.endsWith(" ")) out += " ";
      continue;
    }
    out += c;
  }
  return out;
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

// 시각 파싱 패턴 (DRY — setup.ts의 인라인 정규식과 공유)
// 시간은 1~2자리 허용 ("8:00", "08:00" 모두 지원)
export const TIME_PATTERNS = {
  fullDate: /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/,
  monthDay: /^(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/,
  hourMin:  /^(\d{1,2}):(\d{2})$/,
} as const;

// 시간 문자열을 KST 기준 ISO 문자열로 변환
// 지원 형식:
//   "H:MM" / "HH:MM"              → referenceDate 날짜 사용 (없으면 오늘 KST)
//   "MM-DD H:MM" / "MM-DD HH:MM"  → 현재 연도 + 지정 날짜
//   "YYYY-MM-DD HH:MM"            → 지정 날짜
export function parseKSTTime(input: string, referenceDate?: string | null): string {
  const fullMatch = input.match(TIME_PATTERNS.fullDate);
  if (fullMatch) {
    const [, yyyy, mo, dd, hh, mi] = fullMatch;
    return new Date(`${yyyy}-${mo}-${dd}T${hh.padStart(2, "0")}:${mi}:00+09:00`).toISOString();
  }

  const mmddMatch = input.match(TIME_PATTERNS.monthDay);
  if (mmddMatch) {
    const [, mo, dd, hh, mi] = mmddMatch;
    const year = new Date().toLocaleDateString("sv", { timeZone: "Asia/Seoul" }).slice(0, 4);
    return new Date(`${year}-${mo}-${dd}T${hh.padStart(2, "0")}:${mi}:00+09:00`).toISOString();
  }

  const hhmmMatch = input.match(TIME_PATTERNS.hourMin);
  if (hhmmMatch) {
    const [, hh, mi] = hhmmMatch;
    const base = referenceDate
      ? new Date(referenceDate).toLocaleDateString("sv", { timeZone: "Asia/Seoul" })
      : new Date().toLocaleDateString("sv", { timeZone: "Asia/Seoul" });
    return new Date(`${base}T${hh.padStart(2, "0")}:${mi}:00+09:00`).toISOString();
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
// rawTotal: 해당 scope 전체 멤버 수, checked: 탑승 확인 수(불참 제외), absentCount: 불참 수
export function getGroupBadgeStatus(rawTotal: number, checked: number, hasReport: boolean, absentCount = 0): GroupBadgeStatus {
  if (rawTotal === 0) return "not_started"; // 해당 scope에 멤버 없음
  const effective = rawTotal - absentCount; // 탑승 대상 인원
  if (effective <= 0) return hasReport ? "reported" : "all_checked"; // 전원 불참 → 확인 완료
  if (checked === 0) return "not_started";
  if (checked < effective) return "in_progress";
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
