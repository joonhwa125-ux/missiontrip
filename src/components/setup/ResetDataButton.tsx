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

export default function ResetDataButton() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const handleReset = () => {
    setOpen(false);
    startTransition(async () => {
      const res = await resetAllData();
      setResult(res.ok ? "전체 데이터가 초기화되었어요" : res.error ?? "초기화 실패");
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="min-h-11 text-sm font-medium text-red-500 focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
      >
        {isPending ? "초기화 중..." : "전체 데이터 초기화"}
      </button>

      {result && (
        <p
          aria-live="polite"
          className="mt-2 text-sm text-muted-foreground"
        >
          {result}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>정말 초기화할까요?</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            모든 체크인, 보고, 참가자 데이터가 삭제됩니다.
          </p>
          <DialogFooter>
            <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
              취소
            </DialogClose>
            <button
              onClick={handleReset}
              className="min-h-11 flex-1 rounded-xl bg-red-500 text-sm font-bold text-white focus-visible:ring-2 focus-visible:ring-red-500"
            >
              초기화
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
