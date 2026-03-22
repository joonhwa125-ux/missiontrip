import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn/ui 표준 cn 유틸
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 시각 포매팅 (HH:MM, KST 고정)
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// 경과 시간 (분 단위)
export function getElapsedMinutes(from: string): number {
  return Math.floor((Date.now() - new Date(from).getTime()) / 60000);
}

// 이니셜 추출 (한글 이름 → 첫 글자)
export function getInitial(name: string): string {
  return name.charAt(0);
}
