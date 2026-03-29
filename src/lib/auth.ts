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
    .select("id, role, group_id, shuttle_bus, return_shuttle_bus")
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
