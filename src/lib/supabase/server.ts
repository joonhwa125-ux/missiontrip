import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`환경 변수 ${key}가 없어요. .env.local을 확인해주세요.`);
  return val;
}

type CookieToSet = { name: string; value: string; options: CookieOptions };

// 일반 서버 컴포넌트/Action용 (RLS 적용)
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
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
