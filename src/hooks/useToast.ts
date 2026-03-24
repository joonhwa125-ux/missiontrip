"use client";

import { useState, useEffect, useCallback } from "react";

/** 일정 시간 후 자동 사라지는 토스트 상태 관리 훅 */
export function useToast(duration = 5000) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), duration);
    return () => clearTimeout(timer);
  }, [toast, duration]);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  return { toast, showToast };
}
