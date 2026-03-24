import Link from "next/link";
import { ChevronLeftIcon } from "@/components/ui/icons";

interface Props {
  title: string;
  titleNode?: React.ReactNode;  // title 대신 커스텀 JSX (브랜딩 스타일 등)
  superTitle?: string;          // title 위에 작게 표시 (예: "2026 미션트립 · 관리자")
  subtitle?: string;
  backHref?: string;
  rightSlot?: React.ReactNode;
}

export default function PageHeader({ title, titleNode, superTitle, subtitle, backHref, rightSlot }: Props) {
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
              <ChevronLeftIcon aria-hidden />
            </Link>
          )}
          {superTitle ? (
            <div className="flex flex-col">
              <span className="text-xs text-gray-400">{superTitle}</span>
              <h1 className="text-3xl font-black leading-tight tracking-tight">
                {titleNode ?? title}
              </h1>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">{titleNode ?? title}</h1>
              {subtitle && <span className="text-sm opacity-70">{subtitle}</span>}
            </div>
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
