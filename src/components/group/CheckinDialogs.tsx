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
            className="min-h-11 flex-1 rounded-xl bg-red-500 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-red-500"
          >
            취소할게요
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 불참 처리 확인 모달
export function MarkAbsentDialog({
  open,
  target,
  onClose,
  onConfirm,
}: {
  open: boolean;
  target: Member | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>{target?.name} 불참 처리할까요?</DialogTitle>
          <DialogDescription>
            탑승 인원에서 제외돼요.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
            아니요
          </DialogClose>
          <button
            onClick={onConfirm}
            className="min-h-11 flex-1 rounded-xl bg-gray-700 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-ring"
          >
            불참 처리
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 미완료 보고 확인 모달
export function SubmitReportDialog({
  open,
  uncheckedCount,
  onClose,
  onConfirm,
}: {
  open: boolean;
  uncheckedCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose>
        <DialogHeader>
          <DialogTitle>
            {uncheckedCount}명이 아직이에요. 그래도 보고할까요?
          </DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <DialogClose className="min-h-11 flex-1 rounded-xl bg-gray-100 text-sm font-medium">
            취소
          </DialogClose>
          <button
            onClick={onConfirm}
            className="min-h-11 flex-1 rounded-xl bg-main-action text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action"
          >
            보고하기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
