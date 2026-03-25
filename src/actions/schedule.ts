"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin, getCurrentUser } from "@/lib/auth";
import { canCheckin } from "@/lib/constants";
import type { ActionResult, ScheduleScope } from "@/lib/types";

// /admin + /group 캐시 무효화 헬퍼
function revalidateMainPaths() {
  revalidatePath("/admin");
  revalidatePath("/group");
}

// 일정 활성화 (RPC — 트랜잭션으로 동시 활성화 방지)
export async function activateSchedule(
  scheduleId: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("activate_schedule", {
    target_id: scheduleId,
  });

  if (error) {
    return { ok: false, error: "일정 활성화 중 오류가 발생했어요" };
  }

  revalidateMainPaths();
  return { ok: true };
}

// 일정 종료 (단일 UPDATE — activate와 달리 two-step 트랜잭션 불필요)
export async function deactivateSchedule(
  scheduleId: string
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("schedules")
    .update({ is_active: false, activated_at: new Date().toISOString() })
    .eq("id", scheduleId)
    .eq("is_active", true)
    .select("id");

  if (error) {
    return { ok: false, error: "일정 종료 중 오류가 발생했어요" };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "이미 종료된 일정이에요" };
  }

  revalidateMainPaths();
  return { ok: true };
}

// 즉흥 일정 추가
export async function createSchedule(
  title: string,
  location: string | null,
  dayNumber: number,
  scheduledTime: string | null,
  scope: ScheduleScope = "all"
): Promise<ActionResult<string>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();

  // 같은 day 내 최대 sort_order 조회 (해당 day에 일정이 없을 수 있으므로 maybeSingle)
  const { data: existing } = await supabase
    .from("schedules")
    .select("sort_order")
    .eq("day_number", dayNumber)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = existing ? existing.sort_order + 1 : 1;

  const { data, error } = await supabase
    .from("schedules")
    .insert({
      title,
      location,
      day_number: dayNumber,
      sort_order: nextOrder,
      scheduled_time: scheduledTime,
      scope,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: "일정 추가 중 오류가 발생했어요" };
  }

  revalidateMainPaths();
  return { ok: true, data: data.id };
}

// 특정 일정의 체크인 + 보고 데이터 조회 (바텀시트용)
export async function fetchScheduleCheckIns(scheduleId: string): Promise<{
  checkIns: { user_id: string; is_absent: boolean; checked_at: string }[];
  reports: { group_id: string; pending_count: number; reported_at: string }[];
}> {
  const actor = await getCurrentUser();
  if (!actor || !canCheckin(actor.role))
    return { checkIns: [], reports: [] };
  const supabase = createServiceClient();
  const [{ data: checkIns }, { data: reports }] = await Promise.all([
    supabase
      .from("check_ins")
      .select("user_id, is_absent, checked_at")
      .eq("schedule_id", scheduleId),
    supabase
      .from("group_reports")
      .select("group_id, pending_count, reported_at")
      .eq("schedule_id", scheduleId),
  ]);
  return {
    checkIns: (checkIns ?? []).map((ci) => ({
      user_id: ci.user_id,
      is_absent: ci.is_absent,
      checked_at: ci.checked_at,
    })),
    reports: reports ?? [],
  };
}

// 예정 시각 변경
export async function updateScheduleTime(
  scheduleId: string,
  scheduledTime: string | null
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "관리자 권한이 필요해요" };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("schedules")
    .update({ scheduled_time: scheduledTime })
    .eq("id", scheduleId);

  if (error) {
    return { ok: false, error: "시간 변경 중 오류가 발생했어요" };
  }

  revalidateMainPaths();
  return { ok: true };
}
