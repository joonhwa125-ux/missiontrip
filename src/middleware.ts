import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ALLOWED_EMAIL_DOMAIN, ROLE_ROUTES } from "@/lib/constants";
import { createServerClient } from "@supabase/ssr";
import type { UserRole } from "@/lib/types";

// 인증 불필요 경로
const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // public 경로 통과
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return await updateSession(request).then((r) => r.supabaseResponse);
  }

  const { supabaseResponse, user } = await updateSession(request);

  // 미인증 → 로그인
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 도메인 제한
  if (!user.email?.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    // 세션 종료 처리는 Server Action 또는 /auth/callback에서 수행
    return NextResponse.redirect(
      new URL("/login?error=unauthorized", request.url)
    );
  }

  // 역할 기반 라우팅 — DB에서 role 조회
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data: userData } = await supabase
    .from("users")
    .select("role")
    .eq("email", user.email)
    .single();

  // 미등록 사용자
  if (!userData) {
    return NextResponse.redirect(
      new URL("/login?error=not-registered", request.url)
    );
  }

  const role = userData.role as UserRole;
  const homeRoute = ROLE_ROUTES[role];

  // /setup 은 admin만 허용
  if (pathname.startsWith("/setup") && role !== "admin") {
    return NextResponse.redirect(new URL(homeRoute, request.url));
  }

  // 루트 접속 → 역할별 홈으로 리다이렉트
  if (pathname === "/") {
    return NextResponse.redirect(new URL(homeRoute, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
