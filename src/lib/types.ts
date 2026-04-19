// 미션트립 도메인 타입 정의

export type UserRole = "member" | "leader" | "admin" | "admin_leader";
/** 'temp_leader'는 v2 임시 조장 권한으로 체크인한 경우 audit 구분용 */
export type CheckedBy = "leader" | "admin" | "temp_leader";
export type ScheduleStatus = "active" | "completed" | "waiting";
export type GroupParty = "advance" | "rear";
export type ScheduleScope = "all" | "advance" | "rear";
export type ShuttleType = "departure" | "return";
/** 항공 구간 — 일정이 비행편임을 표시 (outbound=가는편, return=오는편, null=비행 아님) */
export type AirlineLeg = "outbound" | "return";

/** 불참 사유 기본 항목 — '기타'는 `기타: {자유텍스트}` 형태로 저장 */
export type AbsenceReasonCategory = "숙소" | "근무" | "의료" | "기타";

/** schedule_member_info.temp_role */
export type TempRole = "leader" | "member";

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
  party: GroupParty | null;
  shuttle_bus: string | null;
  return_shuttle_bus: string | null;
  airline: string | null;
  return_airline: string | null;
  trip_role: string | null;
  created_at: string;
}

export interface UserWithGroup extends User {
  groups: Group;
}

/** 조장 화면용 멤버 (id, name, party, airline, return_airline, trip_role) */
export type GroupMember = Pick<
  User,
  "id" | "name" | "party" | "airline" | "return_airline" | "trip_role"
>;

/** 전체 현황용 멤버 (id, group_id, party, name, role) */
export interface GroupMemberBrief {
  id: string;
  group_id: string;
  party: GroupParty | null;
  name: string;
  role: UserRole;
}

/** 관리자 화면용 멤버 (전화, 역할, 소속조 포함) */
export interface AdminMember {
  id: string;
  name: string;
  phone: string | null;
  role: UserRole;
  group_id: string;
  party: GroupParty | null;
  shuttle_bus?: string | null;
  return_shuttle_bus?: string | null;
  airline?: string | null;
  return_airline?: string | null;
  trip_role?: string | null;
}

export interface Schedule {
  id: string;
  title: string;
  location: string | null;
  day_number: number;
  sort_order: number;
  scheduled_time: string | null;
  scope: ScheduleScope;
  is_active: boolean;
  shuttle_type: ShuttleType | null;
  airline_leg: AirlineLeg | null;
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
  absence_reason: string | null;
  absence_location: string | null;
  group_id_at_checkin: string | null;
}

/** 관리자 현황용 보고 (경량) */
export type AdminReport = Pick<GroupReport, "group_id" | "pending_count" | "reported_at">;

/** 관리자 현황용 체크인 (경량) */
export interface AdminCheckIn {
  user_id: string;
  is_absent: boolean;
  checked_at?: string;
  absence_reason?: string | null;
  absence_location?: string | null;
}

export interface GroupReport {
  id: string;
  group_id: string;
  schedule_id: string;
  reported_by: string;
  pending_count: number;
  reported_at: string;
}

export interface ShuttleReport {
  id: string;
  shuttle_bus: string;
  schedule_id: string;
  reported_by: string;
  pending_count: number;
  reported_at: string;
}

/** 관리자 일정 카드 집계 전용 (id·schedule_id·reported_by 제외) */
export interface AdminShuttleReport {
  shuttle_bus: string;
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
// NOTE: v2에서 group_id_at_checkin, absence_reason, absence_location 추가
//       localStorage 키 버전을 mtrip_pending → mtrip_pending_v2로 올려서 구버전 레코드 방지
export interface OfflinePendingCheckin {
  user_id: string;
  schedule_id: string;
  checked_by: CheckedBy;
  checked_by_user_id: string;
  checked_at: string;
  is_absent?: boolean;
  absence_reason?: string | null;
  absence_location?: string | null;
  group_id_at_checkin?: string | null;
}

// 오프라인 대기 보고
export interface OfflinePendingReport {
  group_id: string | null;     // 일반 일정용 (셔틀이면 null)
  shuttle_bus?: string | null; // 셔틀 일정용 (일반이면 없음)
  schedule_id: string;
  pending_count: number;
}

// Server Action 반환 타입
export interface ActionResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// v2 일정별 메타데이터 (schedule_member_info / schedule_group_info)
// ============================================================================

/** 일정×사용자 메타데이터 — 조 이동, 임시 권한, 사전 제외, 활동/메뉴 배정 */
export interface ScheduleMemberInfo {
  id: string;
  schedule_id: string;
  user_id: string;
  temp_group_id: string | null;
  temp_role: TempRole | null;
  excused_reason: string | null;
  activity: string | null;
  menu: string | null;
  note: string | null;
  /**
   * Phase J+: 이 배정이 다른 배정(부모)에 의해 생성된 경우 부모의 id.
   * 예: A조 조장 liam.j의 이동+조장 배정 → blue.kk의 대체 조장 배정은 이 필드에 liam.j 배정의 id를 가짐.
   * 부모 삭제 시 DB CASCADE로 자동 삭제됨.
   */
  caused_by_smi_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/** 일정×조 메타데이터 — 층수, 순환순서, 활동장소, 관리자 메모 */
export interface ScheduleGroupInfo {
  id: string;
  schedule_id: string;
  group_id: string;
  location_detail: string | null;
  rotation: string | null;
  sub_location: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * 조장 브리핑 데이터 (v2 Phase E)
 * — 내 조 한정 메타데이터 묶음. 서버에서 조립 후 props로 전달되고,
 *   `useBriefingCache`가 localStorage에 사본을 유지하여 오프라인에서도 조회 가능.
 */
export interface BriefingData {
  /** 조원 중 trip_role / airline / return_airline 중 하나라도 설정된 레코드 */
  roleAssignments: Array<{
    user_id: string;
    name: string;
    trip_role: string | null;
    airline: string | null;
    return_airline: string | null;
  }>;
  /** 내 조 기준 schedule_group_info 레코드 */
  groupInfos: ScheduleGroupInfo[];
  /** 내 조원(이동IN 포함) 기준 schedule_member_info 레코드 */
  memberInfos: ScheduleMemberInfo[];
  /** 브리핑 렌더링 시 일정 정보 조회용 맵 — 서버에서 조립.
   *  `airline_leg`가 null이 아닌 일정은 해당 일차에 항공사 섹션 트리거 */
  scheduleSummaries: Array<{
    schedule_id: string;
    title: string;
    location: string | null;
    day_number: number;
    sort_order: number;
    scheduled_time: string | null;
    airline_leg: AirlineLeg | null;
  }>;
  /** user_id → name 매핑 (member_info 렌더 시 필요) */
  userNameMap: Record<string, string>;
  /** group_id → group name 매핑 (조이동 칩 렌더 시 필요 — Phase G 후속 fix) */
  groupNameMap: Record<string, string>;
  /** 캐시 기준 시각 (ISO). localStorage 저장 시점 확인용 */
  cachedAt: string;
}

/**
 * v2 Phase F: 서버→클라이언트 직렬화용 effective roster.
 * `EffectiveRoster`의 `memberInfoMap` (Map) 을 `memberInfos` (배열) 로 교체한 변형.
 * Map 은 Server Component → Client Component 경계에서 직렬화 불가하므로 별도 정의.
 */
export interface EffectiveRosterClient {
  activeMembers: GroupMember[];
  excusedMembers: GroupMember[];
  transferredIn: Array<GroupMember & { origin_group_name: string }>;
  /** user_id → ScheduleMemberInfo 매핑을 위한 raw 배열 (클라이언트에서 Map으로 재조립) */
  memberInfos: ScheduleMemberInfo[];
}

/** 조장 화면에서 사용하는 effective roster 결과 */
export interface EffectiveRoster {
  /** 체크인 대상 — 기본 조원 - 이동OUT + 이동IN (제외 인원 포함) */
  activeMembers: GroupMember[];
  /** 사전 제외 인원 (체크인 불필요, dim 표시) */
  excusedMembers: GroupMember[];
  /** 다른 조로 이동한 조원 (원래 조 조장에게 참고 정보) */
  transferredOut: Array<GroupMember & { target_group_name: string }>;
  /** 다른 조에서 합류한 조원 (대상 조 조장에게 "합류" 배지) */
  transferredIn: Array<GroupMember & { origin_group_name: string }>;
  /** user_id → 해당 일정의 member_info 매핑 (활동/메뉴/제외사유 렌더링용) */
  memberInfoMap: Map<string, ScheduleMemberInfo>;
}

// ============================================================================
// /setup 파싱 데이터
// ============================================================================

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
  party: GroupParty | null;
  shuttle_bus?: string | null;
  return_shuttle_bus?: string | null;
  airline?: string | null;
  return_airline?: string | null;
  trip_role?: string | null;
}

export interface ParsedSchedule {
  day_number: number;
  sort_order: number;
  title: string;
  location: string | null;
  scheduled_time: string | null;
  scope: ScheduleScope;
  shuttle_type: ShuttleType | null;
  airline_leg: AirlineLeg | null;
}

/** v2: 일정×조 파싱 레코드 — Google Sheets "조 브리핑" 시트 */
export interface ParsedGroupInfo {
  day_number: number;
  sort_order: number;
  group_name: string;
  location_detail: string | null;
  rotation: string | null;
  sub_location: string | null;
  note: string | null;
}

/** v2: 일정×사용자 파싱 레코드 — Google Sheets "개인 안내" 시트 */
export interface ParsedMemberInfo {
  day_number: number;
  sort_order: number;
  user_name: string;
  /** 항목 키: 조이동 / 임시역할 / 미참여 / 활동 / 메뉴 / 메모 */
  field: ParsedMemberInfoField;
  value: string;
}

export type ParsedMemberInfoField =
  | "조이동"
  | "임시역할"
  | "미참여"
  | "활동"
  | "메뉴"
  | "메모";

export interface SetupPreviewData {
  groups: ParsedGroup[];
  users: ParsedUser[];
  schedules: ParsedSchedule[];
  /** v2: 조 브리핑 — 비어있어도 정상 (opt-in) */
  groupInfos: ParsedGroupInfo[];
  /** v2: 개인 안내 — 비어있어도 정상 (opt-in) */
  memberInfos: ParsedMemberInfo[];
  errors: ValidationError[];
}

export interface ValidationError {
  sheet: "users" | "schedules" | "group_info" | "member_info";
  row: number;
  field: string;
  message: string;
}
