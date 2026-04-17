"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { previewFromGoogleSheet } from "@/actions/setup";
import { extractSheetId, extractGid } from "@/utils/sheets-parser";
import { SETUP_LAST_SYNCED_KEY, SETUP_SOURCE_KEY } from "@/lib/constants";
import DataSourceStep from "./DataSourceStep";
import PreviewStep from "./PreviewStep";
import ImportResultStep from "./ImportResultStep";
import ResetDataButton from "./ResetDataButton";
import type { SetupPreviewData } from "@/lib/types";

type Step = 1 | 2 | 3;

interface ImportResult {
  groups: number;
  users: number;
  schedules: number;
}

export default function SetupWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [previewData, setPreviewData] = useState<SetupPreviewData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [, startTransition] = useTransition();
  const resyncHandled = useRef(false);

  // resync 파라미터 감지 → 저장된 URL로 자동 fetch
  useEffect(() => {
    let cancelled = false;

    const isResync = searchParams.get("resync") === "1";
    if (!isResync) {
      resyncHandled.current = false;
      return;
    }
    if (resyncHandled.current) return;

    const saved = localStorage.getItem(SETUP_SOURCE_KEY);
    if (!saved) {
      router.replace("/setup?tab=upload");
      return;
    }

    try {
      const source = JSON.parse(saved);
      if (source.type !== "sheets" || !source.usersUrl || !source.schedulesUrl) {
        router.replace("/setup?tab=upload");
        return;
      }

      const sheetId = extractSheetId(source.usersUrl);
      const gidUsers = extractGid(source.usersUrl) ?? "0";
      const gidSchedules = extractGid(source.schedulesUrl) ?? "0";
      // v2 옵션 GID — source에 저장되어 있으면 사용
      const gidGroupInfo = source.groupInfoUrl ? (extractGid(source.groupInfoUrl) ?? null) : null;
      const gidMemberInfo = source.memberInfoUrl ? (extractGid(source.memberInfoUrl) ?? null) : null;
      if (!sheetId) {
        router.replace("/setup?tab=upload");
        return;
      }

      resyncHandled.current = true;
      setIsResyncing(true);
      setStep(1);
      setPreviewData(null);
      setImportResult(null);
      setImportError(null);

      startTransition(async () => {
        const res = await previewFromGoogleSheet(sheetId, {
          users: gidUsers,
          schedules: gidSchedules,
          group_info: gidGroupInfo,
          member_info: gidMemberInfo,
        });
        if (cancelled) return;
        if (res.ok && res.data) {
          setPreviewData(res.data);
          setStep(2);
        } else {
          // resync 중 미리보기 실패 → Step 1 복귀 (ImportResultStep 오분류 방지)
          setImportError(res.error ?? "시트 데이터를 불러오지 못했어요. 다시 시도해주세요.");
          setStep(1);
        }
        setIsResyncing(false);
        router.replace("/setup?tab=upload");
      });
    } catch {
      router.replace("/setup?tab=upload");
    }

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handlePreviewReady = (data: SetupPreviewData) => {
    setPreviewData(data);
    setImportError(null);
    setStep(2);
  };

  const handleImportDone = (result: ImportResult) => {
    setImportResult(result);
    setImportError(null);
    setStep(3);
    localStorage.setItem(SETUP_LAST_SYNCED_KEY, new Date().toISOString());
    router.replace("/setup?tab=data");
  };

  const handleImportError = (error: string) => {
    setImportError(error);
    setStep(3);
  };

  const handleReset = () => {
    setStep(1);
    setPreviewData(null);
    setImportResult(null);
    setImportError(null);
    router.replace("/setup?tab=upload");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {step === 1 && (
        isResyncing ? (
          <div className="py-12 text-center text-sm text-muted-foreground" aria-live="polite">
            시트 데이터를 불러오는 중...
          </div>
        ) : (
          <>
            {importError && (
              <div
                role="alert"
                className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {importError}
              </div>
            )}
            <DataSourceStep onPreviewReady={handlePreviewReady} />
          </>
        )
      )}
      {step === 2 && previewData && (
        <PreviewStep
          data={previewData}
          onImportDone={handleImportDone}
          onImportError={handleImportError}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <ImportResultStep
          result={importResult}
          error={importError}
          onReset={handleReset}
        />
      )}

      <div className="mt-12 border-t pt-6">
        <ResetDataButton onSuccess={handleReset} />
      </div>
    </div>
  );
}
