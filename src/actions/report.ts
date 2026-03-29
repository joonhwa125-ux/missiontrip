"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canCheckin, isAdminRole } from "@/lib/constants";
import { revalidateMainPaths } from "./_shared";
import type { ActionResult } from "@/lib/types";

// 조장 보고 (UPSERT — 재보고 허용)
export async function submitReport(
  groupId: string,
  scheduleId: string,
  pendingCount: number
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !canCheckin(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  // 조장은 자신의 조만 보고 가능 (관리자는 전체 가능)
  if (!isAdminRole(actor.role) && actor.group_id !== groupId) {
    return { ok: false, error: "내 조의 보고만 할 수 있어요" };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("group_reports").upsert(
    {
      group_id: groupId,
      schedule_id: scheduleId,
      reported_by: actor.id,
      pending_count: pendingCount,
    },
    { onConflict: "group_id,schedule_id" }
  );

  if (error) {
    return { ok: false, error: "보고 처리 중 오류가 발생했어요" };
  }

  revalidateMainPaths();
  return { ok: true };
}

// 셔틀 버스 보고 (UPSERT — 재보고 허용)
export async function submitShuttleReport(
  shuttleBus: string,
  scheduleId: string,
  pendingCount: number
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !canCheckin(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  // 조장은 자신의 버스만 보고 가능 (관리자는 전체 가능)
  if (!isAdminRole(actor.role) && actor.shuttle_bus !== shuttleBus) {
    return { ok: false, error: "내 버스의 보고만 할 수 있어요" };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("shuttle_reports").upsert(
    {
      shuttle_bus: shuttleBus,
      schedule_id: scheduleId,
      reported_by: actor.id,
      pending_count: pendingCount,
    },
    { onConflict: "shuttle_bus,schedule_id" }
  );

  if (error) {
    return { ok: false, error: "보고 처리 중 오류가 발생했어요" };
  }

  revalidateMainPaths();
  return { ok: true };
}
