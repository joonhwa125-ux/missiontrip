import PageHeader from "@/components/common/PageHeader";

export default function AdminLoading() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="실시간 현황" />
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-main-action" role="status">
          <span className="sr-only">로딩 중</span>
        </div>
      </div>
    </div>
  );
}
