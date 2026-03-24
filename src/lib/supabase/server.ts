import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// NEXT_PUBLIC_* 환경변수는 리터럴 접근만 사용 (middleware.ts와 동일)
// 동적 접근 process.env[key]는 클라이언트 번들에서 undefined 반환 (TSG-003)
// SUPABASE_SERVICE_ROLE_KEY는 서버 전용이므로 동적 접근 가능
function requireServerEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`서버 환경 변수 ${key}가 없어요. .env.local을 확인해주세요.`);
  return val;
}

type CookieToSet = { name: string; value: string; options: CookieOptions };

// 일반 서버 컴포넌트/Action용 (RLS 적용)
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서는 쿠키 쓰기 불가 — 무시
          }
        },
      },
    }
  );
}

// Service Role 클라이언트 — RLS 우회, Server Action/API Route 전용
// @supabase/supabase-js 직접 사용: 쿠키 JWT 없이 service role key만으로 인증
// Next.js 14 Data Cache 우회: fetch에 cache:'no-store' 강제 적용
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
