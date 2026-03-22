"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type {
  ActionResult,
  SetupPreviewData,
  ParsedGroup,
  ParsedUser,
  ValidationError,
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
    });
  }

  const { error: userError } = await supabase
    .from("users")
    .upsert(usersPayload, { onConflict: "email" });

  if (userError) {
    return { ok: false, error: `참가자 등록 실패: ${userError.message}` };
  }

  // 3. Schedules INSERT
  // NEW-003: "HH:MM" (날짜 없음) → null (timestamptz 오류 방지)
  // 예정시각은 운영 당일 관리자 화면([일정] 탭)에서 설정 가능
  const HH_MM_ONLY = /^\d{2}:\d{2}$/;
  const schedulesPayload = data.schedules.map((s) => ({
    title: s.title,
    location: s.location,
    day_number: s.day_number,
    sort_order: s.sort_order,
    scheduled_time:
      s.scheduled_time && HH_MM_ONLY.test(s.scheduled_time)
        ? null
        : s.scheduled_time,
  }));

  const { error: scheduleError } = await supabase
    .from("schedules")
    .upsert(schedulesPayload, { onConflict: "day_number,sort_order" });

  if (scheduleError) {
    return { ok: false, error: `일정 등록 실패: ${scheduleError.message}` };
  }

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
    const { error } = await supabase
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      return { ok: false, error: `${table} 삭제 실패: ${error.message}` };
    }
  }

  return { ok: true };
}

// 조장 수 검증 — 각 조에 최소 1명의 조장
function validateLeaderCount(
  groups: ParsedGroup[],
  users: ParsedUser[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const group of groups) {
    const leaders = users.filter(
      (u) => u.group_name === group.name && u.role === "leader"
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

  return { ok: true };
}
