import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // PRD 컬러 시스템 (8.1) - WCAG 2.1 명도대비 준수
        "main-action": "#FEE500",
        "complete-card": "#ECFDF5",
        "complete-check": "#059669",
        "progress-bar": "#0ACF83",
        "offline-banner": "#F1EFE8",
        "progress-badge": "#FEF9C3",
        "app-bg": "#F5F3EF",
        // 상태 뱃지 색상 - 5단계 워크플로우
        // 1. 시작전 (Pending) - neutral
        "status-pending": {
          bg: "#F5F5F4",
          text: "#57534E", // stone-600, 대비 5.7:1
        },
        // 2. 진행중 (Active) - amber 계열
        "status-active": {
          bg: "#FEF3C7",  // amber-100
          text: "#92400E", // amber-800, 대비 6.2:1
        },
        // 3. 보고완료 (Reported) - emerald 밝은 톤 (아직 액션 가능)
        "status-reported": {
          bg: "#D1FAE5",  // emerald-100
          text: "#047857", // emerald-700, 대비 4.6:1
        },
        // 4. 일정완료 (Completed/Archived) - muted neutral
        "status-complete": {
          bg: "#E7E5E4",  // stone-200
          text: "#57534E", // stone-600, 대비 4.8:1
        },
        // 종료 버튼 - amber outline (시작과 짝)
        "btn-end": {
          bg: "#FFFBEB",   // amber-50
          border: "#F59E0B", // amber-500
          text: "#92400E", // amber-800, 대비 6.2:1 on amber-50
        },
        // shadcn/ui CSS 변수
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.7)", opacity: "0" },
          "70%": { transform: "scale(1.1)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        confetti: {
          "0%": { transform: "translateY(0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(100vh) rotate(720deg)", opacity: "0" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.3s ease-out forwards",
        confetti: "confetti 3s ease-in forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
  // CR-008: globals.css 정의 커스텀 클래스 purge 방지
  safelist: ["pb-safe"],
};

export default config;
