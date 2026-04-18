"use client";

import { useCallback, useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Schedule } from "@/lib/types";

interface SimpleGroup {
  id: string;
  name: string;
  bus_name?: string | null;
}

export interface ScheduleGroupInfoFormValues {
  schedule_id: string;
  group_id: string;
  location_detail: string | null;
  rotation: string | null;
  sub_location: string | null;
  note: string | null;
}

interface Props {
  mode: "create" | "edit";
  schedules: Schedule[];
  groups: SimpleGroup[];
  initial?: ScheduleGroupInfoFormValues;
  onSave: (values: ScheduleGroupInfoFormValues) => void;
  onClose: () => void;
}

const INPUT_CLASS =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm";

function scheduleLabel(s: Schedule): string {
  return `${s.day_number}-${s.sort_order} · ${s.title}`;
}

export default function ScheduleGroupInfoEditDialog({
  mode,
  schedules,
  groups,
  initial,
  onSave,
  onClose,
}: Props) {
  const [form, setForm] = useState<ScheduleGroupInfoFormValues>({
    schedule_id: initial?.schedule_id ?? schedules[0]?.id ?? "",
    group_id: initial?.group_id ?? groups[0]?.id ?? "",
    location_detail: initial?.location_detail ?? null,
    rotation: initial?.rotation ?? null,
    sub_location: initial?.sub_location ?? null,
    note: initial?.note ?? null,
  });

  const set = useCallback(
    <K extends keyof ScheduleGroupInfoFormValues>(
      k: K,
      v: ScheduleGroupInfoFormValues[K]
    ) => setForm((prev) => ({ ...prev, [k]: v })),
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      location_detail: form.location_detail?.trim() || null,
      rotation: form.rotation?.trim() || null,
      sub_location: form.sub_location?.trim() || null,
      note: form.note?.trim() || null,
    });
  };

  const isEdit = mode === "edit";
  // Checkpoint 2 수정: label-input htmlFor+id 연결로 KWCAG 3.3.2 준수
  const uid = useId();
  const ids = {
    schedule: `${uid}-schedule`,
    group: `${uid}-group`,
    location: `${uid}-location`,
    rotation: `${uid}-rotation`,
    subLocation: `${uid}-sub`,
    note: `${uid}-note`,
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "조별 배정 수정" : "조별 배정 추가"}</DialogTitle>
          <DialogDescription className="sr-only">
            일정×조 메타데이터(층수/순환/장소/메모)
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-1">
          <div>
            <label htmlFor={ids.schedule} className="mb-1 block text-xs font-medium text-muted-foreground">일정</label>
            <select
              id={ids.schedule}
              value={form.schedule_id}
              onChange={(e) => set("schedule_id", e.target.value)}
              className={INPUT_CLASS}
              disabled={isEdit}
              required
            >
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>{scheduleLabel(s)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.group} className="mb-1 block text-xs font-medium text-muted-foreground">조</label>
            <select
              id={ids.group}
              value={form.group_id}
              onChange={(e) => set("group_id", e.target.value)}
              className={INPUT_CLASS}
              disabled={isEdit}
              required
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.bus_name ? ` · ${g.bus_name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={ids.location} className="mb-1 block text-xs font-medium text-muted-foreground">층/위치</label>
              <input
                id={ids.location}
                value={form.location_detail ?? ""}
                onChange={(e) => set("location_detail", e.target.value)}
                placeholder="예: 1층, A홀"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor={ids.rotation} className="mb-1 block text-xs font-medium text-muted-foreground">순환 순서</label>
              <input
                id={ids.rotation}
                value={form.rotation ?? ""}
                onChange={(e) => set("rotation", e.target.value)}
                placeholder="예: 식사먼저"
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div>
            <label htmlFor={ids.subLocation} className="mb-1 block text-xs font-medium text-muted-foreground">활동 장소</label>
            <input
              id={ids.subLocation}
              value={form.sub_location ?? ""}
              onChange={(e) => set("sub_location", e.target.value)}
              placeholder="예: 해먹존, 족욕존"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label htmlFor={ids.note} className="mb-1 block text-xs font-medium text-muted-foreground">메모</label>
            <textarea
              id={ids.note}
              value={form.note ?? ""}
              onChange={(e) => set("note", e.target.value)}
              placeholder="조장에게 전달할 안내"
              rows={3}
              className={INPUT_CLASS}
            />
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
