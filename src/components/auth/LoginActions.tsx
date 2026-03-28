"use client";

import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 오류 메시지 맵 (PRD 4.1)
const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "회사 계정(@linkagelab.co.kr)으로만 로그인할 수 있어요",
  "not-registered": "등록되지 않은 계정이에요. 담당자에게 문의해주세요",
  "auth-failed": "로그인 중 오류가 발생했어요. 다시 시도해주세요",
};

export default function LoginActions() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] : null;

  async function handleGoogleLogin() {
    try {
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            hd: "linkagelab.co.kr", // G Suite 도메인 힌트
          },
        },
      });
    } catch {
      // signInWithOAuth는 redirect를 트리거 — 에러는 네트워크 문제 등 예외 상황
      window.location.href = "/login?error=auth-failed";
    }
  }

  return (
    <>
      {/* 오류 메시지 */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="polite"
          className="w-full rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      )}

      {/* Google 로그인 버튼 (구글 가이드라인 준수) */}
      <button
        onClick={handleGoogleLogin}
        className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2"
        aria-label="Google 계정으로 로그인"
      >
        {/* Google G 로고 SVG */}
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Google로 계속하기
      </button>
    </>
  );
}
