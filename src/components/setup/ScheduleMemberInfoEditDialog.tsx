"use client";

import { useCallback, useId, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { isLeaderRole } from "@/lib/constants";
import type { Schedule, TempRole, UserRole, ScheduleMemberInfo } from "@/lib/types";

interface SimpleUser {
  id: string;
  name: string;
  group_id: string;
  /** Phase J+: 원래 조에 다른 영구 조장 있는지 판별용 */
  role?: UserRole;
}

interface SimpleGroup {
  id: string;
  name: string;
  bus_name?: string | null;
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
  /** Phase J+: 조 이동 + 임시 조장 지정 시 원래 조의 대체 임시 조장 user_id (optional) */
  replacement_leader_user_id?: string | null;
}

interface Props {
  mode: "create" | "edit";
  schedules: Schedule[];
  users: SimpleUser[];
  groups: SimpleGroup[];
  /** Phase J+: 이 일정의 기존 smi — 대체 조장의 기존 필드 보존 + 이미 있는 조장 판별 */
  memberInfos: ScheduleMemberInfo[];
  initial?: ScheduleMemberInfoFormValues;
  onSave: (values: ScheduleMemberInfoFormValues) => void;
  onClose: () => void;
}

const INPUT_CLASS =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm";

function scheduleLabel(s: Schedule): string {
  // 장소 우선 표시 (PRD 4.2.1 카드 계층과 일관), 없으면 집결지 fallback
  return `${s.day_number}-${s.sort_order} · ${s.location ?? s.title}`;
}

export default function ScheduleMemberInfoEditDialog({
  mode,
  schedules,
  users,
  groups,
  memberInfos,
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
    replacement_leader_user_id: initial?.replacement_leader_user_id ?? null,
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
      // 대체 조장은 이동+조장 조건일 때만 유효
      replacement_leader_user_id: showReplacementSection
        ? form.replacement_leader_user_id || null
        : null,
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
    replacement: `${uid}-replacement`,
  };

  // Phase J+: 대체 조장 지정 관련 계산
  //  - 조건: 이동자의 원래 조(users.group_id)가 temp_group_id와 다를 때
  //          AND temp_role === 'leader' (조장 권한을 가져감)
  //          → 원래 조에 조장 공백 위험
  const selectedUser = useMemo(
    () => users.find((u) => u.id === form.user_id),
    [users, form.user_id]
  );
  const originalGroupId = selectedUser?.group_id ?? null;
  const isTransferringAsLeader =
    form.temp_role === "leader" &&
    !!form.temp_group_id &&
    !!originalGroupId &&
    form.temp_group_id !== originalGroupId;

  // 원래 조의 다른 영구 조장(role=leader/admin_leader)
  const originalGroupOtherPermanentLeaders = useMemo(() => {
    if (!originalGroupId || !selectedUser) return [];
    return users.filter(
      (u) =>
        u.group_id === originalGroupId &&
        u.id !== selectedUser.id &&
        u.role &&
        isLeaderRole(u.role)
    );
  }, [users, originalGroupId, selectedUser]);

  // 원래 조에 이미 이 일정의 임시 조장이 지정된 다른 사람이 있는지
  const existingTempLeaderInOriginal = useMemo(() => {
    if (!originalGroupId || !selectedUser) return null;
    const smi = memberInfos.find(
      (s) =>
        s.schedule_id === form.schedule_id &&
        s.temp_role === "leader" &&
        s.user_id !== selectedUser.id &&
        // temp_group_id가 없거나 원래 조면 그 조의 임시 조장
        (s.temp_group_id === null || s.temp_group_id === originalGroupId) &&
        // 해당 사용자의 원래 조가 이 조여야 함
        users.find((u) => u.id === s.user_id)?.group_id === originalGroupId
    );
    return smi ? users.find((u) => u.id === smi.user_id) ?? null : null;
  }, [memberInfos, originalGroupId, selectedUser, form.schedule_id, users]);

  // 대체 조장 후보: 원래 조의 다른 조원 (본인 제외 / 이미 다른 조로 이동 / 독립 배정 보유자 제외)
  //
  // 독립 배정(caused_by_smi_id IS NULL) 보유자를 제외하는 이유:
  //   대체 조장으로 upsert하면 기존 행의 caused_by_smi_id를 이 메인에 연결하게 되어,
  //   메인 삭제 시 DB CASCADE가 그 사용자의 기존 독립 배정(예: 제외/활동)까지
  //   함께 삭제하는 데이터 손실 위험이 있음. 먼저 기존 배정을 정리한 뒤 재선택하도록 유도.
  const replacementCandidates = useMemo(() => {
    if (!originalGroupId || !selectedUser) return [];
    const movingOutIds = new Set(
      memberInfos
        .filter(
          (s) =>
            s.schedule_id === form.schedule_id &&
            s.temp_group_id &&
            s.temp_group_id !== originalGroupId
        )
        .map((s) => s.user_id)
    );
    // 이 일정에 독립 배정(부모 없음)을 가진 사용자들
    // 단, 이미 이 메인의 자식인 경우(이전에 이 메인이 생성한 대체 조장)는 재선택 허용
    const conflictingIndependentIds = new Set(
      memberInfos
        .filter(
          (s) =>
            s.schedule_id === form.schedule_id &&
            s.caused_by_smi_id === null &&
            s.user_id !== selectedUser.id
        )
        .map((s) => s.user_id)
    );
    return users.filter(
      (u) =>
        u.group_id === originalGroupId &&
        u.id !== selectedUser.id &&
        !movingOutIds.has(u.id) &&
        !conflictingIndependentIds.has(u.id)
    );
  }, [users, originalGroupId, selectedUser, memberInfos, form.schedule_id]);

  const originalGroupName = useMemo(
    () => groups.find((g) => g.id === originalGroupId)?.name ?? "원래 조",
    [groups, originalGroupId]
  );

  // 경고 표시 조건: 이동자가 조장 권한을 가져가는데 원래 조에 남는 조장이 없음
  const showReplacementSection =
    isTransferringAsLeader &&
    originalGroupOtherPermanentLeaders.length === 0 &&
    !existingTempLeaderInOriginal;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "개인 안내 수정" : "개인 안내 추가"}</DialogTitle>
          <DialogDescription className="sr-only">
            일정별 참가자 특이사항 (조이동/임시역할/미참여/활동/메뉴/메모)
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
            <label htmlFor={ids.excused} className="mb-1 block text-xs font-medium text-muted-foreground">미참여 사유</label>
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

          {/* Phase J+: 원래 조 조장 공백 방지 */}
          {/* 조장 공백 경고만 노출. 남는 조장 있을 때 알리는 초록 배너는 노이즈로 제거됨.
              드롭다운/경고 미노출 = "조치 불필요"로 관리자에게 자연스럽게 전달. */}
          {showReplacementSection && (
            <div
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5"
              role="alert"
            >
              <p className="mb-1 text-xs font-semibold text-amber-900">
                ⚠️ {originalGroupName} 조의 조장이 공백이 돼요
              </p>
              <p className="mb-2 text-xs text-amber-800">
                원래 조에서 조장 역할을 대신할 조원을 지정해주세요.
              </p>
              <label
                htmlFor={ids.replacement}
                className="mb-1 block text-xs font-medium text-amber-900"
              >
                대체 임시 조장
              </label>
              <select
                id={ids.replacement}
                value={form.replacement_leader_user_id ?? ""}
                onChange={(e) =>
                  set("replacement_leader_user_id", e.target.value || null)
                }
                className={INPUT_CLASS}
              >
                <option value="">(없음 — 공백 감수)</option>
                {replacementCandidates.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              {replacementCandidates.length === 0 && (
                <p className="mt-1 text-[0.6875rem] text-amber-700">
                  {originalGroupName}에 지정 가능한 다른 조원이 없어요.
                </p>
              )}
            </div>
          )}
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
