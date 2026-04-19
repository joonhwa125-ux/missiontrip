import { useEffect, useRef } from "react";
import { filterMembersByScope } from "@/lib/utils";
import { getReportedLabel } from "@/lib/constants";
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
 * 자동 활성화 타이머 (관리자 전용, 60초 + visibilitychange).
 *
 * ## 정책 (Phase A 변경, 2026-04-20)
 * - 운영 모델 변화("확인된 조는 먼저 이동")에 따라 **미확인 게이트 제거**.
 * - 이전 활성 일정에 미확인 인원이 남아있어도 다음 일정을 자동 시작하며,
 *   관리자에게는 알림 토스트만 발송(차단 아님).
 * - 누락 방지는 조장 뷰의 미확인 배지 + 카카오워크 공지로 보완.
 */
export function useAutoActivateTimer(
  allSchedules: Schedule[],
  activeCheckIns: AdminCheckIn[],
  totalMemberCount: number,
  activeSchedule: Schedule | null,
  handleActivate: (s: Schedule) => void,
  onToast: (msg: string) => void
) {
  const autoAlertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const waiting = allSchedules.filter(
        (s) => !s.is_active && !s.activated_at && s.scheduled_time
      );
      const due = waiting.find((s) => new Date(s.scheduled_time!) <= now);
      if (!due) return;
      const unchecked = calcUncheckedCount(activeCheckIns, totalMemberCount);
      // 미확인 인원 남아있는 상태로 다음 일정이 자동 시작될 때 1회 경고 (차단 아님)
      if (activeSchedule && unchecked > 0 && !autoAlertedRef.current.has(due.id)) {
        autoAlertedRef.current.add(due.id);
        onToast(`이전 일정 ${unchecked}명 미확인 상태로 ${due.title} 시작할게요`);
      }
      handleActivate(due);
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
  }, [allSchedules, activeCheckIns, totalMemberCount, activeSchedule, handleActivate, onToast]);
}
