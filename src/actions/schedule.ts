"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { MIN_DAY_NUMBER, MAX_DAY_NUMBER } from "@/lib/constants";
import type { ActionResult, ScheduleScope } from "@/lib/types";

const VALID_SCOPES: ScheduleScope[] = ["all", "advance", "rear"];

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
    .update({ is_active: false })
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

  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { ok: false, error: "일정명을 입력해주세요" };
  if (!Number.isInteger(dayNumber) || dayNumber < MIN_DAY_NUMBER || dayNumber > MAX_DAY_NUMBER)
    return { ok: false, error: `일차는 ${MIN_DAY_NUMBER}~${MAX_DAY_NUMBER}만 가능해요` };
  if (!VALID_SCOPES.includes(scope)) return { ok: false, error: "유효하지 않은 대상이에요" };

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
      title: trimmedTitle,
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
