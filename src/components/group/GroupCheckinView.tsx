"use client";

import { useState, useCallback, useTransition, useMemo, type Dispatch, type SetStateAction } from "react";
import { useBroadcast } from "@/hooks/useRealtime";
import { useBroadcastCheckin } from "@/hooks/useBroadcastCheckin";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { createCheckin, deleteCheckin, markAbsent } from "@/actions/checkin";
import { submitReport, submitShuttleReport } from "@/actions/report";
import Image from "next/image";
import MemberCard from "./MemberCard";
import { CancelCheckinDialog, MarkAbsentDialog } from "./CheckinDialogs";
import { CheckIcon, ChevronLeftIcon, MinusIcon, XIcon } from "@/components/ui/icons";
import {
  COPY,
  CHANNEL_GLOBAL,
  CHANNEL_ADMIN,
  EVENT_GROUP_REPORTED,
  EVENT_SHUTTLE_REPORTED,
  EVENT_REPORT_INVALIDATED,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Schedule, CheckIn, GroupMember, ScheduleMemberInfo } from "@/lib/types";

type Member = GroupMember;

interface Props {
  currentUser: { id: string; group_id: string; shuttle_bus: string | null; return_shuttle_bus: string | null };
  groupName: string;
  members: Member[];
  activeSchedule: Schedule | null;
  checkIns: CheckIn[];
  setCheckIns: Dispatch<SetStateAction<CheckIn[]>>;
  onBack: () => void;
  /** true이면 닫기(X) 아이콘, false/생략이면 뒤로(<) 아이콘 */
  closeMode?: boolean;
  showToast: (msg: string) => void;
  reported: boolean;
  onReported: () => void;
  onReportReset: () => void;
  /** v2 Phase F: 사전 제외된 조원 (dim 섹션, 체크인 불필요) */
  excusedMembers?: Member[];
  /** v2 Phase F: 다른 조에서 합류한 조원 (user_id → 원래 조명) — 합류 배지용 */
  transferredInMap?: Map<string, string>;
  /** v2 Phase F: user_id → 이 일정의 member_info (activity/excused_reason/note 등) */
  memberInfoMap?: Map<string, ScheduleMemberInfo>;
}

/** 섹션 그루핑 키 — 동일 키의 조원들을 한 섹션에 묶는다 */
type SectionGroup = {
  key: string;
  label: string | null;
  members: Member[];
};

/**
 * 섹션 그루핑 결정:
 *  1) 이 일정에 activity 메타가 하나라도 있으면 activity 기준 그루핑 (식사/투어 등)
 *  2) 그게 아니면 airline이 2개 이상이면 airline 기준 그루핑 (항공편 분리)
 *  3) 둘 다 해당 안 되면 섹션 없는 flat 리스트 반환
 */
function buildSections(
  members: Member[],
  memberInfoMap: Map<string, ScheduleMemberInfo> | undefined
): SectionGroup[] {
  if (memberInfoMap && memberInfoMap.size > 0) {
    const activityPresent = members.some(
      (m) => !!memberInfoMap.get(m.id)?.activity?.trim()
    );
    if (activityPresent) {
      const buckets = new Map<string, Member[]>();
      for (const m of members) {
        const key = memberInfoMap.get(m.id)?.activity?.trim() || "미지정";
        const arr = buckets.get(key) ?? [];
        arr.push(m);
        buckets.set(key, arr);
      }
      return Array.from(buckets.entries())
        .sort(([a], [b]) => (a === "미지정" ? 1 : b === "미지정" ? -1 : a.localeCompare(b, "ko")))
        .map(([key, ms]) => ({ key, label: key, members: ms }));
    }
  }

  const distinctAirlines = new Set(
    members.filter((m) => !!m.airline?.trim()).map((m) => m.airline!.trim())
  );
  if (distinctAirlines.size >= 2) {
    const buckets = new Map<string, Member[]>();
    for (const m of members) {
      const key = m.airline?.trim() || "항공사 미지정";
      const arr = buckets.get(key) ?? [];
      arr.push(m);
      buckets.set(key, arr);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (a === "항공사 미지정" ? 1 : b === "항공사 미지정" ? -1 : a.localeCompare(b, "ko")))
      .map(([key, ms]) => ({ key, label: `✈ ${key}`, members: ms }));
  }

  return [{ key: "__flat__", label: null, members }];
}

export default function GroupCheckinView({
  currentUser,
  groupName,
  members,
  activeSchedule,
  checkIns,
  setCheckIns,
  onBack,
  closeMode,
  showToast,
  reported,
  onReported,
  onReportReset,
  excusedMembers = [],
  transferredInMap,
  memberInfoMap,
}: Props) {
  const [cancelTarget, setCancelTarget] = useState<{ member: Member; isAbsent: boolean } | null>(null);
  const [absentTarget, setAbsentTarget] = useState<Member | null>(null);
  const [, startTransition] = useTransition();

  const { isOnline, pendingCount, addPending, addPendingReport } = useOfflineSync();
  const { broadcast } = useBroadcast();
  const broadcastCheckin = useBroadcastCheckin(currentUser.group_id, activeSchedule?.id, activeSchedule?.shuttle_type ?? null);

  const handleCheckin = useCallback(
    async (userId: string) => {
      if (!activeSchedule) return;
      const temp: CheckIn = {
        id: `temp-${userId}`,
        user_id: userId,
        schedule_id: activeSchedule.id,
        checked_at: new Date().toISOString(),
        checked_by: "leader",
        checked_by_user_id: currentUser.id,
        offline_pending: !isOnline,
        is_absent: false,
        absence_reason: null,
        absence_location: null,
        group_id_at_checkin: currentUser.group_id,
      };
      setCheckIns((prev) => [...prev.filter((c) => c.user_id !== userId), temp]);

      if (!isOnline) {
        const saved = addPending({
          user_id: userId,
          schedule_id: activeSchedule.id,
          checked_by: "leader",
          checked_by_user_id: currentUser.id,
          checked_at: temp.checked_at,
          // v2: 체크인 시점의 조 스냅샷 (과거 기록 추적용 immutable)
          group_id_at_checkin: currentUser.group_id,
        });
        if (!saved) {
          setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
          showToast("저장 공간이 부족해요. 기기 저장소를 확인해주세요.");
        }
        return;
      }

      startTransition(async () => {
        try {
          const res = await createCheckin(userId, activeSchedule.id, activeSchedule.shuttle_type ?? null);
          if (res.ok) {
            await broadcastCheckin(userId, "insert");
          } else {
            setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
            showToast(res.error ?? "체크인 처리 중 오류가 발생했어요.");
          }
        } catch {
          setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
          showToast("서버 연결에 실패했어요. 다시 시도해주세요.");
        }
      });
    },
    [activeSchedule, isOnline, addPending, currentUser.id, currentUser.group_id, broadcastCheckin, setCheckIns, showToast]
  );

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelTarget || !activeSchedule) return;
    const userId = cancelTarget.member.id;
    setCancelTarget(null);
    onReportReset();
    // 낙관적 제거 전 백업 (롤백용)
    let removed: CheckIn | undefined;
    setCheckIns((prev) => {
      removed = prev.find((c) => c.user_id === userId);
      return prev.filter((c) => c.user_id !== userId);
    });
    startTransition(async () => {
      try {
        const res = await deleteCheckin(userId, activeSchedule.id, activeSchedule.shuttle_type ?? null);
        if (res.ok) {
          await broadcastCheckin(userId, "delete");
          // 보고 무효화 브로드캐스트 — 일반 일정만 (셔틀 보고는 shuttle_reports 기반, group_id 무의미)
          if (!activeSchedule.shuttle_type) {
            const invalidatePayload = { group_id: currentUser.group_id, schedule_id: activeSchedule.id };
            await Promise.allSettled([
              broadcast(CHANNEL_GLOBAL, EVENT_REPORT_INVALIDATED, invalidatePayload),
              broadcast(CHANNEL_ADMIN, EVENT_REPORT_INVALIDATED, invalidatePayload),
            ]);
          }
        } else {
          if (removed) setCheckIns((prev) => [...prev, removed!]);
          showToast(res.error ?? "취소 처리 중 오류가 발생했어요.");
        }
      } catch {
        if (removed) setCheckIns((prev) => [...prev, removed!]);
        showToast("서버 연결에 실패했어요. 다시 시도해주세요.");
      }
    });
  }, [cancelTarget, activeSchedule, broadcastCheckin, setCheckIns, showToast, onReportReset, currentUser.group_id, broadcast]);

  const handleAbsentConfirm = useCallback(async (reason: string | null, location: string | null) => {
    if (!absentTarget || !activeSchedule) return;
    const userId = absentTarget.id;
    setAbsentTarget(null);
    const temp: CheckIn = {
      id: `absent-${userId}`,
      user_id: userId,
      schedule_id: activeSchedule.id,
      checked_at: new Date().toISOString(),
      checked_by: "leader",
      checked_by_user_id: currentUser.id,
      offline_pending: false,
      is_absent: true,
      absence_reason: reason,
      absence_location: location,
      group_id_at_checkin: currentUser.group_id,
    };
    setCheckIns((prev) => [...prev.filter((c) => c.user_id !== userId), temp]);
    startTransition(async () => {
      try {
        const res = await markAbsent(userId, activeSchedule.id, activeSchedule.shuttle_type ?? null, reason, location);
        if (res.ok) {
          await broadcastCheckin(userId, "insert", true);
        } else {
          setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
          showToast(res.error ?? "불참 처리 중 오류가 발생했어요.");
        }
      } catch {
        setCheckIns((prev) => prev.filter((c) => c.id !== temp.id));
        showToast("서버 연결에 실패했어요. 다시 시도해주세요.");
      }
    });
  }, [absentTarget, activeSchedule, currentUser.id, currentUser.group_id, broadcastCheckin, setCheckIns, showToast]);

  const handleReport = useCallback(async () => {
    if (!activeSchedule) return;
    const unchecked = members.filter(
      (m) => !checkIns.some((c) => c.user_id === m.id)
    ).length;
    const confirmed = checkIns.length;

    const shuttleType = activeSchedule.shuttle_type;
    const shuttleBus = shuttleType === "departure"
      ? currentUser.shuttle_bus
      : shuttleType === "return"
        ? currentUser.return_shuttle_bus
        : null;

    if (shuttleType && !shuttleBus) {
      showToast("셔틀 버스 배정 정보가 없어요");
      return;
    }

    if (!isOnline) {
      const saved = addPendingReport(
        shuttleType
          ? { group_id: null, shuttle_bus: shuttleBus, schedule_id: activeSchedule.id, pending_count: unchecked }
          : { group_id: currentUser.group_id, shuttle_bus: null, schedule_id: activeSchedule.id, pending_count: unchecked }
      );
      if (saved) {
        onReported();
        showToast(COPY.reportButtonDone(confirmed, members.length));
      } else {
        showToast("저장 공간이 부족해요. 기기 저장소를 확인해주세요.");
      }
      return;
    }

    startTransition(async () => {
      try {
        const res = shuttleType
          ? await submitShuttleReport(shuttleBus!, activeSchedule.id, unchecked)
          : await submitReport(currentUser.group_id, activeSchedule.id, unchecked);
        if (res.ok) {
          onReported();
          showToast(COPY.reportButtonDone(confirmed, members.length));
          // broadcast 실패는 DB 보고 성공에 영향 없음 — 각자 독립 처리
          if (!shuttleType) {
            const reportPayload = {
              group_id: currentUser.group_id,
              schedule_id: activeSchedule.id,
              pending_count: unchecked,
            };
            await Promise.allSettled([
              broadcast(CHANNEL_GLOBAL, EVENT_GROUP_REPORTED, reportPayload),
              broadcast(CHANNEL_ADMIN, EVENT_GROUP_REPORTED, reportPayload),
            ]);
          } else {
            const shuttlePayload = {
              shuttle_bus: shuttleBus!,
              schedule_id: activeSchedule.id,
              pending_count: unchecked,
            };
            await Promise.allSettled([
              broadcast(CHANNEL_GLOBAL, EVENT_SHUTTLE_REPORTED, shuttlePayload),
              broadcast(CHANNEL_ADMIN, EVENT_SHUTTLE_REPORTED, shuttlePayload),
            ]);
          }
        } else {
          showToast(res.error ?? "보고 처리 중 오류가 발생했어요. 다시 시도해주세요.");
        }
      } catch {
        showToast("서버 연결에 실패했어요. 다시 시도해주세요.");
      }
    });
  }, [activeSchedule, members, checkIns, currentUser.group_id, currentUser.shuttle_bus, currentUser.return_shuttle_bus, broadcast, isOnline, addPendingReport, showToast, onReported]);

  // CR-005: checkIns → 불참/확인/미확인 정확히 분리
  //         Phase F: 제외 인원은 members에서 이미 빠져있으므로 별도 고려 불필요
  const checkedIds = useMemo(() => new Set(checkIns.map((c) => c.user_id)), [checkIns]);
  const absentIds = useMemo(() => new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id)), [checkIns]);
  // 미확인 = 체크인도 불참도 아닌 순수 미처리 인원 (제외 인원은 이미 빠져 있음)
  const uncheckedCount = members.filter((m) => !checkedIds.has(m.id)).length;
  const allComplete = members.length > 0 && uncheckedCount === 0;

  // 상단 카운트용 "처리된 인원 수" = 탑승 + 불참 (members 한정)
  const processedCount = useMemo(() => {
    const memberIdSet = new Set(members.map((m) => m.id));
    return checkIns.filter((c) => memberIdSet.has(c.user_id)).length;
  }, [checkIns, members]);

  // 이니셜 원 행 — 원본 순서 유지 (탭한 항목이 제자리에서 반영되도록)
  const sorted = members;

  // Phase F: 섹션 그루핑 (activity or airline). 섹션 내부도 원본 순서 유지
  const sections = useMemo(
    () => buildSections(members, memberInfoMap),
    [members, memberInfoMap]
  );

  return (
    <div className="flex flex-1 flex-col">
      {/* 상단 바 (뒤로 가기 포함) */}
      <header className="bg-white px-4 py-4 shadow-sm">
        {closeMode ? (
          /* closeMode: 모달 패턴 — 타이틀 중앙, X 우측 */
          <div className="relative flex items-center justify-center min-h-11">
            <div className="text-center">
              <h1 className="text-lg font-bold">
                {activeSchedule?.location ?? activeSchedule?.title ?? "대기 중"}
              </h1>
              <div className="flex items-center justify-center gap-2">
                <p className="text-sm text-muted-foreground">{groupName}</p>
                {members.length > 0 && (
                  <span className="text-sm" aria-live="polite">
                    <span className="font-bold text-[#1A1A1A]">{processedCount}</span>
                    <span className="text-[#888780]">/</span>
                    <span className="font-medium text-[#1A1A1A]">{members.length}명</span>
                    {excusedMembers.length > 0 && (
                      <span className="ml-1 text-xs text-stone-500">(제외 {excusedMembers.length})</span>
                    )}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onBack}
              className="absolute right-0 flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg"
              aria-label="닫기"
            >
              <XIcon className="h-5 w-5" aria-hidden />
            </button>
          </div>
        ) : (
          /* 조장 뷰: 뒤로(<) 좌측, 타이틀 좌측 정렬, N/M명 우측 끝 정렬 */
          <div className="flex items-start gap-2">
            <button
              onClick={onBack}
              className="flex min-h-11 min-w-11 flex-shrink-0 items-start justify-center rounded-lg pt-0.5"
              aria-label="일정 피드로 돌아가기"
            >
              <ChevronLeftIcon aria-hidden />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold">
                {activeSchedule?.location ?? activeSchedule?.title ?? "대기 중"}
              </h1>
              <p className="text-sm text-muted-foreground">{groupName}</p>
            </div>
            {members.length > 0 && (
              <span className="flex-shrink-0 pr-4 text-sm" aria-live="polite">
                <span className="font-bold text-[#1A1A1A]">{processedCount}</span>
                <span className="text-[#888780]">/</span>
                <span className="font-medium text-[#1A1A1A]">{members.length}명</span>
                {excusedMembers.length > 0 && (
                  <span className="ml-1 text-xs text-stone-500">(제외 {excusedMembers.length})</span>
                )}
              </span>
            )}
          </div>
        )}
      </header>

      {/* 이니셜 원 행 */}
      <div className="border-b bg-white">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
          {sorted.map((m) => {
            const checked = checkedIds.has(m.id);
            const absent = absentIds.has(m.id);
            return (
              <div key={m.id} className="relative flex-shrink-0">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full text-[0.625rem] font-bold",
                    absent
                      ? "bg-gray-200 text-gray-500"
                      : checked
                        ? "bg-main-action shadow-sm"
                        : "border-2 border-dashed border-gray-300 bg-white"
                  )}
                  aria-label={`${m.name} ${absent ? "불참" : checked ? "탑승 완료" : "미탑승"}`}
                >
                  {m.name.slice(0, 3)}
                </div>
                {checked && !absent && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 ring-2 ring-white"
                    aria-hidden="true"
                  >
                    <CheckIcon className="h-2.5 w-2.5 text-white" aria-hidden />
                  </span>
                )}
                {absent && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-stone-400 ring-2 ring-white"
                    aria-hidden="true"
                  >
                    <MinusIcon className="h-2.5 w-2.5 text-white" aria-hidden />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 조랑말 이미지 사전 로드 — allComplete 전에 미리 fetch하여 전환 시 즉시 표시 */}
      <div className="sr-only" aria-hidden="true">
        <Image src="/standing-horse.png" alt="" width={120} height={120} priority />
        <Image src="/running-horse.png" alt="" width={120} height={120} priority />
      </div>

      {/* 전원 완료 축하 화면 */}
      {allComplete && (
        <div className={cn(
          "flex flex-col items-center bg-gradient-to-b px-6 py-8 text-center",
          "from-sky-50/60"
        )}>
          <div className={cn("mb-4", reported && "animate-bounce")} aria-hidden="true">
            <Image src={reported ? "/running-horse.png" : "/standing-horse.png"} alt="" width={120} height={120} priority />
          </div>
          <h2 className="mb-2 text-2xl font-bold">
            {reported ? COPY.allCompleteReported : COPY.allComplete}
          </h2>
          <p className="whitespace-pre-line text-lg font-medium text-stone-600">
            {reported ? COPY.celebrationReported : COPY.celebrationSubtitle}
          </p>
        </div>
      )}

      {/* 조원 카드 리스트 — 전원 완료 시에도 취소 가능하도록 항상 표시 */}
      {/*  Phase F: 섹션 그루핑 (activity 또는 airline), 단일 섹션이면 헤더 없이 flat */}
      <div className="px-4 pb-28 pt-3" aria-label="조원 탑승 현황">
        {sections.map((section, idx) => (
          <section key={section.key} className={idx > 0 ? "mt-4" : undefined}>
            {section.label && (
              <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                {section.label}
              </h3>
            )}
            <ul className="flex flex-col gap-2">
              {section.members.map((m) => (
                <MemberCard
                  key={m.id}
                  user={m}
                  checkIn={checkIns.find((c) => c.user_id === m.id) ?? null}
                  joinedFrom={transferredInMap?.get(m.id) ?? null}
                  onCheckin={handleCheckin}
                  onCancel={(mm) => {
                    const ci = checkIns.find((c) => c.user_id === mm.id);
                    setCancelTarget({ member: mm, isAbsent: ci?.is_absent ?? false });
                  }}
                  onAbsent={setAbsentTarget}
                />
              ))}
            </ul>
          </section>
        ))}

        {/* Phase F: 사전 제외 섹션 — dim 스타일, 체크인 버튼 없음 */}
        {excusedMembers.length > 0 && (
          <section className="mt-5" aria-labelledby="excused-section-heading">
            <h3
              id="excused-section-heading"
              className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-stone-500"
            >
              제외
              <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[0.6875rem] font-medium text-stone-700">
                {excusedMembers.length}명
              </span>
            </h3>
            <ul className="flex flex-col gap-2 opacity-70">
              {excusedMembers.map((m) => (
                <ExcusedMemberCard
                  key={m.id}
                  member={m}
                  reason={memberInfoMap?.get(m.id)?.excused_reason ?? null}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* CR-006+016: 보고 버튼 + 오프라인 배너를 하나의 fixed 컨테이너로 통합 */}
      <div className="fixed bottom-0 left-1/2 w-full max-w-lg -translate-x-1/2 border-t bg-white px-4 py-3 pb-safe">
        {/* 오프라인 배너 — 보고 버튼 위에 인라인 표시 */}
        {!isOnline && (
          <div
            className="mb-2 rounded-lg bg-offline-banner px-3 py-2 text-center text-sm"
            aria-live="polite"
            role="status"
          >
            {COPY.offline(pendingCount)}
          </div>
        )}
        {reported ? (
          <button
            className="flex w-full items-center justify-center gap-2 min-h-11 rounded-xl border border-[#EBE8E3] bg-app-bg py-4 text-base font-medium text-muted-foreground"
          >
            <CheckIcon className="h-5 w-5 text-complete-check" aria-hidden />
            {COPY.reportButtonDone(processedCount, members.length)}
          </button>
        ) : (
          <button
            aria-disabled={!allComplete}
            onClick={allComplete ? handleReport : undefined}
            className={cn(
              "w-full min-h-11 rounded-xl py-4 text-base transition-colors",
              allComplete
                ? "bg-main-action font-bold"
                : "bg-gray-200 text-gray-400 font-medium"
            )}
          >
            {allComplete ? COPY.reportButtonComplete : COPY.reportButtonPending(uncheckedCount)}
          </button>
        )}
      </div>

      <CancelCheckinDialog
        open={!!cancelTarget}
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirm}
      />
      <MarkAbsentDialog
        open={!!absentTarget}
        target={absentTarget}
        onClose={() => setAbsentTarget(null)}
        onConfirm={handleAbsentConfirm}
      />
    </div>
  );
}

/** Phase F: 사전 제외 조원 카드 — dim 스타일, 체크인 버튼 없음. "기타: ..." prefix 제거 */
function ExcusedMemberCard({ member, reason }: { member: Member; reason: string | null }) {
  const shortReason = reason
    ? reason.startsWith("기타:")
      ? reason.slice(3).trim()
      : reason
    : null;
  return (
    <li className="flex min-h-[4rem] items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-4">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <p className="text-base font-medium text-stone-500 truncate">{member.name}</p>
        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
          <MinusIcon className="h-3 w-3" aria-hidden />
          제외
        </span>
        {shortReason && (
          <span className="inline-block max-w-[10rem] truncate rounded-full bg-white px-2 py-0.5 text-xs text-stone-500">
            {shortReason}
          </span>
        )}
      </div>
    </li>
  );
}
