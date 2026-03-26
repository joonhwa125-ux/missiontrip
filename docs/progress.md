# 개발 진행 상황

> 세션 간 컨텍스트 유실로 인한 중복 작업 방지를 위해 관리한다.
> 각 단계 완료 시 즉시 업데이트한다.

---

## 현재 활성 작업

### 검증 필요 (Phase 1 마무리)

| 항목 | 상태 | 비고 |
|---|---|---|
| E2E 흐름 검증 (체크인→보고→관리자 현황) | ⬜ 미시작 | 로그인 후 실제 체크인/보고 흐름 테스트 필요 |
| /setup 페이지 동작 검증 | ⬜ 미시작 | Google Sheets import 테스트 |
| Realtime 실시간 동기화 검증 | ⬜ 미시작 | 2개 브라우저로 broadcast 테스트 |
| Vercel 배포 후 프로덕션 검증 | ⬜ 미시작 | 최신 코드 배포 + 동작 확인 |

### PRD→코드 정합성 수정

| 항목 | 상태 | 비고 |
|---|---|---|
| `sheets-parser.ts` 5컬럼→4컬럼 | ✅ 완료 | 이메일 컬럼 제거 (사용자 직접 수정) |
| `constants.ts` EXPECTED_GROUP_COUNT | ✅ 완료 | 미사용 상수 삭제 |
| DB `checked_by` CHECK에서 'self' 제거 | ⬜ 미시작 | Supabase SQL 실행 필요 (코드 레벨 아님) |
| DB RLS `checkins_insert` 셀프 허용 제거 | ⬜ 미시작 | Supabase SQL 실행 필요 (코드 레벨 아님) |
| 토스트 시간 3.5초→5초 | ✅ 완료 | `useToast` 기본값 이미 5000ms |
| `types.ts` CheckedBy 타입에서 'self' 제거 | ✅ 완료 | 이미 `"leader" \| "admin"` 만 있음 |

### 리팩토링 — Tier 2/3/4 (`docs/refactoring-plan.md`)

| 항목 | 상태 | 비고 |
|---|---|---|
| T2-1 ROLE_PERMISSIONS 테이블 | ✅ 완료 | `constants.ts` 역할 함수 일원화 |
| T2-2 revalidatePaths 헬퍼 (4개 파일) | ✅ 완료 | `checkin/schedule/report/setup.ts` |
| T2-3 `importToDatabase` 헬퍼 분리 | ✅ 완료 | 97줄 → 3개 헬퍼(upsertGroups/Users/Schedules) + 오케스트레이터 |
| T2-4 `sheets-parser.ts` 검증/매핑 분리 | ✅ 완료 | validateUserRow/validateScheduleRow 추출 |
| T2-5 offline.ts getFromStorage 헬퍼 | ✅ 완료 | 3개 함수 리팩토링 |
| T2-6 TIME_PATTERNS 상수화 | ✅ 완료 | `utils.ts` + `setup.ts` 인라인 제거 |
| T2-minor resetAllData 주석 | ✅ 완료 | `.neq` 패턴 주석 추가 |
| T3-5 ROLE_LABEL/SCOPE_LABEL 통합 | ✅ 완료 | `CurrentDataView` + `PreviewStep` |
| T3-3/T3-4/T3-6 useMemo/useCallback | ✅ 완료 | CurrentDataView, ScheduleEditDialog, UserEditDialog, PreviewStep |
| SIZE-001 AdminScheduleList 훅 추출 | ✅ 완료 | 238줄→180줄. useAdminScheduleEffects.ts 추출 |
| FIX-001 로그인 에러 처리 | ✅ 완료 | try-catch + redirect 패턴 |
| A11Y-001 DataSourceStep htmlFor | ✅ 완료 | 3개 input label-id 연결 |
| Tier 1 (T1-1~4, R1, R2, R3) | ✅ 이미 구현됨 | 코드 확인 결과 모두 이전 세션에서 구현 완료 |
| T3-7 `as` 타입 단언 제거 | ⬜ 스킵 | database.types.ts 미존재 (조건부 항목) |

### 코드 리뷰 4차 수정 (24건 분석 → 3건 수정)

> 에이전트 분석 91/100 → 4차 /bkit:code-review → 교차검증 후 88/100 확정

| 항목 | 상태 | 비고 |
|---|---|---|
| M-3 GroupView scope 누락 | ✅ 완료 | broadcast에 scope 추가. useRealtime.ts 타입 + AdminScheduleList.tsx 페이로드 + GroupView.tsx 핸들러 |
| m-15 AdminMember.role string→UserRole | ✅ 완료 | types.ts 48번 줄 |
| m-17 AdminBottomSheet button>a 중첩 | ✅ 완료 | div[role=button] + onKeyDown으로 대체 |
| 오버킬 8건 (C-1,C-2,M-4,M-7,M-9,M-10,m-11,m-13) | ✅ 확인 | 의도된 설계 / 기존 결정 재확인 |

### 보류 항목 (운영 후 개선)

| 항목 | 출처 | 비고 |
|---|---|---|
| CR-003 전체 현황 바텀시트 | 1차 리뷰 | PRD 4.2.1 기준 변경 가능 |
| CR-015 일정 추가 form 태그 | 1차 리뷰 | Enter 제출 |
| CR-020~028 Minor 9건 | 1차 리뷰 | |
| NEW-002 text-[0.625rem] 가독성 | 2차 리뷰 | |
| NEW-005~010 Minor 6건 | 2차 리뷰 | |

### 셋업 개선

| 항목 | 상태 | 비고 |
|---|---|---|
| 마지막 동기화 시각 + 다시 불러오기 원클릭 | ✅ 완료 | `518382a` — localStorage 기반, 4파일 수정 |

### Phase 2: 추가 기능

| 항목 | 상태 | 비고 |
|---|---|---|
| CSV 다운로드 | ⬜ 미시작 | 체크인 기록 내보내기 |

---

## 완료 아카이브

> 아래 항목은 모두 2026-03-22에 완료되었다. 상세 내용은 해당 문서 참조.

### Phase 0 (인프라/셋업 + DB 스키마) — 전체 완료
Next.js 14 초기화, Supabase 프로젝트, 환경변수, Vercel 배포, Google OAuth,
DB 5개 테이블 + RLS + RPC 2개 + 테스트 데이터

### Phase 1 (핵심 기능 코드) — 전체 완료
로그인, Auth callback, Middleware, 조장 화면, 관리자 화면,
Server Actions, Realtime hooks, 오프라인 대응, 로그인 테스트

### 운영 안정성 수정 (FIX-001~006) — 전체 완료
> 상세: `docs/stability-fixes.md`

### 코드 리뷰 1차 (CR-001~019) — 수정 완료 (보류 3건 제외)
> 상세: `docs/code-review.md`

### 코드 리뷰 2차 (NEW-001~010) — 수정 완료 (보류 3건 제외)
> 2차 리뷰 결과: Score 78/100, Critical 0건. 운영 배포 가능 상태.

### PRD 정합성 수정 (PRD-001~010) — CLAUDE.md 전체 수정 완료

---

## 업데이트 규칙

- 각 항목 완료 시 상태를 `✅ 완료`로 변경하고 완료일 기입
- 새로운 작업 발견 시 해당 섹션에 행 추가
- 세션 시작 시 이 문서를 먼저 확인하여 중복 작업 방지
