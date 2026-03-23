"use client";

import { useState, useEffect, useRef, useCallback, useTransition, useMemo } from "react";
import { activateSchedule } from "@/actions/schedule";
import { useBroadcast } from "@/hooks/useRealtime";
import { CHANNEL_GLOBAL, COPY, EVENT_SCHEDULE_ACTIVATED } from "@/lib/constants";
import type { Schedule, AdminCheckIn, AdminMember, AdminReport, Group } from "@/lib/types";
import AdminScheduleCard from "@/components/admin/AdminScheduleCard";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";

type Report = AdminReport;

interface Props {
  schedules: Schedule[];
  allSchedules: Schedule[];
  checkInsMap: Record<string, AdminCheckIn[]>;
  reportsMap: Record<string, Report[]>;
  groups: Group[];
  members: AdminMember[];
  activeSchedule: Schedule | null;
  onBottomSheet: (s: Schedule) => void;
  onTimeEdit: (s: Schedule) => void;
  onToast: (msg: string) => void;
  onRefresh: () => void;
}

/** 현재 활성 일정 기준 미확인 인원 수 계산 */
function calcUncheckedCount(
  checkIns: { user_id: string; is_absent: boolean }[],
  totalMemberCount: number
): number {
  const absentCount = checkIns.filter((c) => c.is_absent).length;
  const checkedCount = checkIns.filter((c) => !c.is_absent).length;
  return totalMemberCount - absentCount - checkedCount;
}

export default function AdminScheduleList({
  schedules, allSchedules, checkInsMap, reportsMap, groups, members,
  activeSchedule, onBottomSheet, onTimeEdit, onToast, onRefresh,
}: Props) {
  const [, startTransition] = useTransition();
  const { broadcast } = useBroadcast();
  const [warningTarget, setWarningTarget] = useState<Schedule | null>(null);
  const autoAlertedRef = useRef<Set<string>>(new Set());

  const activeCheckIns = useMemo(
    () => (activeSchedule ? checkInsMap[activeSchedule.id] ?? [] : []),
    [activeSchedule, checkInsMap]
  );
  // scope 기반 멤버 카운트 (선발/후발 일정은 해당 party만)
  const totalMemberCount = useMemo(() => {
    const scope = activeSchedule?.scope;
    if (!scope || scope === "all") return members.length;
    return members.filter((m) => m.party === scope).length;
  }, [activeSchedule?.scope, members]);


  // -- 일정 활성화 Server Action --
  const handleActivate = useCallback(
    (s: Schedule) => {
      startTransition(async () => {
        const res = await activateSchedule(s.id);
        if (res.ok) {
          await broadcast(CHANNEL_GLOBAL, EVENT_SCHEDULE_ACTIVATED, {
            schedule_id: s.id, title: s.title,
          });
          onRefresh();
        }
      });
    },
    [broadcast, startTransition, onRefresh]
  );

  // -- 자동 활성화 타이머 (60초 + visibilitychange) --
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

  // -- 수동 활성화 (미확인 경고 래핑) --
  const handleActivateClick = (s: Schedule) => {
    if (!activeSchedule) { handleActivate(s); return; }
    const unchecked = calcUncheckedCount(activeCheckIns, totalMemberCount);
    if (unchecked > 0) { setWarningTarget(s); } else { handleActivate(s); }
  };

  return (
    <div className="px-4 py-4 pb-24">
      <div className="space-y-2">
        {schedules.map((s) => (
          <AdminScheduleCard
            key={s.id}
            schedule={s}
            checkIns={checkInsMap[s.id] ?? []}
            reports={reportsMap[s.id] ?? []}
            groups={groups}
            members={members}
            onSummaryTap={() => onBottomSheet(s)}
            onActivate={() => handleActivateClick(s)}
            onTimeEdit={() => onTimeEdit(s)}
          />
        ))}
      </div>

      {/* 미확인 경고 모달 (수동 활성화 시) */}
      <Dialog open={!!warningTarget} onOpenChange={(o) => !o && setWarningTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {COPY.uncheckedWarning(calcUncheckedCount(activeCheckIns, totalMemberCount))}
            </DialogTitle>
            <DialogDescription className="sr-only">
              미확인 인원이 있는 상태에서 일정을 전환할지 확인합니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              취소
            </DialogClose>
            <button
              onClick={() => {
                const target = warningTarget;
                setWarningTarget(null);
                if (target) handleActivate(target);
              }}
              className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action"
              aria-label="일정 전환 확인"
            >
              전환할게요
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
