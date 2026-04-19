// 미션트립 시스템 상수 정의

import type { UserRole, GroupParty, ScheduleScope } from "./types";

// 인증
export const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "@linkagelab.co.kr";

// 오프라인 스토리지 키
export const OFFLINE_PENDING_KEY = "mtrip_pending";
export const OFFLINE_PENDING_REPORTS_KEY = "mtrip_pending_reports";
export const ACTIVE_SCHEDULE_KEY = "mtrip_active_schedule";

// 브리핑 캐시 스토리지 키 prefix — 실제 키는 `${prefix}${groupId}`
export const BRIEFING_CACHE_PREFIX = "mtrip_briefing_";

// 셋업 동기화 스토리지 키
export const SETUP_LAST_SYNCED_KEY = "setup_last_synced";
export const SETUP_SOURCE_KEY = "setup_source";
export const SETUP_CSV_KEY = "setup_csv_content";

// Realtime
export const BROADCAST_SUBSCRIBE_TIMEOUT_MS = 5_000; // broadcast 채널 구독 최대 대기 시간

// Realtime 채널명
export const CHANNEL_GLOBAL = "global";
export const CHANNEL_ADMIN = "admin";
export const CHANNEL_GROUP_PREFIX = "group:";

// Realtime 이벤트 타입
export const EVENT_SCHEDULE_ACTIVATED = "schedule_activated";
export const EVENT_SCHEDULE_UPDATED = "schedule_updated";
export const EVENT_SCHEDULE_DEACTIVATED = "schedule_deactivated";
export const EVENT_CHECKIN_UPDATED = "checkin_updated";
export const EVENT_GROUP_REPORTED = "group_reported";
export const EVENT_SHUTTLE_REPORTED = "shuttle_reported";
export const EVENT_REPORT_INVALIDATED = "report_invalidated";
export const EVENT_MEMBER_UPDATED = "member_updated";

// UI 치수 (KWCAG 2.5.5)
export const MIN_TOUCH_TARGET = 44; // px — 최소 터치 타겟
export const MEMBER_CARD_MIN_HEIGHT = 72; // px — 조원 카드 최소 높이

// 참가 규모
export const EXPECTED_TOTAL_MEMBERS = 200;
export const EXPECTED_LEADER_COUNT = 18;

// 이메일 자동 생성: 전원 {이름}@linkagelab.co.kr (역할 무관)

// 일차 범위
export const MIN_DAY_NUMBER = 1;
export const MAX_DAY_NUMBER = 3;

// 선후발 매핑 (CSV → DB)
export const PARTY_MAP: Record<string, "advance" | "rear"> = {
  선발: "advance",
  후발: "rear",
};

// 일정 대상 매핑 (CSV → DB)
export const SCOPE_MAP: Record<string, "all" | "advance" | "rear"> = {
  전체: "all",
  선발: "advance",
  후발: "rear",
};

// 일정 대상 라벨 (DB → UI)
export const SCOPE_LABEL: Record<ScheduleScope, string> = {
  all: "전체",
  advance: "선발",
  rear: "후발",
};

// 역할 라벨 (DB → UI)
export const ROLE_LABEL: Record<UserRole, string> = {
  member: "조원",
  leader: "조장",
  admin: "관리자",
  admin_leader: "관리자(조장)",
};

// 선후발 라벨 (null 허용)
export function getPartyLabel(party: GroupParty | null): string {
  if (party === "advance") return "선발";
  if (party === "rear") return "후발";
  return "-";
}

/**
 * 일정의 airline_filter에 매칭되는 멤버가 있는지 검사.
 * - filter가 null/공백이면 항상 true (필터 적용 안 함)
 * - 멤버의 airline(가는편) 또는 return_airline(오는편)이 filter 값을 포함(includes)하면 매치
 *
 * 예: filter="티웨이" → members 중 airline이 "티웨이 항공"/"티웨이"인 사람 있으면 true
 *     filter="제주항공" → members 중 airline/return_airline에 "제주항공"이 있으면 true
 *
 * GroupFeedView(조장 화면 필터), AdminBottomSheet(관리자 조 카운트)에서 공통 사용.
 */
export function matchesAirlineFilter(
  filter: string | null,
  members: Array<{ airline?: string | null; return_airline?: string | null }>
): boolean {
  if (!filter) return true;
  const trimmed = filter.trim();
  if (!trimmed) return true;
  return members.some((m) => {
    const out = m.airline ?? "";
    const ret = m.return_airline ?? "";
    return out.includes(trimmed) || ret.includes(trimmed);
  });
}

/**
 * 특정 멤버 한 명이 일정의 airline_filter에 매칭되는지 검사.
 * 조원 단위 필터링(바텀시트의 셔틀버스 그룹핑과 유사)에 사용.
 */
export function memberMatchesAirlineFilter(
  filter: string | null,
  member: { airline?: string | null; return_airline?: string | null }
): boolean {
  if (!filter) return true;
  const trimmed = filter.trim();
  if (!trimmed) return true;
  const out = member.airline ?? "";
  const ret = member.return_airline ?? "";
  return out.includes(trimmed) || ret.includes(trimmed);
}

// 역할 라우팅
export const ROLE_ROUTES: Record<string, string> = {
  leader: "/group",
  member: "/no-access",
  admin: "/admin",
  admin_leader: "/admin",
};

// 역할 권한 테이블 — 핫픽스 시 1곳만 수정하면 모든 함수에 반영됨
const ROLE_PERMISSIONS = {
  member:       { isAdmin: false, isLeader: false, canCheckin: false },
  leader:       { isAdmin: false, isLeader: true,  canCheckin: true  },
  admin:        { isAdmin: true,  isLeader: false, canCheckin: true  },
  admin_leader: { isAdmin: true,  isLeader: true,  canCheckin: true  },
} as const satisfies Record<string, { isAdmin: boolean; isLeader: boolean; canCheckin: boolean }>;

// 역할 판별 헬퍼 — 복합 역할(admin_leader) 대응
export function isAdminRole(role: string): boolean {
  return ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]?.isAdmin ?? false;
}
export function isLeaderRole(role: string): boolean {
  return ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]?.isLeader ?? false;
}
export function canCheckin(role: string): boolean {
  return ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]?.canCheckin ?? false;
}

// 컬러 상수 (tailwind.config와 동기화)
export const COLORS = {
  mainAction: "#FEE500",
  completeCard: "#EAF3DE",
  completeCheck: "#059669",
  progressBar: "#0ACF83",
  offlineBanner: "#F1EFE8",
  progressBadge: "#FEF9C3",
  appBg: "#F5F3EF",
} as const;

/**
 * 브리핑 시트 이름 나열 구분자 — 가운뎃점(U+00B7 interpunct).
 * 한/영 혼용 방지 차원에서 단일 상수로 관리.
 */
export const BRIEFING_SEPARATOR = " · ";

/**
 * 색맹 친화 그룹 컬러 팔레트 (Tailwind 500 계열).
 * 적록/청황 색맹 환경에서도 구별 가능하도록 hue·명도 충분히 분리.
 * 색상만으로 정보 전달하지 않고 반드시 텍스트와 이중 표기 (KWCAG 1.3.3).
 */
export const GROUP_COLOR_PALETTE = [
  { dot: "bg-sky-500", tint: "bg-sky-50", label: "text-sky-900" },       // 파랑
  { dot: "bg-orange-500", tint: "bg-orange-50", label: "text-orange-900" }, // 주황
  { dot: "bg-purple-500", tint: "bg-purple-50", label: "text-purple-900" }, // 자주
  { dot: "bg-teal-500", tint: "bg-teal-50", label: "text-teal-900" },    // 청록
  { dot: "bg-rose-500", tint: "bg-rose-50", label: "text-rose-900" },    // 분홍
  { dot: "bg-amber-600", tint: "bg-amber-50", label: "text-amber-900" }, // 호박
  { dot: "bg-emerald-500", tint: "bg-emerald-50", label: "text-emerald-900" }, // 녹색
  { dot: "bg-indigo-500", tint: "bg-indigo-50", label: "text-indigo-900" }, // 남색
] as const;

/**
 * 문자열(그룹명) → 팔레트 인덱스 결정적 매핑.
 * 같은 그룹명은 세션 간에도 항상 같은 색상을 받음.
 */
export function hashStringToPaletteIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % GROUP_COLOR_PALETTE.length;
}

export function getGroupColor(groupName: string) {
  return GROUP_COLOR_PALETTE[hashStringToPaletteIndex(groupName)];
}

// 조 배지 스타일 (AdminBottomSheet + GroupFeedView 공통)
export const GROUP_BADGE_STYLE: Record<
  import("./types").GroupBadgeStatus,
  { bg: string; text: string; label: string }
> = {
  reported: { bg: "bg-[#EAF3DE]", text: "text-[#27500A]", label: "보고완료" },
  all_checked: { bg: "bg-[#FEF3C7]", text: "text-[#92400E]", label: "전원확인" },
  in_progress: { bg: "bg-progress-badge", text: "text-[#633806]", label: "진행중" },
  not_started: { bg: "bg-sky-50", text: "text-sky-700", label: "시작전" },
};

// UI 문구 (PRD 8.2)
export const COPY = {
  notChecked: "확인 전",
  checked: (time: string) => `${time} 탑승 완료`,
  checkinButton: "왔수다!",
  cancelButton: "취소",
  totalCount: (checked: number, total: number) => `${checked} / ${total}명 탑승 완료`,
  allComplete: "전원 확인 끝!",
  celebrationSubtitle: "보고하기를 눌러주세요.",
  allCompleteReported: "보고 완료!",
  celebrationReported: "폭싹 속았수다!",
  reportButtonComplete: "우리 조 다 왔수다! 보고하기",
  reportButtonDone: (checked: number, total: number) => `${checked}/${total}명 보고 완료!`,
  reportButtonPending: (n: number) => `${n}명 남았어요`,
  absent: "불참",
  offline: (n: number) => `오프라인 상태예요. ${n}건 저장 중 — 연결되면 자동으로 보낼게요`,
  scheduleAlert: (title: string) => `새로운 일정이 시작되었어요: ${title}`,
  uncheckedWarning: (n: number) => `현재 일정에 ${n}명이 미확인 상태예요`,
  uncheckedWarningQuestion: "그래도 전환할까요?",
  emptySchedule: "현재 진행 중인 일정이 없어요",
  totalSummary: (checked: number, total: number) => `전체 ${checked}/${total}명 확인`,
  absentCancel: "불참을 취소할까요?",
  scheduleDeactivated: "일정이 종료되었어요",
  deactivateConfirm: "정말 종료할까요?",
  allReported: "모든 조가 보고했어요",
} as const;

/** 보고완료 배지 동적 라벨 (관리자 현황) */
export function getReportedLabel(
  reportedCount: number,
  total: number,
  unit: "조" | "차량" = "조"
): string {
  if (total > 0 && reportedCount >= total) return `${total}/${total}${unit} 보고완료`;
  return `${reportedCount}/${total}${unit} 보고완료`;
}
