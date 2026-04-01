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
} from "@/utils/sheets-parser";

// Google Sheets CSV export URL 생성
function buildCsvUrl(sheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// Google Sheets에서 2개 시트 데이터 가져와서 미리보기
export async function previewFromGoogleSheet(
  sheetId: string,
  gids: { users: string; schedules: string }
): Promise<ActionResult<SetupPreviewData>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  try {
    const fetchCsv = async (url: string) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    };
    const [usersCsv, schedulesCsv] = await Promise.all([
      fetchCsv(buildCsvUrl(sheetId, gids.users)),
      fetchCsv(buildCsvUrl(sheetId, gids.schedules)),
    ]);

    const usersRows = parseCsv(usersCsv);
    const schedulesRows = parseCsv(schedulesCsv);

    const { users, groups, errors: userErrors } = parseUsersSheet(usersRows);
    const { schedules, errors: scheduleErrors } =
      parseSchedulesSheet(schedulesRows);

    const leaderErrors = validateLeaderCount(groups, users);

    return {
      ok: true,
      data: {
        groups,
        users,
        schedules,
        errors: [...userErrors, ...scheduleErrors, ...leaderErrors],
      },
    };
  } catch {
    return {
      ok: false,
      error:
        "Google Sheets 데이터를 가져올 수 없어요. URL과 공유 설정을 확인해주세요",
    };
  }
}

// CSV 파일 업로드 미리보기
export async function previewFromCsv(
  usersCsv: string,
  schedulesCsv: string
): Promise<ActionResult<SetupPreviewData>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const usersRows = parseCsv(usersCsv);
  const schedulesRows = parseCsv(schedulesCsv);

  const { users, groups, errors: userErrors } = parseUsersSheet(usersRows);
  const { schedules, errors: scheduleErrors } =
    parseSchedulesSheet(schedulesRows);

  const leaderErrors = validateLeaderCount(groups, users);

  return {
    ok: true,
    data: {
      groups,
      users,
      schedules,
      errors: [...userErrors, ...scheduleErrors, ...leaderErrors],
    },
  };
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
): Promise<{ error?: string }> {
  const payload = schedules.map((s) => ({
    title: s.title,
    location: s.location,
    day_number: s.day_number,
    sort_order: s.sort_order,
    scope: s.scope,
    shuttle_type: s.shuttle_type,
    scheduled_time: s.scheduled_time ? parseKSTTime(s.scheduled_time) : null,
  }));

  const { error } = await supabase
    .from("schedules")
    .upsert(payload, { onConflict: "day_number,sort_order" });

  return error ? { error: `일정 등록 실패: ${error.message}` } : {};
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

  const supabase = createServiceClient();

  // 재업로드 시 고아 행 방지 — UPSERT 전에 기존 데이터 삭제 (FK 역순)
  // 관리자 본인 레코드 + 소속 조는 보존 (삭제 시 미들웨어 역할 검사 실패)
  const cleanupTables = [
    { table: "check_ins", filter: null },
    { table: "group_reports", filter: null },
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

  const { error: se } = await upsertSchedules(supabase, data.schedules);
  if (se) return { ok: false, error: se };

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
  }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();
  const { error } = await supabase.from("users").update(data).eq("id", userId);

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
