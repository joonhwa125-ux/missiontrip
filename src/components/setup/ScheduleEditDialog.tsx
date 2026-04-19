"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Schedule, ScheduleScope, ShuttleType, AirlineLeg } from "@/lib/types";

interface Props {
  schedule: Schedule;
  onSave: (data: {
    title: string;
    location: string | null;
    day_number: number;
    sort_order: number;
    scheduled_time: string | null;
    scope: ScheduleScope;
    shuttle_type: ShuttleType | null;
    airline_leg: AirlineLeg | null;
    airline_filter: string | null;
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
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm";

export default function ScheduleEditDialog({ schedule, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    title: schedule.title,
    location: schedule.location ?? "",
    day_number: schedule.day_number,
    sort_order: schedule.sort_order,
    scheduled_time: isoToDatetimeLocal(schedule.scheduled_time),
    scope: schedule.scope,
    shuttle_type: schedule.shuttle_type,
    airline_leg: schedule.airline_leg,
    airline_filter: schedule.airline_filter ?? "",
  });

  const set = useCallback(
    <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
      setForm((prev) => ({ ...prev, [k]: v })),
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: form.title.trim(),
      location: form.location.trim() || null,
      day_number: form.day_number,
      sort_order: form.sort_order,
      scheduled_time: datetimeLocalToIso(form.scheduled_time),
      scope: form.scope,
      shuttle_type: form.shuttle_type,
      airline_leg: form.airline_leg,
      airline_filter: form.airline_filter.trim() || null,
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">장소</label>
            <input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="선택 사항"
              className={INPUT_CLASS}
              aria-label="장소"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              집결지 <span aria-hidden="true">*</span>
            </label>
            <input
              required
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className={INPUT_CLASS}
              aria-label="집결지"
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
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">셔틀 구분</label>
            <select
              value={form.shuttle_type ?? ""}
              onChange={(e) => set("shuttle_type", (e.target.value as ShuttleType) || null)}
              className={INPUT_CLASS}
              aria-label="셔틀 구분"
            >
              <option value="">없음 (일반 일정)</option>
              <option value="departure">출발 셔틀</option>
              <option value="return">귀가 셔틀</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">항공 구간</label>
            <select
              value={form.airline_leg ?? ""}
              onChange={(e) => set("airline_leg", (e.target.value as AirlineLeg) || null)}
              className={INPUT_CLASS}
              aria-label="항공 구간"
            >
              <option value="">없음 (비행 일정 아님)</option>
              <option value="outbound">가는편</option>
              <option value="return">오는편</option>
            </select>
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">
              비행 일정으로 지정하면 해당 일차 브리핑 카드에 항공사 섹션이 노출돼요
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">항공사 필터</label>
            <input
              value={form.airline_filter}
              onChange={(e) => set("airline_filter", e.target.value)}
              placeholder="예: 티웨이, 제주항공, 에어서울 (빈칸이면 필터 없음)"
              className={INPUT_CLASS}
              aria-label="항공사 필터"
            />
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">
              입력한 키워드를 포함한 탑승자가 조에 없으면 해당 조장 화면에서 이 일정이 숨겨져요
            </p>
          </div>
          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium"
            >
              취소
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-main-action px-4 text-sm font-bold"
            >
              저장
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
