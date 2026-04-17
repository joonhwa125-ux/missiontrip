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
import type { Schedule, TempRole } from "@/lib/types";

interface SimpleUser {
  id: string;
  name: string;
  group_id: string;
}

interface SimpleGroup {
  id: string;
  name: string;
}

export interface ScheduleMemberInfoFormValues {
  schedule_id: string;
  user_id: string;
  temp_group_id: string | null;
  temp_role: TempRole | null;
  excused_reason: string | null;
  activity: string | null;
  menu: string | null;
  note: string | null;
}

interface Props {
  mode: "create" | "edit";
  schedules: Schedule[];
  users: SimpleUser[];
  groups: SimpleGroup[];
  initial?: ScheduleMemberInfoFormValues;
  onSave: (values: ScheduleMemberInfoFormValues) => void;
  onClose: () => void;
}

const INPUT_CLASS =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm";

function scheduleLabel(s: Schedule): string {
  return `${s.day_number}-${s.sort_order} · ${s.title}`;
}

export default function ScheduleMemberInfoEditDialog({
  mode,
  schedules,
  users,
  groups,
  initial,
  onSave,
  onClose,
}: Props) {
  const [form, setForm] = useState<ScheduleMemberInfoFormValues>({
    schedule_id: initial?.schedule_id ?? schedules[0]?.id ?? "",
    user_id: initial?.user_id ?? users[0]?.id ?? "",
    temp_group_id: initial?.temp_group_id ?? null,
    temp_role: initial?.temp_role ?? null,
    excused_reason: initial?.excused_reason ?? null,
    activity: initial?.activity ?? null,
    menu: initial?.menu ?? null,
    note: initial?.note ?? null,
  });

  const set = useCallback(
    <K extends keyof ScheduleMemberInfoFormValues>(
      k: K,
      v: ScheduleMemberInfoFormValues[K]
    ) => setForm((prev) => ({ ...prev, [k]: v })),
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      temp_group_id: form.temp_group_id || null,
      temp_role: form.temp_role || null,
      excused_reason: form.excused_reason?.trim() || null,
      activity: form.activity?.trim() || null,
      menu: form.menu?.trim() || null,
      note: form.note?.trim() || null,
    });
  };

  const isEdit = mode === "edit";
  // Checkpoint 2 수정: label-input htmlFor+id 연결로 KWCAG 3.3.2 준수
  const uid = useId();
  const ids = {
    schedule: `${uid}-schedule`,
    user: `${uid}-user`,
    tempGroup: `${uid}-temp-group`,
    tempRole: `${uid}-temp-role`,
    excused: `${uid}-excused`,
    activity: `${uid}-activity`,
    menu: `${uid}-menu`,
    note: `${uid}-note`,
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "인원별 배정 수정" : "인원별 배정 추가"}</DialogTitle>
          <DialogDescription className="sr-only">
            일정×참가자 메타데이터 (조이동/임시역할/제외/활동/메뉴/메모)
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
            <label htmlFor={ids.user} className="mb-1 block text-xs font-medium text-muted-foreground">참가자</label>
            <select
              id={ids.user}
              value={form.user_id}
              onChange={(e) => set("user_id", e.target.value)}
              className={INPUT_CLASS}
              disabled={isEdit}
              required
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={ids.tempGroup} className="mb-1 block text-xs font-medium text-muted-foreground">조 이동</label>
              <select
                id={ids.tempGroup}
                value={form.temp_group_id ?? ""}
                onChange={(e) => set("temp_group_id", e.target.value || null)}
                className={INPUT_CLASS}
              >
                <option value="">없음</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.tempRole} className="mb-1 block text-xs font-medium text-muted-foreground">임시 역할</label>
              <select
                id={ids.tempRole}
                value={form.temp_role ?? ""}
                onChange={(e) => set("temp_role", (e.target.value || null) as TempRole | null)}
                className={INPUT_CLASS}
              >
                <option value="">없음</option>
                <option value="leader">조장</option>
                <option value="member">조원</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={ids.excused} className="mb-1 block text-xs font-medium text-muted-foreground">제외 사유</label>
            <input
              id={ids.excused}
              value={form.excused_reason ?? ""}
              onChange={(e) => set("excused_reason", e.target.value)}
              placeholder="예: 숙소 휴식, 병원 동행"
              className={INPUT_CLASS}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={ids.activity} className="mb-1 block text-xs font-medium text-muted-foreground">활동</label>
              <input
                id={ids.activity}
                value={form.activity ?? ""}
                onChange={(e) => set("activity", e.target.value)}
                placeholder="예: 해먹, 족욕"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label htmlFor={ids.menu} className="mb-1 block text-xs font-medium text-muted-foreground">메뉴</label>
              <input
                id={ids.menu}
                value={form.menu ?? ""}
                onChange={(e) => set("menu", e.target.value)}
                placeholder="예: 채식, 알러지"
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div>
            <label htmlFor={ids.note} className="mb-1 block text-xs font-medium text-muted-foreground">메모</label>
            <textarea
              id={ids.note}
              value={form.note ?? ""}
              onChange={(e) => set("note", e.target.value)}
              placeholder="조장에게 전달할 특이사항"
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
