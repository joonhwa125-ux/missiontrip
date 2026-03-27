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
  const [newHour, setNewHour] = useState("");
  const [newMinute, setNewMinute] = useState("");
  const [newScope, setNewScope] = useState<ScheduleScope>("all");

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      let scheduledTime: string | null = null;
      if (newHour && newMinute) {
        const sameDay = schedules.find(
          (s) => s.day_number === parseInt(newDay) && s.scheduled_time
        );
        scheduledTime = parseKSTTime(`${newHour}:${newMinute}`, sameDay?.scheduled_time);
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
        setNewHour("");
        setNewMinute("");
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
        <div className="space-y-4">
          {/* 일정명 - 필수 필드 */}
          <div className="flex flex-col gap-1.5">
            <label className="px-1 text-sm font-medium text-stone-700">
              일정명 <span className="text-red-500">*</span>
            </label>
            <input
              placeholder="예: 늘봄식당, 제주공항"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action focus-visible:border-transparent transition-shadow"
              aria-label="일정명"
              aria-required="true"
            />
          </div>

          {/* 장소 - 선택 필드 */}
          <div className="flex flex-col gap-1.5">
            <label className="px-1 text-sm font-medium text-stone-700">
              집결지 <span className="text-stone-400 font-normal">(선택)</span>
            </label>
            <input
              placeholder="예: 주차장, 0번 게이트"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action focus-visible:border-transparent transition-shadow"
              aria-label="집결지"
            />
          </div>

          {/* 일차 & 적용 대상 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="px-1 text-sm font-medium text-stone-700">일차</label>
              <select
                value={newDay}
                onChange={(e) => setNewDay(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action transition-shadow"
                aria-label="일차"
              >
                <option value="1">1일차</option>
                <option value="2">2일차</option>
                <option value="3">3일차</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="px-1 text-sm font-medium text-stone-700">적용 대상</label>
              <select
                value={newScope}
                onChange={(e) => setNewScope(e.target.value as ScheduleScope)}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action transition-shadow"
                aria-label="적용 대상"
              >
                <option value="all">전체</option>
                <option value="advance">선발</option>
                <option value="rear">후발</option>
              </select>
            </div>
          </div>

          {/* 예정 시각 */}
          <div className="flex flex-col gap-1.5">
            <label className="px-1 text-sm font-medium text-stone-700">
              예정 시각 <span className="text-stone-400 font-normal">(선택)</span>
            </label>
            <div className="flex gap-3">
              <select
                value={newHour}
                onChange={(e) => setNewHour(e.target.value)}
                className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action transition-shadow"
                aria-label="시"
              >
                <option value="">시</option>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={String(i).padStart(2, "0")}>{i}시</option>
                ))}
              </select>
              <select
                value={newMinute}
                onChange={(e) => setNewMinute(e.target.value)}
                className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action transition-shadow"
                aria-label="분"
              >
                <option value="">분</option>
                {["00","05","10","15","20","25","30","35","40","45","50","55"].map((m) => (
                  <option key={m} value={m}>{m}분</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <button
            onClick={handleAdd}
            disabled={!newTitle.trim()}
            className="w-full min-h-12 rounded-xl bg-main-action text-base font-bold text-stone-900 shadow-sm transition-all hover:brightness-105 focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="일정 추가 확인"
          >
            추가
          </button>
          <DialogClose className="w-full min-h-12 rounded-xl border border-stone-200 bg-white text-base font-medium text-stone-600 transition-colors hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-300">
            취소
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
