"use client";

import { useState, useTransition, useMemo } from "react";
import { importToDatabase } from "@/actions/setup";
import ValidationErrorList from "./ValidationErrorList";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SCOPE_LABEL, ROLE_LABEL } from "@/lib/constants";
import type { SetupPreviewData } from "@/lib/types";

interface Props {
  data: SetupPreviewData;
  onImportDone: (result: { groups: number; users: number; schedules: number }) => void;
  onImportError: (error: string) => void;
  onBack: () => void;
}

type PreviewTab = "users" | "schedules" | "group_info" | "member_info";

export default function PreviewStep({
  data,
  onImportDone,
  onImportError,
  onBack,
}: Props) {
  const hasGroupInfo = data.groupInfos.length > 0;
  const hasMemberInfo = data.memberInfos.length > 0;
  const [tab, setTab] = useState<PreviewTab>("users");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { leaderCount, memberCount, adminCount } = useMemo(() => {
    let leaders = 0, members = 0, admins = 0;
    for (const u of data.users) {
      if (u.role === "leader" || u.role === "admin_leader") leaders++;
      if (u.role === "member") members++;
      if (u.role === "admin" || u.role === "admin_leader") admins++;
    }
    return { leaderCount: leaders, memberCount: members, adminCount: admins };
  }, [data.users]);
  const hasErrors = data.errors.length > 0;
  const errorRows = new Set(data.errors.map((e) => e.row));

  const handleImport = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await importToDatabase(data);
      if (res.ok && res.data) {
        onImportDone(res.data);
      } else {
        onImportError(res.error ?? "알 수 없는 오류");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white p-3 text-center">
          <p className="text-2xl font-bold">{data.groups.length}</p>
          <p className="text-xs text-muted-foreground">조(차량)</p>
        </div>
        <div className="rounded-xl bg-white p-3 text-center">
          <p className="text-2xl font-bold">{data.users.length}</p>
          <p className="text-xs text-muted-foreground">참가자</p>
        </div>
        <div className="rounded-xl bg-white p-3 text-center">
          <p className="text-2xl font-bold">{data.schedules.length}</p>
          <p className="text-xs text-muted-foreground">일정</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        조장 {leaderCount}명 / 조원 {memberCount}명 / 관리자 {adminCount}명
      </p>

      {/* 조-차량 매핑 요약 */}
      {data.groups.some((g) => g.bus_name !== g.name) && (
        <div className="rounded-xl bg-white p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">차량 배정</p>
          <div className="flex flex-wrap gap-1.5">
            {data.groups.map((g) => (
              <span key={g.name} className="rounded-lg bg-gray-50 px-2 py-1 text-xs">
                {g.name} → {g.bus_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 선후발 인원 요약 */}
      {data.users.some((u) => u.party) && (
        <div className="rounded-xl bg-white p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">선후발 배정</p>
          <p className="text-xs text-muted-foreground">
            선발 {data.users.filter((u) => u.party === "advance").length}명 / 후발 {data.users.filter((u) => u.party === "rear").length}명
          </p>
        </div>
      )}

      {/* v2 배정 정보 요약 */}
      {(hasGroupInfo || hasMemberInfo || data.users.some((u) => u.airline || u.return_airline || u.trip_role)) && (
        <div className="rounded-xl bg-white p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">v2 배정 정보</p>
          <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {data.users.some((u) => u.airline) && (
              <span>가는편 항공사 {data.users.filter((u) => u.airline).length}명</span>
            )}
            {data.users.some((u) => u.return_airline) && (
              <span>· 오는편 항공사 {data.users.filter((u) => u.return_airline).length}명</span>
            )}
            {data.users.some((u) => u.trip_role) && (
              <span>· 여행역할 {data.users.filter((u) => u.trip_role).length}명</span>
            )}
            {hasGroupInfo && <span>· 조별배정 {data.groupInfos.length}건</span>}
            {hasMemberInfo && <span>· 인원별배정 {data.memberInfos.length}건</span>}
          </div>
        </div>
      )}

      {/* 검증 오류 */}
      {hasErrors && <ValidationErrorList errors={data.errors} />}

      {/* 탭 — 배정 정보가 있으면 탭 추가 */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "users"}
          onClick={() => setTab("users")}
          className={cn(
            "min-h-11 flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
            tab === "users" ? "bg-white shadow-sm" : "text-muted-foreground"
          )}
        >
          참가자
        </button>
        <button
          role="tab"
          aria-selected={tab === "schedules"}
          onClick={() => setTab("schedules")}
          className={cn(
            "min-h-11 flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
            tab === "schedules" ? "bg-white shadow-sm" : "text-muted-foreground"
          )}
        >
          일정
        </button>
        {hasGroupInfo && (
          <button
            role="tab"
            aria-selected={tab === "group_info"}
            onClick={() => setTab("group_info")}
            className={cn(
              "min-h-11 flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
              tab === "group_info" ? "bg-white shadow-sm" : "text-muted-foreground"
            )}
          >
            조별배정
          </button>
        )}
        {hasMemberInfo && (
          <button
            role="tab"
            aria-selected={tab === "member_info"}
            onClick={() => setTab("member_info")}
            className={cn(
              "min-h-11 flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
              tab === "member_info" ? "bg-white shadow-sm" : "text-muted-foreground"
            )}
          >
            인원별배정
          </button>
        )}
      </div>

      {/* 테이블 */}
      <div
        role="tabpanel"
        className="max-h-96 overflow-auto rounded-xl bg-white"
      >
        {tab === "users" && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-center text-xs text-muted-foreground">
                <th className="min-w-[36px] px-3 py-2">#</th>
                <th className="sticky left-0 z-10 min-w-[96px] bg-gray-50 px-3 py-2">이름</th>
                <th className="min-w-[110px] px-3 py-2">전화번호</th>
                <th className="min-w-[80px] px-3 py-2">역할</th>
                <th className="min-w-[96px] px-3 py-2">조편성</th>
                <th className="min-w-[96px] px-3 py-2">배정차량</th>
                <th className="min-w-[120px] px-3 py-2">출발셔틀</th>
                <th className="min-w-[120px] px-3 py-2">귀가셔틀</th>
                <th className="min-w-[64px] px-3 py-2">구분</th>
                <th className="min-w-[96px] px-3 py-2">가는편</th>
                <th className="min-w-[96px] px-3 py-2">오는편</th>
                <th className="min-w-[120px] px-3 py-2">여행역할</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u, i) => {
                const busName = data.groups.find((g) => g.name === u.group_name)?.bus_name ?? "-";
                return (
                <tr
                  key={i}
                  className={cn(
                    "border-t",
                    errorRows.has(i + 2) && "bg-red-50"
                  )}
                >
                  <td className="px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium shadow-[1px_0_0_0_#e5e7eb]">{u.name}</td>
                  <td className="px-3 py-2">{u.phone ?? "-"}</td>
                  <td className="px-3 py-2 text-center">{ROLE_LABEL[u.role]}</td>
                  <td className="px-3 py-2 text-center">{u.group_name}</td>
                  <td className="px-3 py-2 text-center">{busName}</td>
                  <td className="px-3 py-2 text-center">{u.shuttle_bus ?? "-"}</td>
                  <td className="px-3 py-2 text-center">{u.return_shuttle_bus ?? "-"}</td>
                  <td className="px-3 py-2 text-center">{u.party ? (SCOPE_LABEL[u.party] ?? "-") : "-"}</td>
                  <td className="px-3 py-2 text-center">{u.airline ?? "-"}</td>
                  <td className="px-3 py-2 text-center">{u.return_airline ?? "-"}</td>
                  <td className="px-3 py-2 text-center">{u.trip_role ?? "-"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === "schedules" && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-center text-xs text-muted-foreground">
                <th className="min-w-[48px] px-3 py-2">일정</th>
                <th className="min-w-[36px] px-3 py-2">순서</th>
                <th className="min-w-[120px] px-3 py-2">장소</th>
                <th className="min-w-[160px] px-3 py-2">집결지</th>
                <th className="min-w-[56px] px-3 py-2">예정 시간</th>
                <th className="min-w-[48px] px-3 py-2">구분</th>
                <th className="min-w-[72px] px-3 py-2">셔틀</th>
                <th className="min-w-[72px] px-3 py-2">항공</th>
              </tr>
            </thead>
            <tbody>
              {data.schedules.map((s, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 text-center">{s.day_number}</td>
                  <td className="px-3 py-2 text-center">{s.sort_order}</td>
                  <td className="px-3 py-2">{s.location ?? "-"}</td>
                  <td className="px-3 py-2 font-medium">{s.title}</td>
                  <td className="px-3 py-2 text-center">{s.scheduled_time ?? "-"}</td>
                  <td className="px-3 py-2 text-center">
                    {SCOPE_LABEL[s.scope]}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.shuttle_type === "departure" ? "출발" : s.shuttle_type === "return" ? "귀가" : "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.airline_leg === "outbound" ? "가는편" : s.airline_leg === "return" ? "오는편" : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "group_info" && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-center text-xs text-muted-foreground">
                <th className="min-w-[48px] px-3 py-2">일정</th>
                <th className="min-w-[36px] px-3 py-2">순서</th>
                <th className="min-w-[72px] px-3 py-2">조</th>
                <th className="min-w-[80px] px-3 py-2">층수</th>
                <th className="min-w-[96px] px-3 py-2">순환</th>
                <th className="min-w-[96px] px-3 py-2">장소상세</th>
                <th className="min-w-[160px] px-3 py-2">메모</th>
              </tr>
            </thead>
            <tbody>
              {data.groupInfos.map((gi, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 text-center">{gi.day_number}</td>
                  <td className="px-3 py-2 text-center">{gi.sort_order}</td>
                  <td className="px-3 py-2 text-center font-medium">{gi.group_name}</td>
                  <td className="px-3 py-2 text-center">{gi.location_detail ?? "-"}</td>
                  <td className="px-3 py-2 text-center">{gi.rotation ?? "-"}</td>
                  <td className="px-3 py-2 text-center">{gi.sub_location ?? "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{gi.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "member_info" && (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-center text-xs text-muted-foreground">
                <th className="min-w-[48px] px-3 py-2">일정</th>
                <th className="min-w-[36px] px-3 py-2">순서</th>
                <th className="min-w-[96px] px-3 py-2">이름</th>
                <th className="min-w-[72px] px-3 py-2">항목</th>
                <th className="min-w-[160px] px-3 py-2">값</th>
              </tr>
            </thead>
            <tbody>
              {data.memberInfos.map((mi, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 text-center">{mi.day_number}</td>
                  <td className="px-3 py-2 text-center">{mi.sort_order}</td>
                  <td className="px-3 py-2 font-medium">{mi.user_name}</td>
                  <td className="px-3 py-2 text-center">{mi.field}</td>
                  <td className="px-3 py-2">{mi.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 버튼 */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="min-h-11 flex-1 rounded-xl bg-gray-100 py-3 text-sm font-medium"
        >
          뒤로
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          className={cn(
            "min-h-11 flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-50",
            hasErrors ? "bg-gray-200 text-gray-500" : "bg-main-action"
          )}
        >
          {isPending ? "반영 중..." : "DB에 반영"}
        </button>
      </div>

      {/* 확인 모달 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent hideClose aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {hasErrors
                ? "검증 오류가 있어요. 그래도 반영할까요?"
                : "기존 데이터를 덮어씁니다. 계속할까요?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            조 {data.groups.length}개, 참가자 {data.users.length}명, 일정{" "}
            {data.schedules.length}개
          </p>
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              취소
            </DialogClose>
            <button
              onClick={handleImport}
              className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold"
            >
              반영하기
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
