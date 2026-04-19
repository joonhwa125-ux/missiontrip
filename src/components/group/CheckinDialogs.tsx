"use client";

import { useState, useEffect, useId } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { COPY } from "@/lib/constants";
import type { GroupMember } from "@/lib/types";
import { cn } from "@/lib/utils";

type Member = GroupMember;

// 체크인/불참 취소 확인 모달
export function CancelCheckinDialog({
  open,
  target,
  onClose,
  onConfirm,
}: {
  open: boolean;
  target: { member: Member; isAbsent: boolean } | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>
            {target?.isAbsent ? COPY.absentCancel : "체크인을 취소할까요?"}
          </DialogTitle>
          <DialogDescription>
            {target?.member.name}님의 {target?.isAbsent ? "불참" : "탑승 확인"}을 취소해요.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
            아니요
          </DialogClose>
          <button
            onClick={onConfirm}
            className="min-h-11 flex-1 rounded-xl bg-red-500 text-sm font-medium text-white"
          >
            취소할게요
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// v2: 불참 사유 선택 옵션 정의
// 숫자 인덱스 대신 고정 키 사용 — DB에 저장될 값과 일치
export const ABSENCE_REASONS = [
  { value: "숙소", label: "숙소 휴식", description: "호텔·숙소에서 쉬고 있어요" },
  { value: "근무", label: "근무", description: "업무 중이에요" },
  { value: "의료", label: "의료", description: "병원·치료 중이에요" },
  { value: "기타", label: "기타", description: "직접 입력할게요" },
] as const;

export type AbsenceReasonValue = (typeof ABSENCE_REASONS)[number]["value"];

const MAX_REASON_LENGTH = 200;

// 불참 처리 모달 — v2: 사유 선택 + 위치(선택)
export function MarkAbsentDialog({
  open,
  target,
  onClose,
  onConfirm,
}: {
  open: boolean;
  target: Member | null;
  onClose: () => void;
  onConfirm: (reason: string | null, location: string | null) => void;
}) {
  const [selectedReason, setSelectedReason] = useState<AbsenceReasonValue | null>(null);
  const [customText, setCustomText] = useState("");
  const [location, setLocation] = useState("");
  const groupId = useId();

  // 모달 열릴 때마다 초기화
  useEffect(() => {
    if (open) {
      setSelectedReason(null);
      setCustomText("");
      setLocation("");
    }
  }, [open]);

  const handleSubmit = () => {
    if (!selectedReason) return;

    let reason: string | null = null;
    if (selectedReason === "기타") {
      const trimmed = customText.trim();
      if (!trimmed) return; // 기타 선택 시 텍스트 필수
      reason = `기타: ${trimmed.slice(0, MAX_REASON_LENGTH)}`;
    } else {
      reason = selectedReason;
    }

    const finalLocation = location.trim()
      ? location.trim().slice(0, MAX_REASON_LENGTH)
      : null;

    onConfirm(reason, finalLocation);
  };

  const canSubmit =
    selectedReason !== null &&
    (selectedReason !== "기타" || customText.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>{target?.name} 불참 처리</DialogTitle>
          <DialogDescription>사유를 선택해주세요.</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="sr-only">불참 사유 선택</legend>
          <div role="radiogroup" aria-required="true" className="space-y-2">
            {ABSENCE_REASONS.map((r) => {
              const checked = selectedReason === r.value;
              return (
                <label
                  key={r.value}
                  htmlFor={`${groupId}-${r.value}`}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                    checked
                      ? "border-main-action bg-main-action-soft"
                      : "border-stone-200 bg-white hover:border-stone-300"
                  )}
                >
                  <input
                    type="radio"
                    id={`${groupId}-${r.value}`}
                    name={`${groupId}-absence-reason`}
                    value={r.value}
                    checked={checked}
                    onChange={() => setSelectedReason(r.value)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 accent-stone-700"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{r.label}</span>
                    <span className="block text-xs text-muted-foreground">{r.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* 기타 선택 시: 직접 입력 필드 */}
        {selectedReason === "기타" && (
          <div className="mt-1">
            <label htmlFor={`${groupId}-custom`} className="mb-1 block text-xs font-medium text-muted-foreground">
              사유 입력
            </label>
            <input
              id={`${groupId}-custom`}
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              maxLength={MAX_REASON_LENGTH}
              placeholder="사유를 간단히 입력해주세요"
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
              autoFocus
            />
          </div>
        )}

        {/* 의료 선택 시: 위치 선택 입력 (선택 사항) */}
        {selectedReason === "의료" && (
          <div className="mt-1">
            <label htmlFor={`${groupId}-location`} className="mb-1 block text-xs font-medium text-muted-foreground">
              위치 <span className="text-muted-foreground/70">(선택)</span>
            </label>
            <input
              id={`${groupId}-location`}
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={MAX_REASON_LENGTH}
              placeholder="예: 서귀포 의료원"
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
            />
          </div>
        )}

        <DialogFooter>
          <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
            아니요
          </DialogClose>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            className={cn(
              "min-h-11 flex-1 rounded-xl text-sm font-medium text-white transition-opacity",
              canSubmit ? "bg-gray-700" : "bg-gray-300"
            )}
          >
            불참 처리
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
