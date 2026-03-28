import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";

export default function SetupLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col min-h-screen bg-app-bg">
      {/* SetupPageTabs 헤더와 동일 구조 */}
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

      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-main-action" role="status">
          <span className="sr-only">로딩 중</span>
        </div>
      </div>
    </div>
  );
}
