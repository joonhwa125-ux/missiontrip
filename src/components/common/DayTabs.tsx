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
    <div className="border-b border-gray-100 bg-white px-4 py-2">
      <div className="flex items-center gap-2">
        <div
          ref={tablistRef}
          role="tablist"
          className="flex flex-1 rounded-xl bg-gray-100 p-1"
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
                  "min-h-9 flex-1 rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-main-action focus-visible:ring-offset-1",
                  isSelected
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {day}일차
              </button>
            );
          })}
        </div>
        {rightSlot && (
          <div className="flex flex-shrink-0 items-center">
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  );
}
