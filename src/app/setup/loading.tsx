import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";

function Bone({ className }: { className: string }) {
  return <div className={`rounded bg-gray-200 ${className}`} />;
}

export default function SetupLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col min-h-screen bg-app-bg">
      {/* 헤더 — 실제 SetupPageTabs 헤더와 동일 */}
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-2 py-1">
        <div className="flex items-center gap-1">
          <Link
            href="/admin"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-gray-900"
            aria-label="관리자 화면으로 돌아가기"
          >
            <ChevronLeftIcon aria-hidden />
          </Link>
          <h1 className="text-lg font-bold">데이터 관리</h1>
        </div>
      </header>

      <div role="status" aria-live="polite" className="sr-only">불러오는 중</div>

      {/* 탭 바 스켈레톤 */}
      <div className="flex items-center border-b border-gray-200 bg-white px-4 animate-pulse" aria-hidden="true">
        <div className="flex flex-1 gap-1">
          <div className="min-h-11 flex items-center border-b-2 border-gray-300 px-4">
            <Bone className="h-4 w-16" />
          </div>
          <div className="min-h-11 flex items-center px-4">
            <Bone className="h-4 w-20 !bg-gray-100" />
          </div>
        </div>
      </div>

      {/* 테이블 스켈레톤 */}
      <div className="flex-1 px-4 py-4 animate-pulse" aria-hidden="true">
        {/* 섹션 헤더 */}
        <div className="mb-3 flex items-center justify-between">
          <Bone className="h-5 w-24" />
          <Bone className="h-8 w-20 rounded-lg !bg-gray-100" />
        </div>
        {/* 테이블 헤더 */}
        <div className="mb-2 flex gap-3 border-b border-gray-100 pb-2">
          <Bone className="h-3 w-16 !bg-gray-100" />
          <Bone className="h-3 w-20 !bg-gray-100" />
          <Bone className="h-3 w-12 !bg-gray-100" />
          <Bone className="h-3 w-14 !bg-gray-100" />
        </div>
        {/* 테이블 행 6줄 */}
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-gray-50 py-3">
            <Bone className="h-4 w-14" />
            <Bone className={`h-4 ${i % 2 === 0 ? "w-24" : "w-20"} !bg-gray-100`} />
            <Bone className="h-4 w-10 !bg-gray-100" />
            <Bone className="h-4 w-12 !bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
