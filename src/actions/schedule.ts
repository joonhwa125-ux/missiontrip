"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin, getCurrentUser } from "@/lib/auth";
import { MIN_DAY_NUMBER, MAX_DAY_NUMBER, isAdminRole, isLeaderRole } from "@/lib/constants";
import { revalidateMainPaths } from "./_shared";
import type { ActionResult, ScheduleScope } from "@/lib/types";

const VALID_SCOPES: ScheduleScope[] = ["all", "advance", "rear"];

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

/**
 * 자동 활성화 — 조장·관리자 공용.
 *
 * ## 안전 모델
 * - 권한: leader / admin / admin_leader (임시 조장 포함 여부는 영구 role만 허용)
 * - 서버 시각 검증: RPC `auto_activate_due_schedule` 내부에서 `scheduled_time <= now()`
 *   원자 체크 → 클라이언트 시각 조작 차단
 * - 다수 클라이언트 동시 호출 안전: `idx_one_active_schedule` + RPC 트랜잭션
 *
 * ## 반환값
 * - `ok=true, activated=true`: 실제 이 호출이 활성화를 수행함 (broadcast 필요)
 * - `ok=true, activated=false`: 이미 다른 클라이언트가 처리했거나 조건 미충족 (no-op)
 * - `ok=false`: 권한 없음 · RPC 오류
 */
export async function autoActivateSchedule(
  scheduleId: string
): Promise<{ ok: boolean; activated?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "인증이 필요해요" };

  const canActivate = isAdminRole(user.role) || isLeaderRole(user.role);
  if (!canActivate) return { ok: false, error: "권한이 없어요" };

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("auto_activate_due_schedule", {
    target_id: scheduleId,
  });

  if (error) {
    return { ok: false, error: "자동 활성화 중 오류가 발생했어요" };
  }

  const activated = data === true;
  if (activated) revalidateMainPaths();
  return { ok: true, activated };
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
