"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// 조장 보고 (UPSERT — 재보고 허용)
export async function submitReport(
  groupId: string,
  scheduleId: string,
  pendingCount: number
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요" };

  const { data: userData } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", user.email!)
    .single();

  if (!userData || !["leader", "admin"].includes(userData.role)) {
    return { ok: false, error: "권한이 없어요" };
  }

  const { error } = await supabase.from("group_reports").upsert(
    {
      group_id: groupId,
      schedule_id: scheduleId,
      reported_by: userData.id,
      pending_count: pendingCount,
    },
    { onConflict: "group_id,schedule_id" }
  );

  if (error) {
    return { ok: false, error: "보고 처리 중 오류가 발생했어요" };
  }

  return { ok: true };
}
