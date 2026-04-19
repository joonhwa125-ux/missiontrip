"use client";

import { useState, useTransition, useRef } from "react";
import { previewFromGoogleSheet, previewFromCsv } from "@/actions/setup";
import { extractSheetId, extractGid } from "@/utils/sheets-parser";
import { cn } from "@/lib/utils";
import { SETUP_SOURCE_KEY, SETUP_CSV_KEY } from "@/lib/constants";
import { UploadIcon } from "@/components/ui/icons";
import type { SetupPreviewData } from "@/lib/types";

interface Props {
  onPreviewReady: (data: SetupPreviewData) => void;
}

type SourceTab = "sheets" | "csv";

// localStorage에서 저장된 소스 정보를 한 번만 파싱
function loadSavedSource() {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(SETUP_SOURCE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

function loadSavedCsv() {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(SETUP_CSV_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

export default function DataSourceStep({ onPreviewReady }: Props) {
  const saved = loadSavedSource();
  const savedCsv = loadSavedCsv();

  const [tab, setTab] = useState<SourceTab>(saved?.type === "csv" ? "csv" : "sheets");
  const [usersUrl, setUsersUrl] = useState<string>(
    saved?.type === "sheets" ? (saved.usersUrl ?? "") : ""
  );
  const [schedulesUrl, setSchedulesUrl] = useState<string>(
    saved?.type === "sheets" ? (saved.schedulesUrl ?? "") : ""
  );
  // v2 optional fields
  const [groupInfoUrl, setGroupInfoUrl] = useState<string>(
    saved?.type === "sheets" ? (saved.groupInfoUrl ?? "") : ""
  );
  const [memberInfoUrl, setMemberInfoUrl] = useState<string>(
    saved?.type === "sheets" ? (saved.memberInfoUrl ?? "") : ""
  );

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const userFileRef = useRef<HTMLInputElement>(null);
  const scheduleFileRef = useRef<HTMLInputElement>(null);
  const groupInfoFileRef = useRef<HTMLInputElement>(null);
  const memberInfoFileRef = useRef<HTMLInputElement>(null);

  const [userFileName, setUserFileName] = useState<string | null>(
    saved?.type === "csv" ? (savedCsv?.userFileName ?? null) : null
  );
  const [scheduleFileName, setScheduleFileName] = useState<string | null>(
    saved?.type === "csv" ? (savedCsv?.scheduleFileName ?? null) : null
  );
  const [groupInfoFileName, setGroupInfoFileName] = useState<string | null>(
    saved?.type === "csv" ? (savedCsv?.groupInfoFileName ?? null) : null
  );
  const [memberInfoFileName, setMemberInfoFileName] = useState<string | null>(
    saved?.type === "csv" ? (savedCsv?.memberInfoFileName ?? null) : null
  );

  // 복원된 CSV 내용 (재선택 없이 업로드 가능)
  const [restoredUsersCsv, setRestoredUsersCsv] = useState<string | null>(
    saved?.type === "csv" ? (savedCsv?.usersCsv ?? null) : null
  );
  const [restoredSchedulesCsv, setRestoredSchedulesCsv] = useState<string | null>(
    saved?.type === "csv" ? (savedCsv?.schedulesCsv ?? null) : null
  );
  const [restoredGroupInfoCsv, setRestoredGroupInfoCsv] = useState<string | null>(
    saved?.type === "csv" ? (savedCsv?.groupInfoCsv ?? null) : null
  );
  const [restoredMemberInfoCsv, setRestoredMemberInfoCsv] = useState<string | null>(
    saved?.type === "csv" ? (savedCsv?.memberInfoCsv ?? null) : null
  );

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

    // v2 옵션 GID (입력된 경우만 사용 — 같은 스프레드시트 검증)
    let gidGroupInfo: string | null = null;
    let gidMemberInfo: string | null = null;
    if (groupInfoUrl.trim()) {
      const sid = extractSheetId(groupInfoUrl);
      if (!sid || sid !== sheetId1) {
        setError("조 브리핑 URL은 같은 스프레드시트여야 해요");
        return;
      }
      gidGroupInfo = extractGid(groupInfoUrl) ?? "0";
    }
    if (memberInfoUrl.trim()) {
      const sid = extractSheetId(memberInfoUrl);
      if (!sid || sid !== sheetId1) {
        setError("개인 안내 URL은 같은 스프레드시트여야 해요");
        return;
      }
      gidMemberInfo = extractGid(memberInfoUrl) ?? "0";
    }

    setError(null);
    startTransition(async () => {
      const res = await previewFromGoogleSheet(sheetId1, {
        users: gidUsers,
        schedules: gidSchedules,
        group_info: gidGroupInfo,
        member_info: gidMemberInfo,
      });
      if (res.ok && res.data) {
        localStorage.setItem(SETUP_SOURCE_KEY, JSON.stringify({
          type: "sheets",
          usersUrl, schedulesUrl,
          groupInfoUrl: groupInfoUrl.trim() || undefined,
          memberInfoUrl: memberInfoUrl.trim() || undefined,
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
    const groupInfoFile = groupInfoFileRef.current?.files?.[0];
    const memberInfoFile = memberInfoFileRef.current?.files?.[0];

    // 기본 2개 파일 필수 확인
    const hasNewBasic = userFile && scheduleFile;
    const hasRestoredBasic = restoredUsersCsv && restoredSchedulesCsv;

    if (!hasNewBasic && !hasRestoredBasic) {
      setError("참가자 CSV와 일정 CSV 파일을 모두 선택해주세요");
      return;
    }

    setError(null);
    startTransition(async () => {
      let usersCsv: string;
      let schedulesCsv: string;
      let groupInfoCsv: string | undefined;
      let memberInfoCsv: string | undefined;
      let uName: string;
      let sName: string;
      let giName: string | null = null;
      let miName: string | null = null;

      if (hasNewBasic) {
        [usersCsv, schedulesCsv] = await Promise.all([
          userFile.text(),
          scheduleFile.text(),
        ]);
        uName = userFile.name;
        sName = scheduleFile.name;
      } else {
        usersCsv = restoredUsersCsv!;
        schedulesCsv = restoredSchedulesCsv!;
        uName = userFileName ?? "참가자.csv";
        sName = scheduleFileName ?? "일정.csv";
      }

      // v2 옵션: 새 파일 → 복원 → undefined 순서
      if (groupInfoFile) {
        groupInfoCsv = await groupInfoFile.text();
        giName = groupInfoFile.name;
      } else if (restoredGroupInfoCsv) {
        groupInfoCsv = restoredGroupInfoCsv;
        giName = groupInfoFileName;
      }
      if (memberInfoFile) {
        memberInfoCsv = await memberInfoFile.text();
        miName = memberInfoFile.name;
      } else if (restoredMemberInfoCsv) {
        memberInfoCsv = restoredMemberInfoCsv;
        miName = memberInfoFileName;
      }

      const res = await previewFromCsv(usersCsv, schedulesCsv, groupInfoCsv, memberInfoCsv);
      if (res.ok && res.data) {
        localStorage.setItem(SETUP_SOURCE_KEY, JSON.stringify({
          type: "csv",
          userFileName: uName, scheduleFileName: sName,
          groupInfoFileName: giName,
          memberInfoFileName: miName,
        }));
        localStorage.setItem(SETUP_CSV_KEY, JSON.stringify({
          userFileName: uName, scheduleFileName: sName,
          groupInfoFileName: giName,
          memberInfoFileName: miName,
          usersCsv, schedulesCsv,
          groupInfoCsv: groupInfoCsv ?? null,
          memberInfoCsv: memberInfoCsv ?? null,
        }));
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
            "min-h-11 flex-1 rounded-lg text-sm font-medium transition-colors",
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
            "min-h-11 flex-1 rounded-lg text-sm font-medium transition-colors",
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
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
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
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
            />
          </div>

          {/* v2 옵션: 조 브리핑 / 개인 안내 */}
          <details className="mb-4 rounded-xl bg-gray-50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">
              조 브리핑 · 개인 안내 (선택) — 층수 · 활동 · 조 이동 · 메뉴 등
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="ds-group-info-url" className="mb-1 block text-xs text-muted-foreground">
                  조 브리핑 탭 URL
                </label>
                <input
                  id="ds-group-info-url"
                  type="url"
                  value={groupInfoUrl}
                  onChange={(e) => { setGroupInfoUrl(e.target.value); setError(null); }}
                  placeholder="일차/순서/조/층수/순환/장소상세/메모"
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="ds-member-info-url" className="mb-1 block text-xs text-muted-foreground">
                  개인 안내 탭 URL
                </label>
                <input
                  id="ds-member-info-url"
                  type="url"
                  value={memberInfoUrl}
                  onChange={(e) => { setMemberInfoUrl(e.target.value); setError(null); }}
                  placeholder="일차/순서/이름/항목(조이동·임시역할·미참여·활동·메뉴·메모)/값"
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
                />
              </div>
            </div>
          </details>

          <button
            onClick={handleGoogleSheet}
            disabled={isPending}
            className="min-h-11 w-full rounded-xl bg-main-action py-3 text-sm font-bold disabled:opacity-50"
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
              참가자 CSV (이름, 전화번호, 역할, 소속조, 배정차량, 선후발, 항공사, 여행역할)
            </label>
            <input
              ref={userFileRef}
              type="file"
              accept=".csv"
              aria-label="참가자 CSV 파일 선택"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setUserFileName(file?.name ?? null);
                setRestoredUsersCsv(null);
                setError(null);
              }}
            />
            <button
              type="button"
              onClick={() => userFileRef.current?.click()}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors",
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
                const file = e.target.files?.[0];
                setScheduleFileName(file?.name ?? null);
                setRestoredSchedulesCsv(null);
                setError(null);
              }}
            />
            <button
              type="button"
              onClick={() => scheduleFileRef.current?.click()}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors",
                scheduleFileName
                  ? "border-main-action bg-[#FEF9E7] text-foreground"
                  : "border-gray-300 bg-[#F5F3EF] text-muted-foreground hover:border-main-action hover:bg-[#FEF9E7]"
              )}
            >
              <UploadIcon aria-hidden />
              {scheduleFileName ?? "파일 선택"}
            </button>
          </div>

          {/* v2 옵션: 조 브리핑 / 개인 안내 */}
          <details className="mb-3 rounded-xl bg-gray-50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">
              조 브리핑 · 개인 안내 (선택) — 층수 · 활동 · 조 이동 · 메뉴 등
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  조 브리핑 CSV (일차, 순서, 조, 층수, 순환, 장소상세, 메모)
                </label>
                <input
                  ref={groupInfoFileRef}
                  type="file"
                  accept=".csv"
                  aria-label="조 브리핑 CSV 파일 선택"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setGroupInfoFileName(file?.name ?? null);
                    setRestoredGroupInfoCsv(null);
                    setError(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => groupInfoFileRef.current?.click()}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors",
                    groupInfoFileName
                      ? "border-main-action bg-[#FEF9E7] text-foreground"
                      : "border-gray-300 bg-white text-muted-foreground hover:border-main-action hover:bg-[#FEF9E7]"
                  )}
                >
                  <UploadIcon aria-hidden />
                  {groupInfoFileName ?? "파일 선택"}
                </button>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  개인 안내 CSV (일차, 순서, 이름, 항목, 값)
                </label>
                <input
                  ref={memberInfoFileRef}
                  type="file"
                  accept=".csv"
                  aria-label="개인 안내 CSV 파일 선택"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setMemberInfoFileName(file?.name ?? null);
                    setRestoredMemberInfoCsv(null);
                    setError(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => memberInfoFileRef.current?.click()}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm transition-colors",
                    memberInfoFileName
                      ? "border-main-action bg-[#FEF9E7] text-foreground"
                      : "border-gray-300 bg-white text-muted-foreground hover:border-main-action hover:bg-[#FEF9E7]"
                  )}
                >
                  <UploadIcon aria-hidden />
                  {memberInfoFileName ?? "파일 선택"}
                </button>
              </div>
            </div>
          </details>

          <button
            onClick={handleCsvUpload}
            disabled={isPending}
            className="min-h-11 w-full rounded-xl bg-main-action py-3 text-sm font-bold disabled:opacity-50"
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
