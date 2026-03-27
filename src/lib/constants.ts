// 미션트립 시스템 상수 정의

import type { UserRole, GroupParty, ScheduleScope } from "./types";

// 인증
export const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "@linkagelab.co.kr";

// 오프라인 스토리지 키
export const OFFLINE_PENDING_KEY = "mtrip_pending";
export const OFFLINE_PENDING_REPORTS_KEY = "mtrip_pending_reports";
export const ACTIVE_SCHEDULE_KEY = "mtrip_active_schedule";

// 셋업 동기화 스토리지 키
export const SETUP_LAST_SYNCED_KEY = "setup_last_synced";
export const SETUP_SOURCE_KEY = "setup_source";

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

// UI 치수 (KWCAG 2.5.5)
export const MIN_TOUCH_TARGET = 44; // px — 최소 터치 타겟
export const MEMBER_CARD_MIN_HEIGHT = 72; // px — 조원 카드 최소 높이

// 참가 규모
export const EXPECTED_TOTAL_MEMBERS = 200;
export const EXPECTED_LEADER_COUNT = 18;

// 이메일 자동 생성 (setup 파싱용)
export const NO_LOGIN_EMAIL_DOMAIN = "@nologin.internal";
export const MEMBER_EMAIL_PREFIX = "_member";

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
  completeCheck: "#047857",
  progressBar: "#0ACF83",
  offlineBanner: "#F1EFE8",
  progressBadge: "#FEF9C3",
  appBg: "#F5F3EF",
} as const;

// 조 배지 스타일 (AdminBottomSheet + GroupFeedView 공통)
// WCAG 2.1 명도대비 4.5:1 이상 준수
export const GROUP_BADGE_STYLE: Record<
  import("./types").GroupBadgeStatus,
  { bg: string; text: string; label: string }
> = {
  // 보고완료: emerald 밝은 톤 (아직 일정 진행중, 액션 가능 상태)
  reported: { bg: "bg-emerald-100", text: "text-emerald-800", label: "보고완료" },
  // 전원확인: amber (보고 직전 단계)
  all_checked: { bg: "bg-amber-100", text: "text-amber-800", label: "전원확인" },
  // 진행중: amber 연한 톤
  in_progress: { bg: "bg-amber-50", text: "text-amber-800", label: "진행중" },
  // 시작전: neutral stone
  not_started: { bg: "bg-stone-100", text: "text-stone-600", label: "시작전" },
};

// UI 문구 (PRD 8.2) - 제주 방언 적용
export const COPY = {
  notChecked: "확인 전",
  checked: (time: string) => `${time} 왔수다`,
  checkinButton: "왔수다!",
  cancelButton: "취소",
  totalCount: (checked: number, total: number) => `${checked} / ${total}명 탑승 완료`,
  allComplete: (groupName: string, hasAbsent: boolean) =>
    hasAbsent ? `${groupName} 다 왔수다!` : `${groupName} 다 왔수다!`,
  reportButtonComplete: "폭싹 속았수다! 보고하기",
  reportButtonDone: "폭싹 속았수다!",
  reportButtonPending: (n: number) => `${n}명 남았수다`,
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
  allReported: "모든 조가 보고했수다",
} as const;
