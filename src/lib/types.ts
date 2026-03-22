// 미션트립 도메인 타입 정의

export type UserRole = "member" | "leader" | "admin";
export type CheckedBy = "self" | "leader" | "admin";
export type ScheduleStatus = "active" | "completed" | "waiting";

export interface Group {
  id: string;
  name: string;
  bus_name: string | null;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  group_id: string;
  created_at: string;
}

export interface UserWithGroup extends User {
  groups: Group;
}

export interface Schedule {
  id: string;
  title: string;
  location: string | null;
  day_number: number;
  sort_order: number;
  scheduled_time: string | null;
  is_active: boolean;
  activated_at: string | null;
  created_at: string;
}

export interface CheckIn {
  id: string;
  user_id: string;
  schedule_id: string;
  checked_at: string;
  checked_by: CheckedBy;
  checked_by_user_id: string | null;
  offline_pending: boolean;
  is_absent: boolean;
}

export interface GroupReport {
  id: string;
  group_id: string;
  schedule_id: string;
  reported_by: string;
  pending_count: number;
  reported_at: string;
}

// 체크인 + 사용자 조인 뷰
export interface MemberCheckinStatus {
  user: User;
  checkIn: CheckIn | null;
  checked: boolean;
}

// 관리자 현황 뷰
export type GroupBadgeStatus =
  | "reported"     // 보고완료
  | "all_checked"  // 전원확인
  | "in_progress"  // 진행중
  | "not_started"; // 시작전

export interface GroupStatusSummary {
  group: Group;
  totalCount: number;
  checkedCount: number;
  badgeStatus: GroupBadgeStatus;
  hasReport: boolean;
  pendingCount: number;
}

// 오프라인 대기 체크인
export interface OfflinePendingCheckin {
  user_id: string;
  schedule_id: string;
  checked_by: CheckedBy;
  checked_by_user_id: string;
  checked_at: string;
}

// 오프라인 대기 보고
export interface OfflinePendingReport {
  group_id: string;
  schedule_id: string;
  pending_count: number;
}

// Server Action 반환 타입
export interface ActionResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

// /setup 파싱 데이터
export interface ParsedGroup {
  name: string;
  bus_name: string;
}

export interface ParsedUser {
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  group_name: string;
}

export interface ParsedSchedule {
  day_number: number;
  sort_order: number;
  title: string;
  location: string | null;
  scheduled_time: string | null;
}

export interface SetupPreviewData {
  groups: ParsedGroup[];
  users: ParsedUser[];
  schedules: ParsedSchedule[];
  errors: ValidationError[];
}

export interface ValidationError {
  sheet: "users" | "schedules";
  row: number;
  field: string;
  message: string;
}
