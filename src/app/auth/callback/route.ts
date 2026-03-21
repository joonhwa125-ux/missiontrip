import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/constants";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no-code`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth-failed`);
  }

  // 세션 교환 성공 후 사용자 조회
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 도메인 제한
  if (!user?.email?.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=unauthorized`);
  }

  // 미들웨어에서 역할 라우팅 처리 — 루트로 보내면 미들웨어가 분기함
  return NextResponse.redirect(`${origin}${next}`);
}
