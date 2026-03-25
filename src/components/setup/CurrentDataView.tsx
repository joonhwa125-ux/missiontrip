"use client";

import { useState, useTransition } from "react";
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

  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, onSuccess: () => void) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) { setErrorMsg(result.error ?? "오류가 발생했어요"); return; }
      onSuccess();
      router.refresh();
    });
  };


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

      {/* 서브 탭 — DataSourceStep과 동일한 segment control */}
      <div role="tablist" aria-label="데이터 종류" className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
        {(["schedules", "users"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "min-h-11 flex-1 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-main-action",
              tab === t
                ? "bg-white font-bold shadow-sm"
                : "text-muted-foreground"
            )}
          >
            {t === "schedules" ? `일정 (${schedules.length}개)` : `참가자 (${users.length}명)`}
          </button>
        ))}
      </div>

      {/* 일정 테이블 */}
      {tab === "schedules" && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-center text-xs text-muted-foreground">
                <th className="min-w-[48px] px-3 py-2">일정</th>
                <th className="min-w-[36px] px-3 py-2">순서</th>
                <th className="min-w-[120px] px-3 py-2">장소</th>
                <th className="min-w-[160px] px-3 py-2">집결지</th>
                <th className="min-w-[56px] px-3 py-2">예정 시간</th>
                <th className="min-w-[48px] px-3 py-2">구분</th>
                <th className="min-w-[108px] px-3 py-2">데이터 관리</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">등록된 일정이 없어요</td></tr>
              )}
              {schedules.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-center">{s.day_number}일</td>
                  <td className="px-3 py-2 text-center">{s.sort_order}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.location ?? "-"}</td>
                  <td className="px-3 py-2">{s.title}</td>
                  <td className="px-3 py-2 text-center text-xs">{s.scheduled_time ? formatTime(s.scheduled_time) : "-"}</td>
                  <td className="px-3 py-2 text-center text-xs">{SCOPE_LABEL[s.scope]}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-start gap-1">
                      <button onClick={() => setEditSchedule(s)} className="min-h-11 rounded-lg bg-gray-100 px-2 text-xs font-medium focus-visible:ring-2 focus-visible:ring-main-action" aria-label={`${s.title} 수정`}>수정</button>
                      <button onClick={() => setDeleteScheduleTarget(s)} disabled={s.is_active} className="min-h-11 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-600 focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-40" aria-label={s.is_active ? `${s.title} 진행중 — 삭제 불가` : `${s.title} 삭제`}>삭제</button>
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
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-center text-xs text-muted-foreground">
                <th className="sticky left-0 z-10 min-w-[96px] bg-gray-50 px-3 py-2">이름</th>
                <th className="min-w-[110px] px-3 py-2">전화번호</th>
                <th className="min-w-[80px] px-3 py-2">역할</th>
                <th className="min-w-[96px] px-3 py-2">조편성</th>
                <th className="min-w-[64px] px-3 py-2">구분</th>
                <th className="min-w-[108px] px-3 py-2">데이터 관리</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">등록된 참가자가 없어요</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium shadow-[1px_0_0_0_#e5e7eb]">{u.name}</td>
                  <td className="px-3 py-2 text-xs">{u.phone ?? "-"}</td>
                  <td className="px-3 py-2 text-center text-xs">{ROLE_LABEL[u.role]}</td>
                  <td className="px-3 py-2 text-center text-xs">{groupMap.get(u.group_id) ?? "-"}</td>
                  <td className="px-3 py-2 text-center text-xs">{getPartyLabel(u.party)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-start gap-1">
                      <button onClick={() => setEditUser(u)} className="min-h-11 rounded-lg bg-gray-100 px-2 text-xs font-medium focus-visible:ring-2 focus-visible:ring-main-action" aria-label={`${u.name} 수정`}>수정</button>
                      <button onClick={() => setDeleteUserTarget(u)} disabled={u.id === currentUserId} className="min-h-11 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-600 focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-40" aria-label={u.id === currentUserId ? "본인 계정 — 삭제 불가" : `${u.name} 삭제`}>삭제</button>
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
              &ldquo;{deleteScheduleTarget?.title}&rdquo; 일정이 삭제됩니다.
              이 일정의 체크인 기록도 함께 삭제될 수 있어요.
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
              {deleteUserTarget?.name}님이 삭제됩니다.
              이 참가자의 체크인 기록도 함께 삭제될 수 있어요.
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
