# 개발 진행 상황

> 세션 간 컨텍스트 유실로 인한 중복 작업 방지를 위해 관리한다.
> 각 단계 완료 시 즉시 업데이트한다.

---

## 🚧 v2 확장 프로젝트 (진행 중 — 2026-04-17)

> **컨셉 전환:** "체크인 도구" → "일정 브리핑 + 체크인 허브"
> **요구사항 10개:** 항공사 구분, 일정별 조 이동, 임시 조장, 사전 제외,
> 활동 배정, 층수 구분, 순환 일정, 같은 일정 2그룹, 개인별 메뉴, 불참 상세 사유
> **추가 요구사항:** 역할 전파(키 수령/가이드 등) + 관리자 메모 → 브리핑 카드에 통합

### 교차 검증 완료 설계

- **에이전트 4개 병렬 검증** (code-analyzer + security-architect + frontend-architect + tech-researcher) → 설계 반영
- 핵심 결정:
  - 임시 조장 권한: `schedule_member_info.temp_role='leader'` + RLS 3-way binding (schedule + is_active + temp_group)
  - 미들웨어 대신 `auth.ts` / page.tsx에서 권한 체크 (DB N+1 방지)
  - 명단 변동: 출발 전 사전 설정 원칙 + Undo 패턴(관리자) + 과거 데이터 immutability
  - UX: 카카오톡 스타일 공지 배너 + 바텀시트 (NNGroup 업계 표준 확인)
  - 체크인 화면은 activity 섹션 헤더만 추가 (개별 태그는 정보 과부하로 제외)

### Phase 진행 상태

| Phase | 작업 | 상태 | 비고 |
|:---:|------|:---:|------|
| A | DB 스키마 (schedule_member_info + schedule_group_info + check_ins 확장 + RLS 3-way binding) | ✅ | `supabase/migrations/20260417_v2_schedule_metadata.sql` 프로덕션 DB 적용 완료 (사용자 검증 7/7 row) |
| B | Types + sheets-parser 4시트 + setup.ts + DataSourceStep/PreviewStep 확장 | ✅ | `ParsedGroupInfo` / `ParsedMemberInfo` 신규, Google Sheets 4시트 → 선택사항 접이식 UI |
| C | getEffectiveRoster + auth.ts 확장 + checkin.ts 리팩터 + offline 확장 | ✅ | `src/lib/roster.ts` 신규 (server-only), validateGroupAccess effective group 기반, group_id_at_checkin 스냅샷 |
| Checkpoint 1 | 교차 검증 (security + code) + HIGH/MED/LOW 7건 수정 | ✅ | syncOfflineCheckins temp_leader 허용, transferred-in excused 포함, dedupe, 200자 cap, server-only 가드 |
| D | AbsenceReasonSheet (라디오그룹 4옵션 + 기타 입력) + MemberCard / AdminDrillDown 사유 표시 | ✅ | KWCAG 2.5.5/4.1.2 준수, 기존 Dialog 패턴 일관성 유지 |
| **E** | **BriefingBanner + BriefingSheet + useBriefingCache** | ⬜ **다음 재개점** | 카카오톡 스타일 1줄 배너 → 탭 → 바텀시트, sessionStorage 일일 dismiss, Radix Dialog 포커스 트랩 |
| F | GroupCheckinView 섹션 헤더 (activity/airline 그루핑) + excused 섹션 + getEffectiveRoster wire-up | ⬜ | `src/app/(main)/group/page.tsx` 에서 getEffectiveRoster 호출 → GroupView에 prop 전달 |
| G | 관리자 Undo 스낵바 + schedule_group_info / schedule_member_info 관리 UI | ⬜ | role="status" aria-live, 5초 되돌리기, Server Actions: `updateScheduleMemberInfo` / `updateScheduleGroupInfo` 신규 필요 |
| H | Realtime member_info_updated broadcast + 캐시 갱신 로직 | ⬜ | 기존 EVENT_MEMBER_UPDATED 상수 이미 존재 (useRealtime.ts), Supabase Dashboard Replication에 schedule_*_info 테이블 추가 필요 |
| I | 통합 테스트 + 엣지 케이스 (조 이동 후 체크인, 과거 일정 immutability) | ⬜ | E2E 시나리오 설계 필요 |
| Checkpoint 2 | 최종 리뷰 (code-analyzer + a11y-checker + review-prd) | ⬜ | |

### v2에서 변경된 파일 (Phase A-D 누적, 20개)

**DB/스키마:**
- `supabase/migrations/20260417_v2_schedule_metadata.sql` (신규)
- `supabase/schema.sql` (updated for fresh installs)

**타입 & 상수:**
- `src/lib/types.ts` — 9개 신규 타입 (ScheduleMemberInfo, ScheduleGroupInfo, EffectiveRoster, ParsedGroupInfo, ParsedMemberInfo, TempRole, AbsenceReasonCategory 등)

**서버 사이드:**
- `src/lib/auth.ts` — `hasActiveOrPastTempLeaderRole` 신규
- `src/lib/roster.ts` (신규, `import "server-only"`) — `getEffectiveRoster`
- `src/utils/sheets-parser.ts` — airline/trip_role + `parseGroupInfoSheet` / `parseMemberInfoSheet` + `mapTempRoleLabel`
- `src/actions/setup.ts` — 4시트 미리보기, `validateMetadataReferences`, `upsertScheduleGroupInfo`, `upsertScheduleMemberInfo`
- `src/actions/checkin.ts` — `canActorCheckin` / `getEffectiveGroupId` / `isTempLeaderFor` 신규, markAbsent가 absence_reason/location 파라미터 받음, syncOfflineCheckins가 temp_leader 오프라인 큐 지원

**페이지/컴포넌트:**
- `src/app/(main)/group/page.tsx` — users SELECT에 airline/trip_role 추가, check_ins SELECT에 absence 컬럼 추가, 접근 제어에 hasActiveOrPastTempLeaderRole 추가
- `src/app/(main)/admin/page.tsx` — check_ins SELECT 확장, CiRow 타입 확장, checkInsMap 매핑 확장
- `src/components/group/GroupCheckinView.tsx` — optimistic CheckIn에 group_id_at_checkin/absence_reason/absence_location, addPending에 group_id_at_checkin, handleAbsentConfirm(reason, location)
- `src/components/group/GroupView.tsx` — Realtime CheckIn 생성 사이트에 v2 필드
- `src/components/group/MemberCard.tsx` — 불참 카드에 사유 배지 추가
- `src/components/group/CheckinDialogs.tsx` — MarkAbsentDialog 전면 확장 (라디오그룹 4옵션 + 기타 입력 + 의료 위치 입력)
- `src/components/admin/AdminView.tsx` — optimistic CheckIn 및 adminCheckinMembers 매핑에 v2 필드
- `src/components/admin/AdminGroupDrillDown.tsx` — 사유 배지 표시
- `src/components/admin/AdminBusDrillDown.tsx` — 사유 배지 표시
- `src/components/setup/DataSourceStep.tsx` — 접이식 "배정 정보 (선택)" 섹션 추가 (URL + CSV)
- `src/components/setup/SetupWizard.tsx` — resync 흐름에 v2 GID 전달
- `src/components/setup/PreviewStep.tsx` — 참가자 테이블에 항공사/여행역할 컬럼, 조별/인원별배정 탭 2개 추가

### 다음 세션 재개 가이드

1. **필독 파일:**
   - `docs/progress.md` (이 섹션)
   - `CLAUDE.md` (요구사항 및 설계 원칙 갱신 여부 확인)
   - `src/lib/types.ts` (v2 타입 확인)
   - `supabase/migrations/20260417_v2_schedule_metadata.sql` (스키마 맥락)

2. **바로 시작 명령:**
   > "Phase E(BriefingBanner + BriefingSheet + useBriefingCache) 진행해줘. docs/progress.md의 v2 섹션 필독"

3. **Phase E 설계 포인트 (기억용):**
   - 배너 위치: `GroupFeedView` 최상단, DayTabs 아래
   - 노출 조건: trip_role OR schedule_member_info(note/excused) OR schedule_group_info(note)가 하나라도 있을 때
   - 1줄 요약 포맷: "역할 N건 · 특이사항 M건"
   - 바텀시트 내용: 역할 섹션 → 일차별 관리자 메모 → 일정별 상세(층수/순환/활동/메뉴/항공사/제외)
   - dismiss 저장: sessionStorage `mtrip_briefing_dismissed_{userId}` (일일 단위)
   - 캐시: `useBriefingCache` 훅으로 localStorage `mtrip_briefing_{groupId}` — 오프라인에서도 조회 가능
   - Radix Dialog 재활용으로 포커스 트랩 + role=dialog + aria-modal 자동 처리

4. **보류 사항 (Phase I/Checkpoint 2에서 재검토):**
   - M1 query consolidation (createCheckin 6-7 DB 쿼리) — 200명 규모에선 허용 가능
   - M2 guard 추출 (createCheckin/deleteCheckin/markAbsent 중복) — 보안 경계라 중복이 오히려 명확

### v2 신규 아키텍처 원칙

- **Additive only**: 기존 DB 컬럼/테이블 삭제 없음. 새 테이블은 opt-in (데이터 없으면 기존 동작 그대로)
- **Server-side only**: roster.ts는 `import "server-only"` 가드. 클라이언트에서 RLS 우회 위험 차단
- **Immutability**: `check_ins.group_id_at_checkin` 체크인 시점 스냅샷 → 조 이동 후에도 과거 기록이 당시 조 기준 유지
- **3-way binding RLS**: temp_leader 권한은 schedule_id + is_active + temp_group_id 3중 조건 모두 만족 시에만
- **Fail-safe page gate**: auth.ts는 과거/미래 상관없이 `temp_role=leader` 존재만 확인 (page 접근만 제어, 실제 쓰기는 Server Action이 per-schedule 재검증)

---

## 현재 활성 작업 (v1 잔여)

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
