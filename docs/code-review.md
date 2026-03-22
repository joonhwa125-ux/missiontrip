# 코드 리뷰 결과

> 접근성(KWCAG 2.2), 프론트엔드 UX/아키텍처, PRD 적합성/코드 품질 3개 관점에서 종합 검토
> 검토일: 2026-03-22
> 대상: src/ 하위 전체 코드 + CLAUDE.md PRD 명세

---

## Critical (운영 전 반드시 수정 — 7건)

### [CR-001] useBroadcast 채널 생성/해제 반복

- **파일:** `src/hooks/useRealtime.ts:96-107`
- **문제:** `broadcast()` 함수가 호출될 때마다 새 채널 생성 → subscribe → send → unsubscribe → removeChannel을 반복한다. 체크인 1건 처리에 `group:{id}` + `admin` 2개 채널을 각각 이 과정으로 처리하므로 총 4번의 WebSocket 구독/해제 발생
- **영향:** 공항/버스 등 네트워크가 느린 현장에서 broadcast 실패 또는 지연. 조원 연속 탭탭탭 시 채널 폭발
- **수정 방향:** broadcast는 이미 구독된 채널에서 `send()`만 호출하면 됨. `useRealtime`에서 구독한 채널을 재사용하거나, broadcast 전용 채널을 1회만 생성하여 유지

```typescript
// 현재 (문제)
const broadcast = useCallback(async (channelName, event, payload) => {
  const channel = supabaseRef.current.channel(channelName); // 매번 새 채널
  await channel.subscribe();
  await channel.send(...);
  await channel.unsubscribe();
  supabaseRef.current.removeChannel(channel);
}, []);

// 개선 방향
// 1) useRealtime에서 이미 구독 중인 채널 ref를 반환
// 2) broadcast 시 해당 ref의 send()만 호출
// 3) 구독 안 된 채널(admin 등)은 1회 생성 후 재사용
```

---

### [CR-002] window.location.reload() 남용

- **파일:** `src/components/group/GroupView.tsx:65`, `src/components/admin/AdminView.tsx:71`, `src/components/admin/ScheduleTab.tsx:83,175`
- **문제:** Next.js App Router에서 `window.location.reload()`는 안티패턴. 전체 페이지 깜박임, Realtime 구독 끊김 → 재연결 비용, Supabase 세션 재확인 발생
- **영향:** 관리자가 일정 활성화 시 모든 조장 화면이 깜박이며 체크인 흐름 단절. 일정 추가/시간 변경 후에도 관리자 화면 깜박임
- **수정 방향:** `router.refresh()`(서버 컴포넌트 데이터만 갱신) 또는 상태 직접 갱신

```
// 수정 필요 위치 4곳
GroupView.tsx:65       → onScheduleActivated (feed 뷰일 때)
GroupView.tsx:103      → handleBack (토스트 있을 때)
AdminView.tsx:71       → onScheduleActivated
ScheduleTab.tsx:83     → 일정 활성화 성공 후
ScheduleTab.tsx:175    → 일정 추가 성공 후
```

---

### [CR-003] 전체 현황 인라인 표시 (PRD 불일치)

- **파일:** `src/components/group/GroupFeedView.tsx:84-99`
- **문제:** PRD 4.2.1이 "[전체 현황 보기] 버튼 → 바텀시트"로 변경됐으나, 코드는 피드 하단에 인라인 그리드로 표시 중. 일정이 많으면 전체 현황이 스크롤 아래로 밀려남
- **수정 방향:** `GroupStatusGrid`를 인라인에서 제거 → 피드 상단에 [전체 현황 보기] 버튼 배치 → 버튼 탭 시 바텀시트(Sheet) 오픈. 버튼 위치/타이밍은 목업 단계에서 확정

---

### [CR-004] updateUserRole RLS 정책 누락

- **파일:** `src/actions/setup.ts:262-272`
- **문제:** `updateUserRole` 함수가 `createClient()`(ANON key, RLS 적용)를 사용하지만, Users 테이블에 UPDATE 정책이 없음 (CLAUDE.md 3.7에 SELECT만 정의). admin이 역할 변경 시도해도 RLS에 의해 조용히 차단됨
- **영향:** 셋업 시 조장 권한 부여가 실패하는 운영 장애
- **수정 방향:** 2가지 중 택 1
  - (A) `createServiceClient()` 사용 (RLS 우회, 이미 requireAdmin 검증됨)
  - (B) Supabase에 admin용 Users UPDATE 정책 추가

---

### [CR-005] uncheckedCount 불참 계산 오류

- **파일:** `src/components/group/GroupCheckinView.tsx:162-163, 200-203`
- **문제:** `checkedIds`가 `checkIns.map(c => c.user_id)`로 생성되어 불참(is_absent=true) 인원도 포함. 결과적으로 불참 처리된 인원이 "확인 완료"로 계산되어 보고 버튼의 `uncheckedCount`가 실제보다 적게 표시됨
- **영향:** 보고 모달의 "N명이 아직이에요" 수치가 부정확. 조장이 보고 시 실제 미확인 인원을 파악 불가
- **수정 방향:** `uncheckedCount` 계산 시 불참 인원을 별도 처리. PRD 기준: 불참 = 탑승 카운트 제외 + 확인 완료 처리

```typescript
// 현재 (문제)
const uncheckedCount = members.filter(
  m => !checkIns.some(c => c.user_id === m.id)
).length;

// 개선: 불참 제외한 순수 미확인
const confirmedIds = new Set(checkIns.map(c => c.user_id)); // 체크인+불참 모두
const uncheckedCount = members.filter(
  m => !confirmedIds.has(m.id)
).length;
// "N명이 아직이에요"의 N = 체크인도 안 되고 불참도 안 된 순수 미확인
```

---

### [CR-006] 오프라인 배너 z-index 충돌

- **파일:** `src/components/group/GroupCheckinView.tsx:332-340`
- **문제:** 보고 버튼(`fixed bottom-0`) 위에 오프라인 배너(`fixed bottom-16`)가 위치하나, safe-area가 있는 iPhone에서 보고 버튼 영역(py-4 + pb-safe)이 64px을 초과하면 둘이 겹침
- **영향:** 오프라인 상태에서 보고 버튼 터치 불가 또는 배너 텍스트 가려짐
- **수정 방향:** 오프라인 배너를 보고 버튼 컨테이너 내부에 배치하거나, 보고 버튼 영역의 실제 높이를 기준으로 배너 bottom 값을 동적 계산

---

### [CR-007] checkin unique violation 에러 코드 불일치

- **파일:** `src/actions/checkin.ts:55-58`
- **문제:** `error.code !== "23505"` 조건으로 PostgreSQL 고유 제약 위반을 처리하나, Supabase JS 클라이언트의 error.code는 PostgreSQL 코드가 아닌 `PGRST116` 등 PostgREST 코드일 수 있음
- **영향:** 중복 체크인 시 에러 메시지가 사용자에게 노출되거나, 중복 오류를 무시 못해 실패로 처리
- **수정 방향:** upsert 방식(`ON CONFLICT DO NOTHING`) 또는 에러 메시지 문자열에 "duplicate"/"unique" 포함 여부로 판별

---

## Major (운영 안정성 영향 — 12건)

### [CR-008] pb-safe Tailwind 클래스 미정의

- **파일:** `src/components/group/GroupCheckinView.tsx:343`
- **문제:** `pb-safe` 클래스가 `tailwind.config.ts`에 정의되지 않아 적용 안 됨. `globals.css`에 정의했다면 Tailwind purge에서 제거될 수 있음
- **영향:** iPhone에서 보고 버튼이 홈 인디케이터에 가려짐 (현장 버그)
- **확인 필요:** `globals.css`에 `.pb-safe` 정의 여부 확인. 있다면 Tailwind safelist에 추가 필요

---

### [CR-009] stale activeSchedule prop

- **파일:** `src/components/group/GroupView.tsx:20-29`
- **문제:** `activeSchedule`은 서버 렌더링 시점의 값. Realtime으로 새 일정이 활성화돼도 이 prop은 갱신 안 됨. `GroupCheckinView`가 stale한 `activeSchedule.id`로 체크인을 생성할 위험
- **영향:** 일정 전환 후 구 일정에 체크인이 기록될 수 있음
- **수정 방향:** `activeSchedule`도 `useState`로 관리하고, `onScheduleActivated`에서 갱신하거나 `router.refresh()` 사용

---

### [CR-010] 피드 <-> 체크인 뷰 전환에 URL 변화 없음

- **파일:** `src/components/group/GroupView.tsx:32-46`
- **문제:** `view` state로 피드/체크인 전환. 브라우저/안드로이드 뒤로가기 버튼 누르면 체크인 중 상태가 사라지고 이전 페이지(로그인 등)로 이동
- **영향:** 조장이 실수로 뒤로가기 누르면 체크인 진행 상태 소실
- **수정 방향:** `History.pushState` 활용 + `popstate` 이벤트 처리, 또는 URL 파라미터(`/group?view=checkin`) 방식

---

### [CR-011] useMemo 누락 (성능)

- **파일:** `src/components/admin/StatusTab.tsx:77-88`, `src/components/group/GroupCheckinView.tsx:205-213`
- **문제:** 200명 데이터 계산(checkedIds, absentIds, summaries, sorted)이 매 렌더마다 재실행. Realtime 업데이트 시 불필요한 재계산
- **수정 방향:** `useMemo`로 의존성 기반 메모이제이션 적용

---

### [CR-012] MainLayout flex 구조 불완전

- **파일:** `src/app/(main)/layout.tsx:7`
- **문제:** `min-h-screen`만 있고 `flex flex-col`이 없어 자식 컴포넌트의 `flex-1`이 동작 안 함
- **수정 방향:** `className="mx-auto w-full max-w-lg min-h-screen flex flex-col bg-app-bg"` 추가

---

### [CR-013] 시간 수정 날짜 덮어쓰기 버그

- **파일:** `src/components/admin/ScheduleTab.tsx:135-157`
- **문제:** `handleTimeEdit`에서 `new Date()`로 오늘 날짜 기준 시각 생성. 3일차 일정의 시각을 1일차에 수정하면 날짜가 1일차로 변경됨
- **수정 방향:** 기존 `scheduled_time`의 날짜 부분을 보존하고 시:분만 변경. 또는 `day_number`와 여행 시작일을 기반으로 날짜 계산

---

### [CR-014] 체크인 로딩 상태 UI 미반영

- **파일:** `src/components/group/GroupCheckinView.tsx:62-107`
- **문제:** `useTransition`의 `isPending`을 UI에 반영하지 않음. 느린 네트워크에서 버튼 응답 여부를 알 수 없어 중복 탭 유발
- **참고:** 낙관적 업데이트로 카드는 즉시 변하지만 `offline_pending: true`인 체크인에 시각적 구분 없음
- **수정 방향:** pending 상태의 카드에 점선 테두리 또는 작은 동기화 아이콘 표시

---

### [CR-015] 일정 추가 form 태그 없음

- **파일:** `src/components/admin/ScheduleTab.tsx:279-330`
- **문제:** 4개 input이 `<div>`로 감싸져 있어 Enter 키 제출 불가. 모바일 키보드 "완료" 버튼 미작동
- **수정 방향:** `<form onSubmit={handleAddSchedule}>` 래핑

---

### [CR-016] fixed 요소 max-w-lg 미적용

- **파일:** 보고 버튼(`GroupCheckinView.tsx`), 오프라인 배너(`GroupFeedView.tsx`, `GroupCheckinView.tsx`), 토스트(`GroupView.tsx`, `AdminView.tsx`)
- **문제:** `fixed bottom-0 left-0 right-0`인 요소들이 `max-w-lg` 컨테이너를 무시하고 전체 화면 너비로 표시
- **영향:** 관리자가 데스크탑에서 접근 시 레이아웃 깨짐
- **수정 방향:** fixed 요소 내부에 `max-w-lg mx-auto` 래퍼 추가

---

### [CR-017] label-input htmlFor 연결 없음 (KWCAG 1.3.1)

- **파일:** `src/components/setup/DataSourceStep.tsx:80-99`
- **문제:** `<label>`과 `<input>`이 `htmlFor`/`id`로 연결되지 않아 스크린리더가 관계 인식 불가
- **수정 방향:** 모든 label-input 쌍에 `htmlFor` + `id` 추가

---

### [CR-018] 컴포넌트 크기 초과 (200줄 권장)

- **파일:**
  - `GroupCheckinView.tsx` — 441줄 (이니셜행, 축하섹션, 모달 3개 분리 필요)
  - `AdminGroupDrillDown.tsx` — 388줄 (MemberRow, ConfirmDialog 분리)
  - `ScheduleTab.tsx` — 361줄 (AddScheduleForm, TimeEditDialog 분리)
  - `GroupFeedView.tsx` — 352줄 (ScheduleCard, GroupStatusGrid 분리)
- **수정 방향:** 관심사별 서브 컴포넌트 추출. 각 파일 200줄 이내로 분리

---

### [CR-019] useOfflineSync 초기 isOnline flash

- **파일:** `src/hooks/useOfflineSync.ts:19`
- **문제:** `useState(true)` 초기값. 오프라인 기기에서 첫 렌더 시 온라인 UI → useEffect 후 오프라인 UI로 전환 시 flash 발생
- **수정 방향:** `useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true)` 패턴

---

## Minor (개선 권장 — 9건)

### [CR-020] 터치 타겟 min-w-11 누락

- **파일/위치:**
  - `MemberCard.tsx:100` — 불참 버튼
  - `AdminGroupDrillDown.tsx:267, 287, 298` — 불참/불참취소/체크인취소 버튼
  - `ScheduleTab.tsx:201` — 시간 수정 버튼 (`min-h-11`도 누락)
- **수정:** 해당 버튼에 `min-w-11` (또는 `min-h-11`) 추가

---

### [CR-021] Member 인터페이스 5곳 중복 정의

- **파일:** `GroupView.tsx:9`, `GroupCheckinView.tsx:27`, `GroupFeedView.tsx:8`, `AdminView.tsx:9`, `StatusTab.tsx:9`
- **수정:** `src/lib/types.ts`에 `MemberSummary` 타입 추가 후 import 통합

---

### [CR-022] 배지 로직 중복

- **파일:** `StatusTab.tsx:44-53` `getBadge()` vs `GroupFeedView.tsx:300-304` `getBadgeStatus()`
- **수정:** `src/lib/utils.ts` 또는 `constants.ts`에 공유 유틸 추출

---

### [CR-023] 토스트 로직 중복

- **파일:** `GroupView.tsx:49-57`, `AdminView.tsx:58-68`
- **수정:** `useToast()` 커스텀 훅 추출

---

### [CR-024] requireAdmin 중복 정의

- **파일:** `src/actions/setup.ts:19-33`, `src/actions/schedule.ts:6-20`
- **수정:** `src/lib/supabase/server.ts`에 공통 헬퍼로 이동

---

### [CR-025] 하드코딩 색상값

- **파일:** `StatusTab.tsx:37-42` — `bg-[#EAF3DE]` (= `bg-complete-card`), `GroupFeedView.tsx:294-298` — `text-[#3C1E1E]`
- **수정:** `tailwind.config.ts`에 등록된 토큰 사용으로 통일

---

### [CR-026] scheduled_time HH:MM 파싱

- **파일:** `src/utils/sheets-parser.ts:209-213`
- **문제:** Google Sheets에서 파싱한 `scheduled_time`이 `"HH:MM"` 문자열 그대로 저장. `timestamptz` 타입에 삽입 시 실패 가능
- **수정:** 날짜 정보(여행 시작일 + day_number)와 합쳐 ISO 형식으로 변환

---

### [CR-027] 관리자 탭 전환 시 스크롤 위치 초기화

- **파일:** `src/components/admin/AdminView.tsx:131-153`
- **문제:** 현황 → 일정 → 현황 이동 시 스크롤 최상단으로 돌아감. 20개 조 확인 중 불편
- **수정:** 탭별 스크롤 위치 저장/복원, 또는 조건부 렌더링 대신 `display: none` 방식

---

### [CR-028] SetupWizard 시각적 진행 표시기 없음

- **파일:** `src/components/setup/SetupWizard.tsx:52-53`
- **문제:** "Step 1 / 3" 텍스트만 있고 프로그레스 바/breadcrumb 없음
- **수정:** 간단한 step indicator UI 추가

---

## 접근성 보완 사항 (KWCAG 2.2)

### 수정 필요

| 항목 | 파일 | 내용 |
|---|---|---|
| 터치 타겟 | `MemberCard.tsx:100` 외 4곳 | `min-w-11` 누락 (CR-020) |
| label 연결 | `DataSourceStep.tsx:80-99` | `htmlFor`/`id` 미연결 (CR-017) |
| 이니셜 행 구조 | `GroupCheckinView.tsx:246` | `role="list"` + `role="listitem"` 없음 |
| 조 카드 터치 타겟 | `StatusTab.tsx:151-155` | `min-h-11` 누락 |

### 통과 (양호)

- 모든 아이콘에 `aria-hidden="true"` 또는 인접 `aria-label` 적용
- 색상 + 텍스트/배지 레이블 병기 (KWCAG 1.3.3 준수)
- 모든 포커스 가능 요소에 `focus-visible:ring-2` 적용
- 모든 폰트 크기 rem 단위 또는 Tailwind utility (px 금지 준수)
- 모달: Radix UI `DialogPrimitive` 사용으로 `role="dialog"` + `aria-modal="true"` 자동 처리
- 상태 메시지: 토스트, 경과 시간에 `aria-live="polite"` 적용

### 확인 필요

- 명도 대비: `#FEE500` + `#3C1E1E` 조합의 4.5:1 비율 수동 검증 필요
- `tailwind.config.ts` 커스텀 색상값과 PRD 8.1 컬러 시스템 테이블 정합성

---

## 강점 (유지)

- 모든 DB 쓰기가 Server Action 경유 (클라이언트 직접 mutation 없음)
- `SUPABASE_SERVICE_ROLE_KEY` 클라이언트 노출 없음
- `any` 타입 0건, `console.log` 잔류 0건
- 오프라인 localStorage 큐 + 낙관적 업데이트 정상 구현
- PRD 컬러 시스템 토큰 대부분 준수
- KWCAG 접근성 기초 패턴 전반적 준수
- 타입 안정성 (TypeScript strict mode)

---

## 수정 우선순위 권고

### 1순위 (현장 장애 직결)
CR-001 useBroadcast, CR-005 uncheckedCount, CR-004 RLS 정책, CR-008 pb-safe

### 2순위 (UX 품질)
CR-002 reload, CR-009 stale activeSchedule, CR-010 뒤로가기, CR-006 z-index

### 3순위 (코드 품질)
CR-003 전체현황 바텀시트, CR-011 useMemo, CR-018 컴포넌트 분리, CR-007 에러 코드

### 4순위 (마감 후)
CR-020~CR-028 Minor 전체
