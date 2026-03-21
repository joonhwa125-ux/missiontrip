"use client";

import { useState, useTransition } from "react";
import { useBroadcast } from "@/hooks/useRealtime";
import { CHANNEL_GLOBAL, EVENT_NOTICE } from "@/lib/constants";

export default function NoticeTab() {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [, startTransition] = useTransition();
  const { broadcast } = useBroadcast();

  const handleSend = () => {
    if (!message.trim()) return;
    startTransition(async () => {
      await broadcast(CHANNEL_GLOBAL, EVENT_NOTICE, { message: message.trim() });
      setSent(true);
      setMessage("");
      setTimeout(() => setSent(false), 3000);
    });
  };

  return (
    <div className="px-4 py-4">
      <h2 className="mb-2 text-base font-bold">전체 공지 보내기</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        모든 조장 화면에 파란 배너로 즉시 표시돼요.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="공지 내용을 입력하세요"
        className="w-full resize-none rounded-2xl border bg-white px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
        rows={4}
        aria-label="공지 내용"
      />
      {sent && (
        <p
          className="mt-2 text-sm font-medium text-complete-check"
          role="status"
          aria-live="polite"
        >
          공지가 전송되었어요 ✓
        </p>
      )}
      <button
        onClick={handleSend}
        className="mt-3 w-full min-h-11 rounded-2xl bg-main-action py-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-main-action disabled:opacity-50"
        disabled={!message.trim()}
        aria-label="전체 공지 보내기"
      >
        전체 공지 보내기
      </button>
    </div>
  );
}
