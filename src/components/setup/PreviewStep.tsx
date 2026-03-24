"use client";

import { useState, useTransition } from "react";
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
import { SCOPE_LABEL } from "@/lib/constants";
import type { SetupPreviewData } from "@/lib/types";

interface Props {
  data: SetupPreviewData;
  onImportDone: (result: { groups: number; users: number; schedules: number }) => void;
  onImportError: (error: string) => void;
  onBack: () => void;
}

export default function PreviewStep({
  data,
  onImportDone,
  onImportError,
  onBack,
}: Props) {
  const [tab, setTab] = useState<"users" | "schedules">("users");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const leaderCount = data.users.filter((u) => u.role === "leader" || u.role === "admin_leader").length;
  const memberCount = data.users.filter((u) => u.role === "member").length;
  const adminCount = data.users.filter((u) => u.role === "admin" || u.role === "admin_leader").length;
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

      {/* 검증 오류 */}
      {hasErrors && <ValidationErrorList errors={data.errors} />}

      {/* 탭 */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        {(["users", "schedules"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "min-h-11 flex-1 rounded-lg py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-main-action",
              tab === t ? "bg-white shadow-sm" : "text-muted-foreground"
            )}
          >
            {t === "users" ? "참가자" : "일정"}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div
        role="tabpanel"
        className="max-h-96 overflow-auto rounded-xl bg-white"
      >
        {tab === "users" ? (
          <table className="text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-xs text-muted-foreground">
                <th className="min-w-[36px] px-3 py-2 text-center">#</th>
                <th className="sticky left-0 z-10 min-w-[96px] bg-gray-50 px-3 py-2 text-left">이름</th>
                <th className="min-w-[110px] px-3 py-2 text-left">전화번호</th>
                <th className="min-w-[80px] px-3 py-2 text-center">역할</th>
                <th className="min-w-[96px] px-3 py-2 text-center">소속조</th>
                <th className="min-w-[64px] px-3 py-2 text-center">선후발</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u, i) => (
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
                  <td className="px-3 py-2 text-center">{u.role}</td>
                  <td className="px-3 py-2 text-center">{u.group_name}</td>
                  <td className="px-3 py-2 text-center">{u.party ? (SCOPE_LABEL[u.party] ?? "-") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-xs text-muted-foreground">
                <th className="min-w-[48px] px-3 py-2 text-center">일차</th>
                <th className="min-w-[36px] px-3 py-2 text-center">순서</th>
                <th className="min-w-[160px] px-3 py-2 text-left">일정명</th>
                <th className="min-w-[120px] px-3 py-2 text-left">장소</th>
                <th className="min-w-[56px] px-3 py-2 text-center">시각</th>
                <th className="min-w-[48px] px-3 py-2 text-center">대상</th>
              </tr>
            </thead>
            <tbody>
              {data.schedules.map((s, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 text-center">{s.day_number}</td>
                  <td className="px-3 py-2 text-center">{s.sort_order}</td>
                  <td className="px-3 py-2 font-medium">{s.title}</td>
                  <td className="px-3 py-2">{s.location ?? "-"}</td>
                  <td className="px-3 py-2 text-center">{s.scheduled_time ?? "-"}</td>
                  <td className="px-3 py-2 text-center">
                    {s.scope === "all" ? "전체" : (SCOPE_LABEL[s.scope] ?? s.scope)}
                  </td>
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
          className="min-h-11 flex-1 rounded-xl bg-gray-100 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-main-action"
        >
          뒤로
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          className={cn(
            "min-h-11 flex-1 rounded-xl py-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2 disabled:opacity-50",
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
              className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action"
            >
              반영하기
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
