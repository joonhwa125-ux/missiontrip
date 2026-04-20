# Code Review Report — 2026-04-20

## Scope
오늘 작업한 6개 커밋 누적 변경 종합 리뷰.

```
20603a5 feat(auto-activate): Phase A — 조장 분산 타이머 + pg_cron 폴백
d962d06 fix(auto-activate): 과거 일정 연쇄 처리 · 날짜 기본값 문제 해결
22d012b feat(group): Phase B — 조장 뷰 상태별 체크인 열람 (대기·완료 읽기 전용)
da72927 chore(copy): 완료 일정 배너 문구 단축 — 1줄 유지
5eea57d feat(group): Phase C Tier 1 — MemberCard 임시조장 배지 · 메모 영역
5fe062a fix(setup): 영구 조장 이동 시 원래 조 공백 경고 gate 확장 (A안)
```

## Summary
- **Files reviewed:** 17
- **Issues found:** 11 (Critical: 0, Major: 4, Minor: 7)
- **Score:** 85/100

### Confirmed Clean
- in-flight guard (`useAutoActivate`)
- `requireActiveSchedule` 모든 쓰기 경로 전파
- A안 replacement gate (`showReplacementSection`)
- RPC 서버 시각 원자 검증 (`auto_activate_due_schedule`)
- `idx_one_active_schedule` UNIQUE + RPC 트랜잭션 상호작용
- `any` 타입 · `console.log` · `line-through` 0건

---

## Critical Issues

없음. 핵심 경로(3개 타이머 + pg_cron 동시성)는 DB UNIQUE INDEX + RPC 원자 조건으로 이중 방어.

---

## Major Issues

### M-1. `selectedSchedule` stale — schedules prop 변경에 미동기화 (안전 이슈)
**파일:** [`src/components/group/GroupView.tsx:121, 245-253, 310-314, 485`](src/components/group/GroupView.tsx)

조장이 대기 일정 열람 중인데 관리자가 해당 일정의 시각을 변경/활성화하면:
- `schedules` state는 Realtime으로 갱신됨
- 하지만 `selectedSchedule`은 **탭 시점 스냅샷** 그대로
- 결과: 헤더 "HH:MM 시작 예정" stale, `isEditable=false` 유지 → **활성화된 일정인데 편집 불가 배너 계속 표시**

**안전 영향:** 조장이 잘못된 시간을 보고 집결 타이밍 오판할 수 있음 (CLAUDE.md 0절 "안전 > 편의").

**Suggestion:**
```tsx
const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
const selectedSchedule = useMemo(
  () => schedules.find(s => s.id === selectedScheduleId) ?? null,
  [schedules, selectedScheduleId]
);
```

---

### M-2. 오프라인 보고 큐 영구 재시도 위험
**파일:** [`src/hooks/useOfflineSync.ts:43`](src/hooks/useOfflineSync.ts)

```ts
res = await submitReport(report.group_id ?? "", report.schedule_id, report.pending_count);
```

- `group_id`가 null이면 빈 문자열 전달 → Server Action UUID 파싱 실패 → `failedReports` 영구 적체
- Phase B의 `syncOfflineCheckins`에는 활성 필터가 있지만 **보고 sync에는 누락**
- 종료된 일정에 대한 보고가 무한 재시도되며 "N건 저장 중" 배너 영구 표시

**Suggestion:**
1. `!report.group_id && !report.shuttle_bus` 케이스 early return
2. 보고 sync에도 `schedules.is_active` 필터 추가 (Phase B 정책 일관성)

---

### M-3. Target 선택 로직 3회 중복
**파일:**
- [`src/hooks/useAutoActivate.ts:46-55`](src/hooks/useAutoActivate.ts)
- [`src/hooks/useAdminScheduleEffects.ts:80-90`](src/hooks/useAdminScheduleEffects.ts)
- [`supabase/schema.sql:316-322, 480-487`](supabase/schema.sql)

"최신 past due 선택" 로직이 TypeScript 2곳 + SQL 1곳에 독립 구현. 주석으로 일치성을 강조하나 drift 위험 존재.

**Suggestion:** `lib/utils::pickLatestDueSchedule` 공용 함수 추출. SQL은 별개지만 JS 2곳은 단일 지점으로 수렴.

---

### M-4. `GroupCheckinView.tsx` 655줄 — 파일 200줄 권장 초과
**파일:** [`src/components/group/GroupCheckinView.tsx`](src/components/group/GroupCheckinView.tsx)

Phase B/C 누적으로 본체가 계속 커지는 중. 다음 Phase 진입 시 700줄 초과 예상.

**Suggestion:**
- `buildSections` → `lib/checkin-sections.ts`
- `ExcusedMemberCard` → `group/ExcusedMemberCard.tsx`
- 보고 로직 → `hooks/useReportSubmit.ts`
- 분리 후 본체 ~350줄

---

## Minor Issues

| # | 파일:라인 | 내용 |
|---|---|---|
| m-1 | `useAutoActivate.ts:9` + `useAdminScheduleEffects.ts:100` | `AUTO_ACTIVATE_INTERVAL_MS` 상수가 한쪽에만. `@/lib/constants`로 이동 권장 |
| m-2 | `GroupView.tsx:77-93` | 렌더 중 조건부 `setState` 3개 — concurrent mode 리스크 |
| m-3 | `checkin.ts:409-412` | `isTempLeaderFor` 순차 await, `in()` 단일 쿼리 개선 가능 |
| m-4 | `GroupCheckinView.tsx:440` | `toLocaleTimeString` 인라인 → `formatTime` 재사용 |
| m-5 | `useAutoActivate.ts:73` | `catch {}` 오류 완전 억제 — 영구 실패 디버깅 어려움 |
| m-6 | `ScheduleMemberInfoEditDialog.tsx:156-169` | O(n·m) 중첩 스캔, `usersById` Map 캐싱으로 개선 |
| m-7 | `schema.sql:491` | pg_cron 부분 권한 케이스 매우 드물어 실용적 영향 없음 (confirmed clean) |

---

## Security · Accessibility · Performance

### Security (전반 clean)
- RLS 우회 `createServiceClient` 사용처 모두 3단 가드 통과
- RPC 서버 시각 원자 검증으로 클라이언트 조작 차단
- `ABSENCE_TEXT_MAX_LENGTH=200` + trim으로 CSV injection 방어
- 민감 정보 반환값 노출 없음

### Accessibility (KWCAG 2.2 전반 clean)
- 터치 44×44px, focus-visible ring, aria-disabled (not disabled), aria-live 배너
- 색상만 상태 구분 없음 (아이콘+텍스트 병기)

### Performance
- m-3, m-6 N·중첩 스캔 외 주요 hotspot 없음
- `useMemo` 의존성 배열 건전

---

## Recommendations (우선순위)

1. **M-1 즉시 수정** — 조장이 잘못된 시간을 보고 오판하면 실제 안전 위협
2. **M-2 즉시 수정** — 오프라인 보고 무한 재시도 + Phase B 정책 일관성
3. **M-3 리팩토링** — `pickLatestDueSchedule` 추출 (drift 방지)
4. **M-4 분할** — 다음 Phase 진입 전 권장
5. **Minor**는 여유 시 배치 처리

## Confirmed Clean 영역 확장 메모
- `auto_activate_due_schedule` RPC 동시성 보장(UPDATE WHERE + UNIQUE INDEX + SECURITY DEFINER) 견고
- `replacement_leader_user_id` A안 gate 설계 의도 주석에 명확
- 시간대 처리(`timestamptz` + `Asia/Seoul` 변환) 일관

## 문서화 제안
`docs/decisions.md`에 "3개 타이머 + pg_cron 병렬 실행 안전성 증명" 한 단락 추가 권장.
