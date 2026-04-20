import { revalidatePath } from "next/cache";
import type { createServiceClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// /admin + /group 캐시 무효화 헬퍼 (체크인·일정·보고 액션 공통)
export function revalidateMainPaths() {
  revalidatePath("/admin");
  revalidatePath("/group");
}

// /admin + /group + /setup 캐시 무효화 헬퍼 (setup 액션 공통)
export function revalidateAllPaths() {
  revalidateMainPaths();
  revalidatePath("/setup");
}

/**
 * Phase B: 일정이 현재 활성 상태인지 서버 측에서 검증하는 공용 헬퍼.
 *
 * 조장 뷰가 대기/완료 일정도 탐색 허용(읽기 전용)하도록 확장되었기 때문에
 * **쓰기 작업은 is_active=true인 일정에 대해서만 허용**한다.
 * createCheckin/deleteCheckin/markAbsent/submitReport/submitShuttleReport 공통으로 사용.
 *
 * ## 반환값
 * - `{ ok: true }`: 활성 일정. 진행 가능.
 * - `{ ok: false, error }`: 존재하지 않거나 비활성. 작업 거부.
 */
export async function requireActiveSchedule(
  supabase: ReturnType<typeof createServiceClient>,
  scheduleId: string
): Promise<ActionResult> {
  const { data, error } = await supabase
    .from("schedules")
    .select("is_active")
    .eq("id", scheduleId)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "일정을 찾을 수 없어요" };
  }
  if (!data.is_active) {
    return { ok: false, error: "진행 중인 일정이 아니에요. 수정이 필요하면 관리자에게 문의해주세요." };
  }
  return { ok: true };
}
