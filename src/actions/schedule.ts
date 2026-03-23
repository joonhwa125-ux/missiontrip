"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult, ScheduleScope } from "@/lib/types";

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

  revalidatePath("/admin");
  revalidatePath("/group");
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

  revalidatePath("/admin");
  revalidatePath("/group");
  return { ok: true, data: data.id };
}

// 특정 일정의 체크인 + 보고 데이터 조회 (바텀시트용)
export async function fetchScheduleCheckIns(scheduleId: string): Promise<{
  checkIns: { user_id: string; is_absent: boolean; checked_at: string }[];
  reports: { group_id: string; pending_count: number; reported_at: string }[];
}> {
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
    checkIns: checkIns ?? [],
    reports: reports ?? [],
  };
}

// 진단용: 활성 일정의 DB 상태 직접 확인 (디버그 후 제거)
export async function debugCheckDbState(): Promise<{
  activeSchedule: { id: string; title: string; is_active: boolean; activated_at: string | null } | null;
  checkInCount: number;
  reportCount: number;
  sampleCheckIns: { user_id: string; schedule_id: string; checked_at: string }[];
  fetchTestCount: number;
  fetchTestError: string | null;
  selectStarCount: number;
  selectStarError: string | null;
}> {
  const supabase = createServiceClient();

  const { data: active } = await supabase
    .from("schedules")
    .select("id, title, is_active, activated_at")
    .eq("is_active", true)
    .maybeSingle();

  if (!active) {
    return { activeSchedule: null, checkInCount: 0, reportCount: 0, sampleCheckIns: [], fetchTestCount: 0, fetchTestError: null, selectStarCount: 0, selectStarError: null };
  }

  // 동일 쿼리 3종 비교: count(*), select(is_absent 포함), select(* 전체)
  const [{ count: ciCount }, { count: rpCount }, { data: samples },
    { data: fetchTest, error: fetchError },
    { data: starTest, error: starError },
  ] = await Promise.all([
    supabase
      .from("check_ins")
      .select("*", { count: "exact", head: true })
      .eq("schedule_id", active.id),
    supabase
      .from("group_reports")
      .select("*", { count: "exact", head: true })
      .eq("schedule_id", active.id),
    supabase
      .from("check_ins")
      .select("user_id, schedule_id, checked_at")
      .eq("schedule_id", active.id)
      .limit(5),
    // fetchScheduleCheckIns와 동일한 쿼리 (is_absent 포함)
    supabase
      .from("check_ins")
      .select("user_id, is_absent, checked_at")
      .eq("schedule_id", active.id),
    // select(*) 전체 컬럼
    supabase
      .from("check_ins")
      .select("*")
      .eq("schedule_id", active.id),
  ]);

  return {
    activeSchedule: active,
    checkInCount: ciCount ?? 0,
    reportCount: rpCount ?? 0,
    sampleCheckIns: samples ?? [],
    fetchTestCount: fetchTest?.length ?? 0,
    fetchTestError: fetchError?.message ?? null,
    selectStarCount: starTest?.length ?? 0,
    selectStarError: starError?.message ?? null,
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

  revalidatePath("/admin");
  revalidatePath("/group");
  return { ok: true };
}
