"use client";

import { useState, useTransition } from "react";
import { activateSchedule, createSchedule, updateScheduleTime } from "@/actions/schedule";
import { useBroadcast } from "@/hooks/useRealtime";
import {
  CHANNEL_GLOBAL,
  EVENT_SCHEDULE_ACTIVATED,
  EVENT_SCHEDULE_UPDATED,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

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

interface Props {
  schedules: Schedule[];
  onSchedulesChange: (s: Schedule[]) => void;
  onToast: (msg: string) => void;
}

export default function ScheduleTab({ schedules, onSchedulesChange, onToast }: Props) {
  const [, startTransition] = useTransition();
  const { broadcast } = useBroadcast();
  const [timeTarget, setTimeTarget] = useState<Schedule | null>(null);
  const [timeValue, setTimeValue] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDay, setNewDay] = useState("1");
  const [newTime, setNewTime] = useState("");

  const days = Array.from(new Set(schedules.map((s) => s.day_number))).sort();

  const handleActivate = (s: Schedule) => {
    startTransition(async () => {
      const res = await activateSchedule(s.id);
      if (res.ok) {
        await broadcast(CHANNEL_GLOBAL, EVENT_SCHEDULE_ACTIVATED, {
          schedule_id: s.id,
          title: s.title,
        });
        window.location.reload();
      }
    });
  };

  const handleTimeEdit = () => {
    if (!timeTarget || !timeValue) return;
    startTransition(async () => {
      // HH:MM → full ISO (오늘 날짜 기준)
      const [hh, mm] = timeValue.split(":");
      const d = new Date();
      d.setHours(parseInt(hh), parseInt(mm), 0, 0);
      const iso = d.toISOString();
      const res = await updateScheduleTime(timeTarget.id, iso);
      if (res.ok) {
        onSchedulesChange(
          schedules.map((s) =>
            s.id === timeTarget.id ? { ...s, scheduled_time: iso } : s
          )
        );
        await broadcast(CHANNEL_GLOBAL, EVENT_SCHEDULE_UPDATED, {
          schedule_id: timeTarget.id,
          scheduled_time: iso,
        });
        onToast("일정 시간이 변경되었어요");
        setTimeTarget(null);
      }
    });
  };

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      let scheduledTime: string | null = null;
      if (newTime) {
        const [hh, mm] = newTime.split(":");
        const d = new Date();
        d.setHours(parseInt(hh), parseInt(mm), 0, 0);
        scheduledTime = d.toISOString();
      }
      const res = await createSchedule(
        newTitle.trim(),
        newLocation.trim() || null,
        parseInt(newDay),
        scheduledTime
      );
      if (res.ok) window.location.reload();
    });
  };

  return (
    <div className="px-4 py-4 pb-8">
      {days.map((day) => (
        <div key={day} className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">{day}일차</h2>
          <div className="space-y-2">
            {schedules
              .filter((s) => s.day_number === day)
              .map((s) => {
                const status = getStatus(s);
                const timeDisplay = formatScheduledTime(s.scheduled_time);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "rounded-2xl bg-white p-4",
                      status === "completed" && "opacity-55"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => {
                          setTimeTarget(s);
                          setTimeValue("");
                        }}
                        className="flex-1 text-left focus-visible:ring-2 focus-visible:ring-main-action rounded-lg"
                        aria-label={`${s.title} 시간 수정`}
                      >
                        <p className="font-medium">{s.title}</p>
                        {s.location && (
                          <p className="text-sm text-muted-foreground">{s.location}</p>
                        )}
                        {timeDisplay && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {timeDisplay}
                          </p>
                        )}
                      </button>
                      {status === "active" && (
                        <span className="flex-shrink-0 rounded-full bg-main-action px-2 py-0.5 text-xs font-bold">
                          진행중
                        </span>
                      )}
                      {status === "waiting" && (
                        <button
                          onClick={() => handleActivate(s)}
                          className="min-h-11 flex-shrink-0 rounded-xl bg-gray-900 px-3 text-xs font-bold text-white focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          활성화
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}

      <button
        onClick={() => setAddOpen(true)}
        className="w-full min-h-11 rounded-2xl border-2 border-dashed border-gray-300 py-4 text-sm font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-main-action"
      >
        + 일정 추가
      </button>

      {/* 시간 수정 */}
      <Dialog open={!!timeTarget} onOpenChange={(o) => !o && setTimeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>예정 시각 변경</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{timeTarget?.title}</p>
          <input
            type="time"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            className="w-full rounded-xl border px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
            aria-label="예정 시각"
          />
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              취소
            </DialogClose>
            <button
              onClick={handleTimeEdit}
              className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action"
            >
              변경
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일정 추가 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>일정 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input
              placeholder="일정명 *"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="일정명"
            />
            <input
              placeholder="장소 (선택)"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="장소"
            />
            <select
              value={newDay}
              onChange={(e) => setNewDay(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="일차"
            >
              <option value="1">1일차</option>
              <option value="2">2일차</option>
              <option value="3">3일차</option>
            </select>
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="예정 시각 (선택)"
            />
          </div>
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              취소
            </DialogClose>
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim()}
              className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action disabled:opacity-50"
            >
              추가
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
