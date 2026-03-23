"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

// 조장 보고 (UPSERT — 재보고 허용)
export async function submitReport(
  groupId: string,
  scheduleId: string,
  pendingCount: number
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!actor || !["leader", "admin"].includes(actor.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  // 조장은 자신의 조만 보고 가능 (다른 조 보고 위조 방지)
  if (actor.role === "leader" && actor.group_id !== groupId) {
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

  revalidatePath("/admin");
  revalidatePath("/group");
  return { ok: true };
}
