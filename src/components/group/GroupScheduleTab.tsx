"use client";

import { cn } from "@/lib/utils";
import type { Schedule, Group } from "@/lib/types";

interface Props {
  activeSchedule: Schedule | null;
  schedules: Schedule[];
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
}

type ScheduleStatus = "active" | "completed" | "waiting";

function getStatus(s: Schedule): ScheduleStatus {
  if (s.is_active) return "active";
  if (s.activated_at) return "completed";
  return "waiting";
}

function formatScheduledTime(t: string | null): string | null {
  if (!t) return null;
  try {
    return new Date(t).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return t;
  }
}

const STATUS_STYLE: Record<ScheduleStatus, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-main-action", text: "text-gray-900", label: "진행중" },
  completed: { bg: "bg-gray-100", text: "text-muted-foreground", label: "완료" },
  waiting: { bg: "bg-secondary", text: "text-muted-foreground", label: "대기" },
};

export default function GroupScheduleTab({
  activeSchedule,
  schedules,
  allGroups,
}: Props) {
  // 오늘 일차 추정: 활성 일정의 day_number 또는 가장 최근 activated 일정
  const todayDay = activeSchedule?.day_number
    ?? schedules.find((s) => s.activated_at)?.day_number
    ?? 1;

  const todaySchedules = schedules.filter((s) => s.day_number === todayDay);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 pb-20">
      {/* 오늘 일정 타임라인 */}
      <h2 className="mb-3 text-sm font-bold text-muted-foreground">{todayDay}일차 일정</h2>
      <div className="mb-6 space-y-2">
        {todaySchedules.map((s) => {
          const status = getStatus(s);
          const style = STATUS_STYLE[status];
          const timeDisplay = formatScheduledTime(s.scheduled_time);
          return (
            <div
              key={s.id}
              className={cn(
                "rounded-2xl p-4",
                status === "active" ? "bg-main-action/20 ring-2 ring-main-action" : "bg-white",
                status === "completed" && "opacity-55"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <p className="font-medium">{s.title}</p>
                  {s.location && (
                    <p className="text-sm text-muted-foreground">{s.location}</p>
                  )}
                  {timeDisplay && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{timeDisplay}</p>
                  )}
                </div>
                <span
                  className={cn(
                    "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    style.bg,
                    style.text
                  )}
                >
                  {style.label}
                </span>
              </div>
            </div>
          );
        })}
        {todaySchedules.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            오늘 일정이 없어요
          </p>
        )}
      </div>

      {/* 전체 조 현황 (읽기 전용) */}
      {activeSchedule && (
        <>
          <h2 className="mb-3 text-sm font-bold text-muted-foreground">전체 현황</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            {activeSchedule.title} 기준 · 읽기 전용
          </p>
          <GroupStatusReadonly groups={allGroups} />
        </>
      )}
    </div>
  );
}

// 간소화된 전체 조 현황 (조장용, 읽기 전용)
function GroupStatusReadonly({ groups }: { groups: Group[] }) {
  // bus_name별 그룹핑
  const busGroups = new Map<string, Group[]>();
  for (const g of groups) {
    const bus = g.bus_name ?? "미배정";
    if (!busGroups.has(bus)) busGroups.set(bus, []);
    busGroups.get(bus)!.push(g);
  }
  const busEntries = Array.from(busGroups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], "ko")
  );

  return (
    <div className="space-y-3">
      {busEntries.map(([busName, busGroupList]) => (
        <section key={busName}>
          <h3 className="mb-1.5 text-xs font-bold text-muted-foreground">{busName}</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {busGroupList.map((g) => (
              <div
                key={g.id}
                className="rounded-xl bg-white px-2.5 py-2 text-center"
              >
                <p className="truncate text-sm font-medium">{g.name}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
