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
  const [timeValue, setTimeValue] = useState("");

  const handleConfirm = () => {
    if (!schedule || !timeValue) return;
    const targetId = schedule.id;
    startTransition(async () => {
      const iso = parseKSTTime(timeValue, schedule.scheduled_time);
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
        setTimeValue("");
        onClose();
      }
    });
  };

  return (
    <Dialog
      open={!!schedule}
      onOpenChange={(o) => {
        if (!o) {
          setTimeValue("");
          onClose();
        }
      }}
    >
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>예정 시각 변경</DialogTitle>
          <DialogDescription>{schedule?.title}</DialogDescription>
        </DialogHeader>
        <input
          type="time"
          value={timeValue}
          onChange={(e) => setTimeValue(e.target.value)}
          className="w-full appearance-none rounded-xl border px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
          aria-label="예정 시각"
        />
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
