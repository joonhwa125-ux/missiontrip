// 미션트립 시스템 상수 정의

// 인증
export const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "@linkagelab.co.kr";

// 오프라인 스토리지 키
export const OFFLINE_PENDING_KEY = "mtrip_pending";
export const ACTIVE_SCHEDULE_KEY = "mtrip_active_schedule";

// Realtime 채널명
export const CHANNEL_GLOBAL = "global";
export const CHANNEL_ADMIN = "admin";
export const CHANNEL_GROUP_PREFIX = "group:";

// Realtime 이벤트 타입
export const EVENT_SCHEDULE_ACTIVATED = "schedule_activated";
export const EVENT_SCHEDULE_UPDATED = "schedule_updated";
export const EVENT_NOTICE = "notice";
export const EVENT_CHECKIN_UPDATED = "checkin_updated";
export const EVENT_GROUP_REPORTED = "group_reported";

// UI 치수 (KWCAG 2.5.5)
export const MIN_TOUCH_TARGET = 44; // px — 최소 터치 타겟
export const MEMBER_CARD_MIN_HEIGHT = 72; // px — 조원 카드 최소 높이

// 참가 규모
export const EXPECTED_TOTAL_MEMBERS = 200;
export const EXPECTED_GROUP_COUNT = 20;
export const EXPECTED_MEMBERS_PER_GROUP = 10;

// 일차 범위
export const MIN_DAY_NUMBER = 1;
export const MAX_DAY_NUMBER = 3;

// 역할 라우팅
export const ROLE_ROUTES = {
  leader: "/group",
  member: "/checkin",
  admin: "/admin",
} as const;

// 컬러 상수 (tailwind.config와 동기화)
export const COLORS = {
  mainAction: "#FEE500",
  completeCard: "#EAF3DE",
  completeCheck: "#00C471",
  noticeBanner: "#E6F1FB",
  offlineBanner: "#F1EFE8",
  progressBadge: "#FAEEDA",
  appBg: "#F5F3EF",
} as const;

// UI 문구 (PRD 8.2)
export const COPY = {
  notChecked: "아직 안 보여요",
  checked: (time: string) => `${time} 탑승 완료`,
  checkinButton: "탔어요!",
  cancelButton: "취소",
  totalCount: (checked: number, total: number) => `${checked} / ${total}명 탑승 완료`,
  allComplete: (groupName: string) => `${groupName} 전원 탑승 완료!`,
  reportButtonComplete: "우리 조 다 탔어요! 보고하기",
  reportButtonDone: "보고 완료!",
  reportButtonPending: (n: number) => `${n}명 남았어요`,
  offline: (n: number) => `오프라인 상태예요. ${n}건 저장 중 — 연결되면 자동으로 보낼게요`,
} as const;
