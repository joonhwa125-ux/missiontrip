"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import GroupCheckinView from "./GroupCheckinView";
import GroupScheduleTab from "./GroupScheduleTab";
import type { Schedule, CheckIn, Group } from "@/lib/types";

interface Member {
  id: string;
  name: string;
}

interface Props {
  currentUser: { id: string; group_id: string };
  groupName: string;
  members: Member[];
  activeSchedule: Schedule | null;
  initialCheckIns: CheckIn[];
  schedules: Schedule[];
  allGroups: Group[];
  allCheckIns: { user_id: string; is_absent: boolean }[];
}

type TabName = "checkin" | "schedule";

const TABS: { key: TabName; label: string }[] = [
  { key: "checkin", label: "체크인" },
  { key: "schedule", label: "일정" },
];

export default function GroupView({
  currentUser,
  groupName,
  members,
  activeSchedule,
  initialCheckIns,
  schedules,
  allGroups,
  allCheckIns,
}: Props) {
  const [tab, setTab] = useState<TabName>("checkin");

  return (
    <div className="flex min-h-screen flex-col bg-app-bg">
      {/* 탭 네비게이션 — 하단 고정 위에 */}
      {tab === "checkin" ? (
        <GroupCheckinView
          currentUser={currentUser}
          groupName={groupName}
          members={members}
          activeSchedule={activeSchedule}
          initialCheckIns={initialCheckIns}
        />
      ) : (
        <GroupScheduleTab
          activeSchedule={activeSchedule}
          schedules={schedules}
          allGroups={allGroups}
          allCheckIns={allCheckIns}
        />
      )}

      {/* 하단 탭 바 */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white pb-safe"
        role="tablist"
        aria-label="조장 메뉴"
      >
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 py-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-main-action",
                tab === t.key ? "text-gray-900" : "text-gray-400"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
