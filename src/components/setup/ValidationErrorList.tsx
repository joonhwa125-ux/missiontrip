import type { ValidationError } from "@/lib/types";

interface Props {
  errors: ValidationError[];
}

export default function ValidationErrorList({ errors }: Props) {
  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl bg-red-50 px-4 py-3"
    >
      <p className="mb-2 text-sm font-bold text-red-700">
        검증 오류 {errors.length}건
      </p>
      <ul className="space-y-1">
        {errors.map((e, i) => (
          <li key={i} className="text-xs text-red-600">
            {e.row > 0 && `${e.sheet} ${e.row}행: `}
            {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
