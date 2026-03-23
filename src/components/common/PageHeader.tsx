import Link from "next/link";

interface Props {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightSlot?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, backHref, rightSlot }: Props) {
  return (
    <header className="border-b border-gray-100 bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {backHref && (
            <Link
              href={backHref}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-gray-900"
              aria-label="뒤로 가기"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          )}
          <h1 className="text-lg font-bold">{title}</h1>
          {subtitle && (
            <span className="text-sm opacity-70">{subtitle}</span>
          )}
        </div>
        {rightSlot && (
          <div className="flex flex-shrink-0 items-center">
            {rightSlot}
          </div>
        )}
      </div>
    </header>
  );
}
