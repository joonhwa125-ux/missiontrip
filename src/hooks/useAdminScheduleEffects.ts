import { useEffect, useRef } from "react";
import { filterMembersByScope } from "@/lib/utils";
import { getReportedLabel } from "@/lib/constants";
import { useAutoActivate } from "@/hooks/useAutoActivate";
import type { Schedule, AdminCheckIn, AdminMember, AdminReport } from "@/lib/types";

/** 현재 활성 일정 기준 미확인 인원 수 계산 */
export function calcUncheckedCount(
  checkIns: { user_id: string; is_absent: boolean }[],
  totalMemberCount: number
): number {
  const absentCount = checkIns.filter((c) => c.is_absent).length;
  const checkedCount = checkIns.filter((c) => !c.is_absent).length;
  return totalMemberCount - absentCount - checkedCount;
}

/** 전 조 보고완료 토스트 감지 */
export function useAllReportedNotification(
  activeSchedule: Schedule | null,
  members: AdminMember[],
  reportsMap: Record<string, AdminReport[]>,
  onToast: (msg: string) => void
) {
  const notifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeSchedule) {
      notifiedRef.current = null;
      return;
    }
    // 일정이 변경되면 ref 리셋 — 새 일정에서도 토스트 발송 가능
    if (notifiedRef.current !== activeSchedule.id) {
      notifiedRef.current = null;
    }
    const scopeMembers = filterMembersByScope(members, activeSchedule.scope);
    const scopeGroupIds = new Set(scopeMembers.map((m) => m.group_id));
    const totalGroups = scopeGroupIds.size;
    const reports = reportsMap[activeSchedule.id] ?? [];
    const reportedGroupIds = new Set(reports.map((r) => r.group_id));
    const reportedCount = Array.from(scopeGroupIds).filter((gid) => reportedGroupIds.has(gid)).length;
    const allReported = totalGroups > 0 && reportedCount >= totalGroups;
    if (allReported && notifiedRef.current !== activeSchedule.id) {
      notifiedRef.current = activeSchedule.id;
      onToast(getReportedLabel(reportedCount, totalGroups));
    }
  }, [reportsMap, activeSchedule, members, onToast]);
}

/**
 * 자동 활성화 타이머 (관리자 전용).
 *
 * ## 책임 (2026-04-20 재설계)
 * - **활성화 자체는 `useAutoActivate`에 위임** — RPC 배치 정리 · 최신 past due 선택 정책과
 *   완전히 일치시킨다. 조장 훅과 관리자 훅이 각자 다른 target을 고르면 race condition 발생.
 * - 이 훅은 **관리자 전용 "미확인 인원 경고" 토스트**만 책임진다 (운영 모델 변화:
 *   "확인된 조는 먼저 이동" → 차단 아닌 경고).
 * - 누락 방지는 조장 뷰의 미확인 배지 + 카카오워크 공지로 보완.
 *
 * ## 과거 설계 문제 (G-1)
 * - 이전엔 이 훅이 `find()`로 sort_order 첫 past due를 골라 `activateSchedule` 호출.
 *   → `useAutoActivate`가 scheduled_time 최신을 고르는 것과 불일치 → 관리자 단독 시나리오에서
 *   과거 일정 일괄 정리 효과 무력화 + 두 경로 경쟁 가능성.
 */
export function useAutoActivateTimer(
  allSchedules: Schedule[],
  activeCheckIns: AdminCheckIn[],
  totalMemberCount: number,
  activeSchedule: Schedule | null,
  onToast: (msg: string) => void
) {
  // 활성화는 공용 훅에 위임 — 조장 뷰와 동일 경로
  useAutoActivate(allSchedules);

  const autoAlertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      // 최신 past due 선택 — RPC · useAutoActivate와 정책 일치
      let due: Schedule | undefined;
      let dueTime = 0;
      for (const s of allSchedules) {
        if (s.is_active || s.activated_at || s.scheduled_time === null) continue;
        const t = new Date(s.scheduled_time).getTime();
        if (t > now) continue;
        if (t > dueTime) {
          dueTime = t;
          due = s;
        }
      }
      if (!due) return;
      const unchecked = calcUncheckedCount(activeCheckIns, totalMemberCount);
      // 미확인 인원 남아있는 상태로 다음 일정이 자동 시작될 때 1회 경고 (차단 아님)
      if (activeSchedule && unchecked > 0 && !autoAlertedRef.current.has(due.id)) {
        autoAlertedRef.current.add(due.id);
        onToast(`이전 일정 ${unchecked}명 미확인 상태로 ${due.title} 시작할게요`);
      }
    };
    check();
    const timer = setInterval(check, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [allSchedules, activeCheckIns, totalMemberCount, activeSchedule, onToast]);
}
