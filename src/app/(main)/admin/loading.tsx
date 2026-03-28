import Image from "next/image";
import PageHeader from "@/components/common/PageHeader";

export default function AdminLoading() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="혼디모영"
        superTitle="2026 링키지랩 미션트립"
        titleNode={
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              <Image src="/감귤.png" alt="" width={36} height={36} className="inline-block" aria-hidden="true" priority />
              혼디모영
            </span>
            <span className="flex-shrink-0 rounded-full bg-gray-900 px-2 py-0.5 font-semibold text-white text-[clamp(0.6875rem,2.5vw,0.875rem)]">
              관리자
            </span>
          </span>
        }
      />
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-main-action" role="status">
          <span className="sr-only">로딩 중</span>
        </div>
      </div>
    </div>
  );
}
