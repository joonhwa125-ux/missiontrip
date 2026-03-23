import PageHeader from "@/components/common/PageHeader";

export default function SetupLoading() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-app-bg">
      <PageHeader title="설정" backHref="/admin" />
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-main-action" role="status">
          <span className="sr-only">로딩 중</span>
        </div>
      </div>
    </div>
  );
}
