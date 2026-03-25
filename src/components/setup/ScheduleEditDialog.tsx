"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Schedule, ScheduleScope } from "@/lib/types";

interface Props {
  schedule: Schedule;
  onSave: (data: {
    title: string;
    location: string | null;
    day_number: number;
    sort_order: number;
    scheduled_time: string | null;
    scope: ScheduleScope;
  }) => void;
  onClose: () => void;
}

// ISO UTC → KST datetime-local 입력값 ("YYYY-MM-DDTHH:MM")
function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16);
}

// datetime-local (KST) → ISO UTC
function datetimeLocalToIso(local: string): string | null {
  if (!local) return null;
  return new Date(local + "+09:00").toISOString();
}

const SCOPE_OPTIONS: { value: ScheduleScope; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "advance", label: "선발" },
  { value: "rear", label: "후발" },
];

const INPUT_CLASS =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action";

export default function ScheduleEditDialog({ schedule, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    title: schedule.title,
    location: schedule.location ?? "",
    day_number: schedule.day_number,
    sort_order: schedule.sort_order,
    scheduled_time: isoToDatetimeLocal(schedule.scheduled_time),
    scope: schedule.scope,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: form.title.trim(),
      location: form.location.trim() || null,
      day_number: form.day_number,
      sort_order: form.sort_order,
      scheduled_time: datetimeLocalToIso(form.scheduled_time),
      scope: form.scope,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>일정 수정</DialogTitle>
          <DialogDescription className="sr-only">일정 정보를 수정해요</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-1">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">집결지</label>
            <input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="선택 사항"
              className={INPUT_CLASS}
              aria-label="집결지"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              집결지 상세 <span aria-hidden="true">*</span>
            </label>
            <input
              required
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className={INPUT_CLASS}
              aria-label="집결지 상세"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">일정</label>
              <select
                value={form.day_number}
                onChange={(e) => set("day_number", Number(e.target.value))}
                className={INPUT_CLASS}
                aria-label="일정"
              >
                {[1, 2, 3].map((d) => (
                  <option key={d} value={d}>{d}일차</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">순서</label>
              <input
                type="number"
                min={1}
                value={form.sort_order}
                onChange={(e) => set("sort_order", Number(e.target.value))}
                className={INPUT_CLASS}
                aria-label="순서"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">예정 시간 (KST)</label>
            <input
              type="datetime-local"
              value={form.scheduled_time}
              onChange={(e) => set("scheduled_time", e.target.value)}
              className={INPUT_CLASS}
              aria-label="예정 시간"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">구분</label>
            <select
              value={form.scope}
              onChange={(e) => set("scope", e.target.value as ScheduleScope)}
              className={INPUT_CLASS}
              aria-label="구분"
            >
              {SCOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-main-action"
            >
              취소
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-main-action px-4 text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action"
            >
              저장
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
