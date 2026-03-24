# 리팩토링 플랜

> **작성일:** 2026-03-24 | **최종 업데이트:** 2026-03-24 (운영 리스크 분석 반영)
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

---

## 분석 요약

| 항목 | 현황 |
|---|---|
| any 타입 | **0건** ✓ |
| console.log | **0건** ✓ |
| 50줄 초과 함수 | 2개 (importToDatabase 97줄, parseUsersSheet 108줄) |
| 잠재적 버그 | channelRegistry 동시성, broadcast 무한 대기, offline 부분 실패 |
| 운영 리스크 | Realtime 재연결 미감지, 보고 재시도 없음, broadcast 침묵 실패 |

---

## 검토 이력

| 항목 | 1차 | 전문가 검토 | 운영 리스크 반영 | 최종 |
|---|---|---|---|---|
| T3-1 AdminView useEffect | Tier 3 | 삭제 | 삭제 유지 | **삭제** |
| T1-1 channelRegistry | Tier 1 | 보류 | 복원 (StrictMode·재마운트 경로) | **실행 Tier 1** |
| T1-2 broadcast 타임아웃 | Tier 1 | Tier 2 하향 | 복원 (무한 대기 = 보고 실패) | **실행 Tier 1** |
| T2-1 ROLE_PERMISSIONS | Tier 2 | 삭제 | 복원 (핫픽스 시 누락 방지) | **실행 Tier 2** |
| T2-4 sheets-parser 분리 | 조건부 | 보류 | 복원 (파싱 오류 = 참가자 누락) | **실행 Tier 2** |
| T3-2 calculateGroupStats | 조건부 | 조건부 | 복원 (집계 불일치 = 현장 혼란) | **실행 Tier 3** |
| T3-3/T3-4/T3-6 | Tier 3 | 삭제 | 낮은 우선순위로 유지 | **Tier 4** |
| R1 Realtime 재연결 | — | — | 신규 추가 | **실행 Tier 1** |
| R2 보고 재시도 | — | — | 신규 추가 | **실행 Tier 1** |
| R3 broadcast 에러 처리 | — | — | 신규 추가 | **실행 Tier 2** |

---

## Tier 1 — 안전 필수 (6개)

> 체크인·보고 흐름에 직접 영향. 모든 Tier보다 먼저 적용.

---

### T1-4: `lib/supabase/server.ts` — env var 런타임 검증

> ⚠️ **사후 수정:** 초안에서 `client.ts`와 `server.ts` 양쪽에 동적 접근 `requireEnv()` 적용을 제안했으나
> 이는 **위험도 평가 오류**였다. 실제 적용 후 두 차례 Critical 에러 발생 (TSG-003, TSG-004).
>
> **원인:** `NEXT_PUBLIC_*` 환경변수는 Next.js가 리터럴 접근만 빌드 시 정적 치환한다.
> 동적 접근 `process.env[key]`는 클라이언트 번들에서 `undefined`를 반환한다.
> `server.ts`도 클라이언트 번들에 포함될 경로가 존재하므로 동일 위험에 노출된다.
>
> **실제 위험도: 높음** — 환경변수 접근 방식은 Next.js 프레임워크 레벨 동작 영역이다.

**올바른 구현 (적용 완료):**
- `NEXT_PUBLIC_*` 변수: 리터럴 접근 유지 (`process.env.NEXT_PUBLIC_SUPABASE_URL!`)
- 서버 전용 변수만: `requireServerEnv()` 동적 접근 허용 (`SUPABASE_SERVICE_ROLE_KEY`)

**교훈:** 기존 코드(`middleware.ts`)가 이미 리터럴 접근을 쓰고 있었다. 이유를 먼저 파악했어야 했다.

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
// useRealtime.ts 수정
interface RealtimeCallbacks {
  // 기존 callbacks...
  onReconnected?: () => void;   // 재연결 감지 시 호출
}

// 각 채널 subscribe 시
const hasConnectedRef = useRef(false);

globalChannel.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    if (hasConnectedRef.current) {
      // 이전에 연결됐다가 재연결됨 → 놓친 이벤트 보완
      callbacksRef.current.onReconnected?.();
    }
    hasConnectedRef.current = true;
  }
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    hasConnectedRef.current = false; // 다음 SUBSCRIBED = 재연결
  }
});
```

`GroupView`·`AdminView`에서:
```typescript
useRealtime(groupId, isAdmin, {
  // 기존 callbacks...
  onReconnected: () => {
    router.refresh();   // 서버 데이터로 갱신
    showToast("연결이 복구되었어요. 화면을 갱신합니다.");
  },
});
```

**위험도:** 낮음. 기존 콜백 구조 확장.
> ⚠️ **주의:** `hasConnectedRef`를 채널별로 관리해야 global/group/admin 중 하나만 재연결 시 중복 refresh 방지

---

### R2 (신규): `hooks/useOfflineSync.ts` — 온라인 중 보고 주기적 재시도

**위험 경로:**
- 오프라인에서 보고 → localStorage 저장 → 온라인 복귀 → sync 시도 → 서버 오류로 실패
- T1-3 수정 후 실패 항목은 localStorage에 남음 ✓
- **그러나:** 재시도는 `online` 이벤트에만 의존. 이미 온라인이면 다음 offline→online 전환 없이는 재시도 없음
- **결과:** 관리자 화면에 보고 완료가 뜨지 않음 → 조장·관리자 간 수동 확인 필요

**수정:** `useOfflineSync`에 주기적 재시도 추가:
```typescript
// 온라인이고 pending 항목이 있으면 30초마다 재시도
useEffect(() => {
  if (!isOnline || pendingCount === 0) return;
  const timer = setInterval(() => syncPending(), 30_000);
  return () => clearInterval(timer);
}, [isOnline, pendingCount, syncPending]);
```

**위험도:** 낮음. syncPending은 이미 멱등성 보장 (T1-3 후).

---

## Tier 2 — 방어 강화 (8개)

> DRY + 함수 책임 분리 + 긴급 핫픽스 대응성. Tier 1 완료 후 적용.

### T2-7: `middleware.ts` — isAdminRole() 활용

```typescript
// 변경 전: role !== "admin" && role !== "admin_leader"
// 변경 후:
if (pathname.startsWith("/setup") && !isAdminRole(role)) {
```
**위험도:** 최소.

---

### T2-1: `lib/constants.ts` — ROLE_PERMISSIONS 테이블로 일원화

**위험 경로:** 긴급 핫픽스 시 `isAdminRole`, `isLeaderRole`, `canCheckin` 중 1곳 수정 누락 → 체크인 불가.

**수정:** 함수 시그니처 유지 (호출부 수정 불필요):
```typescript
const ROLE_PERMISSIONS = {
  member:       { isAdmin: false, isLeader: false, canCheckin: false },
  leader:       { isAdmin: false, isLeader: true,  canCheckin: true  },
  admin:        { isAdmin: true,  isLeader: false, canCheckin: true  },
  admin_leader: { isAdmin: true,  isLeader: true,  canCheckin: true  },
} as const satisfies Record<string, { isAdmin: boolean; isLeader: boolean; canCheckin: boolean }>;

export function isAdminRole(role: string): boolean {
  return ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]?.isAdmin ?? false;
}
// isLeaderRole, canCheckin 동일 패턴
```
**위험도:** 낮음.

---

### R3 (신규): `hooks/useBroadcastCheckin.ts` — broadcast 에러 처리

**위험 경로:** `Promise.all([broadcast(), ...])` — try/catch 없음. broadcast 실패 시 오류 전파. DB에는 체크인 저장됐으나 다른 조장 화면 갱신 안 됨.

**수정:** try/catch + router.refresh() 폴백:
```typescript
// useBroadcastCheckin.ts
import { useRouter } from "next/navigation";

export function useBroadcastCheckin(groupId: string, scheduleId: string | undefined) {
  const { broadcast } = useBroadcast();
  const router = useRouter();

  return useCallback(
    async (userId: string, action: "insert" | "delete", isAbsent = false) => {
      const payload = { user_id: userId, schedule_id: scheduleId ?? "", action, is_absent: isAbsent };
      try {
        await Promise.all([
          broadcast(CHANNEL_GLOBAL, EVENT_CHECKIN_UPDATED, payload),
          broadcast(`${CHANNEL_GROUP_PREFIX}${groupId}`, EVENT_CHECKIN_UPDATED, payload),
          broadcast(CHANNEL_ADMIN, EVENT_CHECKIN_UPDATED, payload),
        ]);
      } catch {
        // DB에는 이미 저장됨. 화면을 서버 데이터로 강제 갱신 (broadcast 실패 보완)
        router.refresh();
      }
    },
    [groupId, scheduleId, broadcast, router]
  );
}
```
**위험도:** 낮음.

---

### T2-2: Server Actions — revalidatePaths 로컬 헬퍼

**문제:** 4개 파일, 14곳 반복 (`setup.ts` 6곳: 189, 237, 266, 296, 341, 395번 줄).

```typescript
function revalidateMainPaths() { revalidatePath("/admin"); revalidatePath("/group"); }
function revalidateAllPaths() { revalidatePath("/admin"); revalidatePath("/group"); revalidatePath("/setup"); }
```
**위험도:** 최소.

---

### T2-3: `actions/setup.ts` — importToDatabase 헬퍼 분리 (97줄)

```typescript
async function upsertGroups(supabase, groups): Promise<{ groupMap: Map<string, string>; error?: string }>
async function upsertUsers(supabase, users, groupMap): Promise<{ error?: string }>
async function upsertSchedules(supabase, schedules): Promise<{ error?: string }>
// importToDatabase → 오케스트레이터 (~25줄)
```
**위험도:** 중간.
> ⚠️ **검증 필수:** Google Sheets → 미리보기 → DB 반영 전체 플로우

---

### T2-4: `utils/sheets-parser.ts` — 검증/매핑 분리 (108줄)

**위험 경로:** 파싱 버그 발견 어려움 → 참가자 누락.

```typescript
function validateUserRow(row, rowIndex, emailSet): { errors; email?; role?; party? }
function validateScheduleRow(row, rowIndex): { errors; dayNumber?; scope? }
```
**위험도:** 중간.
> ⚠️ **검증 필수:** 잘못된 CSV 오류 메시지 동일 확인

---

### T2-5: `utils/offline.ts` — getFromStorage 헬퍼

```typescript
function getFromStorage<T>(key: string): T[]   // getPendingCheckins, getPendingReports
function getObjectFromStorage<T>(key: string): T | null  // getCachedActiveSchedule
```
**위험도:** 낮음.

---

### T2-6: `lib/utils.ts` — TIME_PATTERNS 상수화 (DRY)

**근거:** DRY — `setup.ts:168` 인라인 정규식과 중복. (성능 이유 아님 — JS 엔진이 정규식 리터럴을 한 번만 컴파일)

```typescript
const TIME_PATTERNS = {
  fullDate: /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/,
  monthDay: /^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/,
  hourMin:  /^(\d{2}):(\d{2})$/,
} as const;
```
**위험도:** 최소.

---

## Tier 3 — 정합성 (2개)

> 관리자·조장 화면 간 데이터 일관성.

### T3-2: calculateGroupStats 유틸

**위험 경로:** 관리자·조장 집계 로직 불일치 → 관리자 "전원 완료" + 조장 "1명 남음" → 현장 혼란.

**수정:** `src/lib/utils.ts`에 단일 유틸, 두 컴포넌트(`GroupFeedView`, `AdminScheduleCard`)가 동일 함수 사용.

```typescript
export function calculateGroupStats(
  members: GroupMemberBrief[],
  checkIns: { user_id: string; is_absent: boolean }[],
  reports: { group_id: string }[],
  scope: ScheduleScope
): {
  groupMemberCounts: Map<string, number>;
  groupCheckedCounts: Map<string, number>;
  reportedGroupIds: Set<string>;
  scopeGroupIds: Set<string>;
}
```
**위험도:** 중간.
> ⚠️ **검증 필수:** 동일 데이터 기준 관리자·조장 통계 수치 일치

---

### T3-5: `constants.ts` — ROLE_LABEL, SCOPE_LABEL 통합

`CurrentDataView.tsx`·`PreviewStep.tsx` 로컬 정의 → `constants.ts` import로 통합. T2-1과 독립.

```typescript
export const ROLE_LABEL: Record<UserRole, string> = { member: "조원", leader: "조장", admin: "관리자", admin_leader: "관리자(조장)" };
export function getPartyLabel(party: GroupParty | null): string { ... }
// SCOPE_LABEL에 all: "전체" 추가
```
**위험도:** 낮음.

---

## Tier 4 — 선택적 최적화 (4개)

> 안전 무관, Setup 페이지 렌더링 최적화. 전체 진행 시 함께 처리.

| 항목 | 파일 | 내용 |
|---|---|---|
| T3-3 | `CurrentDataView.tsx` | `groupMap` useMemo + `run()` useCallback |
| T3-4 | `ScheduleEditDialog.tsx`, `UserEditDialog.tsx` | `set()` useCallback |
| T3-6 | `PreviewStep.tsx` | 3번 순회 → 1번 useMemo |
| T3-7 | pages | `as` 타입 단언 → `.returns<T[]>()` (DB 타입 정의 파일 존재 시) |

---

## 실행 순서

```
[안전 필수 — Tier 1]
T1-4 → T1-1/T1-2 (동일 파일) → T1-3 → R2 → R1

[방어 강화 — Tier 2]
T2-7 → T2-1 → R3 → T2-2 → T2-6 → T2-3 → T2-4 → T2-5

[정합성 — Tier 3]
T3-2 → T3-5

[선택 — Tier 4]
T3-3 → T3-4 → T3-6 → T3-7
```

---

## 검증 체크리스트

### Tier 1 배포 전
- [ ] TypeScript 컴파일 오류 없음
- [ ] 체크인 → broadcast → 조장·관리자 화면 즉시 반영
- [ ] WiFi→LTE 전환 후 체크인 데이터 자동 갱신 (R1 검증)
- [ ] 오프라인 → 온라인 복귀 시 pendingCount 올바르게 감소
- [ ] 서버 오류 후에도 30초 내 보고 재시도 확인 (R2 검증)
- [ ] `.env.local` 변수 제거 시 명확한 에러 메시지

### Tier 2 배포 전
- [ ] `isAdminRole('admin_leader')` = true, `canCheckin('member')` = false
- [ ] broadcast 실패 시 router.refresh() 작동 (R3 검증)
- [ ] Google Sheets → 미리보기 → DB 반영 전체 플로우
- [ ] 잘못된 CSV 입력 시 오류 메시지 변경 전과 동일

### Tier 3 배포 전
- [ ] 동일 데이터 기준 관리자·조장 통계 수치 일치
- [ ] Setup 참가자 목록 역할·선후발 표시 동일

---

## 범위 외 (확정 제외)

| 항목 | 이유 |
|---|---|
| **~~T3-1~~ AdminView useEffect 교체** | React 공식 권장 패턴이 이미 적용됨. useEffect 교체 시 stale 숫자 순간 표시 → 판단 오류 |
| `types.ts` 멤버 타입 통합 | API 인터페이스 변경 위험 |
| `auth.ts` 쿼리 통합 | 성능 영향 미미, 위험도 중간 |
| GroupCheckinView 440줄 분리 | 핵심 화면, 회귀 위험 > 이득 |
| localStorage 용량 대응 | 200명 × ~100B ≈ 20KB << 5MB. 실질 위험 없음 |
| Phase 2 (컨페티, CSV 다운로드) | 별도 플랜 필요 |
