"use client";

interface Props {
  result: { groups: number; users: number; schedules: number } | null;
  error: string | null;
  onReset: () => void;
}

export default function ImportResultStep({ result, error, onReset }: Props) {
  return (
    <div className="space-y-6">
      {error ? (
        <div
          role="alert"
          className="rounded-2xl bg-red-50 p-6 text-center"
        >
          <p className="mb-2 text-lg font-bold text-red-700">반영 실패</p>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : result ? (
        <div
          aria-live="polite"
          className="rounded-2xl bg-white p-6 text-center"
        >
          <p className="mb-4 text-4xl" aria-hidden="true">
            &#x2705;
          </p>
          <h2 className="mb-4 text-lg font-bold">반영 완료!</h2>
          <div className="space-y-2 text-sm">
            <p>
              조(차량): <strong>{result.groups}개</strong>
            </p>
            <p>
              참가자: <strong>{result.users}명</strong>
            </p>
            <p>
              일정: <strong>{result.schedules}개</strong>
            </p>
          </div>
        </div>
      ) : null}

      <button
        onClick={onReset}
        className="min-h-11 w-full rounded-xl bg-gray-100 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-2"
      >
        처음으로
      </button>
    </div>
  );
}
