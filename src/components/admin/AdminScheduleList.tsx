"use client";

import { useState, useCallback, useTransition, useMemo } from "react";
import { activateSchedule, deactivateSchedule } from "@/actions/schedule";
import { useBroadcast } from "@/hooks/useRealtime";
import {
  useAllReportedNotification, useAutoActivateTimer, calcUncheckedCount,
} from "@/hooks/useAdminScheduleEffects";
import { filterMembersByScope } from "@/lib/utils";
import {
  CHANNEL_GLOBAL, COPY,
  EVENT_SCHEDULE_ACTIVATED, EVENT_SCHEDULE_DEACTIVATED,
} from "@/lib/constants";
import type { Schedule, AdminCheckIn, AdminMember, AdminReport, AdminShuttleReport } from "@/lib/types";
import AdminScheduleCard from "@/components/admin/AdminScheduleCard";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";

interface Props {
  schedules: Schedule[];
  allSchedules: Schedule[];
  checkInsMap: Record<string, AdminCheckIn[]>;
  reportsMap: Record<string, AdminReport[]>;
  shuttleReportsMap: Record<string, AdminShuttleReport[]>;
  members: AdminMember[];
  activeSchedule: Schedule | null;
  onBottomSheet: (s: Schedule) => void;
  onTimeEdit: (s: Schedule) => void;
  onToast: (msg: string) => void;
}

export default function AdminScheduleList({
  schedules, allSchedules, checkInsMap, reportsMap, shuttleReportsMap, members,
  activeSchedule, onBottomSheet, onTimeEdit, onToast,
}: Props) {
  const [, startTransition] = useTransition();
  const { broadcast } = useBroadcast();
  const [warningTarget, setWarningTarget] = useState<Schedule | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Schedule | null>(null);
  const activeCheckIns = useMemo(
    () => (activeSchedule ? checkInsMap[activeSchedule.id] ?? [] : []),
    [activeSchedule, checkInsMap]
  );
  const totalMemberCount = useMemo(
    () => filterMembersByScope(members, activeSchedule?.scope ?? "all").length,
    [activeSchedule?.scope, members]
  );


  // -- 일정 활성화 Server Action --
  const handleActivate = useCallback(
    (s: Schedule) => {
      startTransition(async () => {
        const res = await activateSchedule(s.id);
        if (res.ok) {
          await broadcast(CHANNEL_GLOBAL, EVENT_SCHEDULE_ACTIVATED, {
            schedule_id: s.id, title: s.title, scope: s.scope,
            location: s.location, day_number: s.day_number, scheduled_time: s.scheduled_time,
            shuttle_type: s.shuttle_type,
          });
          // onRefresh() 제거 — self:true echo → onScheduleActivated → router.refresh() 보장
        }
      });
    },
    [broadcast, startTransition]
  );

  // -- 일정 종료 Server Action --
  const handleDeactivate = useCallback(
    (s: Schedule) => {
      startTransition(async () => {
        const res = await deactivateSchedule(s.id);
        if (res.ok) {
          await broadcast(CHANNEL_GLOBAL, EVENT_SCHEDULE_DEACTIVATED, {
            schedule_id: s.id, title: s.title,
          });
          // onRefresh() 제거 — self:true echo → onScheduleDeactivated → router.refresh() 보장
        }
      });
    },
    [broadcast, startTransition]
  );

  // -- 수동 종료 (미확인 경고 래핑) --
  const handleDeactivateClick = (s: Schedule) => {
    const unchecked = calcUncheckedCount(activeCheckIns, totalMemberCount);
    if (unchecked > 0) { setDeactivateTarget(s); } else { handleDeactivate(s); }
  };

  useAllReportedNotification(activeSchedule, members, reportsMap, onToast);
  useAutoActivateTimer(allSchedules, activeCheckIns, totalMemberCount, activeSchedule, handleActivate, onToast);

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
            shuttleReports={shuttleReportsMap[s.id] ?? []}
            members={members}
            onSummaryTap={() => onBottomSheet(s)}
            onActivate={() => handleActivateClick(s)}
            onDeactivate={() => handleDeactivateClick(s)}
            onTimeEdit={() => onTimeEdit(s)}
          />
        ))}
      </div>

      {/* 미확인 경고 모달 (수동 활성화 시) */}
      <Dialog open={!!warningTarget} onOpenChange={(o) => !o && setWarningTarget(null)}>
        <DialogContent hideClose role="alertdialog">
          <DialogHeader>
            <DialogTitle>
              {COPY.uncheckedWarning(calcUncheckedCount(activeCheckIns, totalMemberCount))}
            </DialogTitle>
            <DialogDescription>
              {COPY.uncheckedWarningQuestion}
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

      {/* 종료 확인 모달 (미확인 인원 경고 포함) */}
      <Dialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <DialogContent hideClose role="alertdialog">
          <DialogHeader>
            <DialogTitle>
              {COPY.uncheckedWarning(calcUncheckedCount(activeCheckIns, totalMemberCount))}
            </DialogTitle>
            <DialogDescription>
              {COPY.deactivateConfirm}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              취소
            </DialogClose>
            <button
              onClick={() => {
                const target = deactivateTarget;
                setDeactivateTarget(null);
                if (target) handleDeactivate(target);
              }}
              className="min-h-11 flex-1 rounded-xl bg-red-500 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-red-500"
              aria-label="일정 종료 확인"
            >
              종료
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
