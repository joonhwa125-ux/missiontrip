"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SettingsIcon, DatabaseIcon, LogOutIcon } from "@/components/ui/icons";

interface Props {
  showDataManagement?: boolean;
}

export default function SettingsDropdown({ showDataManagement = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loggingOutRef = useRef(false);

  // 외부 클릭 + ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    function handlePointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }, [router]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900"
        aria-label="설정"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <SettingsIcon className="h-6 w-6" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          {showDataManagement && (
            <Link
              href="/setup"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-11 w-full items-center gap-2 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900"
            >
              <DatabaseIcon className="h-4 w-4" aria-hidden />
              데이터 관리
            </Link>
          )}
          <button
            role="menuitem"
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center gap-2 px-4 text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900"
          >
            <LogOutIcon className="h-4 w-4" aria-hidden />
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
