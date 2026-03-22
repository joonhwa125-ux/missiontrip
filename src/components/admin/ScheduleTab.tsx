"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { activateSchedule, createSchedule, updateScheduleTime } from "@/actions/schedule";
import { useBroadcast } from "@/hooks/useRealtime";
import {
  CHANNEL_GLOBAL,
  COPY,
  EVENT_SCHEDULE_ACTIVATED,
  EVENT_SCHEDULE_UPDATED,
} from "@/lib/constants";
import { cn, formatTime } from "@/lib/utils";
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

interface Props {
  schedules: Schedule[];
  onSchedulesChange: (s: Schedule[]) => void;
  onToast: (msg: string) => void;
  onRefresh: () => void;
  checkIns: { user_id: string; is_absent: boolean }[];
  totalMemberCount: number;
  activeSchedule: Schedule | null;
}

/** 현재 활성 일정 기준 미확인 인원 수 계산 */
function calcUncheckedCount(
  checkIns: { user_id: string; is_absent: boolean }[],
  totalMemberCount: number
): number {
  const absentCount = checkIns.filter((c) => c.is_absent).length;
  const checkedCount = checkIns.filter((c) => !c.is_absent).length;
  return totalMemberCount - absentCount - checkedCount;
}

export default function ScheduleTab({
  schedules,
  onSchedulesChange,
  onToast,
  onRefresh,
  checkIns,
  totalMemberCount,
  activeSchedule,
}: Props) {
  const [, startTransition] = useTransition();
  const { broadcast } = useBroadcast();
  const [timeTarget, setTimeTarget] = useState<Schedule | null>(null);
  const [timeValue, setTimeValue] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDay, setNewDay] = useState("1");
  const [newTime, setNewTime] = useState("");
  const [warningTarget, setWarningTarget] = useState<Schedule | null>(null);

  const autoAlertedRef = useRef<Set<string>>(new Set());

  const days = Array.from(new Set(schedules.map((s) => s.day_number))).sort();

  const handleActivate = useCallback(
    (s: Schedule) => {
      startTransition(async () => {
        const res = await activateSchedule(s.id);
        if (res.ok) {
          await broadcast(CHANNEL_GLOBAL, EVENT_SCHEDULE_ACTIVATED, {
            schedule_id: s.id,
            title: s.title,
          });
          onRefresh();
        }
      });
    },
    [broadcast, startTransition, onRefresh]
  );

  // A. 자동 활성화 타이머
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const waiting = schedules.filter(
        (s) => !s.is_active && !s.activated_at && s.scheduled_time
      );
      const due = waiting.find((s) => new Date(s.scheduled_time!) <= now);
      if (!due || autoAlertedRef.current.has(due.id)) return;

      const unchecked = calcUncheckedCount(checkIns, totalMemberCount);

      if (activeSchedule && unchecked > 0) {
        autoAlertedRef.current.add(due.id);
        onToast(`${due.title} 시간이 됐지만 ${unchecked}명이 미확인이에요`);
        return;
      }
      handleActivate(due);
    };

    check();
    const timer = setInterval(check, 60000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [schedules, checkIns, totalMemberCount, activeSchedule, handleActivate, onToast]);

  // B. 수동 활성화 — 미확인 경고 래핑
  const handleActivateClick = (s: Schedule) => {
    if (!activeSchedule) {
      handleActivate(s);
      return;
    }
    const unchecked = calcUncheckedCount(checkIns, totalMemberCount);
    if (unchecked > 0) {
      setWarningTarget(s);
    } else {
      handleActivate(s);
    }
  };

  const handleTimeEdit = () => {
    if (!timeTarget || !timeValue) return;
    startTransition(async () => {
      const [hh, mm] = timeValue.split(":");
      const d = timeTarget.scheduled_time
        ? new Date(timeTarget.scheduled_time)
        : new Date();
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
        // 같은 day_number의 기존 일정 날짜를 참조하여 날짜 보존
        const sameDay = schedules.find(
          (s) => s.day_number === parseInt(newDay) && s.scheduled_time
        );
        const d = sameDay ? new Date(sameDay.scheduled_time!) : new Date();
        d.setHours(parseInt(hh), parseInt(mm), 0, 0);
        scheduledTime = d.toISOString();
      }
      const res = await createSchedule(
        newTitle.trim(),
        newLocation.trim() || null,
        parseInt(newDay),
        scheduledTime
      );
      if (res.ok) onRefresh();
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
                const timeDisplay = s.scheduled_time
                  ? formatTime(s.scheduled_time)
                  : null;
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
                          onClick={() => handleActivateClick(s)}
                          className="min-h-11 flex-shrink-0 rounded-xl bg-gray-900 px-3 text-xs font-bold text-white focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`${s.title} 활성화`}
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
        aria-label="일정 추가"
      >
        + 일정 추가
      </button>

      {/* 시간 수정 모달 */}
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
              aria-label="시간 변경 확인"
            >
              변경
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일정 추가 모달 */}
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
              aria-label="일정 추가 확인"
            >
              추가
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 미확인 경고 모달 (수동 활성화 시) */}
      <Dialog open={!!warningTarget} onOpenChange={(o) => !o && setWarningTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {COPY.uncheckedWarning(calcUncheckedCount(checkIns, totalMemberCount))}
            </DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              취소
            </DialogClose>
            <button
              onClick={() => {
                const target = warningTarget;
                setWarningTarget(null);
                if (target) handleActivate(target);
              }}
              className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="일정 전환 확인"
            >
              전환할게요
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
