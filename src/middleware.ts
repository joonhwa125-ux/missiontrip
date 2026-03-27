import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ALLOWED_EMAIL_DOMAIN, ROLE_ROUTES, isAdminRole } from "@/lib/constants";
import type { UserRole } from "@/lib/types";

// 인증 불필요 경로
const PUBLIC_PATHS = ["/login", "/auth/callback", "/design-mockup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // public 경로 통과
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return await updateSession(request).then((r) => r.supabaseResponse);
  }

  const { supabaseResponse, user, supabase } = await updateSession(request);

  // 미인증 → 로그인
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 도메인 제한 — signOut 후 세션 삭제 쿠키를 리다이렉트에 전달
  if (!user.email?.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    await supabase.auth.signOut();
    const redirect = NextResponse.redirect(
      new URL("/login?error=unauthorized", request.url)
    );
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirect.cookies.set(c.name, c.value);
    });
    return redirect;
  }

  // DB 조회가 필요한 경로만 role 확인
  // - 루트("/") → 역할별 홈으로 리다이렉트
  // - /setup → admin만 접근 허용
  // 그 외(/group, /admin, /checkin)는 서버 컴포넌트에서 role 검증 처리 (DB N+1 방지)
  const needsRoleCheck = pathname === "/" || pathname.startsWith("/setup");

  if (needsRoleCheck) {
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("email", user.email ?? "")
      .maybeSingle();

    // 미등록 사용자
    if (!userData) {
      return NextResponse.redirect(
        new URL("/login?error=not-registered", request.url)
      );
    }

    const role = userData.role as UserRole;
    const homeRoute = ROLE_ROUTES[role];

    // /setup 은 admin/admin_leader만 허용
    if (pathname.startsWith("/setup") && !isAdminRole(role)) {
      return NextResponse.redirect(new URL(homeRoute, request.url));
    }

    // 루트 접속 → 역할별 홈으로 리다이렉트
    if (pathname === "/") {
      return NextResponse.redirect(new URL(homeRoute, request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
