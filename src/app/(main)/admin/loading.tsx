import Image from "next/image";
import PageHeader from "@/components/common/PageHeader";
import { DayTabsSkeleton, ActiveCardSkeleton, WaitingCardSkeleton } from "@/components/common/ScheduleCardSkeleton";

export default function AdminLoading() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="동행체크"
        titleNode={
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-flex items-center gap-1">
              <Image src="/1.png" alt="" width={40} height={40} quality={100} className="inline-block" aria-hidden="true" priority />
              동행체크
            </span>
            <span className="flex-shrink-0 rounded-full bg-gray-900 px-1.5 py-1 font-semibold text-white text-xs leading-none">
              관리자
            </span>
          </span>
        }
      />
      <div role="status" aria-live="polite" className="sr-only">불러오는 중</div>
      <DayTabsSkeleton />
      <div className="flex-1 space-y-2 px-4 py-4">
        <ActiveCardSkeleton />
        <WaitingCardSkeleton />
        <WaitingCardSkeleton />
        <WaitingCardSkeleton />
      </div>
    </div>
  );
}
