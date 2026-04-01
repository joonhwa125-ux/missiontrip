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
import { SCOPE_LABEL, ROLE_LABEL, getPartyLabel, CHANNEL_GLOBAL, EVENT_MEMBER_UPDATED } from "@/lib/constants";
import { useBroadcast } from "@/hooks/useRealtime";
import { useToast } from "@/hooks/useToast";
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
  shuttle_bus: string | null;
  return_shuttle_bus: string | null;
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
  const { broadcast } = useBroadcast();
  const [tab, setTab] = useState<"schedules" | "users">("schedules");
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null);
  const [editUser, setEditUser] = useState<SetupUser | null>(null);
  const [deleteScheduleTarget, setDeleteScheduleTarget] = useState<Schedule | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<SetupUser | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const groupBusMap = useMemo(() => new Map(groups.map((g) => [g.id, g.bus_name])), [groups]);

  const run = useCallback(
    (action: () => Promise<{ ok: boolean; error?: string }>, onSuccess: () => void, successText?: string, afterSuccess?: () => Promise<void>) => {
      startTransition(async () => {
        const result = await action();
        if (!result.ok) { setErrorMsg(result.error ?? "오류가 발생했어요"); return; }
        setErrorMsg(null);
        if (successText) { showToast(successText); }
        onSuccess();
        router.refresh();
        await afterSuccess?.();
      });
    },
    [router, showToast]
  );

  // 참가자 편집/삭제 후 admin/leader 뷰에 멤버 변경 알림
  const broadcastMemberUpdate = useCallback(
    () => broadcast(CHANNEL_GLOBAL, EVENT_MEMBER_UPDATED, {}),
    [broadcast]
  );


  return (
    <div className="px-4 py-4">
      {/* 에러 배너 */}
      {errorMsg && (
        <div role="alert" className="mb-3 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="ml-3 min-h-11 min-w-11 rounded-lg"
            aria-label="오류 닫기"
          >
            ✕
          </button>
        </div>
      )}
      {/* 토스트 — 메인 뷰와 동일 스타일 */}
      {toast && (
        <div
          className="fixed bottom-[max(5rem,calc(3.5rem+env(safe-area-inset-bottom)))] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-xl bg-gray-900 px-4 py-3 text-center text-sm text-white shadow-lg">
            {toast}
          </div>
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
              "min-h-11 flex-1 rounded-lg text-sm font-medium transition-colors",
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
          <table className="min-w-[600px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-center text-xs text-muted-foreground whitespace-nowrap">
                <th className="min-w-[40px] px-2 py-2">일차</th>
                <th className="min-w-[40px] px-2 py-2">순서</th>
                <th className="min-w-[72px] px-2 py-2">장소</th>
                <th className="min-w-[88px] px-2 py-2">집결지</th>
                <th className="min-w-[48px] px-2 py-2">시간</th>
                <th className="min-w-[40px] px-2 py-2">구분</th>
                <th className="min-w-[40px] px-2 py-2">셔틀</th>
                <th className="min-w-[92px] px-2 py-2">편집</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">등록된 일정이 없어요</td></tr>
              )}
              {schedules.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-2 py-2 text-center">{s.day_number}일</td>
                  <td className="px-2 py-2 text-center">{s.sort_order}</td>
                  <td className="px-2 py-2 text-muted-foreground">{s.location ?? "-"}</td>
                  <td className="px-2 py-2">{s.title}</td>
                  <td className="px-2 py-2 text-center text-xs">{s.scheduled_time ? formatTime(s.scheduled_time) : "-"}</td>
                  <td className="px-2 py-2 text-center text-xs">{SCOPE_LABEL[s.scope]}</td>
                  <td className="px-2 py-2 text-center text-xs">{s.shuttle_type === "departure" ? "출발" : s.shuttle_type === "return" ? "귀가" : "-"}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-center gap-1 whitespace-nowrap">
                      <button onClick={() => setEditSchedule(s)} className="min-h-11 rounded-lg bg-gray-100 px-2 text-xs font-medium" aria-label={`${s.title} 수정`}>수정</button>
                      <button onClick={() => setDeleteScheduleTarget(s)} disabled={s.is_active} className="min-h-11 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-600 disabled:opacity-40" aria-label={s.is_active ? `${s.title} 진행중 — 삭제 불가` : `${s.title} 삭제`}>삭제</button>
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
          <table className="min-w-[780px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-center text-xs text-muted-foreground whitespace-nowrap">
                <th className="min-w-[52px] px-2 py-2">이름</th>
                <th className="min-w-[88px] px-2 py-2">전화번호</th>
                <th className="min-w-[44px] px-2 py-2">역할</th>
                <th className="min-w-[56px] px-2 py-2">조편성</th>
                <th className="min-w-[64px] px-2 py-2">배정차량</th>
                <th className="min-w-[40px] px-2 py-2">구분</th>
                <th className="min-w-[72px] px-2 py-2">출발셔틀</th>
                <th className="min-w-[72px] px-2 py-2">귀가셔틀</th>
                <th className="min-w-[92px] px-2 py-2">편집</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">등록된 참가자가 없어요</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-2 py-2 font-medium">{u.name}</td>
                  <td className="px-2 py-2 text-xs">{u.phone ?? "-"}</td>
                  <td className="px-2 py-2 text-center text-xs">{ROLE_LABEL[u.role]}</td>
                  <td className="px-2 py-2 text-center text-xs">{groupMap.get(u.group_id) ?? "-"}</td>
                  <td className="px-2 py-2 text-center text-xs">{groupBusMap.get(u.group_id) ?? "-"}</td>
                  <td className="px-2 py-2 text-center text-xs">{getPartyLabel(u.party)}</td>
                  <td className="px-2 py-2 text-center text-xs">{u.shuttle_bus ?? "-"}</td>
                  <td className="px-2 py-2 text-center text-xs">{u.return_shuttle_bus ?? "-"}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-center gap-1 whitespace-nowrap">
                      <button onClick={() => setEditUser(u)} className="min-h-11 rounded-lg bg-gray-100 px-2 text-xs font-medium" aria-label={`${u.name} 수정`}>수정</button>
                      <button onClick={() => setDeleteUserTarget(u)} disabled={u.id === currentUserId} className="min-h-11 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-600 disabled:opacity-40" aria-label={u.id === currentUserId ? "본인 계정 — 삭제 불가" : `${u.name} 삭제`}>삭제</button>
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
          onSave={(data) => run(() => updateSchedule(editSchedule.id, data), () => setEditSchedule(null), "수정이 완료됐어요")}
          onClose={() => setEditSchedule(null)}
        />
      )}

      {/* 참가자 수정 모달 */}
      {editUser && (
        <UserEditDialog
          user={editUser}
          groups={groups}
          onSave={(data) => {
            const roleChanged = data.role !== editUser.role;
            const msg = roleChanged
              ? `${editUser.name}님의 역할이 ${ROLE_LABEL[data.role]}(으)로 변경되었어요`
              : "수정이 완료됐어요";
            run(() => updateUser(editUser.id, data), () => setEditUser(null), msg, broadcastMemberUpdate);
          }}
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
              <button className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium">취소</button>
            </DialogClose>
            <button
              onClick={() => run(() => deleteSchedule(deleteScheduleTarget!.id), () => setDeleteScheduleTarget(null), "삭제가 완료됐어요")}
              className="min-h-11 rounded-xl bg-red-500 px-4 text-sm font-bold text-white"
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
              <button className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium">취소</button>
            </DialogClose>
            <button
              onClick={() => run(() => deleteUser(deleteUserTarget!.id), () => setDeleteUserTarget(null), "삭제가 완료됐어요", broadcastMemberUpdate)}
              className="min-h-11 rounded-xl bg-red-500 px-4 text-sm font-bold text-white"
            >
              삭제
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
