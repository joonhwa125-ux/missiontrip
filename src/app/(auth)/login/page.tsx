import Image from "next/image";
import { Suspense } from "react";
import LoginActions from "@/components/auth/LoginActions";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        {/* 서비스 로고 + 명칭 — Server Component에서 렌더 → SSR preload 보장 */}
        <div className="flex flex-col items-center text-center">
          <Image src="/login_final.png" alt="미션트립" width={120} height={120} priority className="-mb-3" />
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">동행체크</h1>
            <p className="text-sm text-muted-foreground">
              링키지랩 10주년 미션트립
            </p>
          </div>
        </div>

        {/* Client Island — useSearchParams + 로그인 버튼 */}
        <Suspense
          fallback={
            <>
              <div className="h-11 w-full animate-pulse rounded-xl bg-gray-100" aria-hidden="true" />
              <div role="status" aria-live="polite" className="sr-only">불러오는 중</div>
            </>
          }
        >
          <LoginActions />
        </Suspense>
      </div>
    </main>
  );
}
