"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const [step, setStep] = useState<Step>(1);
  const [previewData, setPreviewData] = useState<SetupPreviewData | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handlePreviewReady = (data: SetupPreviewData) => {
    setPreviewData(data);
    setStep(2);
  };

  const handleImportDone = (result: ImportResult) => {
    setImportResult(result);
    setImportError(null);
    setStep(3);
    router.replace("/setup?tab=data"); // 반영 완료 → 서버 재조회 + "현재 데이터" 탭 자동 전환
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
    router.replace("/setup?tab=upload"); // 데이터 있어도 업로드 탭으로 명시 이동
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* 스텝 인디케이터 */}
      <p className="mb-4 text-right text-xs text-muted-foreground" aria-live="polite">
        Step {step} / 3
      </p>

      {step === 1 && (
        <DataSourceStep onPreviewReady={handlePreviewReady} />
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
        <ResetDataButton />
      </div>
    </div>
  );
}
