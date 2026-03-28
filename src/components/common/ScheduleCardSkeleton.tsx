/** 일정 카드 스켈레톤 — group/admin loading.tsx 공용 */

function Bone({ className }: { className: string }) {
  return <div className={`rounded bg-gray-200 ${className}`} />;
}

/** 진행중 카드 스켈레톤 */
export function ActiveCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white ring-2 ring-gray-200 shadow-sm p-4 animate-pulse" aria-hidden="true">
      <div className="mb-2 flex items-center gap-1.5">
        <Bone className="h-5 w-12 rounded-full" />
        <Bone className="h-5 w-16 rounded-full !bg-gray-100" />
      </div>
      <Bone className="h-5 w-3/4" />
      <Bone className="mt-1.5 h-4 w-1/2 !bg-gray-100" />
      <div className="mt-3 flex items-baseline justify-between">
        <Bone className="h-3 w-10 !bg-gray-100" />
        <Bone className="h-3 w-16 !bg-gray-100" />
      </div>
      <Bone className="mt-1.5 h-2 w-full rounded-full !bg-gray-100" />
      <Bone className="mt-2 h-11 w-full rounded-xl !bg-gray-50" />
    </div>
  );
}

/** 대기/완료 카드 스켈레톤 */
export function WaitingCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white shadow-sm p-4 animate-pulse" aria-hidden="true">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Bone className="h-5 w-9 rounded-full !bg-gray-100" />
        <Bone className="h-5 w-16 rounded-full !bg-gray-100" />
      </div>
      <Bone className="h-5 w-2/3" />
      <Bone className="mt-1.5 h-4 w-2/5 !bg-gray-100" />
    </div>
  );
}

/** 일차 탭 스켈레톤 */
export function DayTabsSkeleton() {
  return (
    <div className="bg-white px-4 pt-2 animate-pulse" aria-hidden="true">
      <div className="flex">
        <div className="flex-1 border-b-2 border-gray-200 pb-3 flex justify-center">
          <Bone className="h-5 w-14" />
        </div>
        <div className="flex-1 border-b-2 border-transparent pb-3 flex justify-center">
          <Bone className="h-5 w-14 !bg-gray-100" />
        </div>
        <div className="flex-1 border-b-2 border-transparent pb-3 flex justify-center">
          <Bone className="h-5 w-14 !bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
