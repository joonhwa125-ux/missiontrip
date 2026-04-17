import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/constants";

/** 현재 로그인 사용자의 DB 정보 조회 */
export async function getCurrentUser() {
  // 인증 확인은 쿠키 기반 클라이언트
  const authClient = createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user?.email) return null;

  // 데이터 조회는 service client (page 컴포넌트와 동일 패턴)
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, role, group_id, shuttle_bus, return_shuttle_bus")
    .eq("email", user.email)
    .single();

  return data;
}

/** 관리자 전용 — admin 또는 admin_leader 확인 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  return isAdminRole(user.role) ? user : null;
}

/**
 * v2: 사용자가 임시 조장 배정을 하나라도 가지는지 확인 (시간 무관)
 *
 * ## 사용 시점
 * - `/group` 페이지 접근 제어 (page.tsx 에서만 호출)
 * - 기존 middleware.ts는 건드리지 않음 (code-analyzer 권고: DB N+1 방지)
 *
 * ## 권한 정책 (coarse-grained gate)
 * 이 함수는 **페이지 접근**만 제어한다. 실제 체크인 권한은 Server Action 내부의
 * `canActorCheckin` + `validateGroupAccess`가 per-schedule 단위로 재검증한다
 * (schedule_id + temp_group_id + RLS 정책의 is_active 조건 조합).
 *
 * ## 정책 근거 (1회성 3일 서비스 기준)
 * - 임시 조장으로 지정된 member는 트립 전체 기간 `/group`에 접근 가능
 * - 이 페이지는 모든 조의 현황/조원 목록을 읽기 전용으로 노출하는데,
 *   1회성 서비스 + 내부 회사 계정 한정이므로 "leader와 동일한 읽기 범위" 허용
 * - 쓰기(체크인/취소/불참)는 temp_group_id 기준 per-schedule로 엄격히 제한됨
 *
 * ## Returns
 * - true: 임시 조장 배정이 하나라도 있음 (과거/현재/미래 무관)
 * - false: 없음 또는 조회 실패 (fail-safe)
 */
export async function hasActiveOrPastTempLeaderRole(userId: string): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("schedule_member_info")
      .select("id")
      .eq("user_id", userId)
      .eq("temp_role", "leader")
      .limit(1)
      .maybeSingle();

    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}
