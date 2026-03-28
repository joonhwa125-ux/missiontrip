import Image from "next/image";
import PageHeader from "@/components/common/PageHeader";
import { DayTabsSkeleton, ActiveCardSkeleton, WaitingCardSkeleton } from "@/components/common/ScheduleCardSkeleton";

export default function GroupLoading() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="혼디모영"
        superTitle="2026 링키지랩 미션트립"
        titleNode={
          <span className="inline-flex items-center gap-1">
            <Image src="/감귤.png" alt="" width={36} height={36} className="inline-block" aria-hidden="true" priority />
            혼디모영
          </span>
        }
      />
      <DayTabsSkeleton />
      <div className="flex-1 space-y-2 px-4 py-4">
        <ActiveCardSkeleton />
        <WaitingCardSkeleton />
        <WaitingCardSkeleton />
      </div>
    </div>
  );
}
