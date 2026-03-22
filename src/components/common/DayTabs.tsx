"use client";

import { cn } from "@/lib/utils";

interface Props {
  days: number[];
  selected: number;
  onChange: (day: number) => void;
}

export default function DayTabs({ days, selected, onChange }: Props) {
  return (
    <div role="tablist" className="flex border-b bg-white">
      {days.map((day) => (
        <button
          key={day}
          role="tab"
          aria-selected={selected === day}
          onClick={() => onChange(day)}
          className={cn(
            "min-h-11 flex-1 py-2.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-main-action",
            selected === day
              ? "border-b-2 border-gray-900 text-gray-900"
              : "text-gray-500"
          )}
        >
          {day}일차
        </button>
      ))}
    </div>
  );
}
