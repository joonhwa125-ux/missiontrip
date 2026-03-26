"use client";

import { useState, useTransition, useRef } from "react";
import { previewFromGoogleSheet, previewFromCsv } from "@/actions/setup";
import { extractSheetId, extractGid } from "@/utils/sheets-parser";
import { cn } from "@/lib/utils";
import { SETUP_SOURCE_KEY } from "@/lib/constants";
import { UploadIcon } from "@/components/ui/icons";
import type { SetupPreviewData } from "@/lib/types";

interface Props {
  onPreviewReady: (data: SetupPreviewData) => void;
}

type SourceTab = "sheets" | "csv";

export default function DataSourceStep({ onPreviewReady }: Props) {
  const [tab, setTab] = useState<SourceTab>("sheets");
  const [usersUrl, setUsersUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const saved = localStorage.getItem(SETUP_SOURCE_KEY);
      if (!saved) return "";
      const s = JSON.parse(saved);
      return s.type === "sheets" ? (s.usersUrl as string) ?? "" : "";
    } catch { return ""; }
  });
  const [schedulesUrl, setSchedulesUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const saved = localStorage.getItem(SETUP_SOURCE_KEY);
      if (!saved) return "";
      const s = JSON.parse(saved);
      return s.type === "sheets" ? (s.schedulesUrl as string) ?? "" : "";
    } catch { return ""; }
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const userFileRef = useRef<HTMLInputElement>(null);
  const scheduleFileRef = useRef<HTMLInputElement>(null);
  const [userFileName, setUserFileName] = useState<string | null>(null);
  const [scheduleFileName, setScheduleFileName] = useState<string | null>(null);

  const handleGoogleSheet = () => {
    const sheetId1 = extractSheetId(usersUrl);
    const sheetId2 = extractSheetId(schedulesUrl);

    if (!sheetId1 || !sheetId2) {
      setError("참가자 탭과 일정 탭 URL을 모두 입력해주세요");
      return;
    }
    if (sheetId1 !== sheetId2) {
      setError("두 URL이 같은 스프레드시트를 가리키지 않아요");
      return;
    }

    const gidUsers = extractGid(usersUrl) ?? "0";
    const gidSchedules = extractGid(schedulesUrl) ?? "0";

    if (gidUsers === gidSchedules) {
      setError("참가자 탭과 일정 탭이 같은 시트예요. 각각 다른 탭에서 URL을 복사해주세요");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await previewFromGoogleSheet(sheetId1, {
        users: gidUsers,
        schedules: gidSchedules,
      });
      if (res.ok && res.data) {
        localStorage.setItem(SETUP_SOURCE_KEY, JSON.stringify({
          type: "sheets", usersUrl, schedulesUrl,
        }));
        onPreviewReady(res.data);
      } else {
        setError(res.error ?? "알 수 없는 오류");
      }
    });
  };

  const handleCsvUpload = () => {
    const userFile = userFileRef.current?.files?.[0];
    const scheduleFile = scheduleFileRef.current?.files?.[0];
    if (!userFile || !scheduleFile) {
      setError("참가자 CSV와 일정 CSV 파일을 모두 선택해주세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      const [usersCsv, schedulesCsv] = await Promise.all([
        userFile.text(),
        scheduleFile.text(),
      ]);
      const res = await previewFromCsv(usersCsv, schedulesCsv);
      if (res.ok && res.data) {
        onPreviewReady(res.data);
      } else {
        setError(res.error ?? "알 수 없는 오류");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* 탭 전환 */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "sheets"}
          aria-controls="panel-sheets"
          onClick={() => { setTab("sheets"); setError(null); }}
          className={cn(
            "min-h-11 flex-1 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-main-action",
            tab === "sheets"
              ? "bg-white font-bold shadow-sm"
              : "text-muted-foreground"
          )}
        >
          Google Sheets
        </button>
        <button
          role="tab"
          aria-selected={tab === "csv"}
          aria-controls="panel-csv"
          onClick={() => { setTab("csv"); setError(null); }}
          className={cn(
            "min-h-11 flex-1 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-main-action",
            tab === "csv"
              ? "bg-white font-bold shadow-sm"
              : "text-muted-foreground"
          )}
        >
          CSV 파일
        </button>
      </div>

      {/* Google Sheets 패널 */}
      {tab === "sheets" && (
        <section id="panel-sheets" role="tabpanel" className="rounded-2xl bg-white p-5">
          <div className="mb-3">
            <label htmlFor="ds-users-url" className="mb-1 block text-sm font-medium">
              참가자 탭 URL
            </label>
            <input
              id="ds-users-url"
              type="url"
              value={usersUrl}
              onChange={(e) => { setUsersUrl(e.target.value); setError(null); }}
              placeholder="참가자 시트 탭을 선택한 후 URL을 복사해 붙여넣기"
              className="w-full rounded-xl border px-3 py-2.5 text-sm focus-visible:ring-2 focus-visible:ring-main-action"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="ds-schedules-url" className="mb-1 block text-sm font-medium">
              일정 탭 URL
            </label>
            <input
              id="ds-schedules-url"
              type="url"
              value={schedulesUrl}
              onChange={(e) => { setSchedulesUrl(e.target.value); setError(null); }}
              placeholder="일정 시트 탭을 선택한 후 URL을 복사해 붙여넣기"
              className="w-full rounded-xl border px-3 py-2.5 text-sm focus-visible:ring-2 focus-visible:ring-main-action"
            />
          </div>
          <button
            onClick={handleGoogleSheet}
            disabled={isPending}
            className="min-h-11 w-full rounded-xl bg-main-action py-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {isPending ? "불러오는 중..." : "불러오기"}
          </button>
        </section>
      )}

      {/* CSV 업로드 패널 */}
      {tab === "csv" && (
        <section id="panel-csv" role="tabpanel" className="rounded-2xl bg-white p-5">
          <div className="mb-2">
            <label className="mb-1 block text-xs text-muted-foreground">
              참가자 CSV (이름, 전화번호, 역할, 소속조, 배정차량, 선후발)
            </label>
            <input
              ref={userFileRef}
              type="file"
              accept=".csv"
              aria-label="참가자 CSV 파일 선택"
              className="sr-only"
              onChange={(e) => {
                setUserFileName(e.target.files?.[0]?.name ?? null);
                setError(null);
              }}
            />
            <button
              type="button"
              onClick={() => userFileRef.current?.click()}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-main-action",
                userFileName
                  ? "border-main-action bg-[#FEF9E7] text-foreground"
                  : "border-gray-300 bg-[#F5F3EF] text-muted-foreground hover:border-main-action hover:bg-[#FEF9E7]"
              )}
            >
              <UploadIcon aria-hidden />
              {userFileName ?? "파일 선택"}
            </button>
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs text-muted-foreground">
              일정 CSV (일차, 순서, 일정명, 장소, 예정시각, 대상)
            </label>
            <input
              ref={scheduleFileRef}
              type="file"
              accept=".csv"
              aria-label="일정 CSV 파일 선택"
              className="sr-only"
              onChange={(e) => {
                setScheduleFileName(e.target.files?.[0]?.name ?? null);
                setError(null);
              }}
            />
            <button
              type="button"
              onClick={() => scheduleFileRef.current?.click()}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-main-action",
                scheduleFileName
                  ? "border-main-action bg-[#FEF9E7] text-foreground"
                  : "border-gray-300 bg-[#F5F3EF] text-muted-foreground hover:border-main-action hover:bg-[#FEF9E7]"
              )}
            >
              <UploadIcon aria-hidden />
              {scheduleFileName ?? "파일 선택"}
            </button>
          </div>
          <button
            onClick={handleCsvUpload}
            disabled={isPending}
            className="min-h-11 w-full rounded-xl bg-main-action py-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "CSV 업로드"}
          </button>
        </section>
      )}

      {/* 오류 표시 */}
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
