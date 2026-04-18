# 코드 리뷰 — 조장 뷰 "현황 보기" 대시보드 제거

**일자:** 2026-04-19
**범위:** 조장 뷰 Dual-action card 패턴 제거 리팩토링
**변경:** 수정 4 + 삭제 1

## 요약

| 항목 | 결과 |
|---|---|
| 품질 점수 | **88 / 100** |
| Critical | 0 |
| Major | 0 |
| Minor | 4 (모두 범위 외 또는 선택) |
| 빌드 | ✅ 통과 (tsc + next build exit 0) |
| 배포 가능 | ✅ |

## 변경 파일

1. `src/components/group/ScheduleCard.tsx` — `[현황 보기 >]` 버튼 및 `onStatusOpen` prop 제거
2. `src/components/group/GroupFeedView.tsx` — 바텀시트 Dialog, `statusOpen` state, 미사용 props 제거
3. `src/components/group/GroupView.tsx` — `allCheckInsState`/`allReportsState` state 및 관련 핸들러 로직 제거
4. `src/app/(main)/group/page.tsx` — `allCheckIns` 쿼리 제거, `allReports` → `.eq('group_id').maybeSingle()` 축소
5. `src/components/group/GroupStatusGrid.tsx` — **파일 삭제** (dead code)

## Minor 이슈

### M1. `shuttleReports` 쿼리도 `.maybeSingle()`로 대칭 축소 가능 (선택)

- **위치:** `src/app/(main)/group/page.tsx:137, 198–205`
- **현상:** `group_reports`와 동일 패턴인데 배열로 받아 `.some()`만 호출. 쿼리를 `.eq("shuttle_bus", myShuttleBus).maybeSingle()`로 바꾸면 `shuttleReports` 지역 변수와 `ShuttleReport` import 제거 가능.
- **우선순위:** 낮음. 기능 변경 아닌 일관성 개선.

### M2. `fetchLatestBriefing`의 `briefingState` deps — 불필요한 함수 재생성 (범위 외)

- **위치:** `src/components/group/GroupView.tsx:151, 214`
- **현상:** deps에 `briefingState` 포함 → `setBriefingState` 호출마다 콜백 재생성. 본문에서는 null 가드용으로만 사용.
- **이번 리팩토링 범위 밖이므로 수정 비권장.** 추후 정리.

### M3. `reportInvalidatedRef`가 Write-only Ref가 됨

- **위치:** `src/components/group/GroupView.tsx:109, 285–291, 375–380, 388–391`
- **현상:** 3곳에서 `= true/false` 쓰기만 수행, **읽는 곳 없음**. 원래 `allReportsState` self-echo 차단용이었으나 state 제거로 역할 소실.
- **권고:** 당장 제거하기보다는 다음 리팩토링에서 같이 정리. 지금 제거하면 W-3 자해 위험이 있던 영역이라 "왜 빠졌는지" 재검증 부담. 주석으로 현재 상태 기록만 추가하는 것도 옵션.

### M4. `onCheckinUpdated`는 현재 일정만 반영 (기존 동작 유지)

- **위치:** `src/components/group/GroupView.tsx:292–317`
- **회귀 아님.** 리팩토링 전후 동일 동작. 검토자 확인 목적으로만 기록.

## 안전성 검증 (Info)

### I1. `onGroupReported` 제거 영향

- 전역 검색 결과, 현재 사용처는 **AdminView뿐**. GroupView에서 제거된 것은 전부 dashboard 업데이트용이었음.
- Multi-tab 시나리오: 자기 조 보고는 `reported` state + `onReportInvalidated` 경로로 동기화. 영향 없음.
- **결론:** 안전.

### I2. `group_reports` 쿼리 최적화 효율

- `UNIQUE (group_id, schedule_id)` 제약이 B-tree 인덱스를 자동 생성.
- `.eq("schedule_id").eq("group_id").maybeSingle()` → 인덱스 조회 1회. ✅

### I3. `GroupStatusGrid.tsx` 완전 제거

- 파일 부재 + import/참조 전무 확인. ✅

### I4. `reported` single source of truth 유지

- `GroupView`에서만 소유, `GroupCheckinView`로 controlled prop 패턴 전달.
- TSG-005 교훈(`useState(props.X)` 금지) 일치. "안전 > 편의" 원칙 충족. ✅

## 권고 액션

| 우선순위 | 항목 | 결정 필요 |
|---|---|---|
| 선택 | M1 — `shuttleReports` 쿼리 대칭 축소 | 일관성 vs 범위 확장 |
| 보류 | M3 — `reportInvalidatedRef` 제거 또는 주석 | 안전 관련 영역이라 보수적 접근 권장 |

## 결론

PRD 요구사항("조장 뷰 단순화, 역할 분리 명확화")이 정확히 반영되었고, 안전 관련 상태가 손상 없이 유지됨. **배포 승인.**
