import Image from "next/image";
import PageHeader from "@/components/common/PageHeader";

export default function GroupLoading() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="혼디모영"
        superTitle="2026 링키지랩 미션트립"
        titleNode={
          <span className="inline-flex items-center gap-1">
            <Image src="/감귤.png" alt="" width={36} height={36} className="inline-block" aria-hidden="true" />
            혼디모영
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
