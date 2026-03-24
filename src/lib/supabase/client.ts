import { createBrowserClient } from "@supabase/ssr";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`환경 변수 ${key}가 없어요. .env.local을 확인해주세요.`);
  return val;
}

export function createClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}
