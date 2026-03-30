"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn, getGroupBadgeStatus, filterMembersByScope } from "@/lib/utils";
import { COPY, GROUP_BADGE_STYLE, isLeaderRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import AdminGroupDrillDown from "./AdminGroupDrillDown";
import { PhoneIcon } from "@/components/ui/icons";
import type {
  Group,
  Schedule,
  AdminMember,
  AdminCheckIn,
  AdminReport,
  ShuttleReport,
} from "@/lib/types";

interface Props {
  schedule: Schedule | null;
  groups: Group[];
  members: AdminMember[];
  checkIns: AdminCheckIn[];
  reports: AdminReport[];
  isReadOnly: boolean;
  loading?: boolean;
  onClose: () => void;
  onCheckInsChange: React.Dispatch<React.SetStateAction<AdminCheckIn[]>>;
  showToast?: (msg: string) => void;
}

export default function AdminBottomSheet({
  schedule,
  groups,
  members,
  checkIns,
  reports,
  isReadOnly,
  loading,
  onClose,
  onCheckInsChange,
  showToast,
}: Props) {
  const [drillGroup, setDrillGroup] = useState<Group | null>(null);
  const [shuttleReports, setShuttleReports] = useState<ShuttleReport[]>([]);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  // 일정 변경 시 드릴다운 초기화 + 셔틀 보고 조회
  useEffect(() => {
    if (closingRef.current) return; // 닫힘 애니메이션 중 상태 변경 방지
    setDrillGroup(null);
    if (!schedule?.shuttle_type) {
      setShuttleReports([]);
      return;
    }
    const supabase = createClient();
    supabase
      .from("shuttle_reports")
      .select("*")
      .eq("schedule_id", schedule.id)
      .then(({ data, error }) => {
        if (!error) setShuttleReports((data ?? []) as ShuttleReport[]);
      });
  }, [schedule?.id, schedule?.shuttle_type]);

  const checkedIds = useMemo(() => new Set(checkIns.map((c) => c.user_id)), [checkIns]);
  const absentIds = useMemo(
    () => new Set(checkIns.filter((c) => c.is_absent).map((c) => c.user_id)),
    [checkIns]
  );
  const reportMap = useMemo(() => new Map(reports.map((r) => [r.group_id, r])), [reports]);

  const scopeMembers = useMemo(
    () => filterMembersByScope(members, schedule?.scope ?? "all"),
    [schedule?.scope, members]
  );

  const summaries = useMemo(
    () =>
      groups
        .map((g) => {
          const gMembers = scopeMembers.filter((m) => m.group_id === g.id);
          const absentCount = gMembers.filter((m) => absentIds.has(m.id)).length;
          const checkedCount = gMembers.filter(
            (m) => checkedIds.has(m.id) && !absentIds.has(m.id)
          ).length;
          const totalCount = gMembers.length - absentCount;
          const badge = getGroupBadgeStatus(gMembers.length, checkedCount, reportMap.has(g.id), absentCount);
          const leader = gMembers.find((m) => isLeaderRole(m.role));
          return { group: g, totalCount, checkedCount, absentCount, badge, leader, rawTotal: gMembers.length };
        })
        .filter((s) => s.rawTotal > 0),
    [groups, scopeMembers, checkedIds, absentIds, reportMap]
  );

  const busEntries = useMemo(() => {
    const busGroups = new Map<string, typeof summaries>();
    for (const s of summaries) {
      const bus = s.group.bus_name ?? "미배정";
      if (!busGroups.has(bus)) busGroups.set(bus, []);
      busGroups.get(bus)!.push(s);
    }
    return Array.from(busGroups.entries()).sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [summaries]);

  // 셔틀 일정: 버스별 탑승 현황 집계
  const shuttleEntries = useMemo(() => {
    if (!schedule?.shuttle_type) return null;
    const busField = schedule.shuttle_type === "departure" ? "shuttle_bus" : "return_shuttle_bus";
    const busMap = new Map<string, { busMembers: AdminMember[]; report?: ShuttleReport }>();
    for (const m of scopeMembers) {
      const busName = m[busField];
      if (!busName) continue;
      if (!busMap.has(busName)) busMap.set(busName, { busMembers: [] });
      busMap.get(busName)!.busMembers.push(m);
    }
    for (const r of shuttleReports) {
      if (busMap.has(r.shuttle_bus)) busMap.get(r.shuttle_bus)!.report = r;
    }
    return Array.from(busMap.entries()).sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [schedule?.shuttle_type, scopeMembers, shuttleReports]);

  // 셔틀 일정: 해당 버스 배정 인원만 집계 / 일반 일정: scope 필터 인원
  const displayMembers = useMemo(() => {
    if (!schedule?.shuttle_type) return scopeMembers;
    const busField = schedule.shuttle_type === "departure" ? "shuttle_bus" : "return_shuttle_bus";
    return scopeMembers.filter((m) => !!m[busField]);
  }, [schedule?.shuttle_type, scopeMembers]);

  const totalChecked = useMemo(
    () => displayMembers.filter((m) => checkedIds.has(m.id) && !absentIds.has(m.id)).length,
    [displayMembers, checkedIds, absentIds]
  );

  function deferClose() {
    closingRef.current = true;
    setClosing(true);
    // 애니메이션(200ms) 완료 후 상태 초기화 + 닫기
    setTimeout(() => {
      setDrillGroup(null);
      setShuttleReports([]);
      closingRef.current = false;
      setClosing(false);
      onClose();
    }, 200);
  }

  function handleClose() {
    deferClose();
  }

  return (
    <Dialog
      open={schedule !== null && !closing}
      onOpenChange={(o) => {
        if (!o) {
          // 스택 네비게이션: 드릴다운 → 그리드 → 닫기
          if (drillGroup) {
            setDrillGroup(null);
          } else {
            deferClose();
          }
        }
      }}
    >
      <DialogContent
        hideClose
        className="flex max-h-[85vh] flex-col overflow-hidden p-0"
        onEscapeKeyDown={(e) => {
          if (drillGroup) {
            e.preventDefault();
            setDrillGroup(null);
          }
        }}
        onPointerDownOutside={(e) => {
          if (drillGroup) {
            e.preventDefault();
            setDrillGroup(null);
          }
        }}
      >
        {/* 닫기 버튼 — 드릴다운에서는 숨김 (← 뒤로가기만 노출) */}
        {!drillGroup && (
          <button
            onClick={handleClose}
            className="absolute right-4 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2"
            aria-label="닫기"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        {drillGroup ? (
          <AdminGroupDrillDown
            group={drillGroup}
            members={scopeMembers}
            checkIns={checkIns}
            activeSchedule={isReadOnly ? null : schedule}
            onBack={() => setDrillGroup(null)}
            onCheckInsChange={onCheckInsChange}
            showToast={showToast}
          />
        ) : (
          <>
            <div className="flex-shrink-0 px-6 pt-4">
              <DialogHeader>
                <DialogTitle>{schedule?.location ?? schedule?.title} 현황</DialogTitle>
                <DialogDescription aria-live="polite">
                  {COPY.totalSummary(totalChecked, displayMembers.length)}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="relative overflow-y-auto px-6 pb-6">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-main-action" role="status" aria-label="불러오는 중" />
              </div>
            )}
            {shuttleEntries ? (
              /* 셔틀 일정: 버스별 카드 (드릴다운 없음) */
              <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
                {shuttleEntries.map(([busName, { busMembers, report }]) => {
                  const absentCount = busMembers.filter((m) => absentIds.has(m.id)).length;
                  const checkedCount = busMembers.filter((m) => checkedIds.has(m.id) && !absentIds.has(m.id)).length;
                  const totalCount = busMembers.length - absentCount;
                  const badge = getGroupBadgeStatus(busMembers.length, checkedCount, !!report, absentCount);
                  const b = GROUP_BADGE_STYLE[badge];
                  const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
                  return (
                    <div
                      key={busName}
                      className={cn("rounded-2xl border bg-white p-4", badge === "reported" ? "border-emerald-300" : "border-stone-200")}
                    >
                      <div className="mb-1.5">
                        <span className={cn("inline-block -ml-1 rounded-full px-2 py-0.5 text-[0.8125rem] font-medium", b.bg, b.text)}>
                          {b.label}
                        </span>
                        <p className="mt-1 text-sm font-semibold leading-snug">{busName}</p>
                      </div>
                      <div
                        className="mb-1 h-2 overflow-hidden rounded-full bg-gray-100"
                        role="progressbar"
                        aria-valuenow={checkedCount}
                        aria-valuemax={totalCount}
                        aria-label={`${checkedCount}/${totalCount}명 탑승`}
                      >
                        <div className="h-full rounded-full bg-progress-bar transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {checkedCount} / {busMembers.length}명{absentCount > 0 ? ` (불참 ${absentCount})` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* 일반 일정: 차량별 섹션 + 조 카드 드릴다운 */
              busEntries.map(([busName, busSummaries]) => (
                <section key={busName} className="mb-4">
                  <h3 className="mb-2 text-sm font-bold text-muted-foreground">{busName}</h3>
                  <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
                    {busSummaries.map(({ group, totalCount, checkedCount, absentCount, badge, leader, rawTotal }) => {
                      const b = GROUP_BADGE_STYLE[badge];
                      const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;
                      return (
                        <div
                          key={group.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDrillGroup(group)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setDrillGroup(group);
                            }
                          }}
                          className={cn("cursor-pointer rounded-2xl border bg-white p-4 text-left transition-colors active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action min-h-11", badge === "reported" ? "border-emerald-300" : "border-stone-200")}
                          aria-label={`${group.name} 상세 보기`}
                        >
                          <div className="mb-1.5">
                            <span className={cn("inline-block -ml-1 rounded-full px-2 py-0.5 text-[0.8125rem] font-medium", b.bg, b.text)}>
                              {b.label}
                            </span>
                            <p className="mt-1 text-sm font-semibold leading-snug">{group.name}</p>
                          </div>
                          {leader && (
                            <div className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="truncate">{leader.name}</span>
                              {leader.phone && (
                                <a
                                  href={`tel:${leader.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-main-action"
                                  aria-label={`${leader.name} 조장에게 전화`}
                                >
                                  <PhoneIcon />
                                </a>
                              )}
                            </div>
                          )}
                          <div
                            className="mb-1 h-2 overflow-hidden rounded-full bg-gray-100"
                            role="progressbar"
                            aria-valuenow={checkedCount}
                            aria-valuemax={totalCount}
                            aria-label={`${checkedCount}/${totalCount}명 탑승`}
                          >
                            <div
                              className="h-full rounded-full bg-progress-bar transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {checkedCount} / {rawTotal}명{absentCount > 0 ? ` (불참 ${absentCount})` : ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
