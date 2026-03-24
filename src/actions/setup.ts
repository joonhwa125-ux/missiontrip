"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { parseKSTTime } from "@/lib/utils";
import { canCheckin } from "@/lib/constants";
import type {
  ActionResult,
  SetupPreviewData,
  ParsedGroup,
  ParsedUser,
  ValidationError,
  ScheduleScope,
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

  // 1. Groups INSERT
  const { data: insertedGroups, error: groupError } = await supabase
    .from("groups")
    .upsert(
      data.groups.map((g) => ({ name: g.name, bus_name: g.bus_name })),
      { onConflict: "name" }
    )
    .select("id, name");

  if (groupError || !insertedGroups) {
    return { ok: false, error: `조 등록 실패: ${groupError?.message}` };
  }

  // 조이름 → UUID 매핑
  const groupMap = new Map(insertedGroups.map((g) => [g.name, g.id]));

  // 2. Users INSERT
  const usersPayload: {
    name: string;
    email: string;
    phone: string | null;
    role: string;
    group_id: string;
    party: string | null;
  }[] = [];
  for (const u of data.users) {
    const groupId = groupMap.get(u.group_name);
    if (!groupId) {
      return {
        ok: false,
        error: `조 "${u.group_name}"를 찾을 수 없어요. 데이터를 다시 확인해주세요`,
      };
    }
    usersPayload.push({
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      group_id: groupId,
      party: u.party,
    });
  }

  const { error: userError } = await supabase
    .from("users")
    .upsert(usersPayload, { onConflict: "email" });

  if (userError) {
    return { ok: false, error: `참가자 등록 실패: ${userError.message}` };
  }

  // 3. Schedules INSERT
  // "HH:MM" / "MM-DD HH:MM" / "YYYY-MM-DD HH:MM" → parseKSTTime으로 ISO 변환
  const TIME_PATTERN = /^\d{2}:\d{2}$|^\d{2}-\d{2}\s+\d{2}:\d{2}$|^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/;
  const schedulesPayload = data.schedules.map((s) => ({
    title: s.title,
    location: s.location,
    day_number: s.day_number,
    sort_order: s.sort_order,
    scope: s.scope,
    scheduled_time:
      s.scheduled_time && TIME_PATTERN.test(s.scheduled_time)
        ? parseKSTTime(s.scheduled_time)
        : s.scheduled_time || null,
  }));

  const { error: scheduleError } = await supabase
    .from("schedules")
    .upsert(schedulesPayload, { onConflict: "day_number,sort_order" });

  if (scheduleError) {
    return { ok: false, error: `일정 등록 실패: ${scheduleError.message}` };
  }

  revalidatePath("/admin");
  revalidatePath("/group");
  revalidatePath("/setup");
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
    "users",
    "schedules",
    "groups",
  ];

  for (const table of tables) {
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

  revalidatePath("/admin");
  revalidatePath("/group");
  revalidatePath("/setup");
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
  }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("schedules")
    .update(data)
    .eq("id", scheduleId);

  if (error) return { ok: false, error: "일정 수정 중 오류가 발생했어요" };

  revalidatePath("/admin");
  revalidatePath("/group");
  revalidatePath("/setup");
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

  revalidatePath("/admin");
  revalidatePath("/group");
  revalidatePath("/setup");
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
  }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();
  const { error } = await supabase.from("users").update(data).eq("id", userId);

  if (error) return { ok: false, error: "참가자 수정 중 오류가 발생했어요" };

  revalidatePath("/admin");
  revalidatePath("/group");
  revalidatePath("/setup");
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

  revalidatePath("/admin");
  revalidatePath("/group");
  revalidatePath("/setup");
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

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("users")
    .update({ role: newRole })
    .eq("id", userId);

  if (error) {
    return { ok: false, error: "역할 변경 중 오류가 발생했어요" };
  }

  revalidatePath("/admin");
  revalidatePath("/group");
  return { ok: true };
}
