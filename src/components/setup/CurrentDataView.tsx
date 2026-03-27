"use client";

import { useState, useTransition, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { updateSchedule, deleteSchedule, updateUser, deleteUser } from "@/actions/setup";
import { formatTime, cn } from "@/lib/utils";
import { SCOPE_LABEL, ROLE_LABEL, getPartyLabel } from "@/lib/constants";
import ScheduleEditDialog from "./ScheduleEditDialog";
import UserEditDialog from "./UserEditDialog";
import type { Schedule, UserRole, GroupParty } from "@/lib/types";

type SetupUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  group_id: string;
  party: GroupParty | null;
};

type SetupGroup = { id: string; name: string; bus_name: string | null };

interface Props {
  schedules: Schedule[];
  users: SetupUser[];
  groups: SetupGroup[];
  currentUserId: string;
}

export default function CurrentDataView({ schedules, users, groups, currentUserId }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<"schedules" | "users">("schedules");
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null);
  const [editUser, setEditUser] = useState<SetupUser | null>(null);
  const [deleteScheduleTarget, setDeleteScheduleTarget] = useState<Schedule | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<SetupUser | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  const run = useCallback(
    (action: () => Promise<{ ok: boolean; error?: string }>, onSuccess: () => void) => {
      startTransition(async () => {
        const result = await action();
        if (!result.ok) { setErrorMsg(result.error ?? "오류가 발생했어요"); return; }
        onSuccess();
        router.refresh();
      });
    },
    [router]
  );


  return (
    <div className="px-4 py-4">
      {/* 에러 배너 */}
      {errorMsg && (
        <div role="alert" className="mb-3 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="ml-3 min-h-11 min-w-11 rounded-lg focus-visible:ring-2 focus-visible:ring-red-400"
            aria-label="오류 닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* 서브 탭 — 세그먼트 컨트롤 스타일 */}
      <div role="tablist" aria-label="데이터 종류" className="mb-5 flex gap-1 rounded-xl bg-stone-100 p-1">
        {(["schedules", "users"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "min-h-11 flex-1 rounded-lg text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-main-action",
              tab === t
                ? "bg-white font-bold text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            )}
          >
            {t === "schedules" ? `일정 (${schedules.length}개)` : `참가자 (${users.length}명)`}
          </button>
        ))}
      </div>

      {/* 일정 테이블 */}
      {tab === "schedules" && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr className="text-center text-xs font-semibold text-stone-600">
                <th className="min-w-[48px] px-3 py-3">일정</th>
                <th className="min-w-[36px] px-3 py-3">순서</th>
                <th className="min-w-[120px] px-3 py-3 text-left">장소</th>
                <th className="min-w-[160px] px-3 py-3 text-left">집결지</th>
                <th className="min-w-[56px] px-3 py-3">예정 시간</th>
                <th className="min-w-[48px] px-3 py-3">구분</th>
                <th className="min-w-[108px] px-3 py-3">편집</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {schedules.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-stone-500">등록된 일정이 없어요</td></tr>
              )}
              {schedules.map((s) => (
                <tr key={s.id} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-3 py-3 text-center font-medium text-stone-700">{s.day_number}일</td>
                  <td className="px-3 py-3 text-center text-stone-500">{s.sort_order}</td>
                  <td className="px-3 py-3 text-stone-700 font-medium">{s.location ?? "-"}</td>
                  <td className="px-3 py-3 text-stone-600">{s.title}</td>
                  <td className="px-3 py-3 text-center text-xs text-stone-500">{s.scheduled_time ? formatTime(s.scheduled_time) : "-"}</td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">{SCOPE_LABEL[s.scope]}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-start gap-1.5">
                      <button onClick={() => setEditSchedule(s)} className="min-h-10 rounded-lg bg-stone-100 px-3 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-main-action" aria-label={`${s.title} 수정`}>수정</button>
                      <button onClick={() => setDeleteScheduleTarget(s)} disabled={s.is_active} className="min-h-10 rounded-lg bg-white border border-red-200 px-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-40" aria-label={s.is_active ? `${s.title} 진행중 — 삭제 불가` : `${s.title} 삭제`}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 참가자 테이블 */}
      {tab === "users" && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr className="text-center text-xs font-semibold text-stone-600">
                <th className="sticky left-0 z-10 min-w-[96px] bg-stone-50 px-3 py-3 text-left">이름</th>
                <th className="min-w-[110px] px-3 py-3">전화번호</th>
                <th className="min-w-[80px] px-3 py-3">역할</th>
                <th className="min-w-[96px] px-3 py-3">조편성</th>
                <th className="min-w-[64px] px-3 py-3">구분</th>
                <th className="min-w-[108px] px-3 py-3">편집</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-stone-500">등록된 참가자가 없어요</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-stone-50/50 transition-colors">
                  <td className="sticky left-0 z-10 bg-white px-3 py-3 font-semibold text-stone-800 shadow-[1px_0_0_0_#e7e5e4]">{u.name}</td>
                  <td className="px-3 py-3 text-center text-xs text-stone-600">{u.phone ?? "-"}</td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">{ROLE_LABEL[u.role]}</span>
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-stone-600">{groupMap.get(u.group_id) ?? "-"}</td>
                  <td className="px-3 py-3 text-center">
                    <span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">{getPartyLabel(u.party)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-start gap-1.5">
                      <button onClick={() => setEditUser(u)} className="min-h-10 rounded-lg bg-stone-100 px-3 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-main-action" aria-label={`${u.name} 수정`}>수정</button>
                      <button onClick={() => setDeleteUserTarget(u)} disabled={u.id === currentUserId} className="min-h-10 rounded-lg bg-white border border-red-200 px-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-40" aria-label={u.id === currentUserId ? "본인 계정 — 삭제 불가" : `${u.name} 삭제`}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 일정 수정 모달 */}
      {editSchedule && (
        <ScheduleEditDialog
          schedule={editSchedule}
          onSave={(data) => run(() => updateSchedule(editSchedule.id, data), () => setEditSchedule(null))}
          onClose={() => setEditSchedule(null)}
        />
      )}

      {/* 참가자 수정 모달 */}
      {editUser && (
        <UserEditDialog
          user={editUser}
          groups={groups}
          onSave={(data) => run(() => updateUser(editUser.id, data), () => setEditUser(null))}
          onClose={() => setEditUser(null)}
        />
      )}

      {/* 일정 삭제 확인 */}
      <Dialog open={!!deleteScheduleTarget} onOpenChange={(o) => !o && setDeleteScheduleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>일정을 삭제할까요?</DialogTitle>
            <DialogDescription>
              인원 확인 기록도 함께 삭제돼요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-main-action">취소</button>
            </DialogClose>
            <button
              onClick={() => run(() => deleteSchedule(deleteScheduleTarget!.id), () => setDeleteScheduleTarget(null))}
              className="min-h-11 rounded-xl bg-red-500 px-4 text-sm font-bold text-white focus-visible:ring-2 focus-visible:ring-red-400"
            >
              삭제
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 참가자 삭제 확인 */}
      <Dialog open={!!deleteUserTarget} onOpenChange={(o) => !o && setDeleteUserTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>참가자를 삭제할까요?</DialogTitle>
            <DialogDescription>
              인원 확인 기록도 함께 삭제돼요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-main-action">취소</button>
            </DialogClose>
            <button
              onClick={() => run(() => deleteUser(deleteUserTarget!.id), () => setDeleteUserTarget(null))}
              className="min-h-11 rounded-xl bg-red-500 px-4 text-sm font-bold text-white focus-visible:ring-2 focus-visible:ring-red-400"
            >
              삭제
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
