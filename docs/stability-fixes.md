# 운영 안정성 수정 기록

> 2박 3일 실전 운영 전 사전 안정성 점검에서 발견된 이슈 및 수정 사항
> 작성일: 2026-03-22

---

## 수정 완료 목록

### P0 (운영 중 장애 유발 가능)

#### [FIX-001] useRealtime 콜백 스테일 클로저 문제
- **파일:** `src/hooks/useRealtime.ts`
- **문제:** `callbacks` 객체가 `useEffect` 의존성 배열에 없어 채널 핸들러가 초기 렌더 시의 클로저를 참조. 컴포넌트 상태(checkIns, schedule 등) 업데이트 후에도 Realtime 이벤트가 구 상태로 처리됨
- **증상:** 다른 기기에서 체크인 시 조장 화면에 반영 안 될 수 있음
- **수정:** `callbacksRef` 패턴 도입 — deps 없는 `useEffect`로 매 렌더 후 ref 갱신, 채널 핸들러는 항상 `callbacksRef.current` 참조
- **추가:** `useBroadcast`에서 `removeChannel` 전 `await channel.unsubscribe()` 추가 (채널 정리 순서 보장)

#### [FIX-002] 체크인/취소/보고 에러 피드백 누락
- **파일:** `src/components/group/GroupCheckinView.tsx`
- **문제:** Server Action 실패 시 카드 롤백만 되고 조장에게 에러 메시지 미표시. 현장에서 조장이 왜 실패했는지 알 수 없음
- **증상:** 체크인 실패, 보고 실패 시 조용히 실패 → 조장이 확인했다고 착각
- **수정:** `toast` state + `showToast()` 헬퍼 추가. `createCheckin`, `deleteCheckin`, `submitReport` 실패 시 에러 토스트 3.5초 표시
- **추가:** 오프라인 저장 실패(localStorage 용량 초과)도 토스트로 안내

---

### P1 (성능/기능 저하)

#### [FIX-003] Middleware DB N+1 쿼리 최적화
- **파일:** `src/middleware.ts`
- **문제:** 모든 페이지 요청마다 `users` 테이블 role 조회. 조장 20명 동시 접속 시 → 각 클릭/네비게이션마다 DB 쿼리 폭발
- **수정:** DB 조회를 `pathname === "/"` 또는 `pathname.startsWith("/setup")` 경우에만 실행. 그 외 경로는 서버 컴포넌트에서 이미 role 검증하므로 미들웨어 중복 불필요
- **효과:** `/group`, `/admin`, `/checkin` 페이지 요청 시 Supabase DB 쿼리 1회 감소
- **부가 수정:** `.single()` → `.maybeSingle()` (미등록 사용자 조회 시 PGRST116 에러 방지)

#### [FIX-004] 즉흥 일정 추가 시 `.single()` 버그
- **파일:** `src/actions/schedule.ts`
- **문제:** 특정 day에 일정이 0건일 때 `.single()` 호출 → PGRST116 에러 반환 (결과가 정확히 1건이 아닐 때). 에러 객체를 무시하므로 `existing = null`이 되어 사실상 동작하지만, 잠재적 불안정성
- **수정:** `.single()` → `.maybeSingle()` (0건이면 null 반환, 1건이면 data 반환, 명시적으로 안전)

#### [FIX-005] localStorage 쓰기 실패 처리
- **파일:** `src/utils/offline.ts`, `src/hooks/useOfflineSync.ts`
- **문제:** `localStorage.setItem()` 실패(QuotaExceededError) 시 에러 처리 없음. 조장이 체크인했다고 생각하지만 실제로 저장 안 됨
- **수정:** `savePendingCheckin()` try-catch 추가, `boolean` 반환. `addPending()` 반환값 전파. `GroupCheckinView`에서 저장 실패 시 카드 롤백 + 토스트 안내

---

### P2 (모바일 환경 대응)

#### [FIX-006] iOS Safari 뷰포트 높이 및 safe-area 대응
- **파일:** `src/app/layout.tsx`, `src/app/globals.css`, `src/components/group/GroupCheckinView.tsx`, `src/components/admin/AdminView.tsx`
- **문제 1:** `min-h-screen` = `100vh` → iOS Safari에서 주소창 포함 시 실제 뷰포트보다 큼 → 레이아웃 깨짐
- **문제 2:** 하단 고정 버튼(보고 버튼)이 iPhone 홈 인디케이터 영역과 겹침
- **수정 1:** `layout.tsx`에 `viewportFit: "cover"` 추가 → `env(safe-area-inset-*)` 활성화
- **수정 2:** `globals.css`에 `@supports (min-height: 100dvh)` + `.pb-safe` 유틸리티 클래스 추가
- **수정 3:** `GroupCheckinView` 하단 고정 버튼에 `pb-safe` 적용
- **수정 4:** `AdminView` 토스트 `bottom` 값에 safe-area 반영

---

## 잔존 이슈 (향후 개선 권고)

### 관리자 화면 체크인 실시간 반영 없음
- **현황:** `AdminView.tsx`에서 `checkIns` 상태가 초기 로드 후 업데이트되지 않음. Realtime `onCheckinUpdated` 구독 없음
- **설계 의도:** 조장 보고가 핵심 흐름이므로 `group_reported` 이벤트로만 관리자 현황 업데이트 — PRD에 명시적으로 `admin` 채널에 checkin_updated 없음
- **위험도:** 낮음 (보고 전까지는 관리자가 실시간 체크인 수를 모르지만, 운영 모델상 OK)
- **권고:** 운영 중 불편하면 `admin` 채널에 `checkin_updated` 이벤트 추가 검토

### Supabase Realtime 재연결 로직 없음
- **현황:** 네트워크 일시 단절 후 복귀 시 Realtime 채널이 자동 재구독되는지 명시적 처리 없음
- **참고:** Supabase JS v2는 내부적으로 reconnect 시도를 하지만, 채널 상태를 모니터링하는 코드 없음
- **권고:** `channel.on('system', ...)` 으로 subscribe 상태 모니터링 + 실패 시 사용자 안내 고려

### 세션 만료 중간 처리 없음
- **현황:** 장시간 사용 중 Supabase 세션 만료(Access Token 1시간) 후 Server Action 호출 시 `actor = null` 반환 → 에러 메시지만 표시
- **권고:** Server Action에서 `actor = null` 응답 시 `/login`으로 자동 리다이렉트 처리 추가

---

## 수정 파일 요약

| 파일 | 수정 내용 |
|------|-----------|
| `src/hooks/useRealtime.ts` | callbacksRef 패턴, unsubscribe 추가 |
| `src/components/group/GroupCheckinView.tsx` | 에러 토스트, safe-area 하단 버튼 |
| `src/middleware.ts` | DB N+1 최적화 (조건부 role 조회) |
| `src/actions/schedule.ts` | .maybeSingle() |
| `src/utils/offline.ts` | try-catch, boolean 반환 |
| `src/hooks/useOfflineSync.ts` | addPending boolean 전파 |
| `src/app/layout.tsx` | viewportFit: "cover" |
| `src/app/globals.css` | 100dvh override, pb-safe 유틸리티 |
| `src/components/admin/AdminView.tsx` | 토스트 safe-area bottom |
