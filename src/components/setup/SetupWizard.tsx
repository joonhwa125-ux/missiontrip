"use client";

import { useState } from "react";
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
  };

  return (
    <div className="min-h-screen bg-app-bg">
      <header className="bg-main-action px-4 py-4">
        <h1 className="text-lg font-bold">데이터 셋업</h1>
        <p className="text-sm opacity-70">
          Step {step} / 3
        </p>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
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
      </main>
    </div>
  );
}
