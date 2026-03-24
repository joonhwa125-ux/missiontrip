"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  wizard: React.ReactNode;
  currentData: React.ReactNode;
  hasData: boolean;
}

export default function SetupPageTabs({ wizard, currentData, hasData }: Props) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"upload" | "data">("upload");

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

  return (
    <div className="flex min-h-screen flex-col">
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
          <h1 className="text-lg font-bold">설정</h1>
        </div>
      </header>

      {/* 탭 바 */}
      <div
        role="tablist"
        aria-label="셋업 메뉴"
        className="flex gap-1 border-b border-gray-200 bg-white px-4"
      >
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
        <button
          role="tab"
          id="tab-data"
          aria-selected={tab === "data"}
          aria-controls="panel-data"
          onClick={() => setTab("data")}
          disabled={!hasData}
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
