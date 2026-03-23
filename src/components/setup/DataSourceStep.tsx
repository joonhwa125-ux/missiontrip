"use client";

import { useState, useTransition, useRef } from "react";
import { previewFromGoogleSheet, previewFromCsv } from "@/actions/setup";
import { extractSheetId } from "@/utils/sheets-parser";
import { cn } from "@/lib/utils";
import type { SetupPreviewData } from "@/lib/types";

interface Props {
  onPreviewReady: (data: SetupPreviewData) => void;
}

type SourceTab = "sheets" | "csv";

export default function DataSourceStep({ onPreviewReady }: Props) {
  const [tab, setTab] = useState<SourceTab>("sheets");
  const [sheetUrl, setSheetUrl] = useState("");
  const [gidUsers, setGidUsers] = useState("0");
  const [gidSchedules, setGidSchedules] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const userFileRef = useRef<HTMLInputElement>(null);
  const scheduleFileRef = useRef<HTMLInputElement>(null);

  const handleGoogleSheet = () => {
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      setError("올바른 Google Sheets URL을 입력해주세요");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await previewFromGoogleSheet(sheetId, {
        users: gidUsers,
        schedules: gidSchedules,
      });
      if (res.ok && res.data) {
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
          <label className="mb-1 block text-sm text-muted-foreground">
            Sheet URL
          </label>
          <input
            type="url"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="mb-3 w-full rounded-xl border px-3 py-2.5 text-sm focus-visible:ring-2 focus-visible:ring-main-action"
          />
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                참가자 탭 GID
              </label>
              <input
                type="text"
                value={gidUsers}
                onChange={(e) => setGidUsers(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-main-action"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                일정 탭 GID
              </label>
              <input
                type="text"
                value={gidSchedules}
                onChange={(e) => setGidSchedules(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-main-action"
              />
            </div>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            시트 탭 선택 시 URL에서 #gid=숫자 확인. 기본: 첫 번째 탭=0
          </p>
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
              className="w-full text-sm"
            />
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
              className="w-full text-sm"
            />
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
