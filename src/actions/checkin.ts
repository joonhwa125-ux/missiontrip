"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult, OfflinePendingCheckin } from "@/lib/types";

// 현재 로그인 사용자 확인 헬퍼
async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("id, role, group_id")
    .eq("email", user.email!)
    .single();

  return data;
}

// 체크인 INSERT (조장/관리자 대리 체크인)
export async function createCheckin(
  userId: string,
  scheduleId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const actor = await getCurrentUser();

  if (!actor || !["leader", "admin"].includes(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  const { error } = await supabase.from("check_ins").insert({
    user_id: userId,
    schedule_id: scheduleId,
    checked_by: actor.role as "leader" | "admin",
    checked_by_user_id: actor.id,
  });

  if (error && error.code !== "23505") {
    // 23505 = unique violation → 이미 체크인, 무시
    return { ok: false, error: "체크인 처리 중 오류가 발생했어요" };
  }

  return { ok: true };
}

// 체크인 취소 DELETE
export async function deleteCheckin(
  userId: string,
  scheduleId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const actor = await getCurrentUser();

  if (!actor || !["leader", "admin"].includes(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  const { error } = await supabase
    .from("check_ins")
    .delete()
    .eq("user_id", userId)
    .eq("schedule_id", scheduleId);

  if (error) {
    return { ok: false, error: "취소 처리 중 오류가 발생했어요" };
  }

  return { ok: true };
}

// 오프라인 체크인 일괄 동기화
export async function syncOfflineCheckins(
  checkins: OfflinePendingCheckin[]
): Promise<ActionResult<number>> {
  const supabase = createClient();
  const actor = await getCurrentUser();

  if (!actor || actor.role !== "leader") {
    return { ok: false, error: "권한이 없어요" };
  }

  const { data, error } = await supabase.rpc("sync_offline_checkins", {
    checkins: JSON.stringify(checkins),
  });

  if (error) {
    return { ok: false, error: "동기화 중 오류가 발생했어요" };
  }

  return { ok: true, data: data as number };
}
