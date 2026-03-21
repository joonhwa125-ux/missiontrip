---
name: gen-component
description: KWCAG 2.2 접근성과 PRD 디자인 시스템을 준수하는 React 컴포넌트를 생성한다. 새 컴포넌트 작성 시 사용한다.
argument-hint: "[컴포넌트명] [설명]"
---

## 접근성 준수 컴포넌트 생성

$ARGUMENTS 컴포넌트를 생성하라.

### 필수 규칙

1. **KWCAG 2.2 접근성 기본 적용:**
   - 모든 `<button>`, `<a>` → `min-h-11 min-w-11` (44x44px)
   - 아이콘 → `aria-label` 필수
   - 상태 변화 → `aria-live="polite"`
   - `outline-none` 사용 시 `focus-visible:ring-2` 필수
   - 색상 상태 표현 시 텍스트/아이콘 병기
   - 폰트 크기 rem 단위만

2. **디자인 시스템 (CLAUDE.md 8.1):**
   - 메인 액션: `#FEE500`
   - 완료 카드: `#EAF3DE`
   - 완료 체크: `#00C471`
   - 공지 배너: `#E6F1FB`
   - 오프라인: `#F1EFE8`
   - 앱 배경: `#F5F3EF`

3. **코드 규칙:**
   - TypeScript strict, `any` 금지
   - PascalCase 파일명
   - 컴포넌트 200줄 이내
   - `console.log` 금지
   - `'use client'` 최소화

4. **모달 작성 시:**
   - `role="dialog"` + `aria-modal="true"`
   - 포커스 트랩
   - ESC 키 닫기

### 생성 후

CLAUDE.md 섹션 4에서 해당 컴포넌트의 명세를 확인하고, 명세에 정의된 모든 스펙이 구현에 포함되었는지 확인하라.
