"use client";

import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Props {
  days: number[];
  selected: number;
  onChange: (day: number) => void;
  panelId?: string;
  rightSlot?: React.ReactNode;
}

export default function DayTabs({ days, selected, onChange, panelId, rightSlot }: Props) {
  const tablistRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = days.indexOf(selected);
      let next = idx;

      if (e.key === "ArrowRight") {
        next = (idx + 1) % days.length;
      } else if (e.key === "ArrowLeft") {
        next = (idx - 1 + days.length) % days.length;
      } else if (e.key === "Home") {
        next = 0;
      } else if (e.key === "End") {
        next = days.length - 1;
      } else {
        return;
      }

      e.preventDefault();
      onChange(days[next]);

      const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[next]?.focus();
    },
    [days, selected, onChange]
  );

  return (
    <div
      ref={tablistRef}
      role="tablist"
      className="flex border-b bg-white"
      onKeyDown={handleKeyDown}
    >
      {days.map((day) => {
        const isSelected = selected === day;
        return (
          <button
            key={day}
            role="tab"
            aria-selected={isSelected}
            aria-controls={panelId}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(day)}
            className={cn(
              "min-h-11 flex-1 py-2.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-main-action",
              isSelected
                ? "border-b-2 border-gray-900 text-gray-900"
                : "text-gray-500"
            )}
          >
            {day}일차
          </button>
        );
      })}
      {rightSlot && (
        <div className="flex flex-shrink-0 items-center px-2">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
