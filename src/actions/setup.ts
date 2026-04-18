"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { parseKSTTime } from "@/lib/utils";
import { canCheckin, MIN_DAY_NUMBER, MAX_DAY_NUMBER } from "@/lib/constants";
import { revalidateMainPaths, revalidateAllPaths } from "./_shared";
import type {
  ActionResult,
  SetupPreviewData,
  ParsedGroup,
  ParsedUser,
  ParsedSchedule,
  ParsedGroupInfo,
  ParsedMemberInfo,
  ValidationError,
  ScheduleScope,
  ShuttleType,
  UserRole,
  GroupParty,
} from "@/lib/types";
import {
  parseCsv,
  parseUsersSheet,
  parseSchedulesSheet,
  parseGroupInfoSheet,
  parseMemberInfoSheet,
  mapTempRoleLabel,
} from "@/utils/sheets-parser";

// Google Sheets CSV export URL 생성
function buildCsvUrl(sheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// Google Sheets에서 시트 데이터 가져와서 미리보기
// v2: group_info, member_info는 optional — 제공되지 않으면 빈 배열로 처리
export async function previewFromGoogleSheet(
  sheetId: string,
  gids: {
    users: string;
    schedules: string;
    group_info?: string | null;
    member_info?: string | null;
  }
): Promise<ActionResult<SetupPreviewData>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  try {
    const fetchCsv = async (url: string) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    };
    const [usersCsv, schedulesCsv, groupInfoCsv, memberInfoCsv] = await Promise.all([
      fetchCsv(buildCsvUrl(sheetId, gids.users)),
      fetchCsv(buildCsvUrl(sheetId, gids.schedules)),
      gids.group_info ? fetchCsv(buildCsvUrl(sheetId, gids.group_info)) : Promise.resolve(""),
      gids.member_info ? fetchCsv(buildCsvUrl(sheetId, gids.member_info)) : Promise.resolve(""),
    ]);

    return buildPreviewData(usersCsv, schedulesCsv, groupInfoCsv, memberInfoCsv);
  } catch {
    return {
      ok: false,
      error:
        "Google Sheets 데이터를 가져올 수 없어요. URL과 공유 설정을 확인해주세요",
    };
  }
}

// CSV 파일 업로드 미리보기
// v2: groupInfoCsv, memberInfoCsv는 optional
export async function previewFromCsv(
  usersCsv: string,
  schedulesCsv: string,
  groupInfoCsv?: string,
  memberInfoCsv?: string
): Promise<ActionResult<SetupPreviewData>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  return buildPreviewData(usersCsv, schedulesCsv, groupInfoCsv ?? "", memberInfoCsv ?? "");
}

// 공통 preview 로직 — Google Sheets / CSV 업로드 둘 다 사용
function buildPreviewData(
  usersCsv: string,
  schedulesCsv: string,
  groupInfoCsv: string,
  memberInfoCsv: string
): ActionResult<SetupPreviewData> {
  const usersRows = parseCsv(usersCsv);
  const schedulesRows = parseCsv(schedulesCsv);

  const { users, groups, errors: userErrors } = parseUsersSheet(usersRows);
  const { schedules, errors: scheduleErrors } = parseSchedulesSheet(schedulesRows);

  const groupInfoRows = groupInfoCsv ? parseCsv(groupInfoCsv) : [];
  const memberInfoRows = memberInfoCsv ? parseCsv(memberInfoCsv) : [];
  const { groupInfos, errors: groupInfoErrors } = parseGroupInfoSheet(groupInfoRows);
  const { memberInfos, errors: memberInfoErrors } = parseMemberInfoSheet(memberInfoRows);

  const leaderErrors = validateLeaderCount(groups, users);

  // 크로스 참조 검증 — 인원별/조별배정의 일정(일차+순서), 이름, 조 이름이 실제 존재하는지
  const crossRefErrors = validateMetadataReferences(
    groupInfos,
    memberInfos,
    schedules,
    users,
    groups
  );

  return {
    ok: true,
    data: {
      groups,
      users,
      schedules,
      groupInfos,
      memberInfos,
      errors: [
        ...userErrors,
        ...scheduleErrors,
        ...groupInfoErrors,
        ...memberInfoErrors,
        ...leaderErrors,
        ...crossRefErrors,
      ],
    },
  };
}

// v2 메타데이터의 참조 무결성 검증
// - group_info/member_info의 (일차, 순서) → schedules에 존재해야 함
// - member_info.user_name → users에 존재해야 함
// - member_info.field='조이동' value → groups에 존재해야 함
function validateMetadataReferences(
  groupInfos: ParsedGroupInfo[],
  memberInfos: ParsedMemberInfo[],
  schedules: ParsedSchedule[],
  users: ParsedUser[],
  groups: ParsedGroup[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const scheduleKey = (d: number, s: number) => `${d}-${s}`;
  const scheduleSet = new Set(schedules.map((s) => scheduleKey(s.day_number, s.sort_order)));
  const userNameSet = new Set(users.map((u) => u.name));
  const groupNameSet = new Set(groups.map((g) => g.name));

  // group_info 참조 검증
  for (const gi of groupInfos) {
    const key = scheduleKey(gi.day_number, gi.sort_order);
    if (!scheduleSet.has(key)) {
      errors.push({
        sheet: "group_info",
        row: 0,
        field: "일차/순서",
        message: `일정(${key})을 찾을 수 없어요 — 일정 시트를 확인해주세요`,
      });
    }
    if (!groupNameSet.has(gi.group_name)) {
      errors.push({
        sheet: "group_info",
        row: 0,
        field: "조",
        message: `조 "${gi.group_name}"를 찾을 수 없어요 — 참가자 시트의 소속조를 확인해주세요`,
      });
    }
  }

  // member_info 참조 검증
  for (const mi of memberInfos) {
    const key = scheduleKey(mi.day_number, mi.sort_order);
    if (!scheduleSet.has(key)) {
      errors.push({
        sheet: "member_info",
        row: 0,
        field: "일차/순서",
        message: `일정(${key})을 찾을 수 없어요`,
      });
    }
    if (!userNameSet.has(mi.user_name)) {
      errors.push({
        sheet: "member_info",
        row: 0,
        field: "이름",
        message: `참가자 "${mi.user_name}"을(를) 찾을 수 없어요`,
      });
    }
    // 조이동 값이 존재하는 조 이름인지
    if (mi.field === "조이동" && !groupNameSet.has(mi.value)) {
      errors.push({
        sheet: "member_info",
        row: 0,
        field: "값",
        message: `조이동 대상 "${mi.value}"을(를) 찾을 수 없어요`,
      });
    }
  }

  return errors;
}

// importToDatabase 내부 헬퍼 — Groups UPSERT + 조이름→UUID 매핑 반환
async function upsertGroups(
  supabase: ReturnType<typeof createServiceClient>,
  groups: ParsedGroup[]
): Promise<{ groupMap?: Map<string, string>; error?: string }> {
  const { data: inserted, error } = await supabase
    .from("groups")
    .upsert(
      groups.map((g) => ({ name: g.name, bus_name: g.bus_name })),
      { onConflict: "name" }
    )
    .select("id, name");

  if (error || !inserted) {
    return { error: `조 등록 실패: ${error?.message}` };
  }
  return { groupMap: new Map(inserted.map((g) => [g.name, g.id])) };
}

// importToDatabase 내부 헬퍼 — Users UPSERT (조이름→UUID 매핑 필요)
async function upsertUsers(
  supabase: ReturnType<typeof createServiceClient>,
  users: ParsedUser[],
  groupMap: Map<string, string>
): Promise<{ error?: string }> {
  const payload: {
    name: string; email: string; phone: string | null;
    role: string; group_id: string; party: string | null;
    shuttle_bus: string | null; return_shuttle_bus: string | null;
    airline: string | null; trip_role: string | null;
  }[] = [];

  for (const u of users) {
    const groupId = groupMap.get(u.group_name);
    if (!groupId) {
      return { error: `조 "${u.group_name}"를 찾을 수 없어요. 데이터를 다시 확인해주세요` };
    }
    payload.push({
      name: u.name, email: u.email, phone: u.phone,
      role: u.role, group_id: groupId, party: u.party,
      shuttle_bus: u.shuttle_bus ?? null,
      return_shuttle_bus: u.return_shuttle_bus ?? null,
      airline: u.airline ?? null,
      trip_role: u.trip_role ?? null,
    });
  }

  const { error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "email" });

  return error ? { error: `참가자 등록 실패: ${error.message}` } : {};
}

// importToDatabase 내부 헬퍼 — Schedules UPSERT (parseKSTTime으로 시간 변환)
async function upsertSchedules(
  supabase: ReturnType<typeof createServiceClient>,
  schedules: ParsedSchedule[]
): Promise<{ scheduleMap?: Map<string, string>; error?: string }> {
  const payload = schedules.map((s) => ({
    title: s.title,
    location: s.location,
    day_number: s.day_number,
    sort_order: s.sort_order,
    scope: s.scope,
    shuttle_type: s.shuttle_type,
    scheduled_time: s.scheduled_time ? parseKSTTime(s.scheduled_time) : null,
  }));

  const { data: inserted, error } = await supabase
    .from("schedules")
    .upsert(payload, { onConflict: "day_number,sort_order" })
    .select("id, day_number, sort_order");

  if (error || !inserted) {
    return { error: `일정 등록 실패: ${error?.message}` };
  }
  // (day_number, sort_order) → id 매핑 반환 (group_info, member_info에서 사용)
  const scheduleMap = new Map<string, string>();
  for (const s of inserted) {
    scheduleMap.set(`${s.day_number}-${s.sort_order}`, s.id);
  }
  return { scheduleMap };
}

// v2: Schedule Group Info UPSERT (일정×조 메타데이터)
async function upsertScheduleGroupInfo(
  supabase: ReturnType<typeof createServiceClient>,
  groupInfos: ParsedGroupInfo[],
  scheduleMap: Map<string, string>,
  groupMap: Map<string, string>,
  adminId: string
): Promise<{ error?: string }> {
  if (groupInfos.length === 0) return {};

  const payload: {
    schedule_id: string;
    group_id: string;
    location_detail: string | null;
    rotation: string | null;
    sub_location: string | null;
    note: string | null;
    updated_by: string;
  }[] = [];

  for (const gi of groupInfos) {
    const scheduleId = scheduleMap.get(`${gi.day_number}-${gi.sort_order}`);
    const groupId = groupMap.get(gi.group_name);
    if (!scheduleId || !groupId) {
      // validateMetadataReferences에서 이미 걸러져야 하지만 방어적 스킵
      continue;
    }
    payload.push({
      schedule_id: scheduleId,
      group_id: groupId,
      location_detail: gi.location_detail,
      rotation: gi.rotation,
      sub_location: gi.sub_location,
      note: gi.note,
      updated_by: adminId,
    });
  }

  if (payload.length === 0) return {};

  const { error } = await supabase
    .from("schedule_group_info")
    .upsert(payload, { onConflict: "schedule_id,group_id" });

  return error ? { error: `조별배정 등록 실패: ${error.message}` } : {};
}

// v2: Schedule Member Info UPSERT (일정×사용자 메타데이터)
// 같은 user×schedule에 여러 행이 있을 수 있으므로 클라이언트에서 먼저 merge
async function upsertScheduleMemberInfo(
  supabase: ReturnType<typeof createServiceClient>,
  memberInfos: ParsedMemberInfo[],
  scheduleMap: Map<string, string>,
  groupMap: Map<string, string>,
  userMap: Map<string, string>,
  adminId: string
): Promise<{ error?: string }> {
  if (memberInfos.length === 0) return {};

  // merge key = `${schedule_id}:${user_id}` → 누적 record
  type MergedRow = {
    schedule_id: string;
    user_id: string;
    temp_group_id: string | null;
    temp_role: "leader" | "member" | null;
    excused_reason: string | null;
    activity: string | null;
    menu: string | null;
    note: string | null;
    updated_by: string;
  };
  const merged = new Map<string, MergedRow>();

  for (const mi of memberInfos) {
    const scheduleId = scheduleMap.get(`${mi.day_number}-${mi.sort_order}`);
    const userId = userMap.get(mi.user_name);
    if (!scheduleId || !userId) continue;  // cross-ref 검증에서 걸러져야 함

    const mergeKey = `${scheduleId}:${userId}`;
    const existing = merged.get(mergeKey) ?? {
      schedule_id: scheduleId,
      user_id: userId,
      temp_group_id: null,
      temp_role: null,
      excused_reason: null,
      activity: null,
      menu: null,
      note: null,
      updated_by: adminId,
    };

    switch (mi.field) {
      case "조이동": {
        const targetGroupId = groupMap.get(mi.value);
        if (targetGroupId) existing.temp_group_id = targetGroupId;
        break;
      }
      case "임시역할":
        existing.temp_role = mapTempRoleLabel(mi.value);
        break;
      case "제외":
        existing.excused_reason = mi.value;
        break;
      case "활동":
        existing.activity = mi.value;
        break;
      case "메뉴":
        existing.menu = mi.value;
        break;
      case "메모":
        existing.note = mi.value;
        break;
    }

    merged.set(mergeKey, existing);
  }

  const payload = Array.from(merged.values());
  if (payload.length === 0) return {};

  const { error } = await supabase
    .from("schedule_member_info")
    .upsert(payload, { onConflict: "schedule_id,user_id" });

  return error ? { error: `인원별배정 등록 실패: ${error.message}` } : {};
}

// DB에 데이터 반영 (Groups → Users → Schedules 순서)
export async function importToDatabase(
  data: SetupPreviewData
): Promise<ActionResult<{ groups: number; users: number; schedules: number }>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  if (data.errors.length > 0) {
    return { ok: false, error: "검증 오류가 있어요. 오류를 먼저 해결해주세요" };
  }

  // 관리자 본인이 시트에 포함되어 있어야 cleanup 보존 정책과 정합성 유지
  const adminInSheet = data.users.find((u) => u.email === admin.email);
  if (!adminInSheet) {
    return {
      ok: false,
      error: "시트에 관리자 본인(" + admin.email + ")이 포함되어 있어야 해요. 참가자 시트에 본인을 추가해주세요",
    };
  }
  // 관리자 본인의 소속조가 시트에 존재해야 함 (보존된 group_id가 고립되는 것 방지)
  const adminGroupInSheet = data.groups.some((g) => g.name === adminInSheet.group_name);
  if (!adminGroupInSheet) {
    return {
      ok: false,
      error: "시트에 관리자 소속조 정보가 없어요. 참가자 시트의 소속조 컬럼을 확인해주세요",
    };
  }

  const supabase = createServiceClient();

  // 재업로드 시 고아 행 방지 — UPSERT 전에 기존 데이터 삭제 (FK 역순)
  // v2: schedule_member_info, schedule_group_info를 users/schedules 삭제 전에 정리
  // (FK CASCADE가 있어도 명시적 정리로 기대 동작 유지)
  const cleanupTables = [
    { table: "check_ins", filter: null },
    { table: "group_reports", filter: null },
    { table: "shuttle_reports", filter: null },
    { table: "schedule_member_info", filter: null },
    { table: "schedule_group_info", filter: null },
    { table: "users", filter: admin.id },
    { table: "schedules", filter: null },
  ] as const;
  for (const { table, filter } of cleanupTables) {
    let q = supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (filter) q = q.neq("id", filter);
    const { error } = await q;
    if (error) return { ok: false, error: `기존 데이터 정리 실패 (${table}): ${error.message}` };
  }
  // groups는 users 삭제 후 처리 (FK)
  {
    const { error } = await supabase
      .from("groups")
      .delete()
      .neq("id", admin.group_id)
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) return { ok: false, error: `기존 데이터 정리 실패 (groups): ${error.message}` };
  }

  const { groupMap, error: ge } = await upsertGroups(supabase, data.groups);
  if (ge || !groupMap) return { ok: false, error: ge ?? "조 등록 실패" };

  const { error: ue } = await upsertUsers(supabase, data.users, groupMap);
  if (ue) return { ok: false, error: ue };

  const { scheduleMap, error: se } = await upsertSchedules(supabase, data.schedules);
  if (se || !scheduleMap) return { ok: false, error: se ?? "일정 등록 실패" };

  // v2: 메타데이터 UPSERT — user_name → id 매핑이 필요하므로 방금 UPSERT된 users 조회
  const { data: userRows } = await supabase
    .from("users")
    .select("id, name");
  const userMap = new Map<string, string>(
    (userRows ?? []).map((u) => [u.name, u.id])
  );

  const { error: giError } = await upsertScheduleGroupInfo(
    supabase, data.groupInfos, scheduleMap, groupMap, admin.id
  );
  if (giError) return { ok: false, error: giError };

  const { error: miError } = await upsertScheduleMemberInfo(
    supabase, data.memberInfos, scheduleMap, groupMap, userMap, admin.id
  );
  if (miError) return { ok: false, error: miError };

  revalidateAllPaths();
  return {
    ok: true,
    data: {
      groups: data.groups.length,
      users: data.users.length,
      schedules: data.schedules.length,
    },
  };
}

// 전체 데이터 초기화 (FK 역순 삭제)
export async function resetAllData(): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();

  const tables = [
    "check_ins",
    "group_reports",
    "shuttle_reports",
    "schedule_member_info",
    "schedule_group_info",
    "users",
    "schedules",
    "groups",
  ];

  for (const table of tables) {
    // PostgREST는 필터 없는 DELETE를 거부 → 불가능한 UUID로 neq 필터 적용 (전 행 삭제 우회)
    let query = supabase
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    // 관리자 본인 레코드 + 소속 조 보존 — 삭제하면 미들웨어 역할 검사 실패
    if (table === "users") {
      query = query.neq("id", admin.id);
    }
    if (table === "groups") {
      query = query.neq("id", admin.group_id);
    }

    const { error } = await query;
    if (error) {
      return { ok: false, error: `${table} 삭제 실패: ${error.message}` };
    }
  }

  revalidateAllPaths();
  return { ok: true };
}

// 일정 수정
export async function updateSchedule(
  scheduleId: string,
  data: {
    title: string;
    location: string | null;
    day_number: number;
    sort_order: number;
    scheduled_time: string | null;
    scope: ScheduleScope;
    shuttle_type: ShuttleType | null;
  }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const trimmedTitle = data.title.trim();
  if (!trimmedTitle) return { ok: false, error: "일정명을 입력해주세요" };
  if (!Number.isInteger(data.day_number) || data.day_number < MIN_DAY_NUMBER || data.day_number > MAX_DAY_NUMBER)
    return { ok: false, error: `일차는 ${MIN_DAY_NUMBER}~${MAX_DAY_NUMBER}만 가능해요` };
  const VALID_SCOPES: ScheduleScope[] = ["all", "advance", "rear"];
  if (!VALID_SCOPES.includes(data.scope))
    return { ok: false, error: "유효하지 않은 대상이에요" };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("schedules")
    .update({ ...data, title: trimmedTitle })
    .eq("id", scheduleId);

  if (error) return { ok: false, error: "일정 수정 중 오류가 발생했어요" };

  revalidateAllPaths();
  return { ok: true };
}

// 일정 삭제 (진행 중인 일정 제외)
export async function deleteSchedule(scheduleId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();

  const { data: schedule } = await supabase
    .from("schedules")
    .select("is_active")
    .eq("id", scheduleId)
    .single();

  if (schedule?.is_active) {
    return {
      ok: false,
      error: "진행 중인 일정은 삭제할 수 없어요. 먼저 다른 일정을 활성화해주세요",
    };
  }

  // FK 자식 행 선삭제 — supabase/migrations/20260415_fk_cascade.sql 적용 후에는 DB CASCADE가 처리하지만
  // 마이그레이션 미적용 환경도 지원하기 위해 애플리케이션 레벨 방어 로직 유지
  // v2: schedule_member_info, schedule_group_info도 schedule_id FK
  for (const table of ["check_ins", "group_reports", "shuttle_reports", "schedule_member_info", "schedule_group_info"] as const) {
    const { error: fkErr } = await supabase.from(table).delete().eq("schedule_id", scheduleId);
    if (fkErr) return { ok: false, error: `일정 삭제 중 오류가 발생했어요 (${table})` };
  }

  const { error } = await supabase.from("schedules").delete().eq("id", scheduleId);

  if (error) return { ok: false, error: "일정 삭제 중 오류가 발생했어요" };

  revalidateAllPaths();
  return { ok: true };
}

// 참가자 수정
export async function updateUser(
  userId: string,
  data: {
    name: string;
    phone: string | null;
    role: UserRole;
    group_id: string;
    party: GroupParty | null;
    shuttle_bus: string | null;
    return_shuttle_bus: string | null;
    airline?: string | null;
    trip_role?: string | null;
  }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  // 본인 역할 변경 차단 — admin 자격 상실 방지
  if (userId === admin.id && data.role !== admin.role) {
    return { ok: false, error: "자신의 역할은 변경할 수 없어요" };
  }

  // 본인 소속조 변경 차단 — importToDatabase cleanup 필터 기준 변경 방지
  if (userId === admin.id && data.group_id !== admin.group_id) {
    return { ok: false, error: "자신의 소속조는 변경할 수 없어요" };
  }

  // role 화이트리스트 검증 — 런타임 권한 에스컬레이션 방지
  const VALID_ROLES: UserRole[] = ["member", "leader", "admin", "admin_leader"];
  if (!VALID_ROLES.includes(data.role)) {
    return { ok: false, error: "유효하지 않은 역할이에요" };
  }

  const trimmedName = data.name.trim();
  if (!trimmedName) return { ok: false, error: "이름을 입력해주세요" };

  const supabase = createServiceClient();

  // 조 변경 감지: 활성 일정의 체크인만 삭제 (안전 우선 — 삭제 실패 시 업데이트 차단)
  // 종료된 일정의 체크인은 당시 소속 조 기준의 유효한 과거 기록이므로 보존
  const { data: prevUser } = await supabase
    .from("users")
    .select("group_id")
    .eq("id", userId)
    .single();

  const groupChanged = prevUser && prevUser.group_id !== data.group_id;

  if (groupChanged) {
    const { data: activeSchedule } = await supabase
      .from("schedules")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    if (activeSchedule) {
      const { error: deleteError } = await supabase
        .from("check_ins")
        .delete()
        .eq("user_id", userId)
        .eq("schedule_id", activeSchedule.id);

      if (deleteError) {
        return { ok: false, error: "체크인 초기화에 실패했어요. 다시 시도해주세요" };
      }
    }
  }

  const { error } = await supabase.from("users").update({ ...data, name: trimmedName }).eq("id", userId);
  if (error) return { ok: false, error: "참가자 수정 중 오류가 발생했어요" };

  revalidateAllPaths();
  return { ok: true };
}

// 참가자 삭제 (본인 제외)
export async function deleteUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  if (userId === admin.id) {
    return { ok: false, error: "자신의 계정은 삭제할 수 없어요" };
  }

  const supabase = createServiceClient();

  // FK 자식 행 선삭제 — supabase/migrations/20260415_fk_cascade.sql 적용 후에는 DB CASCADE가 처리하지만
  // 마이그레이션 미적용 환경도 지원하기 위해 애플리케이션 레벨 방어 로직 유지
  // 1. user_id를 참조하는 NOT NULL FK → 행 삭제
  const { error: ciErr } = await supabase.from("check_ins").delete().eq("user_id", userId);
  if (ciErr) return { ok: false, error: "참가자 삭제 중 오류가 발생했어요 (check_ins)" };

  const { error: grErr } = await supabase.from("group_reports").delete().eq("reported_by", userId);
  if (grErr) return { ok: false, error: "참가자 삭제 중 오류가 발생했어요 (group_reports)" };

  const { error: srErr } = await supabase.from("shuttle_reports").delete().eq("reported_by", userId);
  if (srErr) return { ok: false, error: "참가자 삭제 중 오류가 발생했어요 (shuttle_reports)" };

  // v2: schedule_member_info — user_id가 NOT NULL FK이므로 선삭제
  const { error: smiErr } = await supabase.from("schedule_member_info").delete().eq("user_id", userId);
  if (smiErr) return { ok: false, error: "참가자 삭제 중 오류가 발생했어요 (schedule_member_info)" };

  // 2. checked_by_user_id는 nullable FK → NULL로 설정 (체크인 기록 보존)
  const { error: cbuErr } = await supabase
    .from("check_ins").update({ checked_by_user_id: null }).eq("checked_by_user_id", userId);
  if (cbuErr) return { ok: false, error: "참가자 삭제 중 오류가 발생했어요 (checked_by)" };

  const { error } = await supabase.from("users").delete().eq("id", userId);

  if (error) return { ok: false, error: "참가자 삭제 중 오류가 발생했어요" };

  revalidateAllPaths();
  return { ok: true };
}

// 조장 수 검증 — 각 조에 최소 1명의 조장 (관리자도 조장 역할 수행 가능)
function validateLeaderCount(
  groups: ParsedGroup[],
  users: ParsedUser[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const group of groups) {
    const leaders = users.filter(
      (u) =>
        u.group_name === group.name &&
        canCheckin(u.role)
    );
    if (leaders.length === 0) {
      errors.push({
        sheet: "users",
        row: 0,
        field: "역할",
        message: `${group.name}에 조장이 없어요`,
      });
    }
  }

  return errors;
}

// ============================================================================
// v2 Phase G: 단일 행 schedule_group_info / schedule_member_info CRUD
// — 관리자 데이터관리 UI에서 직접 편집/삭제/되돌리기 용
// — 벌크 UPSERT 헬퍼(`upsertScheduleGroupInfo` / `upsertScheduleMemberInfo`)와 분리
// ============================================================================

/**
 * 단일 조별 배정 upsert. 신규 생성 + 기존 수정 + Undo 재삽입 모두 커버.
 *
 * - id가 주어지면 해당 id로 UPDATE 시도
 * - id가 없으면 (schedule_id, group_id) 유일키로 UPSERT
 * - 모든 payload 필드가 null이면 의미 없는 행이므로 거부
 */
export async function updateScheduleGroupInfo(
  scheduleId: string,
  groupId: string,
  payload: {
    location_detail: string | null;
    rotation: string | null;
    sub_location: string | null;
    note: string | null;
  },
  existingId?: string | null
): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();

  const normalized = {
    schedule_id: scheduleId,
    group_id: groupId,
    location_detail: payload.location_detail?.trim() || null,
    rotation: payload.rotation?.trim() || null,
    sub_location: payload.sub_location?.trim() || null,
    note: payload.note?.trim() || null,
    updated_by: admin.id,
  };

  const hasContent =
    normalized.location_detail ||
    normalized.rotation ||
    normalized.sub_location ||
    normalized.note;
  if (!hasContent) {
    return { ok: false, error: "최소 한 개 항목은 입력해주세요" };
  }

  if (existingId) {
    const { data, error } = await supabase
      .from("schedule_group_info")
      .update(normalized)
      .eq("id", existingId)
      .select("id")
      .single();
    if (error) return { ok: false, error: "조별 배정 수정 중 오류가 발생했어요" };
    revalidateMainPaths();
    return { ok: true, data: { id: data.id } };
  }

  const { data, error } = await supabase
    .from("schedule_group_info")
    .upsert(normalized, { onConflict: "schedule_id,group_id" })
    .select("id")
    .single();
  if (error) return { ok: false, error: "조별 배정 저장 중 오류가 발생했어요" };

  revalidateMainPaths();
  return { ok: true, data: { id: data.id } };
}

/** 단일 조별 배정 삭제 */
export async function deleteScheduleGroupInfo(
  id: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("schedule_group_info")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: "조별 배정 삭제 중 오류가 발생했어요" };

  revalidateMainPaths();
  return { ok: true };
}

/**
 * 단일 인원별 배정 upsert. 신규 생성 + 기존 수정 + Undo 재삽입 모두 커버.
 * payload의 temp_role은 'leader'/'member'만 허용.
 */
export async function updateScheduleMemberInfo(
  scheduleId: string,
  userId: string,
  payload: {
    temp_group_id: string | null;
    temp_role: "leader" | "member" | null;
    excused_reason: string | null;
    activity: string | null;
    menu: string | null;
    note: string | null;
    /** Phase J+: 이 배정이 다른 배정에 의해 부수적으로 생성되는 경우 부모 배정 id */
    caused_by_smi_id?: string | null;
  },
  existingId?: string | null
): Promise<ActionResult<{ id: string }>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  if (payload.temp_role && payload.temp_role !== "leader" && payload.temp_role !== "member") {
    return { ok: false, error: "유효하지 않은 임시 역할이에요" };
  }

  const supabase = createServiceClient();

  const normalized = {
    schedule_id: scheduleId,
    user_id: userId,
    temp_group_id: payload.temp_group_id || null,
    temp_role: payload.temp_role,
    excused_reason: payload.excused_reason?.trim() || null,
    activity: payload.activity?.trim() || null,
    menu: payload.menu?.trim() || null,
    note: payload.note?.trim() || null,
    caused_by_smi_id: payload.caused_by_smi_id ?? null,
    updated_by: admin.id,
  };

  const hasContent =
    normalized.temp_group_id ||
    normalized.temp_role ||
    normalized.excused_reason ||
    normalized.activity ||
    normalized.menu ||
    normalized.note;
  if (!hasContent) {
    return { ok: false, error: "최소 한 개 항목은 입력해주세요" };
  }

  if (existingId) {
    const { data, error } = await supabase
      .from("schedule_member_info")
      .update(normalized)
      .eq("id", existingId)
      .select("id")
      .single();
    if (error) return { ok: false, error: "인원별 배정 수정 중 오류가 발생했어요" };
    revalidateMainPaths();
    return { ok: true, data: { id: data.id } };
  }

  const { data, error } = await supabase
    .from("schedule_member_info")
    .upsert(normalized, { onConflict: "schedule_id,user_id" })
    .select("id")
    .single();
  if (error) return { ok: false, error: "인원별 배정 저장 중 오류가 발생했어요" };

  revalidateMainPaths();
  return { ok: true, data: { id: data.id } };
}

/** 단일 인원별 배정 삭제 */
export async function deleteScheduleMemberInfo(
  id: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("schedule_member_info")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: "인원별 배정 삭제 중 오류가 발생했어요" };

  revalidateMainPaths();
  return { ok: true };
}

// 조장 ↔ 조원 역할 변경 (admin 전용)
export async function updateUserRole(
  userId: string,
  newRole: "member" | "leader"
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  if (userId === admin.id) {
    return { ok: false, error: "자신의 역할은 변경할 수 없어요" };
  }
  if (newRole !== "member" && newRole !== "leader") {
    return { ok: false, error: "유효하지 않은 역할이에요" };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("users")
    .update({ role: newRole })
    .eq("id", userId);

  if (error) {
    return { ok: false, error: "역할 변경 중 오류가 발생했어요" };
  }

  revalidateMainPaths();
  return { ok: true };
}
