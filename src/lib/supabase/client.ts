import { createBrowserClient } from "@supabase/ssr";

// NEXT_PUBLIC_* 환경변수는 Next.js가 빌드 시 정적 치환하므로
// 반드시 리터럴로 참조해야 함 (동적 접근 process.env[key] 불가)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
