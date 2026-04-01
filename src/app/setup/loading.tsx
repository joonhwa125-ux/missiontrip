import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";

function Bone({ className }: { className: string }) {
  return <div className={`rounded bg-gray-200 ${className}`} />;
}

function TableRowSkeleton({ cols }: { cols: number }) {
  const widths = ["w-8", "w-12", "w-16", "w-20", "w-10", "w-10", "w-10", "w-16", "w-14"];
  return (
    <tr className="border-t border-gray-100">
      {Array.from({ length: cols }, (_, i) => (
        <td key={i} className="px-2 py-2.5 text-center">
          <Bone className={`mx-auto h-3.5 ${widths[i % widths.length]} !bg-gray-100`} />
        </td>
      ))}
    </tr>
  );
}

export default function SetupLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col min-h-screen bg-app-bg">

      {/* 헤더 — SetupPageTabs와 동일 구조 */}
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
        {/* 새로고침 버튼 자리 */}
        <div className="flex min-h-11 min-w-11 flex-col items-center justify-center px-2 py-1" aria-hidden="true">
          <Bone className="h-4 w-4 rounded" />
          <Bone className="mt-1 h-2.5 w-10 !bg-gray-100" />
        </div>
      </header>

      <div role="status" aria-live="polite" className="sr-only">불러오는 중</div>

      {/* 탭 바 — SetupPageTabs 탭 바와 동일 구조 */}
      <div className="flex items-center border-b border-gray-200 bg-white px-4" aria-hidden="true">
        <div className="flex flex-1 gap-1">
          {/* 현재 데이터 탭 (선택됨) */}
          <div className="min-h-11 flex items-center border-b-2 border-gray-900 px-4">
            <Bone className="h-4 w-20" />
          </div>
          {/* 데이터 업로드 탭 */}
          <div className="min-h-11 flex items-center px-4">
            <Bone className="h-4 w-24 !bg-gray-100" />
          </div>
        </div>
      </div>

      {/* 콘텐츠 영역 — CurrentDataView와 동일 구조 */}
      <div className="px-4 py-4 animate-pulse" aria-hidden="true">

        {/* 서브 탭 — segment control */}
        <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
          <div className="min-h-11 flex flex-1 items-center justify-center rounded-lg bg-white shadow-sm">
            <Bone className="h-4 w-16" />
          </div>
          <div className="min-h-11 flex flex-1 items-center justify-center">
            <Bone className="h-4 w-20 !bg-gray-200" />
          </div>
        </div>

        {/* 테이블 — 일정 테이블 (8컬럼) */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-[600px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-center">
                {["w-10", "w-10", "w-16", "w-20", "w-12", "w-10", "w-10", "w-20"].map((w, i) => (
                  <th key={i} className="px-2 py-2">
                    <Bone className={`mx-auto h-3 ${w} !bg-gray-200`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <TableRowSkeleton key={i} cols={8} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
