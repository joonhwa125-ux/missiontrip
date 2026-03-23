"use client";

import { useState, useTransition } from "react";
import { createSchedule } from "@/actions/schedule";
import { parseKSTTime } from "@/lib/utils";
import type { Schedule, ScheduleScope } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedules: Schedule[];
  onRefresh: () => void;
}

export default function ScheduleAddDialog({
  open,
  onOpenChange,
  schedules,
  onRefresh,
}: Props) {
  const [, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDay, setNewDay] = useState("1");
  const [newTime, setNewTime] = useState("");
  const [newScope, setNewScope] = useState<ScheduleScope>("all");

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      let scheduledTime: string | null = null;
      if (newTime) {
        const sameDay = schedules.find(
          (s) => s.day_number === parseInt(newDay) && s.scheduled_time
        );
        scheduledTime = parseKSTTime(newTime, sameDay?.scheduled_time);
      }
      const res = await createSchedule(
        newTitle.trim(),
        newLocation.trim() || null,
        parseInt(newDay),
        scheduledTime,
        newScope
      );
      if (res.ok) {
        setNewTitle("");
        setNewLocation("");
        setNewDay("1");
        setNewTime("");
        setNewScope("all");
        onOpenChange(false);
        onRefresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>일정 추가</DialogTitle>
          <DialogDescription className="sr-only">
            새 일정의 이름, 장소, 일차, 시각을 입력합니다.
          </DialogDescription>
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
          <div className="grid grid-cols-2 gap-2">
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
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as ScheduleScope)}
              className="w-full rounded-xl border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="대상"
            >
              <option value="all">전체</option>
              <option value="advance">선발</option>
              <option value="rear">후발</option>
            </select>
          </div>
          <div className="relative">
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className={`w-full rounded-xl border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action ${!newTime ? "text-transparent focus:text-foreground" : ""}`}
              aria-label="예정 시각 (선택)"
            />
            {!newTime && (
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                예정 시각 (선택)
              </span>
            )}
          </div>
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
  );
}
