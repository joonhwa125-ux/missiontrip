import Image from "next/image";
import PageHeader from "@/components/common/PageHeader";
import { DayTabsSkeleton, ActiveCardSkeleton, WaitingCardSkeleton } from "@/components/common/ScheduleCardSkeleton";

export default function GroupLoading() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="혼디모영"
        titleNode={
          <span className="inline-flex items-center gap-1">
            <Image src="/logo.png" alt="" width={40} height={40} quality={100} className="inline-block" aria-hidden="true" priority />
            혼디모영
          </span>
        }
      />
      <div role="status" aria-live="polite" className="sr-only">불러오는 중</div>
      <DayTabsSkeleton />
      <div className="flex-1 space-y-2 px-4 py-4">
        <ActiveCardSkeleton />
        <WaitingCardSkeleton />
        <WaitingCardSkeleton />
      </div>
    </div>
  );
}
