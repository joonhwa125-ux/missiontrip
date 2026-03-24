# 코드 리뷰 & 리팩토링 검토 보고서

> **최초 작성:** 2026-03-24 | **재검증:** 2026-03-24
> **분석 범위:** Phase 0 + Phase 1 전체 (src/ 하위 모든 파일)
> **세션별 순차 적용 예정 — 매 세션 시작 시 이 문서 확인**

---

## 재검증 결과 요약

| 카테고리 | 총 이슈 | ✅ 정확 | ⚠️ 부분 확인 | ➕ 신규 발견 |
|---|---|---|---|---|
| 버그/보안 B-1~5 | 5 | 3 | 2 | 0 |
| 코드 중복 D-1~5 | 5 | 4 | 1 | 0 |
| 타입 T-1~3 | 3 | 3 | 0 | 0 |
| JSX/성능 J-1~2 | 2 | 2 | 0 | 1 |
| **신규 발견** | — | — | — | **3건** |

**전체 평가:** 문서 정확도 높음. 오류 항목 없음. 부분 확인 2건은 심각도 조정 필요.

---

## ✅ 이미 수정된 항목

| ID | 파일 | 내용 |
|---|---|---|
| DONE-1 | `src/components/group/GroupFeedView.tsx` | 진행중 카드 카운트 `total` → `effectiveTotal` (불참 제외) 수정 |

---

## 🔴 버그 / 보안 — 세션 1 대상

### B-1. `CheckedBy` 타입에 미사용 `"self"` 포함 ✅

- **파일:** `src/lib/types.ts:4`
- **현재:** `export type CheckedBy = "self" | "leader" | "admin";`
- **문제:** PRD "셀프 체크인 없음" 명시. 전체 코드에서 `"self"` 미사용. DB CHECK 제약 `('leader','admin')`과 불일치
- **수정:**
  ```typescript
  export type CheckedBy = "leader" | "admin";
  ```

---

### B-2. `group/page.tsx` 중복 DB 쿼리 ✅

- **파일:** `src/app/(main)/group/page.tsx:63-83`
- **현재:** 활성 일정이 있을 때 `check_ins` 쿼리 2회 (전체 조 + 우리 조)
- **문제:** `queries[1]`은 `queries[0]` 결과의 부분집합 → 불필요한 DB 왕복 1회
- **수정:**
  ```typescript
  // queries[1] 제거 후:
  allCheckIns = (results[0].data ?? []) as typeof allCheckIns;
  const memberIds = new Set(members?.map((m) => m.id) ?? []);
  checkIns = allCheckIns.filter((ci) => memberIds.has(ci.user_id)) as CheckIn[];
  ```

---

### B-3. `AdminView` Dialog 내 `GroupCheckinView`에 `onReported` 미전달 ⚠️

- **파일:** `src/components/admin/AdminView.tsx:387-410`
- **문제:** 관리자가 자기 조 Sheet에서 보고해도 `reportsMap` state 미갱신
- **재검증 보완:** `closeCheckinSheet`(205-210행)에서 `router.refresh()` 호출로 Sheet 닫을 때 서버 데이터 갱신됨 → **Sheet가 열린 상태에서만** 배지가 미반영. 심각도는 초기 기재보다 낮음
- **수정 (여전히 권장):** `handleSheetReported` 콜백 추가 후 `onReported={handleSheetReported}` 전달
  ```typescript
  const handleSheetReported = useCallback(() => {
    if (!activeSchedule) return;
    const sid = activeSchedule.id;
    setReportsMap((prev) => {
      const list = prev[sid] ?? [];
      if (list.some((r) => r.group_id === currentUser.group_id)) return prev;
      return {
        ...prev,
        [sid]: [...list, {
          group_id: currentUser.group_id,
          pending_count: 0,
          reported_at: new Date().toISOString(),
        }],
      };
    });
  }, [activeSchedule, currentUser.group_id]);
  ```

---

### B-4. `AdminView` Realtime 핸들러 — 빈 `schedule_id` 처리 ✅

- **파일:** `src/components/admin/AdminView.tsx:230, 241`
- **현재:** `const sid = schedule_id || activeSchedule?.id;`
- **문제:** `GroupCheckinView` broadcast 시 `activeSchedule?.id ?? ""` 사용 → `schedule_id`가 `""` 이면 falsy로 의도치 않은 fallback
- **수정:**
  ```typescript
  const sid = schedule_id?.length ? schedule_id : activeSchedule?.id;
  ```

---

### B-5. `fetchScheduleCheckIns` 인증 검사 누락 ✅

- **파일:** `src/actions/schedule.ts:76-99`
- **문제:** 같은 파일의 `activateSchedule`, `createSchedule`, `updateScheduleTime`은 모두 `requireAdmin()` 호출하는데 `fetchScheduleCheckIns`만 인증 없이 `createServiceClient()` 직접 사용
- **수정:**
  ```typescript
  export async function fetchScheduleCheckIns(scheduleId: string) {
    const actor = await getCurrentUser();
    if (!actor) return { checkIns: [], reports: [] };
    // ... 이후 기존 로직
  }
  ```

---

## 🟠 코드 중복 — 세션 2 대상

### D-1. `broadcastCheckin` 함수 중복 ✅

- **파일:** `src/components/group/GroupCheckinView.tsx:64-74`, `src/components/admin/AdminGroupDrillDown.tsx:156-168`
- **문제:** 두 컴포넌트에 3채널 broadcast 로직 완전 동일 (GLOBAL + GROUP:{id} + ADMIN)
- **수정:** `src/hooks/useRealtime.ts`에 `useBroadcastCheckin(groupId, scheduleId)` 훅 추출

---

### D-2. 배지 설정 + `getBadgeStatus` 함수 중복 ✅

- **파일:** `src/components/group/GroupFeedView.tsx:349-361`, `src/components/admin/AdminBottomSheet.tsx:38-50`
- **문제:** `FEED_BADGE` / `BADGE` 동일 내용, `getBadgeStatus` / `getBadge` 동일 로직 (100% 일치)
- **수정:**
  - `src/lib/utils.ts`에 `getGroupBadgeStatus(total, checked, hasReport): GroupBadgeStatus` 추출
  - `src/lib/constants.ts`에 `GROUP_BADGE_STYLE` 상수 추가

---

### D-3. scope 기반 멤버 필터링 중복 (7곳) ✅

- **파일 (재검증 결과 7곳으로 확대):**
  - `src/components/admin/AdminScheduleCard.tsx:41-43`
  - `src/components/admin/AdminBottomSheet.tsx:74-78`
  - `src/components/admin/AdminScheduleList.tsx:54-58`
  - `src/components/group/GroupView.tsx:176-180`
  - `src/components/admin/AdminView.tsx:390-396`
  - `src/components/group/GroupFeedView.tsx:159-162` (ScheduleCard 내부)
  - `src/components/group/GroupFeedView.tsx:282-284` (GroupStatusGrid 내부)
- **패턴:** `scope === "all" ? members : members.filter(m => m.party === scope)`
- **수정:** `src/lib/utils.ts`에 제네릭 함수 추출
  ```typescript
  export function filterMembersByScope<T extends { party: GroupParty | null }>(
    members: T[],
    scope: ScheduleScope
  ): T[] {
    if (scope === "all") return members;
    return members.filter((m) => m.party === scope);
  }
  ```

---

### D-4. 토스트 상태 로직 중복 ✅

- **파일:** `src/components/group/GroupView.tsx:56,88-94`, `src/components/admin/AdminView.tsx:49,214-218`
- **패턴:** `useState<string | null>` + `useEffect` 5초 타이머 + `showToast` callback + 토스트 JSX 완전 동일
- **수정:**
  - `src/hooks/useToast.ts` 훅 추출
  - `src/components/common/Toast.tsx` 컴포넌트 추출

---

### D-5. 백그라운드 복귀 갱신 로직 중복 ✅

- **파일:** `src/components/group/GroupView.tsx:75-86`, `src/components/admin/AdminView.tsx:94-112`
- **패턴:** `visibilitychange` 이벤트 → 3초 이상 숨겨진 경우 `router.refresh()` 호출
- **재검증 보완:** `AdminView.tsx:104-107`에는 `fetchScheduleCheckIns` 추가 호출 포함 → "완전 동일"이 아님. 훅 추출 시 `onVisible` 추가 콜백 파라미터 필요
- **수정:** `src/hooks/useVisibilityRefresh.ts` 훅 추출 완료. `GroupView`는 `useVisibilityRefresh()`, `AdminView`는 `useVisibilityRefresh(fetchOnVisible)` 으로 적용

---

## 🟡 타입 정확성 — 세션 1 대상

### T-1. `AllMember` 인터페이스 중복 정의 ✅

- **파일:** `src/components/group/GroupView.tsx:12-16`, `src/components/group/GroupFeedView.tsx:20-24`
- **현재:** 두 파일에 동일한 로컬 `interface AllMember { id, group_id, party }`
- **수정:** `src/lib/types.ts`에 추가
  ```typescript
  export interface GroupMemberBrief {
    id: string;
    group_id: string;
    party: GroupParty | null;
  }
  ```

### T-2. `type Report = AdminReport` 로컬 별칭 남용 ✅

- **파일:** `src/components/admin/AdminView.tsx:23`, `AdminScheduleList.tsx:14`, `AdminBottomSheet.tsx:23`
- **수정:** 각 파일에서 `AdminReport` 직접 import, 로컬 별칭 제거

### T-3. `AdminScheduleCard` 로컬 `Report` 인터페이스 ✅

- **파일:** `src/components/admin/AdminScheduleCard.tsx:7-11`
- **현재:** `interface Report { group_id, pending_count, reported_at }` — `AdminReport`와 동일
- **수정:** `AdminReport` 직접 import

---

## 🟢 JSX / 성능 — 세션 1 대상

### J-1. `AdminView` Dialog 내 IIFE 패턴 ✅

- **파일:** `src/components/admin/AdminView.tsx:390-396`
- **현재:** `members={(() => { const scope = ...; return ...; })()`
- **수정:** `useMemo`로 `adminCheckinMembers` 변수 분리

### J-2. `days` 배열 미메모이제이션 ✅ + ➕

- **파일 (원래):** `src/components/admin/AdminView.tsx:115`
- **파일 (신규 발견 NEW-1):** `src/components/group/GroupFeedView.tsx:67` — 동일 패턴 문서 누락
- **수정 (두 파일 모두):**
  ```typescript
  const days = useMemo(
    () => Array.from(new Set(schedules.map((s) => s.day_number))).sort(),
    [schedules]
  );
  ```

### J-3. 인라인 SVG 중복 ✅ 완료

- **파일:** `AdminView.tsx`, `GroupCheckinView.tsx`, `AdminGroupDrillDown.tsx`, `AdminBottomSheet.tsx`, `MemberCard.tsx`, `DataSourceStep.tsx`, `PageHeader.tsx`
- **수정:** `src/components/ui/icons.tsx` 생성 — 8개 아이콘 컴포넌트 (`CheckIcon`, `PhoneIcon`, `ChevronLeftIcon`, `XIcon`, `UsersIcon`, `PlusIcon`, `SettingsIcon`, `UploadIcon`) 추출 완료. 전체 컴포넌트에 적용

---

## ➕ 신규 발견 이슈 (재검증에서 추가)

### NEW-1. `GroupFeedView.tsx` `days` 배열 미메모이제이션

- **파일:** `src/components/group/GroupFeedView.tsx:67`
- **현재:** `const days = Array.from(new Set(mySchedules.map((s) => s.day_number))).sort();`
- **처리:** J-2 수정 시 함께 처리 (세션 1)

---

### NEW-2. `GroupCheckinView` 미완료 시 보고 버튼 `<p>` 태그 사용 ✅

- **파일:** `src/components/group/GroupCheckinView.tsx`
- **수정:** PRD 준수 확인. `<button>` + 확인 모달로 복원 완료 (세션 1에서 수정)

---

### NEW-3. `COPY.uncheckedWarning` PRD 문구 경미한 불일치

- **파일:** `src/lib/constants.ts:89`
- **현재:** `` uncheckedWarning: (n) => `${n}명이 미확인 상태예요` ``
- **PRD 명세:** `"현재 일정에 N명이 미확인 상태예요. 그래도 전환할까요?"`
- **현재 구현:** "현재 일정에" 접두어 누락. `uncheckedWarningQuestion` 상수로 분리되어 있어 조합하면 의미 전달에는 문제 없으나 PRD와 정확히 일치시키려면 수정 필요
- **처리:** 세션 1에서 constants.ts 수정 시 함께 처리 (경미)

---

## 금지 항목 점검 결과 — 전부 이상 없음 ✅

| 점검 항목 | 결과 |
|---|---|
| `console.log` 잔류 | 미발견 |
| `any` 타입 사용 | 미발견 |
| 보고 버튼 `disabled` 사용 | 미사용 |
| `text-decoration: line-through` | 미발견 |
| `focus-visible` 링 제거 (`outline-none` 단독) | 미발견 — 모두 `focus-visible:ring-2` 대체 존재 |
| px 단위 폰트 | 미발견 (`text-[0.625rem]`은 rem) |
| Polling 사용 | 미발견 — Realtime broadcast만 사용 |

---

## 리스크 분석 (코드 대조 검증 기반)

### 세션 1 항목별 리스크

| 항목 | 리스크 | 근거 |
|---|---|---|
| B-1 CheckedBy | **낮음** | `"self"` 사용처 0건 확인. 타입 축소만으로 컴파일 오류 없음 |
| B-2 중복 쿼리 | **낮음** | 동일 데이터의 클라이언트 필터링. `memberIds` Set이 비어있을 경우에도 빈 배열 반환으로 안전 |
| B-3 onReported | **중간** | `useCallback` deps에 `activeSchedule`와 `currentUser.group_id` 포함. `activeSchedule` 변경 시 콜백 재생성 — stale closure 위험은 낮으나, `setReportsMap` functional update 패턴으로 안전성 확보 필요 |
| B-4 sid 처리 | **낮음** | `""` → `.length` 체크로 변경. 기존 동작에서 `schedule_id`가 빈 문자열인 경우에만 차이 발생 |
| B-5 인증 추가 | **중간** | `getCurrentUser()`가 쿠키 기반이므로 Server Action 호출 시 인증 쿠키 미전달 가능성 검토 필요. 실패 시 빈 배열 반환으로 UX 영향은 "데이터 미표시" 수준 |
| T-1~T-3 | **낮음** | 구조적으로 동일한 타입. import 경로 변경만 |
| J-1, J-2 | **낮음** | `useMemo` 래핑. 동일 출력, 캐싱만 추가 |

### 세션 2 항목별 리스크

| 항목 | 리스크 | 근거 |
|---|---|---|
| D-1 broadcastCheckin | **중간** | 함수 시그니처 변경: GroupCheckinView의 `(userId, action)` → `(groupId, userId, action)`. **호출부 3곳** 수정 필요. 누락 시 컴파일 에러로 잡힘 (TS strict) |
| D-2 badge 중앙화 | **낮음** | 100% 동일한 상수+함수 이동. import 경로만 변경 |
| D-3 filterMembersByScope | **낮음** | 제네릭 `<T extends { party }>` 사용으로 기존 타입 모두 호환. 7곳 모두 동일 패턴 |
| D-4 useToast | **낮음** | state + timer + callback 추출. JSX는 각 컴포넌트에 유지 (GroupView에 "피드로 이동" 버튼 있어 구조 다름) |
| D-5 useVisibilityRefresh | **중간** | AdminView에 `fetchScheduleCheckIns` 추가 호출 포함 → 완전 동일하지 않음. `onVisible` 콜백 파라미터화 필요. 1회성 서비스에 2곳 사용은 과잉 추출 가능성 |

### 가장 위험한 시나리오

1. **D-1 호출부 누락:** `broadcastCheckin` 시그니처 변경 후 GroupCheckinView 호출부 3곳 중 하나라도 `groupId` 인자 누락 시 잘못된 채널로 broadcast → 조장 화면 미갱신. 다만 TypeScript strict로 컴파일 에러 발생하므로 배포 전 발견 가능
2. **B-5 인증 과잉 차단:** `getCurrentUser()` 실패 시 바텀시트 데이터가 빈 상태로 표시. 관리자 페이지 자체가 이미 인증 검증하므로 정상 사용 시에는 발생 안 함. 세션 만료 시에만 영향

---

## 실행 계획

### 세션 1 — 버그 + 타입 + JSX + 신규 이슈

| 항목 | 수정 파일 |
|---|---|
| B-1 CheckedBy 타입 | `src/lib/types.ts` |
| T-1 GroupMemberBrief 추가 | `src/lib/types.ts` |
| T-1 AllMember 교체 | `GroupView.tsx`, `GroupFeedView.tsx` |
| T-2, T-3 Report 타입 정리 | `AdminView.tsx`, `AdminScheduleList.tsx`, `AdminBottomSheet.tsx`, `AdminScheduleCard.tsx` |
| B-2 중복 쿼리 제거 | `src/app/(main)/group/page.tsx` |
| B-3 onReported 연결 | `src/components/admin/AdminView.tsx` |
| B-4 sid 처리 수정 | `src/components/admin/AdminView.tsx` |
| B-5 인증 추가 | `src/actions/schedule.ts` |
| J-1 IIFE → useMemo | `src/components/admin/AdminView.tsx` |
| J-2 + NEW-1 days 배열 메모 | `AdminView.tsx`, `GroupFeedView.tsx` |
| NEW-3 COPY 문구 수정 | `src/lib/constants.ts` |

**예상 수정 파일:** 10개

---

### 세션 2 — 공통 유틸/훅 추출 (중복 제거)

| 항목 | 신규/수정 파일 |
|---|---|
| D-3 filterMembersByScope 추출 + 7곳 적용 | `utils.ts` + 6개 파일 |
| D-2 badge 중앙화 | `utils.ts`, `constants.ts`, `AdminBottomSheet.tsx`, `GroupFeedView.tsx` |
| D-1 useBroadcastCheckin 훅 | `useRealtime.ts`, `GroupCheckinView.tsx`, `AdminGroupDrillDown.tsx` |
| D-4 useToast 훅 | `useToast.ts`(신규), `GroupView.tsx`, `AdminView.tsx` |
| D-5 useVisibilityRefresh 훅 추출 ✅ | `useVisibilityRefresh.ts`(신규), `GroupView.tsx`, `AdminView.tsx` |

**예상 수정 파일:** 12개

---

### 세션 3 — SVG 아이콘 정리 ✅ 완료

- `src/components/ui/icons.tsx` 생성 — 8개 아이콘 (`CheckIcon`, `PhoneIcon`, `ChevronLeftIcon`, `XIcon`, `UsersIcon`, `PlusIcon`, `SettingsIcon`, `UploadIcon`)
- 적용 파일: `PageHeader`, `GroupCheckinView`, `MemberCard`, `GroupFeedView`, `AdminScheduleCard`, `AdminBottomSheet`, `AdminGroupDrillDown`, `AdminView`, `DataSourceStep`

---

### 코드 리뷰 2차 — Critical 수정 ✅

| 항목 | 수정 내용 |
|---|---|
| C-1: `AdminScheduleCard` totalGroups scope 미적용 | `groups.length` → scope-filtered members에서 고유 group_id 추출. `groups` prop 완전 제거 (AdminScheduleCard → AdminScheduleList → AdminView 3파일 연쇄) |
| C-2: `fetchScheduleCheckIns` 역할 검증 누락 + `select("*")` | `["leader", "admin"]` 역할 검증 추가 + `select("user_id, is_absent, checked_at")` 컬럼 제한 |

---

## 세션별 파일 수정 요약

| 파일 | 세션 | 항목 |
|---|---|---|
| `src/lib/types.ts` | 1 | B-1, T-1 |
| `src/app/(main)/group/page.tsx` | 1 | B-2 |
| `src/actions/schedule.ts` | 1 | B-5 |
| `src/lib/constants.ts` | 1+2 | NEW-3, D-2 |
| `src/components/admin/AdminView.tsx` | 1+2 | T-2, B-3, B-4, J-1, J-2, D-3, D-4 |
| `src/components/admin/AdminScheduleList.tsx` | 1 | T-2 |
| `src/components/admin/AdminBottomSheet.tsx` | 1+2 | T-2, D-2, D-3 |
| `src/components/admin/AdminScheduleCard.tsx` | 1+2 | T-3, D-3 |
| `src/components/group/GroupView.tsx` | 1+2 | T-1, D-3, D-4 |
| `src/components/group/GroupFeedView.tsx` | 1+2 | T-1, J-2/NEW-1, D-2, D-3 |
| `src/lib/utils.ts` | 2 | D-2, D-3 |
| `src/hooks/useRealtime.ts` | 2 | D-1 |
| `src/hooks/useToast.ts` (신규) | 2 | D-4 |
| `src/components/group/GroupCheckinView.tsx` | 2 | D-1 |
| `src/components/admin/AdminGroupDrillDown.tsx` | 2 | D-1 |

---

## 검증 체크리스트

각 세션 수정 후 실행:

```bash
npx tsc --noEmit   # TypeScript 오류 없음
npx next lint      # ESLint 오류 없음
```

기능 검증:
- [ ] 조장 체크인 E2E: 탭탭탭 → 전원 완료 → 보고 → '보고 완료!' 토스트 5초
- [ ] 관리자 E2E: 일정 활성화 → 전체 현황 → 드릴다운 → 체크인 대행 → 보고완료 배지
- [ ] 관리자 내 조 Sheet에서 보고 → Sheet 열린 상태에서 배지 즉시 반영 (B-3)
- [ ] 오프라인: 네트워크 끊기 → 체크인 → 재연결 → 자동 sync 완료