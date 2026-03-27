"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canCheckin, isAdminRole } from "@/lib/constants";
import type { ActionResult, OfflinePendingCheckin } from "@/lib/types";

// /admin + /group 캐시 무효화 헬퍼 (체크인 관련 액션 공통)
function revalidateMainPaths() {
  revalidatePath("/admin");
  revalidatePath("/group");
}

/** 조장의 자기 조원 접근 권한 검증. 실패 시 ActionResult 반환, 통과 시 null */
async function validateGroupAccess(
  actor: { role: string; group_id: string },
  targetUserId: string
): Promise<ActionResult | null> {
  if (isAdminRole(actor.role)) return null;
  const supabase = createServiceClient();
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
  scheduleId: string
): Promise<ActionResult> {
  const actor = await getCurrentUser();

  if (!actor || !canCheckin(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  const denied = await validateGroupAccess(actor, userId);
  if (denied) return denied;

  const checkedBy = isAdminRole(actor.role) ? "admin" : "leader";
  const supabase = createServiceClient();
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
  scheduleId: string
): Promise<ActionResult> {
  const actor = await getCurrentUser();

  if (!actor || !canCheckin(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  const denied = await validateGroupAccess(actor, userId);
  if (denied) return denied;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("check_ins")
    .delete()
    .eq("user_id", userId)
    .eq("schedule_id", scheduleId);

  if (error) {
    return { ok: false, error: "취소 처리 중 오류가 발생했어요" };
  }

  // 체크인 취소 → 해당 조의 보고 기록도 무효화 (stale reported 상태 방지)
  const targetGroupId = isAdminRole(actor.role)
    ? (await supabase.from("users").select("group_id").eq("id", userId).single()).data?.group_id
    : actor.group_id;

  if (targetGroupId) {
    await supabase
      .from("group_reports")
      .delete()
      .eq("group_id", targetGroupId)
      .eq("schedule_id", scheduleId);
  }

  revalidateMainPaths();
  return { ok: true };
}

// 불참 처리 INSERT (is_absent=true)
export async function markAbsent(
  userId: string,
  scheduleId: string
): Promise<ActionResult> {
  const actor = await getCurrentUser();

  if (!actor || !canCheckin(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  const denied = await validateGroupAccess(actor, userId);
  if (denied) return denied;

  const checkedBy = isAdminRole(actor.role) ? "admin" : "leader";
  const supabase = createServiceClient();
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
