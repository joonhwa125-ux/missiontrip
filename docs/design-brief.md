# 디자인 브리프 — Stitch/Figma 연동용

> Stitch 프롬프트 또는 디자이너 핸드오프 시 사용하는 디자인 요구사항 문서
> 작성일: 2026-03-22

---

## 1. 서비스 개요

- **서비스명:** 미션트립 인원관리
- **한줄 설명:** 장애인·비장애인이 함께하는 2박3일 제주도 여행에서 이동 시 인원 누락을 방지하는 모바일 웹앱
- **사용 환경:** 공항, 버스, 관광지 (야외, 햇빛 아래, 한 손 조작)
- **사용자:** 조장 20명 (핵심), 관리자 1~2명, 참가자 약 180명 (선택)
- **사용 빈도:** 1회성 (미션트립 기간만 운영)

---

## 2. 디자인 방향

### 톤 & 무드
- **현재:** 카카오 스타일 (플랫, 따뜻한 노란색 기반, 아이콘 중심)
- **희망:** 현재 톤 유지하되, 포인트 화면에 **사진풍/일러스트 그래픽**으로 세련미 추가
- **키워드:** 따뜻한, 함께하는 여행, 안심, 밝은, 세련된
- **피해야 할 느낌:** 업무 도구, 차갑고 기계적인, 전형적인 AI 생성 UI

### 레퍼런스 앱
- 카카오택시 (따뜻한 노란색 + 깔끔한 카드)
- 토스 (빈 상태 일러스트, 축하 애니메이션)
- 당근마켓 (친근한 일러스트 포인트)

---

## 3. 디자인 시스템 (현재 확정)

### 컬러 팔레트

| 용도 | 토큰명 | HEX | 사용처 |
|---|---|---|---|
| 메인 액션 | main-action | #FEE500 | 탔어요! 버튼, 보고 버튼, 관리자 헤더 |
| 완료 카드 | complete-card | #EAF3DE | 완료 조원 카드 배경 |
| 완료 체크 | complete-check | #00C471 | 체크 아이콘, 이니셜 완료 점 |
| 공지 배너 | notice-banner | #E6F1FB | 상단 공지 배너 |
| 오프라인 | offline-banner | #F1EFE8 | 하단 오프라인 배너 |
| 진행중 배지 | progress-badge | #FAEEDA | 진행중 배지 배경 |
| 앱 배경 | app-bg | #F5F3EF | 전체 화면 배경 |

### 타이포그래피
- 시스템 폰트 (Apple SD Gothic Neo, Pretendard 등)
- rem 단위 사용 (접근성 필수)
- 본문: 0.875rem(14px), 제목: 1rem(16px), 카운트: 1.5rem(24px)

### 간격/레이아웃
- 카드 간격: 0.5rem (8px)
- 카드 패딩: 1rem (16px)
- 카드 라운드: 1rem (16px) — rounded-2xl
- 터치 타겟 최소: 44x44px (KWCAG 2.5.5)
- 멤버 카드 최소 높이: 72px
- 컨테이너 최대 너비: 512px (max-w-lg)

---

## 4. 디자인 필요 화면 (Stitch 작업 대상)

### 4.1 로그인 화면 — 메인 비주얼
- **현재:** 서비스명 텍스트 + Google 로그인 버튼만 있음
- **필요:** 제주도 여행 느낌의 메인 일러스트/그래픽
- **분위기:** 비행기, 버스, 제주 바다/한라산 등 여행 모티브
- **제약:** Google 로그인 버튼은 공식 가이드라인 준수 (흰 배경, G 로고)

### 4.2 전원 완료 축하 화면
- **현재:** 이모지 + 텍스트 ("[조명] 전원 탑승 완료!")
- **필요:** 축하 그래픽 (컨페티, 환호하는 캐릭터, 또는 감성 일러스트)
- **분위기:** 성취감, 안도감, 즐거움
- **제약:** 이니셜 동그라미 팝인 애니메이션과 조화

### 4.3 빈 상태 (일정 없음)
- **현재:** '현재 진행 중인 일정이 없어요' 텍스트만
- **필요:** 빈 상태 일러스트 (대기 중인 느낌)
- **분위기:** 편안한 대기, "곧 시작해요" 느낌
- **예시:** 버스가 출발을 기다리는 일러스트, 여행 가방 일러스트

### 4.4 오프라인 상태 그래픽 (선택)
- **현재:** 텍스트만 ("오프라인 상태예요. N건 저장 중...")
- **필요:** 작은 인라인 일러스트 또는 아이콘
- **분위기:** 걱정하지 마세요, 자동으로 처리됩니다
- **제약:** 배너 높이 제한 (40px 내외), 배경색 #F1EFE8

### 4.5 Group 뷰 — 일정 피드
- **현재:** 일정 카드 리스트 (진행중: 노란 테두리, 완료: 반투명, 대기: 흰색)
- **개선 포인트:**
  - 일정 카드 스타일 세련화 (그림자, 미묘한 그라데이션, 아이콘 포인트)
  - "N일차 일정" 헤더 영역 + [전체 현황 >] 버튼 레이아웃
  - 진행중 카드의 시각적 강조 방식 (현재 노란 ring → 더 세련된 방식?)
- **제약:** 진행중 카드는 탭하면 체크인 화면 진입 → 버튼처럼 인지 가능해야 함

### 4.6 Group 뷰 — 체크인 화면
- **현재:** 이니셜 동그라미 행 + 멤버 카드 리스트 + 하단 보고 버튼
- **개선 포인트:**
  - 이니셜 동그라미 스타일 (그라데이션, 그림자, 완료 시 애니메이션)
  - 멤버 카드 레이아웃 (아바타 영역, 상태 텍스트, 버튼 배치)
  - [탔어요!] 버튼 스타일 (현재 노란 배경 → 더 입체적?)
  - 완료/미완료/불참 카드의 시각적 차이
  - 보고 버튼 영역 디자인
- **제약:** 카드 최소 높이 72px, 터치 타겟 44x44px, 탭탭탭 속도 최우선

### 4.7 Group 뷰 — 전체 현황 바텀시트
- **현재:** 버스별 그룹 → 조 카드 그리드 (프로그레스 바 + 배지)
- **개선 포인트:**
  - 바텀시트 헤더/핸들 디자인
  - 조 카드 스타일 (현재 흰 카드 → 더 구분감 있는 디자인?)
  - 프로그레스 바 스타일
  - 버스 섹션 구분 방식
- **제약:** 읽기 전용 (탭 인터랙션 없음), 조 20개 + 버스 4~5대 분량

### 4.8 Admin 뷰 — 현황 탭
- **현재:** 요약 카드 3개 (보고완료/진행중/시작전) + 조별 그리드 + 드릴다운 바텀시트
- **개선 포인트:**
  - 요약 카드 스타일 (숫자 강조, 아이콘/색상 조합)
  - 경과 시간 표시 영역 디자인
  - 조 카드 스타일 (배지 + 프로그레스 바 + 조장 전화 아이콘)
  - 드릴다운 바텀시트: 미확인 인원 리스트 + 체크인 대행 버튼 레이아웃
- **제약:** 노란 헤더(#FEE500) 유지, 2탭 구조 (현황/일정)

### 4.9 Admin 뷰 — 일정 탭
- **현재:** 일차별 섹션 + 일정 카드 (진행중: 노란 배경, 대기: [활성화] 버튼)
- **개선 포인트:**
  - 일정 카드 스타일 (시간/장소/상태 배치)
  - [활성화] 버튼 디자인
  - [+ 일정 추가] 영역 (점선 카드)
  - 시간 수정 모달 레이아웃
- **제약:** 즉흥 일정 추가 시 필드 4개 (일정명, 장소, 일차, 시각)

### 4.10 Setup 뷰 — 데이터 셋업 위자드
- **현재:** Step 1/3 텍스트 + 입력 필드 + 검증 테이블
- **개선 포인트:**
  - 스텝 진행 표시기 (프로그레스 바 또는 스텝 아이콘)
  - 데이터 소스 선택 영역 (Google Sheet URL 입력 vs CSV 업로드)
  - 검증 결과 테이블 스타일 (오류 행 하이라이트)
  - [DB에 반영] 버튼 영역 + 진행 상태 표시
  - 성공/실패 결과 화면
- **제약:** admin 전용, 데이터 정확성이 최우선

### 4.11 공통 요소 — 전체 화면 공유
- **토스트 알림:** 위치, 크기, 애니메이션 (slide-up, fade 등)
- **모달/다이얼로그:** 확인 모달, 시간 수정 모달, 보고 확인 모달 등의 통일된 스타일
- **앱 배경:** #F5F3EF 기반, 카드/섹션 간 시각적 계층 구분
- **헤더 바:** 관리자(노란 배경) vs 조장(투명/흰색) 스타일 통일성
- **버튼 시스템:** Primary(#FEE500) / Secondary(회색) / Danger(빨간) 계층
- **배지 시스템:** 보고완료/전원확인/진행중/미시작/대기/완료 — 통일된 pill 스타일
- **프로그레스 바:** 조별 현황에 사용되는 바 스타일 (높이, 라운드, 색상)
- **오프라인 배너:** 하단 고정 배너의 시각적 스타일
- **카드 시스템:** 기본 카드, 강조 카드, dim 카드의 통일된 그림자/라운드/패딩

---

## 6. 접근성 제약 (디자인 시 필수 준수)

- 명도 대비 4.5:1 이상 (KWCAG 1.4.3)
- 색상만으로 상태 구분 금지 — 텍스트/아이콘 병기 필수 (KWCAG 1.3.3)
- 터치 타겟 최소 44x44px (KWCAG 2.5.5)
- 폰트 크기 rem 단위 (200% 확대 시 깨지지 않아야 함)
- 장식 이미지는 `aria-hidden="true"` 처리 (스크린리더 무시)
- 의미 있는 이미지는 `alt` 텍스트 필수

---

## 7. Stitch 프롬프트 예시

### 로그인 화면
```
Travel check-in app login screen for a group trip to Jeju Island.
Warm, friendly tone with yellow (#FEE500) accent.
Main illustration: bus and airplane with Jeju island scenery.
Single "Continue with Google" button at bottom.
Mobile-first, 375px width. Background: #F5F3EF.
Style: modern Korean app design, similar to KakaoTalk/Toss.
```

### 전원 완료 축하
```
Celebration screen for travel attendance app.
All members checked in successfully.
Confetti or cheerful illustration.
Text: "전원 탑승 완료!" (All aboard!).
Yellow (#FEE500) accent, green (#00C471) check marks.
Warm, relieved, joyful mood. Mobile-first.
```

### 빈 상태
```
Empty state for travel schedule app.
No active schedule right now.
Illustration: waiting bus or travel suitcase.
Text: "현재 진행 중인 일정이 없어요" (No active schedule).
Calm, patient mood. Warm beige background (#F5F3EF).
```

### 조장 일정 피드
```
Mobile schedule feed for group travel check-in app.
Header: "1일차 일정" with "전체 현황 >" button on the right.
Card list: active schedule (yellow #FEE500 border, "진행중" badge, tap to enter),
completed schedule (dimmed, green check, count), waiting schedule (plain).
Warm beige background (#F5F3EF), rounded-2xl cards, 375px width.
Style: KakaoTalk/Toss-like Korean mobile app.
```

### 조장 체크인 화면
```
Mobile check-in screen for group leader.
Top: back arrow + schedule title + location.
Circle avatar row: gray dashed circles (unchecked), yellow (#FEE500) circles with green dot (checked).
Member card list: unchecked card (white, "아직 안 보여요", yellow "탔어요!" button),
checked card (light green #EAF3DE, "HH:MM 탑승 완료", green check, gray "취소" button).
Bottom fixed: report button "N명 남았어요" or "우리 조 다 탔어요! 보고하기".
Min card height 72px, 375px width. Warm and friendly tone.
```

### 관리자 현황 탭
```
Admin dashboard for travel attendance app.
Yellow (#FEE500) header with "미션트립 관리자" title, 2 tabs: 현황/일정.
Top: elapsed time "23분 경과", total count "전체 N/M명 확인".
3 summary cards in a row: "보고완료" (green), "진행중" (yellow), "시작전" (gray).
Group grid (2 columns): group cards with name, progress bar, count, status badge.
Grouped by bus ("1호차", "2호차"). Tap card to open bottom sheet drilldown.
375px width, warm beige background.
```

### 관리자 일정 탭
```
Admin schedule management tab for travel app.
Sections by day ("1일차", "2일차", "3일차").
Schedule cards: active (yellow background, "진행중" pill),
completed (dimmed), waiting (white with "활성화" button).
Each card shows: title, location, time (HH:MM).
Bottom: dashed outline "+ 일정 추가" button.
375px width, clean and functional style.
```

### 전체 현황 바텀시트
```
Bottom sheet overlay showing all groups status for travel check-in app.
Drag handle at top. Grouped by bus name ("1호차", "2호차").
Each group: mini card with name, status badge (시작전/진행중/전원확인),
progress bar (green #00C471), count "N/N명".
2-column grid layout. Read-only, no tap interaction.
375px width, white background, rounded-2xl top corners.
```

### 셋업 위자드
```
Setup wizard for travel management app, 3 steps.
Step indicator at top (progress bar or numbered circles).
Step 1: Google Sheet URL input field + "불러오기" button, or CSV upload.
Step 2: Preview table with 3 tabs (조구성/참가자/일정), error rows highlighted red.
Step 3: "DB에 반영" button with progress indicator.
Clean, functional admin interface. 375px width.
```

---

## 8. 산출물 포맷

| 항목 | 포맷 | 용도 |
|---|---|---|
| 전체 화면 디자인 | Figma 프레임 | Figma MCP → Claude Code 연동 |
| 포인트 일러스트 | SVG 또는 PNG (@2x) | 로그인, 빈 상태, 축하 |
| Lottie 애니메이션 | JSON | 전원 완료 컨페티 (선택) |
| 디자인 토큰 | Figma Variables | 컬러/간격/타이포 동기화 |

> **워크플로우:** Stitch → Figma 내보내기 → 세부 조정 → Figma MCP로 Claude Code에 전달 → 구현
>
> **화면 수:** 총 11개 (로그인, 축하, 빈 상태, 오프라인, 피드, 체크인, 전체현황 시트, 관리자 현황, 관리자 일정, 관리자 드릴다운, 셋업)
