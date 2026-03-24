"use client";

import { useState, useTransition } from "react";
import { resetAllData } from "@/actions/setup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

const CONFIRM_WORD = "초기화";

export default function ResetDataButton() {
  const [step, setStep] = useState<1 | 2 | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const openStep1 = () => { setStep(1); setInputValue(""); };
  const closeDialog = () => { setStep(null); setInputValue(""); };

  const handleReset = () => {
    closeDialog();
    startTransition(async () => {
      const res = await resetAllData();
      setResult(res.ok ? "전체 데이터가 초기화되었어요" : res.error ?? "초기화 실패");
    });
  };

  return (
    <>
      <button
        onClick={openStep1}
        disabled={isPending}
        className="min-h-11 text-sm font-medium text-red-500 focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
      >
        {isPending ? "초기화 중..." : "전체 데이터 초기화"}
      </button>

      {result && (
        <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
          {result}
        </p>
      )}

      {/* 1단계: 경고 확인 */}
      <Dialog open={step === 1} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent hideClose aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>정말 초기화할까요?</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            모든 체크인, 보고, 참가자 데이터가 삭제됩니다.
            <br />
            이 작업은 되돌릴 수 없어요.
          </p>
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              취소
            </DialogClose>
            <button
              onClick={() => setStep(2)}
              className="min-h-11 flex-1 rounded-xl bg-red-500 text-sm font-bold text-white focus-visible:ring-2 focus-visible:ring-red-500"
            >
              계속
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2단계: "초기화" 텍스트 입력 확인 */}
      <Dialog open={step === 2} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent hideClose aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>아래에 &ldquo;{CONFIRM_WORD}&rdquo;를 입력하세요</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoFocus
            className="w-full rounded-xl border px-4 py-3 text-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            aria-label={`확인 단어 입력 — "${CONFIRM_WORD}" 입력 시 초기화 버튼 활성화`}
          />
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              취소
            </DialogClose>
            <button
              onClick={handleReset}
              disabled={inputValue !== CONFIRM_WORD}
              className="min-h-11 flex-1 rounded-xl bg-red-500 text-sm font-bold text-white focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-40"
            >
              초기화
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
