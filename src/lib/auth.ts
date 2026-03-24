import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/constants";

/** 현재 로그인 사용자의 DB 정보 조회 */
export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data } = await supabase
    .from("users")
    .select("id, role, group_id")
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
