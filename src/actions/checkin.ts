"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canCheckin, isAdminRole } from "@/lib/constants";
import { revalidateMainPaths } from "./_shared";
import type { ActionResult, OfflinePendingCheckin, CheckedBy, ShuttleType } from "@/lib/types";

/** 조장의 자기 조원/버스 접근 권한 검증. 실패 시 ActionResult 반환, 통과 시 null */
async function validateGroupAccess(
  supabase: ReturnType<typeof createServiceClient>,
  actor: { role: string; group_id: string; shuttle_bus?: string | null; return_shuttle_bus?: string | null },
  targetUserId: string,
  shuttleType: ShuttleType | null = null
): Promise<ActionResult | null> {
  if (isAdminRole(actor.role)) return null;

  if (shuttleType === "departure") {
    if (!actor.shuttle_bus) {
      return { ok: false, error: "셔틀 담당 조장만 처리할 수 있어요" };
    }
    const { data } = await supabase
      .from("users")
      .select("shuttle_bus")
      .eq("id", targetUserId)
      .single();
    if (data?.shuttle_bus !== actor.shuttle_bus) {
      return { ok: false, error: "내 버스 탑승자만 처리할 수 있어요" };
    }
    return null;
  }

  if (shuttleType === "return") {
    if (!actor.return_shuttle_bus) {
      return { ok: false, error: "귀가 셔틀 담당 조장만 처리할 수 있어요" };
    }
    const { data } = await supabase
      .from("users")
      .select("return_shuttle_bus")
      .eq("id", targetUserId)
      .single();
    if (data?.return_shuttle_bus !== actor.return_shuttle_bus) {
      return { ok: false, error: "내 버스 탑승자만 처리할 수 있어요" };
    }
    return null;
  }

  const { data } = await supabase
    .from("users")
    .select("group_id")
    .eq("id", targetUserId)
    .single();
  if (!data || data.group_id !== actor.group_id) {
    return { ok: false, error: "자기 조원만 처리할 수 있어요" };
  }
  return null;
}

// 체크인 INSERT (조장/관리자 대리 체크인)
export async function createCheckin(
  userId: string,
  scheduleId: string,
  shuttleType: ShuttleType | null = null
): Promise<ActionResult> {
  const actor = await getCurrentUser();

  if (!actor || !canCheckin(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  const supabase = createServiceClient();
  const denied = await validateGroupAccess(supabase, actor, userId, shuttleType);
  if (denied) return denied;

  const checkedBy = isAdminRole(actor.role) ? "admin" : "leader";
  const { error } = await supabase.from("check_ins").upsert(
    {
      user_id: userId,
      schedule_id: scheduleId,
      checked_by: checkedBy,
      checked_by_user_id: actor.id,
    },
    { onConflict: "user_id,schedule_id", ignoreDuplicates: true }
  );

  if (error) {
    return { ok: false, error: "체크인 처리 중 오류가 발생했어요" };
  }

  revalidateMainPaths();
  return { ok: true };
}

// 체크인 취소 DELETE
export async function deleteCheckin(
  userId: string,
  scheduleId: string,
  shuttleType: ShuttleType | null = null
): Promise<ActionResult> {
  const actor = await getCurrentUser();

  if (!actor || !canCheckin(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  const supabase = createServiceClient();
  const denied = await validateGroupAccess(supabase, actor, userId, shuttleType);
  if (denied) return denied;

  const { error } = await supabase
    .from("check_ins")
    .delete()
    .eq("user_id", userId)
    .eq("schedule_id", scheduleId);

  if (error) {
    return { ok: false, error: "취소 처리 중 오류가 발생했어요" };
  }

  // 체크인 취소 → 보고 기록도 무효화 (stale reported 상태 방지)
  if (shuttleType) {
    // 셔틀 일정: shuttle_reports 무효화
    let targetShuttleBus: string | null;
    if (isAdminRole(actor.role)) {
      if (shuttleType === "departure") {
        const { data } = await supabase.from("users").select("shuttle_bus").eq("id", userId).single();
        targetShuttleBus = data?.shuttle_bus ?? null;
      } else {
        const { data } = await supabase.from("users").select("return_shuttle_bus").eq("id", userId).single();
        targetShuttleBus = data?.return_shuttle_bus ?? null;
      }
    } else {
      targetShuttleBus = shuttleType === "departure" ? (actor.shuttle_bus ?? null) : (actor.return_shuttle_bus ?? null);
    }
    if (targetShuttleBus) {
      await supabase
        .from("shuttle_reports")
        .delete()
        .eq("shuttle_bus", targetShuttleBus)
        .eq("schedule_id", scheduleId);
    }
  } else {
    // 일반 일정: group_reports 무효화
    let targetGroupId: string | null;
    if (isAdminRole(actor.role)) {
      const { data, error: lookupError } = await supabase
        .from("users").select("group_id").eq("id", userId).single();
      targetGroupId = lookupError || !data ? null : data.group_id;
    } else {
      targetGroupId = actor.group_id;
    }
    if (targetGroupId) {
      await supabase
        .from("group_reports")
        .delete()
        .eq("group_id", targetGroupId)
        .eq("schedule_id", scheduleId);
    }
  }

  revalidateMainPaths();
  return { ok: true };
}

// 불참 처리 INSERT (is_absent=true)
export async function markAbsent(
  userId: string,
  scheduleId: string,
  shuttleType: ShuttleType | null = null
): Promise<ActionResult> {
  const actor = await getCurrentUser();

  if (!actor || !canCheckin(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  const supabase = createServiceClient();
  const denied = await validateGroupAccess(supabase, actor, userId, shuttleType);
  if (denied) return denied;

  const checkedBy = isAdminRole(actor.role) ? "admin" : "leader";
  const { error } = await supabase.from("check_ins").upsert(
    {
      user_id: userId,
      schedule_id: scheduleId,
      checked_by: checkedBy,
      checked_by_user_id: actor.id,
      is_absent: true,
    },
    { onConflict: "user_id,schedule_id" }
  );

  if (error) {
    return { ok: false, error: "불참 처리 중 오류가 발생했어요" };
  }

  revalidateMainPaths();
  return { ok: true };
}

// 오프라인 체크인 일괄 동기화
export async function syncOfflineCheckins(
  checkins: OfflinePendingCheckin[]
): Promise<ActionResult<number>> {
  const actor = await getCurrentUser();

  if (!actor || !canCheckin(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  if (!Array.isArray(checkins) || checkins.length === 0) {
    return { ok: false, error: "동기화할 데이터가 없어요" };
  }
  if (checkins.length > 500) {
    return { ok: false, error: "한 번에 동기화할 수 있는 최대 건수를 초과했어요" };
  }
  const VALID_CHECKED_BY: CheckedBy[] = ["leader", "admin"];
  for (const item of checkins) {
    if (!VALID_CHECKED_BY.includes(item.checked_by)) {
      return { ok: false, error: "유효하지 않은 체크인 데이터예요" };
    }
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("sync_offline_checkins", {
    checkins,
  });

  if (error) {
    return { ok: false, error: "동기화 중 오류가 발생했어요" };
  }

  revalidateMainPaths();
  return { ok: true, data: data as number };
}
