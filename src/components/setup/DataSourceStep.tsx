"use client";

import { useState, useTransition, useRef } from "react";
import { previewFromGoogleSheet, previewFromCsv } from "@/actions/setup";
import { extractSheetId } from "@/utils/sheets-parser";
import type { SetupPreviewData } from "@/lib/types";

interface Props {
  onPreviewReady: (data: SetupPreviewData) => void;
}

export default function DataSourceStep({ onPreviewReady }: Props) {
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
    <div className="space-y-6">
      {/* Google Sheets 입력 */}
      <section className="rounded-2xl bg-white p-5">
        <h2 className="mb-3 font-bold">Google Sheets에서 불러오기</h2>
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

      {/* CSV 업로드 대안 */}
      <section className="rounded-2xl bg-white p-5">
        <h2 className="mb-3 font-bold">CSV 파일 업로드</h2>
        <div className="mb-2">
          <label className="mb-1 block text-xs text-muted-foreground">
            참가자 CSV (이름, 전화번호, 역할, 소속조, 배정차량)
          </label>
          <input
            ref={userFileRef}
            type="file"
            accept=".csv"
            className="w-full text-sm"
          />
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-xs text-muted-foreground">
            일정 CSV (일차, 순서, 일정명, 장소, 예정시각)
          </label>
          <input
            ref={scheduleFileRef}
            type="file"
            accept=".csv"
            className="w-full text-sm"
          />
        </div>
        <button
          onClick={handleCsvUpload}
          disabled={isPending}
          className="min-h-11 w-full rounded-xl bg-gray-100 py-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {isPending ? "처리 중..." : "CSV 업로드"}
        </button>
      </section>

      {/* 오류 표시 */}
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
