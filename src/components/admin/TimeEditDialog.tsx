"use client";

import { useState, useTransition } from "react";
import { updateScheduleTime } from "@/actions/schedule";
import { useBroadcast } from "@/hooks/useRealtime";
import { CHANNEL_GLOBAL, EVENT_SCHEDULE_UPDATED } from "@/lib/constants";
import { parseKSTTime } from "@/lib/utils";
import type { Schedule } from "@/lib/types";
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
  schedule: Schedule | null;
  onClose: () => void;
  onSchedulesChange: (updater: (prev: Schedule[]) => Schedule[]) => void;
  onToast: (msg: string) => void;
}

export default function TimeEditDialog({
  schedule,
  onClose,
  onSchedulesChange,
  onToast,
}: Props) {
  const [, startTransition] = useTransition();
  const { broadcast } = useBroadcast();
  const [timeHour, setTimeHour] = useState("");
  const [timeMinute, setTimeMinute] = useState("");

  const handleConfirm = () => {
    if (!schedule || !timeHour || !timeMinute) return;
    const targetId = schedule.id;
    startTransition(async () => {
      const iso = parseKSTTime(`${timeHour}:${timeMinute}`, schedule.scheduled_time);
      const res = await updateScheduleTime(targetId, iso);
      if (res.ok) {
        onSchedulesChange((prev) =>
          prev.map((s) =>
            s.id === targetId ? { ...s, scheduled_time: iso } : s
          )
        );
        await broadcast(CHANNEL_GLOBAL, EVENT_SCHEDULE_UPDATED, {
          schedule_id: targetId,
          scheduled_time: iso,
        });
        onToast("일정 시간이 변경되었어요");
        setTimeHour("");
        setTimeMinute("");
        onClose();
      }
    });
  };

  return (
    <Dialog
      open={!!schedule}
      onOpenChange={(o) => {
        if (!o) {
          setTimeHour("");
          setTimeMinute("");
          onClose();
        }
      }}
    >
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>예정 시각 변경</DialogTitle>
          <DialogDescription>{schedule?.title}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <select
            value={timeHour}
            onChange={(e) => setTimeHour(e.target.value)}
            className="flex-1 rounded-xl border px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
            aria-label="시"
          >
            <option value="">시</option>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={String(i).padStart(2, "0")}>{i}시</option>
            ))}
          </select>
          <select
            value={timeMinute}
            onChange={(e) => setTimeMinute(e.target.value)}
            className="flex-1 rounded-xl border px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
            aria-label="분"
          >
            <option value="">분</option>
            {["00","05","10","15","20","25","30","35","40","45","50","55"].map((m) => (
              <option key={m} value={m}>{m}분</option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
            취소
          </DialogClose>
          <button
            onClick={handleConfirm}
            className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action"
            aria-label="시간 변경 확인"
          >
            변경
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
