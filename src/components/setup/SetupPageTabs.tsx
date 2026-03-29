"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeftIcon, ArrowPathIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { SETUP_LAST_SYNCED_KEY, SETUP_SOURCE_KEY } from "@/lib/constants";

interface Props {
  wizard: React.ReactNode;
  currentData: React.ReactNode;
  hasData: boolean;
}

/** 동기화 시각을 "M/D HH:MM" KST 형식으로 표시 */
function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function SetupPageTabs({ wizard, currentData, hasData }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"upload" | "data">("upload");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [hasSheetSource, setHasSheetSource] = useState(false);

  // 탭 결정 우선순위:
  // 1. ?tab=upload 명시 → 업로드 탭
  // 2. hasData=true → 현재 데이터 탭 (재진입 시에도 편집 뷰 바로 접근)
  // 3. 그 외 → 업로드 탭
  useEffect(() => {
    if (searchParams.get("tab") === "upload") {
      setTab("upload");
    } else if (hasData) {
      setTab("data");
    }
  }, [searchParams, hasData]);

  // localStorage에서 동기화 정보 읽기 (탭 전환 시 갱신)
  useEffect(() => {
    setLastSynced(localStorage.getItem(SETUP_LAST_SYNCED_KEY));
    try {
      const src = localStorage.getItem(SETUP_SOURCE_KEY);
      setHasSheetSource(!!src && JSON.parse(src).type === "sheets");
    } catch {
      setHasSheetSource(false);
    }
  }, [tab]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col min-h-screen bg-app-bg">
      {/* 페이지 헤더 (단일) */}
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-2 py-1">
        <div className="flex items-center gap-1">
          <Link
            href="/admin"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-gray-900"
            aria-label="관리자 화면으로 돌아가기"
          >
            <ChevronLeftIcon aria-hidden />
          </Link>
          <h1 className="text-lg font-bold">데이터 관리</h1>
        </div>
        {hasData && (
          <button
            onClick={() => router.push(
              hasSheetSource ? "/setup?tab=upload&resync=1" : "/setup?tab=upload"
            )}
            className="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-lg px-2 py-1 text-gray-500 focus-visible:ring-2 focus-visible:ring-gray-900"
            aria-label="데이터 다시 불러오기"
          >
            <ArrowPathIcon className="h-4 w-4" aria-hidden />
            {lastSynced && (
              <span className="mt-0.5 text-xs leading-none text-muted-foreground">
                {formatSyncTime(lastSynced)}
              </span>
            )}
          </button>
        )}
      </header>

      {/* 탭 바 */}
      <div className="flex items-center border-b border-gray-200 bg-white px-4">
        <div
          role="tablist"
          aria-label="셋업 메뉴"
          className="flex flex-1 gap-1"
        >
          <button
            role="tab"
            id="tab-data"
            aria-selected={tab === "data"}
            aria-controls="panel-data"
            aria-disabled={!hasData}
            onClick={() => { if (hasData) setTab("data"); }}
            className={cn(
              "min-h-11 rounded-t-lg px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action",
              tab === "data"
                ? "border-b-2 border-gray-900 text-gray-900"
                : "text-muted-foreground hover:text-gray-600",
              !hasData && "cursor-not-allowed opacity-40"
            )}
          >
            현재 데이터
            {!hasData && <span className="ml-1 text-xs">(없음)</span>}
          </button>
          <button
            role="tab"
            id="tab-upload"
            aria-selected={tab === "upload"}
            aria-controls="panel-upload"
            onClick={() => setTab("upload")}
            className={cn(
              "min-h-11 rounded-t-lg px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action",
              tab === "upload"
                ? "border-b-2 border-gray-900 text-gray-900"
                : "text-muted-foreground hover:text-gray-600"
            )}
          >
            데이터 업로드
          </button>
        </div>
      </div>

      <div
        id="panel-upload"
        role="tabpanel"
        aria-labelledby="tab-upload"
        className={tab !== "upload" ? "hidden" : undefined}
      >
        {wizard}
      </div>
      <div
        id="panel-data"
        role="tabpanel"
        aria-labelledby="tab-data"
        className={tab !== "data" ? "hidden" : undefined}
      >
        {currentData}
      </div>
    </div>
  );
}
