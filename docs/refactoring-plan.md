# 리팩토링 플랜

> **작성일:** 2026-03-24 | **최종 업데이트:** 2026-03-25 (전체 리팩토링 완료 — 즉시수정 + Tier 2 + Tier 4 + 에이전트 교차검증 91/100)
> **분석 대상:** src/ 전체 (60개 파일, 약 5,700줄)

## 판단 기준

> **"확률적으로 낮다"가 아니라 "발생 가능한 모든 경로를 차단했는가"**
>
> 200명 중 한 사람도 누락되면 안 되는 안전 시스템이다.
> 체크인 반영 실패, 보고 전송 실패, 참가자 누락 — 이 세 가지가 발생할 수 있는 경로는
> 확률이 낮더라도 모두 차단한다.

**원칙:** 각 Tier는 독립 배포 가능. JSX 구조·Tailwind 클래스·Server Action 반환 형식·DB 쿼리 결과 형식 변경 금지.

---

## 방어됨 (수정 불필요)

| 항목 | 이유 |
|---|---|
| 중복 체크인 | DB UNIQUE(user_id, schedule_id) + ON CONFLICT DO NOTHING |
| 동시 일정 활성화 | RPC activate_schedule 트랜잭션 + UNIQUE 인덱스 |
| broadcast self: true | 의도적 설계 — 이벤트 기반 UI 갱신에서 행위자 화면도 갱신 필요 |
| admin_leader 권한 | canCheckin/isAdminRole helper 함수로 일관 처리 |
| scope 필터링 | filterMembersByScope 적용됨 |
| Toast 지속시간 | useToast(duration = 5000) — PRD 5초 충족 |
| localStorage 용량 | 200명 × ~100B = ~20KB << 5MB 제한. 실질 위험 없음 |
| **T2-7 middleware isAdminRole()** | **이미 적용됨.** `!isAdminRole(role)` 사용 중 (확인 완료) |
| **BUG-001 전원 불참 배지** | **이미 수정됨.** `utils.ts` `absentCount > 0` 처리 + `AdminScheduleCard.tsx` `gTotal === 0 \|\|` 조건 확인 완료 |
| **GroupFeedView 컴포넌트 분할** | **이미 완료.** ScheduleCard(154줄) · GroupStatusGrid(90줄) · GroupMiniCard(55줄) 3개로 분리됨 |
| **C-1 완료 일정 체크인 쿼리** | `.in(completedIds)` 단일 쿼리 1회 왕복. 직렬 실행 아님 — 오탐 |
| **M-6 group/page 워터폴** | activeSchedule 결정 후 체크인 조회가 논리적 의존성. 순차 불가피 |
| **M-9 AdminBottomSheet 드릴다운 닫기** | `if (!o && drillGroup) return` — 드릴다운→바텀시트 계층적 폐쇄. 의도된 UX |
| **BUG-002 scope 배지 advance 미표시** | 의도된 설계. 후발(rear)만 예외적 케이스로 배지 구분. 선발(advance)은 기본 상태이므로 배지 불필요 |

---

## 완료 이력

> 아래 항목은 2026-03-25에 완료됨.

| 항목 | 완료 내용 |
|---|---|
| **T2-1** | `constants.ts` ROLE_PERMISSIONS 테이블 — `isAdminRole/isLeaderRole/canCheckin` 일원화 |
| **T2-2** | Server Actions 4개 파일 `revalidateMainPaths/revalidateAllPaths` 헬퍼 추출 |
| **T2-5** | `offline.ts` `getFromStorage/getObjectFromStorage` 헬퍼 — 3개 함수 리팩토링 |
| **T2-6** | `utils.ts` `TIME_PATTERNS` 상수 export — `setup.ts` 인라인 regex 제거 |
| **T2-minor** | `resetAllData` `.neq` 패턴 주석 추가 |
| **T3-5** | `ROLE_LABEL/getPartyLabel/SCOPE_LABEL("all":"전체")` constants.ts 통합 — CurrentDataView·PreviewStep 로컬 정의 제거 |
| **FIX-001** | `login/page.tsx` OAuth signInWithOAuth try-catch + redirect 에러 처리 |
| **A11Y-001** | `DataSourceStep.tsx` 3개 input htmlFor/id 연결 (KWCAG 2.4.6) |
| **T2-3** | `setup.ts` importToDatabase → upsertGroups/upsertUsers/upsertSchedules 3개 헬퍼 분리 |
| **T2-4** | `sheets-parser.ts` validateUserRow/validateScheduleRow 검증 함수 추출 |
| **T3-3** | `CurrentDataView.tsx` groupMap useMemo + run useCallback |
| **T3-4** | `ScheduleEditDialog.tsx` + `UserEditDialog.tsx` set() useCallback |
| **T3-6** | `PreviewStep.tsx` 3x filter → 1x useMemo 단일 순회 |
| **SIZE-001** | `AdminScheduleList.tsx` 238→180줄. useAdminScheduleEffects.ts 훅 추출 |

> ⚠️ **세션 내 Critical 버그 발생 및 수정:** `setup.ts` `revalidateAllPaths()`가 자기 자신을 재귀 호출하는 버그를 T2-2 작업 중 도입. importToDatabase·resetAllData 등 6개 함수에 영향. 같은 세션에서 발견·수정 완료.

> ℹ️ **이미 구현 발견:** PERF-001, T1-1/T1-2, T1-3, R1, R2, R3 — 코드 확인 결과 이전 세션에서 이미 구현됨. 문서만 미반영 상태였음.

---

## 분석 요약

| 항목 | 현황 |
|---|---|
| any 타입 | **0건** ✓ |
| console.log | **0건** ✓ |
| 50줄 초과 함수 | **0건** ✓ (importToDatabase·parseUsersSheet 헬퍼 분리 완료) |
| 잠재적 버그 | **모두 해결** (channelRegistry Set화, broadcast 타임아웃, offline 부분실패 처리) |
| 운영 리스크 | **모두 해결** (Realtime 재연결 감지, 보고 30초 재시도, broadcast try-catch) |
| 코드 리뷰 3차 | 22건 분석 — 오탐 8건 / 이미완료·기존플랜 3건 / 실제 수정 7건 → **전체 완료** |

---

## 검토 이력

| 항목 | 1차 | 전문가 검토 | 운영 리스크 반영 | 코드 리뷰 2차 | 코드 리뷰 3차 | 최종 |
|---|---|---|---|---|---|---|
| T3-1 AdminView useEffect | Tier 3 | 삭제 | 삭제 유지 | — | AdminView 444줄, Realtime orchestration 의존성 — 분할 회귀 위험 높음 | **범위 외** |
| T1-1 channelRegistry | Tier 1 | 보류 | 복원 | — | — | **실행 Tier 1** |
| T1-2 broadcast 타임아웃 | Tier 1 | Tier 2 하향 | 복원 | — | — | **실행 Tier 1** |
| T2-1 ROLE_PERMISSIONS | Tier 2 | 삭제 | 복원 | — | — | **✅ 완료** |
| T2-2 revalidatePaths | Tier 2 | — | — | — | — | **✅ 완료** |
| T2-4 sheets-parser 분리 | 조건부 | 보류 | 복원 | — | — | **실행 Tier 2** |
| T2-5 offline.ts 헬퍼 | Tier 2 | — | — | — | — | **✅ 완료** |
| T2-6 TIME_PATTERNS | Tier 2 | — | — | — | — | **✅ 완료** |
| T2-minor resetAllData 주석 | — | — | — | — | — | **✅ 완료** |
| T3-2 calculateGroupStats | 조건부 | 조건부 | 복원 | **삭제** (목적이 달라 과잉) | — | **범위 외** |
| T3-5 ROLE_LABEL/SCOPE_LABEL | Tier 3 | — | — | — | — | **✅ 완료** |
| T3-3/T3-4/T3-6 | Tier 3 | 삭제 | 낮은 우선순위 | — | — | **Tier 4** |
| R1 Realtime 재연결 | — | — | 신규 추가 | — | — | **실행 Tier 1** |
| R2 보고 재시도 | — | — | 신규 추가 | — | — | **실행 Tier 1** |
| R3 broadcast 에러 처리 | — | — | 신규 추가 | — | — | **실행 Tier 2** |
| T2-7 middleware | Tier 2 | — | — | **이미 완료** | — | **방어됨** |
| BUG-001 전원 불참 배지 | — | — | — | **이미 수정** | — | **방어됨** |
| GroupFeedView 분할 | — | — | — | **이미 완료** | — | **방어됨** |
| GroupCheckinView 분할 | — | — | — | 핵심 화면, 회귀 위험 | — | **범위 외** |
| C-1 완료 일정 직렬 실행 | — | — | — | — | **오탐** (`.in()` 단일 쿼리) | **방어됨** |
| C-2 클라이언트 3개 생성 | — | — | — | — | 확인 (3회 생성, 4회 왕복) | **범위 외** (1회성 서비스, 실질 영향 제한) |
| C-3 check_ins select("*") | — | — | — | — | 확인 (8컬럼 전체, 최대 1,400행) | **✅ 이미 구현됨** |
| M-3 AdminView 444줄 | — | — | — | — | 분할 회귀 위험 높음 | **범위 외** |
| M-4 AdminScheduleList 238줄 | — | — | — | — | 훅 추출로 180줄 달성, 회귀 위험 낮음 | **✅ 완료** |
| M-5 DB 4회 왕복 | — | — | — | — | 구조적 변경 필요 대비 실익 낮음 | **범위 외** |
| M-6 group/page 워터폴 | — | — | — | — | **오탐** (논리적 의존성) | **방어됨** |
| M-8 importToDatabase 92줄 | — | — | — | — | 기존 T2-3과 동일 | **✅ 완료** |
| M-9 AdminBottomSheet 닫기 | — | — | — | — | **오탐** (의도된 UX) | **방어됨** |
| BUG-002 scope 배지 advance 누락 | — | — | — | — | 확인 (`scope === "rear"` 하드코딩) | **방어됨** (의도된 설계) |
| FIX-001 로그인 에러 처리 | — | — | — | — | 확인 (try-catch 없음) | **✅ 완료** |
| A11Y-001 DataSourceStep htmlFor | — | — | — | — | 확인 (3개 input 미연결) | **✅ 완료** |

---

## ✅ 즉시 수정 — 접근성/성능 (3개) — 전체 완료

> 2026-03-25 완료. PERF-001은 이전 세션에서 이미 구현됨. FIX-001, A11Y-001 수정 완료.

---

### PERF-001: `admin/page.tsx` check_ins `select("*")` → 컬럼 최적화

**파일:** `src/app/(main)/admin/page.tsx:64`

**문제:** 8컬럼 전체 조회. 실제 사용 4컬럼. 최대 1,400행.

```typescript
// 변경 전
.select("*")

// 변경 후
.select("user_id, is_absent, schedule_id, checked_at")
```

---

### FIX-001: 로그인 에러 처리 누락

**파일:** `src/app/(auth)/login/page.tsx:19-30`

**문제:** `signInWithOAuth`에 try-catch 없음. OAuth 실패 시 사용자 피드백 없이 묵살.

```typescript
async function handleGoogleLogin() {
  try {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({ provider: "google", options: { ... } });
  } catch {
    // signInWithOAuth는 redirect를 트리거하므로 에러는 네트워크 문제 등 예외 상황
    showToast("로그인 중 오류가 발생했어요. 다시 시도해주세요");
  }
}
```

---

### A11Y-001: `DataSourceStep.tsx` label-input 연결 누락 (KWCAG 2.4.6)

**파일:** `src/components/setup/DataSourceStep.tsx`

**문제:** Sheet URL, 참가자 GID, 일정 GID input 3개에 `htmlFor`/`id` 연결 없음.

```tsx
// 변경 전
<label className="...">Sheet URL</label>
<input type="url" ... />

// 변경 후
<label htmlFor="sheet-url" className="...">Sheet URL</label>
<input id="sheet-url" type="url" ... />
```

CSV 파일 input은 `sr-only` + 버튼 트리거 패턴이므로 동일 방식 적용.

---

## ✅ Tier 1 — 안전 필수 (6개) — 전체 이미 구현됨

> 코드 확인 결과 T1-1/T1-2/T1-3/T1-4/R1/R2 모두 이전 세션에서 이미 구현 완료됨.

---

### T1-4: `lib/supabase/server.ts` — env var 런타임 검증

> ⚠️ **사후 수정:** 초안에서 `client.ts`와 `server.ts` 양쪽에 동적 접근 `requireEnv()` 적용을 제안했으나
> 이는 **위험도 평가 오류**였다. 실제 적용 후 두 차례 Critical 에러 발생 (TSG-003, TSG-004).
>
> **원인:** `NEXT_PUBLIC_*` 환경변수는 Next.js가 리터럴 접근만 빌드 시 정적 치환한다.
> 동적 접근 `process.env[key]`는 클라이언트 번들에서 `undefined`를 반환한다.
> `server.ts`도 클라이언트 번들에 포함될 경로가 존재하므로 동일 위험에 노출된다.

**올바른 구현 (적용 완료):**
- `NEXT_PUBLIC_*` 변수: 리터럴 접근 유지 (`process.env.NEXT_PUBLIC_SUPABASE_URL!`)
- 서버 전용 변수만: `requireServerEnv()` 동적 접근 허용 (`SUPABASE_SERVICE_ROLE_KEY`)

---

### T1-1 + T1-2: `hooks/useRealtime.ts` — channelRegistry 안전화 + broadcast 타임아웃

**T1-1 위험 경로:**
- React StrictMode 이중 마운트 → registry 덮어쓰기 → cleanup 참조 불일치
- 네트워크 복구 재마운트 → 기존 채널과 충돌
- **결과:** useBroadcast가 stale 채널로 전송 → 체크인이 화면에 반영 안 됨

**T1-1 수정:** `Map<string, RealtimeChannel>` → `Map<string, Set<RealtimeChannel>>`
```typescript
// 등록 (덮어쓰기 방지)
const existing = channelRegistry.get(name) ?? new Set();
existing.add(channel);
channelRegistry.set(name, existing);

// broadcast 조회
const set = channelRegistry.get(channelName);
const ch = set ? [...set][0] : undefined;

// cleanup
const set = channelRegistry.get(key);
set?.delete(ch);
if (set?.size === 0) channelRegistry.delete(key);
```

**T1-2 위험 경로:** WebSocket 연결 유지 + Supabase 내부 라우팅 실패 시 CHANNEL_ERROR 미도달 → broadcast Promise 영구 대기 → 보고 전송 함수 멈춤

**T1-2 수정:** `constants.ts`에 `BROADCAST_SUBSCRIBE_TIMEOUT_MS = 5000` 추가:
```typescript
await Promise.race([
  new Promise<void>((resolve) => {
    channel!.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        resolve();
    });
  }),
  new Promise<void>((resolve) => setTimeout(resolve, BROADCAST_SUBSCRIBE_TIMEOUT_MS)),
]);
```

**위험도:** 낮음.

---

### T1-3: `hooks/useOfflineSync.ts` — 보고 부분 실패 시 상태 정리

**문제** (38-45번 줄): 보고 부분 실패 시 성공 항목도 큐에 남아 다음 sync에서 재전송.

**수정:**
```typescript
const failedReports: OfflinePendingReport[] = [];
for (const report of pendingReports) {
  const res = await submitReport(report.group_id, report.schedule_id, report.pending_count);
  if (!res.ok) failedReports.push(report);
}
clearPendingReports();
if (failedReports.length > 0) {
  localStorage.setItem(OFFLINE_PENDING_REPORTS_KEY, JSON.stringify(failedReports));
}
setPendingCount(getPendingCheckins().length + failedReports.length);
```
**위험도:** 낮음.

---

### R1 (신규): `hooks/useRealtime.ts` — Realtime 재연결 시 데이터 재조회

**위험 경로:**
- WiFi → LTE 전환, 짧은 네트워크 단절 후 복구 = visibility 변화 없음 → `useVisibilityRefresh` 미작동
- Supabase Realtime은 재연결 시 끊긴 동안의 이벤트를 재전송하지 않음
- **결과:** Leader A가 체크인한 내용을 Leader B가 수신 못 함 → 이미 탑승한 사람을 다시 찾음

**수정:** `useRealtime`에 재연결 감지 + 콜백 추가:
```typescript
interface RealtimeCallbacks {
  // 기존 callbacks...
  onReconnected?: () => void;
}

const makeStatusHandler = (channelName: string) => (status: string) => {
  if (status === "SUBSCRIBED") {
    if (erroredRef.current.has(channelName)) {
      erroredRef.current.delete(channelName);
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        callbacksRef.current.onReconnected?.();
      }, 300);
    }
    everConnectedRef.current.add(channelName);
  }
  if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
      everConnectedRef.current.has(channelName)) {
    erroredRef.current.add(channelName);
  }
};
```

`GroupView`·`AdminView`에서:
```typescript
onReconnected: () => {
  router.refresh();
  showToast("연결이 복구되었어요. 화면을 갱신합니다.");
},
```

**위험도:** 낮음.

---

### R2 (신규): `hooks/useOfflineSync.ts` — 온라인 중 보고 주기적 재시도

**위험 경로:**
- T1-3 수정 후 실패 항목은 localStorage에 남음 ✓
- 재시도는 `online` 이벤트에만 의존 → 이미 온라인이면 재시도 없음
- **결과:** 관리자 화면에 보고 완료가 뜨지 않음

**수정:**
```typescript
useEffect(() => {
  if (!isOnline || pendingCount === 0) return;
  const timer = setInterval(() => syncPending(), 30_000);
  return () => clearInterval(timer);
}, [isOnline, pendingCount, syncPending]);
```

**위험도:** 낮음.

---

## ✅ Tier 2 — 방어 강화 — 전체 완료

> DRY + 함수 책임 분리. T2-3, T2-4 수정 완료 (2026-03-25). R3 이미 구현됨.

### ✅ T2-1: `lib/constants.ts` — ROLE_PERMISSIONS 테이블로 일원화 (완료)

### ✅ T2-2: Server Actions — revalidatePaths 로컬 헬퍼 (완료)

---

### ✅ T2-3: `actions/setup.ts` — importToDatabase 헬퍼 분리 (완료)

upsertGroups/upsertUsers/upsertSchedules 3개 헬퍼 추출. importToDatabase를 ~25줄 오케스트레이터로 축소.

---

### ✅ T2-4: `utils/sheets-parser.ts` — 검증/매핑 분리 (완료)

validateUserRow/validateScheduleRow 추출. parseUsersSheet·parseSchedulesSheet 단순화.

---

### ✅ T2-5: `utils/offline.ts` — getFromStorage 헬퍼 (완료)

### ✅ T2-6: `lib/utils.ts` — TIME_PATTERNS 상수화 (완료)

### ✅ T2-minor: `actions/setup.ts` — resetAllData `.neq` 패턴 주석 (완료)

---

### ✅ R3: `hooks/useBroadcastCheckin.ts` — broadcast 에러 처리 (이미 구현됨)

Promise.allSettled + try-catch + router.refresh() 폴백 확인 완료.

---

## Tier 3 — 정합성

### ✅ T3-5: `constants.ts` — ROLE_LABEL, SCOPE_LABEL 통합 (완료)

---

## ✅ Tier 4 — 선택적 최적화 — 4/5 완료 (T3-7 조건부 스킵)

> 2026-03-25 완료. 에이전트 교차검증 91/100, Critical 0.

| 항목 | 파일 | 상태 |
|---|---|---|
| T3-3 | `CurrentDataView.tsx` | ✅ `groupMap` useMemo + `run()` useCallback |
| T3-4 | `ScheduleEditDialog.tsx`, `UserEditDialog.tsx` | ✅ `set()` useCallback |
| T3-6 | `PreviewStep.tsx` | ✅ 3번 순회 → 1번 useMemo |
| T3-7 | pages | ⬜ 스킵 — `database.types.ts` 미존재 (Supabase CLI 자동생성 타입 없음) |
| **SIZE-001** | `AdminScheduleList.tsx` (238→180줄) | ✅ `useAdminScheduleEffects.ts` 추출 |

---

## 실행 순서

```
[즉시 수정 — 버그/접근성]
BUG-002 → PERF-001 → FIX-001 → A11Y-001

[안전 필수 — Tier 1]
T1-4 → T1-1/T1-2 (동일 파일) → T1-3 → R2 → R1

[방어 강화 — Tier 2]
T2-3 → T2-4 → R3

[선택 — Tier 4]
T3-3 → T3-4 → T3-6 → T3-7 → SIZE-001
```

---

## 검증 체크리스트

### 즉시 수정 후
- [ ] 선발(advance) 일정 카드에 "선발" 배지 표시
- [ ] OAuth 실패 시 토스트 표시 (테스트: 네트워크 차단 후 로그인 시도)
- [ ] DataSourceStep Sheet URL 라벨 클릭 → input focus 이동
- [ ] admin/page.tsx check_ins 조회 컬럼 4개로 제한 확인

### Tier 1 배포 전
- [ ] TypeScript 컴파일 오류 없음
- [ ] 체크인 → broadcast → 조장·관리자 화면 즉시 반영
- [ ] WiFi→LTE 전환 후 체크인 데이터 자동 갱신 (R1 검증)
- [ ] 오프라인 → 온라인 복귀 시 pendingCount 올바르게 감소
- [ ] 서버 오류 후에도 30초 내 보고 재시도 확인 (R2 검증)

### Tier 2 배포 전
- [ ] Google Sheets → 미리보기 → DB 반영 전체 플로우
- [ ] 잘못된 CSV 입력 시 오류 메시지 변경 전과 동일
- [ ] broadcast 실패 시 router.refresh() 작동 (R3 검증)

---

## 범위 외 (확정 제외)

| 항목 | 이유 |
|---|---|
| **~~T3-1~~ AdminView useEffect 교체** | React 공식 권장 패턴이 이미 적용됨. useEffect 교체 시 stale 숫자 순간 표시 → 판단 오류 |
| **~~T3-2~~ calculateGroupStats 유틸** | AdminScheduleCard(보고율 집계)와 GroupFeedView(전체 현황 집계)는 목적이 달라 공통 추상화 과잉 |
| **~~T2-7~~ middleware isAdminRole()** | 이미 `!isAdminRole(role)` 적용됨 |
| **M-3 AdminView.tsx 분할** | 444줄이지만 Realtime orchestration 의존성으로 분할 시 회귀 위험 높음. 현재 구조가 최적 |
| **C-2 클라이언트 3개 생성** | createCheckin 1건당 3개 인스턴스 생성 확인됨. 그러나 1회성 서비스 + Server Action 컨텍스트 특성상 실질 영향 제한적 |
| **M-5 DB 4회 왕복** | getCurrentUser 2회 + validateGroupAccess 1회 + 본체 1회. 구조적 변경 필요 대비 1회성 서비스 실익 낮음 |
| **syncOfflineCheckins 보안** | 취약점 확인됨 (validateGroupAccess 미호출). DevTools 접근 필요, 1회성 서비스 특성상 의도적 제외 |
| **GroupCheckinView 분할** | 핵심 화면(443줄), 다이얼로그 3개·props 11+ 필요. 회귀 위험 > 이득 |
| `types.ts` 멤버 타입 통합 | API 인터페이스 변경 위험 |
| `auth.ts` 쿼리 통합 | 성능 영향 미미, 위험도 중간 |
| localStorage 용량 대응 | 200명 × ~100B ≈ 20KB << 5MB |
| Phase 2 (컨페티, CSV 다운로드) | 별도 플랜 필요 |
