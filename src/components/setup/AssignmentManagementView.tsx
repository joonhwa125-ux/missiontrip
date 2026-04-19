"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlusIcon } from "@/components/ui/icons";
import UndoSnackbar from "@/components/common/UndoSnackbar";
import ScheduleGroupInfoEditDialog, {
  type ScheduleGroupInfoFormValues,
} from "./ScheduleGroupInfoEditDialog";
import ScheduleMemberInfoEditDialog, {
  type ScheduleMemberInfoFormValues,
} from "./ScheduleMemberInfoEditDialog";
import {
  updateScheduleGroupInfo,
  deleteScheduleGroupInfo,
  updateScheduleMemberInfo,
  deleteScheduleMemberInfo,
} from "@/actions/setup";
import { useBroadcast } from "@/hooks/useRealtime";
import { CHANNEL_GLOBAL, EVENT_MEMBER_UPDATED } from "@/lib/constants";
import type {
  Schedule,
  ScheduleGroupInfo,
  ScheduleMemberInfo,
} from "@/lib/types";

interface SimpleGroup {
  id: string;
  name: string;
  bus_name?: string | null;
}

interface SimpleUser {
  id: string;
  name: string;
  group_id: string;
  /** Phase J+: 대체 조장 계산 시 원래 조에 영구 조장이 있는지 판별용 */
  role?: import("@/lib/types").UserRole;
}

export type AssignmentSection = "group_info" | "member_info";

interface Props {
  section: AssignmentSection;
  schedules: Schedule[];
  groups: SimpleGroup[];
  users: SimpleUser[];
  groupInfos: ScheduleGroupInfo[];
  memberInfos: ScheduleMemberInfo[];
}

interface UndoState {
  message: string;
  restore: () => Promise<void>;
}

function scheduleLabel(s: Schedule): string {
  return `${s.day_number}-${s.sort_order} · ${s.title}`;
}

export default function AssignmentManagementView({
  section,
  schedules,
  groups,
  users,
  groupInfos,
  memberInfos,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { broadcast } = useBroadcast();

  // Phase H: 배정 CRUD 후 조장/관리자 페이지에 "member_updated" 실시간 전파.
  //          GroupView는 fetchLatestBriefing + router.refresh 병행 처리(0-flash),
  //          AdminView는 router.refresh로 현황 갱신.
  const broadcastMemberUpdate = useCallback(() => {
    // 실패해도 UI 흐름엔 영향 없음 — 로그만 조용히 소실
    void broadcast(CHANNEL_GLOBAL, EVENT_MEMBER_UPDATED, {});
  }, [broadcast]);

  // 다이얼로그 상태
  const [sgiDialog, setSgiDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; id: string; initial: ScheduleGroupInfoFormValues }
    | null
  >(null);
  const [smiDialog, setSmiDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; id: string; initial: ScheduleMemberInfoFormValues }
    | null
  >(null);

  const [deleteSgiId, setDeleteSgiId] = useState<string | null>(null);
  const [deleteSmiId, setDeleteSmiId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);

  // 조회용 맵 — 테이블 렌더링에서 이름 조회
  const scheduleMap = useMemo(
    () => new Map(schedules.map((s) => [s.id, s])),
    [schedules]
  );
  const groupMap = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups]
  );
  const userMap = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users]
  );

  // 일정 ↑ 일차/순서, 조/이름 순 정렬
  const sortedGroupInfos = useMemo(() => {
    return [...groupInfos].sort((a, b) => {
      const sa = scheduleMap.get(a.schedule_id);
      const sb = scheduleMap.get(b.schedule_id);
      const dayDiff = (sa?.day_number ?? 0) - (sb?.day_number ?? 0);
      if (dayDiff !== 0) return dayDiff;
      const orderDiff = (sa?.sort_order ?? 0) - (sb?.sort_order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      const ga = groupMap.get(a.group_id)?.name ?? "";
      const gb = groupMap.get(b.group_id)?.name ?? "";
      return ga.localeCompare(gb, "ko");
    });
  }, [groupInfos, scheduleMap, groupMap]);

  const sortedMemberInfos = useMemo(() => {
    return [...memberInfos].sort((a, b) => {
      const sa = scheduleMap.get(a.schedule_id);
      const sb = scheduleMap.get(b.schedule_id);
      const dayDiff = (sa?.day_number ?? 0) - (sb?.day_number ?? 0);
      if (dayDiff !== 0) return dayDiff;
      const orderDiff = (sa?.sort_order ?? 0) - (sb?.sort_order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      const ua = userMap.get(a.user_id)?.name ?? "";
      const ub = userMap.get(b.user_id)?.name ?? "";
      return ua.localeCompare(ub, "ko");
    });
  }, [memberInfos, scheduleMap, userMap]);

  // 공통 실행 헬퍼 — startTransition + 에러 처리 + refresh + member_updated broadcast
  // Phase H: 성공 시 자동으로 broadcastMemberUpdate 호출 → 조장/관리자 페이지 실시간 반영
  const run = useCallback(
    (
      action: () => Promise<{ ok: boolean; error?: string }>,
      onSuccess?: () => void
    ) => {
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          setErrorMsg(result.error ?? "오류가 발생했어요");
          return;
        }
        setErrorMsg(null);
        onSuccess?.();
        router.refresh();
        broadcastMemberUpdate();
      });
    },
    [router, broadcastMemberUpdate]
  );

  // ==========================================================================
  // SGI (조별) 핸들러
  // ==========================================================================
  const handleSgiSave = (values: ScheduleGroupInfoFormValues) => {
    const existingId =
      sgiDialog?.mode === "edit" ? sgiDialog.id : null;
    run(
      () =>
        updateScheduleGroupInfo(
          values.schedule_id,
          values.group_id,
          {
            group_location: values.group_location,
            note: values.note,
          },
          existingId
        ),
      () => setSgiDialog(null)
    );
  };

  const confirmDeleteSgi = () => {
    const target = groupInfos.find((g) => g.id === deleteSgiId);
    if (!target) {
      setDeleteSgiId(null);
      return;
    }
    // Undo용 스냅샷 (되돌리기 시 그대로 upsert)
    const restorePayload: ScheduleGroupInfoFormValues = {
      schedule_id: target.schedule_id,
      group_id: target.group_id,
      group_location: target.group_location,
      note: target.note,
    };
    const scheduleName =
      scheduleMap.get(target.schedule_id)?.title ?? "일정";
    const groupName = groupMap.get(target.group_id)?.name ?? "조";

    run(
      () => deleteScheduleGroupInfo(target.id),
      () => {
        setDeleteSgiId(null);
        setUndo({
          message: `${groupName} · ${scheduleName} 조 브리핑을 삭제했어요`,
          restore: async () => {
            const res = await updateScheduleGroupInfo(
              restorePayload.schedule_id,
              restorePayload.group_id,
              {
                group_location: restorePayload.group_location,
                note: restorePayload.note,
              }
            );
            if (!res.ok) {
              setErrorMsg(res.error ?? "되돌리기에 실패했어요");
            } else {
              router.refresh();
              broadcastMemberUpdate();
            }
          },
        });
      }
    );
  };

  // ==========================================================================
  // SMI (인원별) 핸들러
  // ==========================================================================
  // Phase J+: 2-step save + 부모-자식 연결 (caused_by_smi_id)
  //   Step 1) 메인 smi 저장, 반환된 id를 부모 id로 획득
  //   Step 2) 기존 자식(이 메인이 생성한) 중 새 대체 조장과 다른 행은 삭제.
  //           DB CASCADE가 메인 삭제 시 자식 자동 삭제를 보장하므로, UI 레벨에서는
  //           "메인 편집 시 자식 정리"만 처리하면 됨.
  //   Step 3) 새 대체 조장 지정 시 upsert (caused_by_smi_id = 메인 id).
  //           user_id가 기존 자식과 같으면 update, 다르면 새 row.
  const handleSmiSave = (values: ScheduleMemberInfoFormValues) => {
    const existingId = smiDialog?.mode === "edit" ? smiDialog.id : null;
    startTransition(async () => {
      // Step 1: 메인 smi 저장
      const mainResult = await updateScheduleMemberInfo(
        values.schedule_id,
        values.user_id,
        {
          temp_group_id: values.temp_group_id,
          temp_role: values.temp_role,
          excused_reason: values.excused_reason,
          activity: values.activity,
          menu: values.menu,
          note: values.note,
          // 본인은 최상위 독립 배정 (자식이 아님)
          caused_by_smi_id: null,
        },
        existingId
      );
      if (!mainResult.ok) {
        setErrorMsg(mainResult.error ?? "오류가 발생했어요");
        return;
      }
      const mainSmiId = mainResult.data?.id;
      if (!mainSmiId) {
        setErrorMsg("배정 id를 가져오지 못했어요");
        return;
      }

      // Step 2: 편집 시 기존 자식 정리 — 새 대체 조장과 다른 자식 row는 삭제.
      // 각 삭제 결과를 확인하여 부분 실패 시 즉시 중단 + 사용자 안내 (일관성 유지).
      if (existingId) {
        const existingChildren = memberInfos.filter(
          (s) => s.caused_by_smi_id === mainSmiId
        );
        for (const child of existingChildren) {
          // 새 대체 조장이 이 자식과 동일 user면 유지 (아래에서 update)
          if (child.user_id === values.replacement_leader_user_id) continue;
          const deleteResult = await deleteScheduleMemberInfo(child.id);
          if (!deleteResult.ok) {
            setErrorMsg(
              `기존 대체 조장 정리 중 오류: ${deleteResult.error ?? "알 수 없는 오류"}. 개인 안내 탭에서 수동으로 확인해주세요.`
            );
            router.refresh();
            broadcastMemberUpdate();
            return;
          }
        }
      }

      // Step 3: 대체 조장 지정 시 upsert
      if (values.replacement_leader_user_id) {
        const existingReplacement = memberInfos.find(
          (s) =>
            s.schedule_id === values.schedule_id &&
            s.user_id === values.replacement_leader_user_id
        );
        const replacementResult = await updateScheduleMemberInfo(
          values.schedule_id,
          values.replacement_leader_user_id,
          {
            // 기존 필드는 보존, temp_role만 leader로 설정, caused_by로 부모 연결
            temp_group_id: existingReplacement?.temp_group_id ?? null,
            temp_role: "leader",
            excused_reason: existingReplacement?.excused_reason ?? null,
            activity: existingReplacement?.activity ?? null,
            menu: existingReplacement?.menu ?? null,
            note: existingReplacement?.note ?? null,
            caused_by_smi_id: mainSmiId,
          },
          existingReplacement?.id
        );
        if (!replacementResult.ok) {
          setErrorMsg(
            `이동자 배정은 저장됐지만 대체 조장 지정 실패: ${replacementResult.error ?? "알 수 없는 오류"}. 개인 안내 탭에서 수동으로 추가해주세요.`
          );
          router.refresh();
          broadcastMemberUpdate();
          return;
        }
      }

      setErrorMsg(null);
      setSmiDialog(null);
      router.refresh();
      broadcastMemberUpdate();
    });
  };

  const confirmDeleteSmi = () => {
    const target = memberInfos.find((m) => m.id === deleteSmiId);
    if (!target) {
      setDeleteSmiId(null);
      return;
    }
    // Phase J+: 자식 row(CASCADE로 같이 삭제될) 스냅샷 — Undo 복구용
    const childSnapshots = memberInfos.filter(
      (s) => s.caused_by_smi_id === target.id
    );
    const restorePayload = {
      schedule_id: target.schedule_id,
      user_id: target.user_id,
      temp_group_id: target.temp_group_id,
      temp_role: target.temp_role,
      excused_reason: target.excused_reason,
      activity: target.activity,
      menu: target.menu,
      note: target.note,
      // 원래 부모 관계도 보존 (이 target이 다른 배정의 자식이었다면)
      caused_by_smi_id: target.caused_by_smi_id,
    };
    const userName = userMap.get(target.user_id)?.name ?? "참가자";
    const scheduleName =
      scheduleMap.get(target.schedule_id)?.title ?? "일정";

    run(
      () => deleteScheduleMemberInfo(target.id),
      () => {
        setDeleteSmiId(null);
        const childCount = childSnapshots.length;
        setUndo({
          message:
            childCount > 0
              ? `${userName} · ${scheduleName} 개인 안내 + 대체 조장 ${childCount}건 삭제됨`
              : `${userName} · ${scheduleName} 개인 안내를 삭제했어요`,
          restore: async () => {
            // 1. 메인 복구 (부모 관계도 보존)
            const mainRes = await updateScheduleMemberInfo(
              restorePayload.schedule_id,
              restorePayload.user_id,
              {
                temp_group_id: restorePayload.temp_group_id,
                temp_role: restorePayload.temp_role,
                excused_reason: restorePayload.excused_reason,
                activity: restorePayload.activity,
                menu: restorePayload.menu,
                note: restorePayload.note,
                caused_by_smi_id: restorePayload.caused_by_smi_id,
              }
            );
            if (!mainRes.ok) {
              setErrorMsg(mainRes.error ?? "되돌리기에 실패했어요");
              return;
            }
            const newMainId = mainRes.data?.id;
            // 2. 자식 row들도 복구 (새 부모 id로 연결).
            //    newMainId 누락 또는 자식 upsert 실패 시 부분 복구됨을 명시적으로 알림.
            if (childSnapshots.length > 0) {
              if (!newMainId) {
                setErrorMsg(
                  "메인 배정은 복구됐지만 id를 확인할 수 없어 대체 조장 배정 복구를 건너뛰었어요. 개인 안내 탭에서 수동 확인해주세요."
                );
              } else {
                const failedChildren: string[] = [];
                for (const child of childSnapshots) {
                  const res = await updateScheduleMemberInfo(
                    child.schedule_id,
                    child.user_id,
                    {
                      temp_group_id: child.temp_group_id,
                      temp_role: child.temp_role,
                      excused_reason: child.excused_reason,
                      activity: child.activity,
                      menu: child.menu,
                      note: child.note,
                      caused_by_smi_id: newMainId,
                    }
                  );
                  if (!res.ok) {
                    failedChildren.push(
                      userMap.get(child.user_id)?.name ?? child.user_id
                    );
                  }
                }
                if (failedChildren.length > 0) {
                  setErrorMsg(
                    `메인 배정은 복구됐지만 대체 조장 복구 실패: ${failedChildren.join(", ")}. 개인 안내 탭에서 수동으로 추가해주세요.`
                  );
                }
              }
            }
            router.refresh();
            broadcastMemberUpdate();
          },
        });
      }
    );
  };

  // ==========================================================================
  // 렌더링
  // ==========================================================================
  return (
    <div>
      {/* 에러 배너 */}
      {errorMsg && (
        <div
          role="alert"
          className="mb-3 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
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

      {/* 조 브리핑 섹션 */}
      {section === "group_info" && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              일정별 조에게 공지되는 안내 (조 위치, 메모)
            </p>
            <button
              onClick={() => setSgiDialog({ mode: "create" })}
              className="flex min-h-11 items-center gap-1 rounded-xl bg-main-action px-3 text-sm font-bold"
              aria-label="조 브리핑 추가"
              disabled={schedules.length === 0 || groups.length === 0}
            >
              <PlusIcon className="h-4 w-4" aria-hidden />
              추가
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-center text-xs text-muted-foreground whitespace-nowrap">
                  <th className="min-w-[140px] px-2 py-2">일정</th>
                  <th className="min-w-[64px] px-2 py-2">조</th>
                  <th className="min-w-[96px] px-2 py-2">조 위치</th>
                  <th className="min-w-[160px] px-2 py-2">메모</th>
                  <th className="min-w-[96px] px-2 py-2">편집</th>
                </tr>
              </thead>
              <tbody>
                {sortedGroupInfos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      등록된 조 브리핑이 없어요
                    </td>
                  </tr>
                )}
                {sortedGroupInfos.map((g) => {
                  const s = scheduleMap.get(g.schedule_id);
                  const group = groupMap.get(g.group_id);
                  return (
                    <tr key={g.id} className="border-t border-gray-100">
                      <td className="px-2 py-2 text-xs">
                        {s ? scheduleLabel(s) : "(삭제된 일정)"}
                      </td>
                      <td className="px-2 py-2 text-center text-xs">{group?.name ?? "-"}</td>
                      <td className="px-2 py-2 text-center text-xs">{g.group_location ?? "-"}</td>
                      <td className="px-2 py-2 text-xs truncate max-w-[200px]">{g.note ?? "-"}</td>
                      <td className="px-2 py-2">
                        <div className="flex justify-center gap-2 whitespace-nowrap">
                          <button
                            onClick={() =>
                              setSgiDialog({
                                mode: "edit",
                                id: g.id,
                                initial: {
                                  schedule_id: g.schedule_id,
                                  group_id: g.group_id,
                                  group_location: g.group_location,
                                  note: g.note,
                                },
                              })
                            }
                            className="min-h-11 rounded-lg bg-gray-100 px-2 text-xs font-medium"
                            aria-label="조 브리핑 수정"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => setDeleteSgiId(g.id)}
                            className="min-h-11 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-600"
                            aria-label="조 브리핑 삭제"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 개인 안내 섹션 */}
      {section === "member_info" && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              일정별 참가자 특이사항 (조이동/임시역할/미참여/활동/메뉴/메모)
            </p>
            <button
              onClick={() => setSmiDialog({ mode: "create" })}
              className="flex min-h-11 items-center gap-1 rounded-xl bg-main-action px-3 text-sm font-bold"
              aria-label="개인 안내 추가"
              disabled={schedules.length === 0 || users.length === 0}
            >
              <PlusIcon className="h-4 w-4" aria-hidden />
              추가
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-center text-xs text-muted-foreground whitespace-nowrap">
                  <th className="min-w-[140px] px-2 py-2">일정</th>
                  <th className="min-w-[64px] px-2 py-2">이름</th>
                  <th className="min-w-[72px] px-2 py-2">조이동</th>
                  <th className="min-w-[56px] px-2 py-2">임시역할</th>
                  <th className="min-w-[88px] px-2 py-2">미참여</th>
                  <th className="min-w-[72px] px-2 py-2">활동</th>
                  <th className="min-w-[72px] px-2 py-2">메뉴</th>
                  <th className="min-w-[120px] px-2 py-2">메모</th>
                  <th className="min-w-[96px] px-2 py-2">편집</th>
                </tr>
              </thead>
              <tbody>
                {sortedMemberInfos.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      등록된 개인 안내가 없어요
                    </td>
                  </tr>
                )}
                {sortedMemberInfos.map((m) => {
                  const s = scheduleMap.get(m.schedule_id);
                  const user = userMap.get(m.user_id);
                  const tempGroup = m.temp_group_id
                    ? groupMap.get(m.temp_group_id)
                    : null;
                  return (
                    <tr key={m.id} className="border-t border-gray-100">
                      <td className="px-2 py-2 text-xs">
                        {s ? scheduleLabel(s) : "(삭제된 일정)"}
                      </td>
                      <td className="px-2 py-2 text-xs font-medium">{user?.name ?? "-"}</td>
                      <td className="px-2 py-2 text-center text-xs">{tempGroup?.name ?? "-"}</td>
                      <td className="px-2 py-2 text-center text-xs">
                        {m.temp_role === "leader" ? "조장" : m.temp_role === "member" ? "조원" : "-"}
                      </td>
                      <td className="px-2 py-2 text-xs truncate max-w-[140px]">{m.excused_reason ?? "-"}</td>
                      <td className="px-2 py-2 text-center text-xs">{m.activity ?? "-"}</td>
                      <td className="px-2 py-2 text-center text-xs">{m.menu ?? "-"}</td>
                      <td className="px-2 py-2 text-xs truncate max-w-[200px]">{m.note ?? "-"}</td>
                      <td className="px-2 py-2">
                        <div className="flex justify-center gap-2 whitespace-nowrap">
                          <button
                            onClick={() => {
                              // Phase J+: 기존 자식 row(대체 조장) 있으면 초기값으로 로드
                              const existingChild = memberInfos.find(
                                (s) => s.caused_by_smi_id === m.id
                              );
                              setSmiDialog({
                                mode: "edit",
                                id: m.id,
                                initial: {
                                  schedule_id: m.schedule_id,
                                  user_id: m.user_id,
                                  temp_group_id: m.temp_group_id,
                                  temp_role: m.temp_role,
                                  excused_reason: m.excused_reason,
                                  activity: m.activity,
                                  menu: m.menu,
                                  note: m.note,
                                  replacement_leader_user_id: existingChild?.user_id ?? null,
                                },
                              });
                            }
                            }
                            className="min-h-11 rounded-lg bg-gray-100 px-2 text-xs font-medium"
                            aria-label="개인 안내 수정"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => setDeleteSmiId(m.id)}
                            className="min-h-11 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-600"
                            aria-label="개인 안내 삭제"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 다이얼로그 */}
      {sgiDialog && (
        <ScheduleGroupInfoEditDialog
          mode={sgiDialog.mode}
          schedules={schedules}
          groups={groups}
          initial={sgiDialog.mode === "edit" ? sgiDialog.initial : undefined}
          onSave={handleSgiSave}
          onClose={() => setSgiDialog(null)}
        />
      )}
      {smiDialog && (
        <ScheduleMemberInfoEditDialog
          mode={smiDialog.mode}
          schedules={schedules}
          groups={groups}
          users={users}
          memberInfos={memberInfos}
          initial={smiDialog.mode === "edit" ? smiDialog.initial : undefined}
          onSave={handleSmiSave}
          onClose={() => setSmiDialog(null)}
        />
      )}

      {/* 삭제 확인 */}
      <Dialog open={!!deleteSgiId} onOpenChange={(o) => !o && setDeleteSgiId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>조 브리핑을 삭제할까요?</DialogTitle>
            <DialogDescription>
              조장 화면의 브리핑에서 해당 항목이 사라져요. 5초 안에 되돌릴 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium">
                취소
              </button>
            </DialogClose>
            <button
              onClick={confirmDeleteSgi}
              className="min-h-11 rounded-xl bg-red-500 px-4 text-sm font-bold text-white"
            >
              삭제
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteSmiId} onOpenChange={(o) => !o && setDeleteSmiId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>개인 안내를 삭제할까요?</DialogTitle>
            <DialogDescription>
              해당 참가자의 이 일정 안내가 사라져요. 5초 안에 되돌릴 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium">
                취소
              </button>
            </DialogClose>
            <button
              onClick={confirmDeleteSmi}
              className="min-h-11 rounded-xl bg-red-500 px-4 text-sm font-bold text-white"
            >
              삭제
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Undo 스낵바 */}
      {undo && (
        <UndoSnackbar
          message={undo.message}
          onUndo={undo.restore}
          onClose={() => setUndo(null)}
        />
      )}
    </div>
  );
}
