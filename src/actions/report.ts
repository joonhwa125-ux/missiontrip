"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canCheckin, isAdminRole } from "@/lib/constants";
import { revalidateMainPaths, requireActiveSchedule } from "./_shared";
import type { ActionResult } from "@/lib/types";

// 조장 보고 (UPSERT — 재보고 허용)
export async function submitReport(
  groupId: string,
  scheduleId: string,
  pendingCount: number
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "권한이 없어요" };

  const supabase = createServiceClient();

  // Phase B: 활성 일정에만 보고 허용 (오프라인 큐가 일정 종료 후 flush되는 시나리오 방어)
  const activeCheck = await requireActiveSchedule(supabase, scheduleId);
  if (!activeCheck.ok) return activeCheck;

  // v2: 영구 권한 OR 해당 일정의 임시 조장 권한
  // temp_leader는 actor.group_id가 원래 조이므로, smi.temp_group_id를 효용 조로 사용해야 한다.
  let actorEffectiveGroupId: string | null = actor.group_id;
  if (!canCheckin(actor.role)) {
    const { data: smi } = await supabase
      .from("schedule_member_info")
      .select("temp_group_id")
      .eq("user_id", actor.id)
      .eq("schedule_id", scheduleId)
      .eq("temp_role", "leader")
      .maybeSingle();
    if (!smi) return { ok: false, error: "권한이 없어요" };
    actorEffectiveGroupId = smi.temp_group_id ?? actor.group_id;
  }

  // 조장은 자신의 조(temp_leader는 실효 조)만 보고 가능. 관리자는 전체 가능
  if (!isAdminRole(actor.role) && actorEffectiveGroupId !== groupId) {
    return { ok: false, error: "내 조의 보고만 할 수 있어요" };
  }

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

  const supabase = createServiceClient();

  // Phase B: 활성 일정에만 보고 허용
  const activeCheck = await requireActiveSchedule(supabase, scheduleId);
  if (!activeCheck.ok) return activeCheck;

  // 조장은 자신의 버스만 보고 가능 (셔틀 타입에 맞는 필드만 검증, 관리자는 전체 가능)
  if (!isAdminRole(actor.role)) {
    const { data: sched } = await supabase
      .from("schedules").select("shuttle_type").eq("id", scheduleId).single();
    const ownerBus = sched?.shuttle_type === "return" ? actor.return_shuttle_bus : actor.shuttle_bus;
    if (ownerBus !== shuttleBus) {
      return { ok: false, error: "내 버스의 보고만 할 수 있어요" };
    }
  }
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
