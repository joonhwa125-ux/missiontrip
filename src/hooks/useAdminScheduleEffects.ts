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

/** 자동 활성화 타이머 (60초 + visibilitychange) */
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
      if (!due || autoAlertedRef.current.has(due.id)) return;
      const unchecked = calcUncheckedCount(activeCheckIns, totalMemberCount);
      if (activeSchedule && unchecked > 0) {
        autoAlertedRef.current.add(due.id);
        onToast(`${due.title} 시간이 됐지만 ${unchecked}명이 미확인이에요`);
        return;
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
