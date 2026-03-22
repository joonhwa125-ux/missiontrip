"use client";

import { useState, useCallback, useEffect } from "react";
import { useRealtime } from "@/hooks/useRealtime";
import { cn } from "@/lib/utils";
import StatusTab from "./StatusTab";
import ScheduleTab from "./ScheduleTab";
import type { Group, Schedule } from "@/lib/types";

interface Member {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  group_id: string;
}
interface CheckIn {
  user_id: string;
  is_absent: boolean;
  checked_at?: string;
}
interface Report {
  group_id: string;
  pending_count: number;
  reported_at: string;
}

interface Props {
  currentUser: { id: string };
  groups: Group[];
  members: Member[];
  activeSchedule: Schedule | null;
  schedules: Schedule[];
  initialCheckIns: CheckIn[];
  initialReports: Report[];
}

type TabName = "status" | "schedule";

const TABS: { key: TabName; label: string }[] = [
  { key: "status", label: "현황" },
  { key: "schedule", label: "일정" },
];

export default function AdminView({
  groups,
  members: initialMembers,
  activeSchedule,
  schedules: initialSchedules,
  initialCheckIns,
  initialReports,
}: Props) {
  const [tab, setTab] = useState<TabName>("status");
  const [schedules, setSchedules] = useState(initialSchedules);
  const [members, setMembers] = useState(initialMembers);
  const [checkIns, setCheckIns] = useState(initialCheckIns);
  const [reports, setReports] = useState(initialReports);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useRealtime(null, true, {
    onScheduleActivated: () => window.location.reload(),
    onScheduleUpdated: ({ schedule_id, scheduled_time }) => {
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule_id ? { ...s, scheduled_time } : s))
      );
      showToast("일정 시간이 변경되었어요");
    },
    onCheckinUpdated: ({ user_id, action }) => {
      setCheckIns((prev) => {
        if (action === "insert") {
          if (prev.some((c) => c.user_id === user_id)) return prev;
          return [...prev, { user_id, is_absent: false, checked_at: new Date().toISOString() }];
        }
        return prev.filter((c) => c.user_id !== user_id);
      });
    },
    onGroupReported: ({ group_id, pending_count }) => {
      setReports((prev) => {
        const idx = prev.findIndex((r) => r.group_id === group_id);
        const newReport = {
          group_id,
          pending_count,
          reported_at: new Date().toISOString(),
        };
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = newReport;
          return updated;
        }
        return [...prev, newReport];
      });
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-app-bg">
      {/* 헤더 + 탭 */}
      <header className="bg-main-action px-4 pt-6 pb-0">
        <h1 className="mb-3 text-xl font-bold">미션트립 관리자</h1>
        <div role="tablist" className="flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 border-b-2 py-2.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                tab === t.key
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* 탭 콘텐츠 */}
      <div role="tabpanel" className="flex-1">
        {tab === "status" && (
          <StatusTab
            groups={groups}
            members={members}
            activeSchedule={activeSchedule}
            checkIns={checkIns}
            reports={reports}
            onMembersChange={setMembers}
            onCheckInsChange={setCheckIns}
          />
        )}
        {tab === "schedule" && (
          <ScheduleTab
            schedules={schedules}
            onSchedulesChange={setSchedules}
            onToast={showToast}
            checkIns={checkIns}
            totalMemberCount={members.length}
            activeSchedule={activeSchedule}
          />
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          className="fixed bottom-[max(1.5rem,_env(safe-area-inset-bottom))] left-4 right-4 rounded-xl bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
