import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/constants";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no-code`);
  }

  // 리다이렉트 응답을 미리 생성하고 쿠키를 직접 설정
  const redirectUrl = `${origin}${next}`;
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers
            .get("cookie")
            ?.split(";")
            .map((c) => {
              const [name, ...rest] = c.trim().split("=");
              return { name, value: rest.join("=") };
            })
            .filter((c) => c.name) ?? [];
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    await supabase.auth.signOut();
    response.headers.set("location", `${origin}/login?error=auth-failed`);
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 도메인 제한
  if (!user?.email?.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    // signOut()이 기존 response.cookies에 세션 삭제 쿠키를 설정함
    // 새 NextResponse를 반환하면 해당 쿠키가 전달되지 않아 세션이 남음
    // → 기존 response의 Location 헤더만 변경하여 세션 삭제 쿠키를 함께 전달
    await supabase.auth.signOut();
    response.headers.set("location", `${origin}/login?error=unauthorized`);
    return response;
  }

  return response;
}
