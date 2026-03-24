"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  wizard: React.ReactNode;
  currentData: React.ReactNode;
  hasData: boolean;
}

export default function SetupPageTabs({ wizard, currentData, hasData }: Props) {
  const [tab, setTab] = useState<"upload" | "data">("upload");

  return (
    <div className="flex min-h-screen flex-col">
      {/* 상단 탭 */}
      <div
        role="tablist"
        aria-label="셋업 메뉴"
        className="flex gap-1 border-b border-gray-200 bg-white px-4 pt-2"
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
