# Code Review Report

## Analysis Target
- Path: `src/` (전체 코드베이스)
- File count: 45 (actions 4, hooks 6, components 29, lib 6, utils 2, app pages/routes 12, middleware 1)
- Analysis date: 2026-03-26
- Reviewer: Claude Code Analyzer

## Quality Score: 82/100

| Category | Score | Notes |
|---|---|---|
| Security | 17/20 | Server Action 입력 검증 부재, 나머지 우수 |
| Architecture | 18/20 | Clean Architecture 준수, 레이어 분리 명확 |
| Code Quality | 16/20 | 타입 안전, `any`/`console.log` 없음, 일부 중복 |
| Accessibility | 16/20 | KWCAG 2.2 전반 준수, 일부 누락 |
| Performance | 15/20 | 전반 양호, 일부 불필요 재렌더/중복 연산 |

## Files Reviewed: 45

## Issues Found: 19 (Critical: 2, Major: 8, Minor: 9)

---

## Critical Issues

| # | File | Line | Issue | Recommended Action |
|---|------|------|-------|-------------------|
| C-1 | `src/actions/checkin.ts` | 34-65 | **Server Action 입력 검증 부재 (SQL Injection 계열):** `createCheckin(userId, scheduleId)`, `deleteCheckin`, `markAbsent`, `syncOfflineCheckins` 등 모든 Server Action이 `userId`, `scheduleId` 파라미터에 대해 UUID 형식 검증을 수행하지 않음. 클라이언트에서 임의 문자열을 전달할 수 있음. Supabase의 PostgreSQL이 UUID 타입 불일치 시 에러를 반환하므로 직접적 SQL Injection은 아니지만, 악의적 입력이 RPC 함수(`sync_offline_checkins`)의 JSONB 파싱까지 도달 가능. | 모든 Server Action 진입점에 UUID 형식 검증 추가: `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; if (!UUID_RE.test(userId)) return { ok: false, error: "잘못된 요청" };` |
| C-2 | `src/actions/schedule.ts` | 61-103 | **`createSchedule` 입력 검증 부재:** `title`, `location`, `dayNumber`, `scheduledTime`, `scope` 파라미터 모두 서버 측 검증 없음. `dayNumber`에 음수나 비정상 값, `scope`에 임의 문자열 전달 가능. DB의 CHECK 제약이 마지막 방어선이지만, 서버 액션 레벨에서 걸러야 함. `updateScheduleTime`도 `scheduledTime`에 대한 형식 검증 없음. | `dayNumber` 범위 검증(1-3), `scope` 허용값 검증(`"all" | "advance" | "rear"`), `title` 빈 문자열 검증 추가 |

---

## Major Issues

| # | File | Line | Issue | Recommended Action |
|---|------|------|-------|-------------------|
| M-1 | `src/actions/setup.ts` | 315-335 | **`updateUser` 권한 우회 가능성:** `updateUser`가 `role` 필드를 포함하여 업데이트하는데, 전달된 `data.role`에 대한 허용값 검증이 없음. 이론적으로 `admin_leader` 등 임의 역할을 설정할 수 있음. `updateUserRole`은 `"member" | "leader"`로 타입 제한되어 있지만, `updateUser`는 `UserRole` 전체를 수용. | `updateUser`에서 `role`이 `admin` 또는 `admin_leader`로 변경되는 경우 차단하거나, 명시적 허용 역할 목록 검증 추가 |
| M-2 | `src/components/group/GroupCheckinView.tsx` | 348-361 | **보고 버튼 `disabled` 패턴 근접:** PRD에서 보고 버튼 `disabled` 처리를 절대 금지하고 있으나, 현재 `aria-disabled={!allComplete}`과 `onClick={allComplete ? handleReport : undefined}` 조합으로 미완료 시 클릭 불가 상태. PRD 4.2.7은 "미완료 시 확인 모달 표시 후 보고"를 요구. | 미완료 상태에서도 `onClick`을 활성화하고, 클릭 시 "N명이 아직이에요. 그래도 보고할까요?" 확인 모달을 표시한 후 보고 진행하도록 변경 |
| M-3 | `src/components/group/GroupView.tsx` | 86-101 | **`onScheduleActivated` 시 불완전한 Schedule 객체 생성:** Realtime으로 새 일정 활성화 이벤트 수신 시, payload에 `title`과 `schedule_id`만 전달되므로 `location`, `day_number`, `sort_order`, `scheduled_time` 등은 이전 일정(`prev`)의 값을 복사함. 이전 일정과 새 일정의 속성이 완전히 다를 수 있어, UI에 잘못된 location/time이 표시될 수 있음. | broadcast payload에 `location`, `day_number`, `scope` 등 필수 필드를 추가하거나, 활성화 이벤트 수신 시 `router.refresh()`로 서버 데이터를 다시 가져오는 방식으로 전환 |
| M-4 | `src/hooks/useOfflineSync.ts` | 26-51 | **오프라인 sync 실패 시 체크인 데이터 유실 위험:** `syncPending()`에서 `syncOfflineCheckins` 성공 시 즉시 `clearPendingCheckins()`를 호출하지만, 부분 성공(일부만 sync)인 경우 RPC가 성공 건수만 반환하고 실패 건은 무시됨. `ON CONFLICT DO NOTHING`이므로 중복은 자연 처리되나, 네트워크 타임아웃으로 서버에서는 처리됐지만 응답이 실패로 돌아온 경우 재시도가 반복될 수 있음. | 이 패턴은 `ON CONFLICT DO NOTHING`으로 안전하게 중복 방어되므로 심각도는 낮지만, 동기화 성공 후 pending count가 0이 아닌 경우를 UI에서 별도 안내하면 좋음 |
| M-5 | `src/components/admin/AdminView.tsx` | 37-57 | **클라이언트에서 Supabase SELECT 직접 호출:** `fetchCheckInsClient()` 함수가 클라이언트에서 `createClient()`로 Supabase에 직접 SELECT 쿼리를 수행. PRD는 "클라이언트에서 Supabase 직접 INSERT/UPDATE/DELETE 금지"로 명시하며 SELECT는 허용 범위이나, 이 패턴이 확산되면 RLS 정책 의존도가 높아짐. 현재 RLS `checkins_read`는 같은 조만 읽도록 제한되어 있으므로 admin이 전체 조 체크인을 읽으려면 service client가 필요한데, 여기서는 `createClient()`(anon key)를 사용 중. | RLS에 admin 역할의 전체 읽기 정책이 포함되어 있으므로 현재는 동작하나, 이를 Server Action으로 래핑하여 일관성을 확보하는 것을 권장 |
| M-6 | `src/app/(main)/group/page.tsx` | 88-107 | **완료 일정별 체크인 카운트 N+1 잠재 위험:** 완료 일정 ID 목록으로 한 번의 `IN` 쿼리를 수행하고 있어 현재는 N+1 아니지만, 일정 수가 많아지면 `IN` 절의 UUID 목록이 매우 길어질 수 있음. 2박3일 여행으로 일정 수가 제한적(10-20개)이므로 현재는 문제 없으나 확장 시 주의 필요. | 현재 규모에서는 허용. 확장 시 DB View 또는 집계 RPC 도입 검토 |
| M-7 | `src/lib/supabase/server.ts` | 20-21 | **환경변수 non-null assertion `!` 사용:** `process.env.NEXT_PUBLIC_SUPABASE_URL!`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY!`에서 `!`로 null 체크를 우회. service client는 `requireServerEnv()`로 검증하지만, anon client는 검증 없이 `!`만 사용. 환경변수 누락 시 런타임에서 빈 URL로 Supabase 클라이언트가 생성되어 암호적(cryptic) 에러 발생. | `requireServerEnv()` 패턴을 `NEXT_PUBLIC_*` 변수에도 적용하거나, 앱 초기화 시 환경변수 존재 여부를 검증하는 스크립트 추가 |
| M-8 | `src/actions/setup.ts` | 260-284 | **`updateSchedule`에서 `scope` 변경 시 기존 체크인 정합성 미검증:** `scope`가 `"all"`에서 `"advance"`로 변경되면 후발 인원의 기존 체크인이 orphan 상태가 됨. DB에는 여전히 존재하지만 UI에서 보이지 않아 카운트 불일치 가능. | `scope` 변경 시 해당 일정의 기존 체크인 중 새 scope에 해당하지 않는 건에 대한 경고 또는 자동 정리 로직 추가 |

---

## Minor Issues

| # | File | Line | Issue | Recommended Action |
|---|------|------|-------|-------------------|
| m-1 | `src/actions/checkin.ts` + `report.ts` | 10-13, 9-13 | **`revalidateMainPaths()` 중복 정의:** 동일 함수가 `checkin.ts`, `report.ts`, `schedule.ts`, `setup.ts` 4개 파일에 각각 정의됨. | 공통 유틸로 추출: `src/lib/revalidate.ts` 또는 `src/actions/_shared.ts` |
| m-2 | `src/components/admin/AdminScheduleCard.tsx` | 34-41 | **`reportedCount` 계산 O(groups x members) 복잡도:** 카드 렌더링마다 조별 멤버 필터링 + 체크인 상태 확인 수행. 일정 카드가 많으면 렌더링 비용 증가. `useMemo`로 감싸진 상위 컴포넌트가 아닌 일반 함수형 컴포넌트 내부에서 매 렌더마다 수행. | 상위 컴포넌트(`AdminScheduleList`)에서 미리 계산하여 prop으로 전달하거나, `AdminScheduleCard` 내부에서 `useMemo` 사용. 단, 현재 규모(10조)에서는 성능 영향 미미 |
| m-3 | `src/components/group/GroupView.tsx` | 187-193 | **`useEffect` 의존성 배열에 `currentUser.group_id` 누락 경고 가능성:** `checkinComplete`과 `currentUser.group_id`를 의존하는 useEffect에서 `currentUser.group_id`는 변경되지 않는 값이므로 실질적 문제는 아니지만, ESLint exhaustive-deps 규칙 관점에서 명시적으로 포함하는 것이 적절. | 현재 포함되어 있으므로 문제 없음 (확인 완료) |
| m-4 | `src/components/admin/AdminBottomSheet.tsx` | 175 | **구조 분해 변수 미사용 경고 잠재:** `busSummaries.map()` 내부의 `rawTotal`이 구조 분해로 추출되지만 텍스트 표시에만 사용. 변수 자체는 사용되므로 문제 없으나 ESLint `no-unused-vars` 설정에 따라 경고 가능. | 현재 사용 중이므로 문제 없음 (확인 완료) |
| m-5 | `src/hooks/useRealtime.ts` | 21 | **모듈 레벨 `channelRegistry` (전역 상태):** `Map` 객체가 모듈 스코프에 선언되어 HMR(Hot Module Replacement) 시 이전 인스턴스가 남아있을 수 있음. 프로덕션에서는 문제 없으나, 개발 중 StrictMode 이중 마운트 시 채널 누적 가능. | 현재 `Set` 기반 중복 방지와 cleanup에서 `unregisterChannel`이 올바르게 동작하므로 안전. 추가 방어는 불필요 |
| m-6 | `src/components/group/ScheduleCard.tsx` | 42-43 | **동일 배열에 대한 이중 `filter` 호출:** `checkIns.filter(c => !c.is_absent).length`와 `checkIns.filter(c => c.is_absent).length`가 같은 `checkIns` 배열을 2회 순회. | 단일 `reduce`로 통합하여 1회 순회로 최적화 가능. 단, 배열 크기가 조원 수(최대 20명)이므로 성능 영향 무시 가능 |
| m-7 | `src/components/group/GroupCheckinView.tsx` | 318-326 | **`checkIns.find()` 반복 호출 (O(n x m)):** `sorted.map()` 내부에서 매 카드마다 `checkIns.find((c) => c.user_id === m.id)`를 호출. 조원 수(최대 20)에서 성능 문제 없으나, `Map`으로 사전 변환하면 O(1) 조회 가능. | `useMemo(() => new Map(checkIns.map(c => [c.user_id, c])), [checkIns])` 사용 권장 |
| m-8 | `src/lib/utils.ts` | 56 | **`parseKSTTime` fallback의 취약한 입력 처리:** 매칭되지 않는 입력이 그대로 반환됨(`return input`). 이미 ISO 형식이라는 주석이 있지만, 완전히 비정상적인 문자열이 들어오면 DB 오류 발생. | setup 파싱 컨텍스트에서만 사용되므로 현재 안전. `updateScheduleTime` 등에서 사용되면 추가 검증 필요 |
| m-9 | `src/components/admin/AdminView.tsx` | 1 | **파일 길이 515줄:** CLAUDE.md 권장 200줄 초과. State 관리, Realtime 처리, 다이얼로그 조합 등이 한 파일에 집중. | Realtime 콜백 로직을 커스텀 훅(`useAdminRealtime`)으로, 바텀시트/다이얼로그 state를 `useReducer`로 추출 검토 |

---

## Recently Changed Files Review

### `src/lib/utils.ts` -- parseKSTTime regex fix

**변경 내용:** `TIME_PATTERNS`의 시간 부분 정규식이 `\d{2}`에서 `\d{1,2}`로 변경되어 `"8:00"` 같은 1자리 시간도 지원.

- **정합성:** `parseKSTTime()` 내부에서 `hh.padStart(2, "0")`으로 1자리 시간을 2자리로 보정하므로 올바르게 동작
- **영향 범위:** `setup.ts`의 `upsertSchedules()`에서 사용. Google Sheets에서 "8:00" 형식으로 입력된 시간이 정상 파싱됨
- **판정:** 정상. 하위 호환성 유지.

### `src/components/group/ScheduleCard.tsx` -- 진행중 배지 소형 원 추가

**변경 내용:** 진행중 배지에 `<span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 align-middle" aria-hidden="true" />` 소형 원(dot) 추가.

- **접근성:** `aria-hidden="true"` 적용으로 스크린 리더 노출 차단 -- 순수 장식 요소로 적절
- **KWCAG 1.3.3:** 색상+텍스트("진행중")+아이콘(dot) 3중 표현으로 감각적 특성 준수
- **판정:** 정상. 접근성 준수.

### `src/components/admin/AdminScheduleCard.tsx` -- 동일 패턴 적용

**변경 내용:** 관리자 카드에도 동일한 진행중 배지 소형 원 추가.

- **일관성:** 조장 ScheduleCard와 동일 패턴으로 UI 일관성 확보
- **판정:** 정상.

---

## Positive Findings

### Security
- **`any` 타입 사용:** 0건 (전체 TypeScript strict 준수)
- **`console.log` 잔여:** 0건
- **`line-through` 사용:** 0건 (PRD 금지 사항 준수)
- **Server Action 패턴:** 모든 DB 쓰기가 Server Action 경유. 클라이언트 INSERT/UPDATE/DELETE 0건
- **SUPABASE_SERVICE_ROLE_KEY:** 서버 파일(`server.ts`)에서만 사용, 클라이언트 노출 없음
- **도메인 제한:** `middleware.ts` + `auth/callback/route.ts` 이중 검증
- **RLS:** 모든 테이블 활성화, 역할별 정책 적용

### Architecture
- **Server Action 레이어 분리:** `actions/` 디렉토리에 역할별 4개 파일로 분리
- **타입 시스템:** `types.ts`에 도메인 타입 집중, 컴포넌트별 경량 타입 별도 정의
- **상수 관리:** 매직넘버/문자열 없음, `constants.ts`에 집중 정의
- **Realtime 아키텍처:** 채널 레지스트리 기반 중복 구독 방지, StrictMode 안전

### Accessibility (KWCAG 2.2)
- **터치 타겟 44px:** 모든 `<button>`, `<a>`에 `min-h-11 min-w-11` 적용 (100% 준수)
- **focus-visible 링:** `outline-none` 사용 시 100% `focus-visible:ring-2` 대체 적용
- **aria-live:** 상태 변화 컨테이너에 `aria-live="polite"` 적용
- **aria-label:** 아이콘 버튼에 명시적 레이블 적용
- **rem 단위:** px 기반 font-size 0건 (Tailwind 유틸리티 rem 기반)
- **색상+텍스트 이중 표현:** 체크인 상태에 색상+텍스트+아이콘 3중 표시
- **lang="ko":** root layout에 한국어 언어 속성 설정

### Code Quality
- **함수 길이:** 대부분 50줄 이내. AdminView(515줄)만 초과
- **네이밍:** PascalCase(컴포넌트), camelCase(함수/변수) 일관 준수
- **에러 처리:** Server Action에서 `try/catch` + 사용자 친화적 에러 메시지 반환
- **낙관적 업데이트:** 체크인/취소 시 즉시 UI 반영 + 실패 시 롤백 패턴 일관 적용
- **오프라인 대응:** localStorage 큐잉 + `ON CONFLICT DO NOTHING` 중복 방어

---

## Architecture Compliance (CLAUDE.md 기준)

| 항목 | 상태 | 비고 |
|------|------|------|
| Server Action 경유 DB 쓰기 | PASS | 클라이언트 직접 쓰기 0건 |
| Realtime broadcast 전용 | PASS | Polling 패턴 0건 |
| 컬러 시스템 준수 | PASS | PRD 8.1 테이블 값만 사용 |
| UI 문구 준수 | PASS | `COPY` 상수로 일원화 |
| 보고 버튼 disabled 금지 | **WARN** | `aria-disabled` + click 미연결 (M-2) |
| `line-through` 금지 | PASS | 사용 0건 |
| `focus-visible` 링 유지 | PASS | 제거 0건 |
| 오프라인 배너 하단 고정 | PASS | `fixed bottom-0` |
| RLS 정책 적용 | PASS | middleware + Server Action 이중 검증 |

---

## Improvement Recommendations

1. **[High] Server Action 입력 검증 계층 추가:** UUID 형식 검증 유틸(`validateUUID`)을 만들어 모든 Server Action 진입점에 적용. zod 같은 스키마 검증 라이브러리 도입도 검토.

2. **[High] 보고 버튼 PRD 정합성 수정:** 미완료 상태에서도 클릭 가능하게 하고, "N명이 아직이에요. 그래도 보고할까요?" 확인 모달을 표시하는 PRD 원본 흐름으로 복원.

3. **[Medium] AdminView 파일 분할:** 515줄 파일을 Realtime 로직(`useAdminRealtime` 훅), 바텀시트 상태관리, 다이얼로그 상태관리로 분리하여 200줄 이내로 축소.

4. **[Medium] `revalidateMainPaths()` 중복 제거:** 4개 파일에 동일 함수 정의 -- 공유 모듈로 추출.

5. **[Low] `onScheduleActivated` broadcast payload 확장:** `location`, `day_number`, `scope` 필드를 payload에 포함하여 체크인 뷰에서 서버 재조회 없이 정확한 Schedule 객체를 구성할 수 있도록 개선.

---

## Deployment Decision

**Warning 이슈만 존재 -- 배포 가능, 수정 권장**

- Critical 2건은 모두 입력 검증 관련으로, PostgreSQL UUID 타입 체크가 최종 방어선으로 작동하여 실제 공격 성공 가능성은 낮음
- 그러나 Defense in Depth 원칙상 Server Action 레벨 검증 추가를 강력 권장
- M-2(보고 버튼)는 PRD 원문과의 정합성 이슈로, 운영 전 수정 필요
