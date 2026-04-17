# 개발 진행 상황

> 세션 간 컨텍스트 유실로 인한 중복 작업 방지를 위해 관리한다.
> 각 단계 완료 시 즉시 업데이트한다.

---

## ✅ v2 확장 프로젝트 (완료 — 2026-04-18)

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
| E | BriefingBanner + BriefingSheet + useBriefingCache | ✅ | 카카오톡 스타일 1줄 배너 + Radix Dialog 바텀시트 + sessionStorage 일일 dismiss + localStorage 캐시. `next build` 통과 |
| F | GroupCheckinView 섹션 헤더 (activity/airline 그루핑) + excused 섹션 + getEffectiveRoster wire-up | ✅ | page.tsx에서 non-shuttle 활성 일정에 getEffectiveRoster 호출, GroupView가 main/excused 분리 + transferredInMap/memberInfoMap 조립, GroupCheckinView가 activity/airline 섹션 + 제외 섹션 + 합류 배지 렌더. `next build` 통과 |
| G | 관리자 Undo 스낵바 + schedule_group_info / schedule_member_info 관리 UI | ✅ | Server Actions 4건 (upsert/delete × sgi/smi) + `UndoSnackbar` 재사용 컴포넌트(role=status, 5s) + `AssignmentManagementView` 신규 서브탭 + Sgi/Smi EditDialog. `next build` 통과 |
| G-fix | 코드 리뷰 후속 수정 2건 | ✅ | **Issue 2** (transferredOut 보내는 쪽 UX 구멍): `BriefingData.groupNameMap` 추가 + `BriefingSheet`가 `temp_group_id`/`temp_role` 칩(tone="warn") 렌더 → 보내는 쪽 조장이 "조이동 · {조이름}" 확인 가능. **Issue 1** (onMemberUpdated 깜빡임): `GroupView`에서 `briefing`을 state로 lift + `fetchLatestBriefing` 콜백(client RLS 쿼리) → `onMemberUpdated`에서 client refetch + router.refresh 병행 호출. 브리핑은 즉시, effectiveRoster는 서버 refresh로 커버. `next build` 통과 |
| H | Realtime member_info_updated broadcast + 캐시 갱신 로직 | ✅ | `AssignmentManagementView.run()`이 성공 시 `broadcast(GLOBAL, EVENT_MEMBER_UPDATED)` 자동 호출 (4개 CRUD + 2개 Undo restore 모두 커버). GroupView `onMemberUpdated`는 G-fix에서 이미 `fetchLatestBriefing()` + `router.refresh()` 병행 처리 중 → 0-flash 실시간 반영. AdminView는 기존 `router.refresh()` + `refetchAllCachedSchedules()`로 현황 갱신. 브리핑 캐시(`mtrip_briefing_{groupId}`)는 useBriefingCache가 새 briefing 데이터를 자동 덮어씀 (수동 invalidate 불필요). `next build` 통과 |
| I | 통합 테스트 + 엣지 케이스 (조 이동 후 체크인, 과거 일정 immutability) | ✅ | 3개 E2E 시나리오 정적 추적 완료: S1(조 이동) ✅ / S2(과거 immutability) 🟡 DB✅ UI제한 / S3(excused) ✅. 상세: [docs/phase-i-verification.md](docs/phase-i-verification.md) — 코드 경로 증빙 + 런타임 체크리스트 + 성능 관측 포인트 포함 |
| Checkpoint 2 | 최종 리뷰 (code-reviewer + a11y-checker) | ✅ | 에이전트 병렬 실행 → Critical 2 + High 6 + Medium/Low 다수 분류. 수정 반영 5건(보안 1, 퍼포먼스 1, 안전 1, 접근성 2) + 재검토 후 no-op 1건. 보류 항목은 `docs/checkpoint-2-review.md`에 근거 명시. `tsc` + `next build` 모두 통과. **v2 확장 프로젝트 완료 — 운영 배포 가능** |

### v2에서 변경된 파일 (Phase A-H 누적)

**DB/스키마:**
- `supabase/migrations/20260417_v2_schedule_metadata.sql` (신규)
- `supabase/schema.sql` (updated for fresh installs)

**타입 & 상수:**
- `src/lib/types.ts` — 9개 신규 타입 (ScheduleMemberInfo, ScheduleGroupInfo, EffectiveRoster, ParsedGroupInfo, ParsedMemberInfo, TempRole, AbsenceReasonCategory 등) + Phase E `BriefingData` + Phase F `EffectiveRosterClient` + Phase G-fix: `BriefingData.groupNameMap`
- `src/lib/constants.ts` — Phase E `BRIEFING_CACHE_PREFIX` / `BRIEFING_DISMISSED_PREFIX`

**서버 사이드:**
- `src/lib/auth.ts` — `hasActiveOrPastTempLeaderRole` 신규
- `src/lib/roster.ts` (신규, `import "server-only"`) — `getEffectiveRoster`
- `src/utils/sheets-parser.ts` — airline/trip_role + `parseGroupInfoSheet` / `parseMemberInfoSheet` + `mapTempRoleLabel`
- `src/actions/setup.ts` — 4시트 미리보기, `validateMetadataReferences`, 벌크 `upsertScheduleGroupInfo`/`upsertScheduleMemberInfo` + Phase G 단일 행 `updateScheduleGroupInfo`/`deleteScheduleGroupInfo`/`updateScheduleMemberInfo`/`deleteScheduleMemberInfo`
- `src/actions/checkin.ts` — `canActorCheckin` / `getEffectiveGroupId` / `isTempLeaderFor` 신규, markAbsent가 absence_reason/location 파라미터 받음, syncOfflineCheckins가 temp_leader 오프라인 큐 지원

**훅:**
- `src/hooks/useBriefingCache.ts` (신규, Phase E) — localStorage groupId별 캐시 + 서버 데이터 우선 병합

**공통 컴포넌트:**
- `src/components/common/UndoSnackbar.tsx` (신규, Phase G) — 하단 스낵바 (role=status aria-live=polite, 5초 자동 만료, [되돌리기] + 닫기 버튼)

**페이지/컴포넌트:**
- `src/app/(main)/group/page.tsx` — users SELECT에 airline/trip_role 추가, check_ins SELECT에 absence 컬럼 추가, 접근 제어에 hasActiveOrPastTempLeaderRole 추가. Phase E: schedule_group_info/schedule_member_info 서버 조립 → BriefingData prop 전달. Phase F: getEffectiveRoster 호출 + rosterIds 기반 check_ins 필터 + EffectiveRosterClient 변환. Phase G-fix: groupNameMap 조립
- `src/components/group/BriefingBanner.tsx` (신규, Phase E)
- `src/components/group/BriefingSheet.tsx` (신규, Phase E) + Phase G-fix: temp_group_id/temp_role 칩 렌더 (tone="warn")
- `src/components/group/GroupCheckinView.tsx` — Phase F: buildSections (activity/airline 그루핑) + sortByStatus 추출 + 제외 섹션 + ExcusedMemberCard + processedCount 사용 + MemberCard에 joinedFrom 전달
- `src/components/group/MemberCard.tsx` — Phase F: `joinedFrom` prop (transferredIn 합류 배지, indigo)
- `src/app/(main)/admin/page.tsx` — check_ins SELECT 확장, CiRow 타입 확장, checkInsMap 매핑 확장
- `src/components/group/GroupCheckinView.tsx` — optimistic CheckIn에 group_id_at_checkin/absence_reason/absence_location, addPending에 group_id_at_checkin, handleAbsentConfirm(reason, location)
- `src/components/group/GroupView.tsx` — Realtime CheckIn 생성 사이트에 v2 필드 + Phase E briefing prop 전달 + Phase F: effectiveRoster prop → mainMembers/scopedExcused/transferredInMap/memberInfoMap 파생, checkinComplete 기준 mainMembers로 전환 + Phase G-fix: briefingState lift + fetchLatestBriefing 콜백, onMemberUpdated에서 client refetch + router.refresh 병행
- `src/components/group/GroupFeedView.tsx` — Phase E: DayTabs 아래 BriefingBanner + Dialog 기반 BriefingSheet 통합, useBriefingCache 훅 사용
- `src/components/group/MemberCard.tsx` — 불참 카드에 사유 배지 추가
- `src/components/group/CheckinDialogs.tsx` — MarkAbsentDialog 전면 확장 (라디오그룹 4옵션 + 기타 입력 + 의료 위치 입력)
- `src/components/admin/AdminView.tsx` — optimistic CheckIn 및 adminCheckinMembers 매핑에 v2 필드
- `src/components/admin/AdminGroupDrillDown.tsx` — 사유 배지 표시
- `src/components/admin/AdminBusDrillDown.tsx` — 사유 배지 표시
- `src/components/setup/DataSourceStep.tsx` — 접이식 "배정 정보 (선택)" 섹션 추가 (URL + CSV)
- `src/components/setup/SetupWizard.tsx` — resync 흐름에 v2 GID 전달
- `src/components/setup/PreviewStep.tsx` — 참가자 테이블에 항공사/여행역할 컬럼, 조별/인원별배정 탭 2개 추가
- `src/components/setup/AssignmentManagementView.tsx` (신규, Phase G) — 배정 서브탭 본체 (조별/인원별 2 sub-section + CRUD + Undo 연동) + Phase H: `broadcastMemberUpdate` useBroadcast 통해 member_updated 실시간 전파 (4 CRUD + 2 Undo restore 공통 처리)
- `src/components/setup/ScheduleGroupInfoEditDialog.tsx` (신규, Phase G)
- `src/components/setup/ScheduleMemberInfoEditDialog.tsx` (신규, Phase G)
- `src/components/setup/CurrentDataView.tsx` — Phase G: "배정" 서브탭 추가, AssignmentManagementView 연동
- `src/app/setup/page.tsx` — Phase G: schedule_group_info / schedule_member_info 조회 추가 + CurrentDataView에 전달

### 다음 세션 재개 가이드

1. **필독 파일:**
   - `docs/progress.md` (이 섹션)
   - `CLAUDE.md` (요구사항 및 설계 원칙 갱신 여부 확인)
   - `src/lib/types.ts` (v2 타입 확인)
   - `supabase/migrations/20260417_v2_schedule_metadata.sql` (스키마 맥락)

2. **v2 확장 프로젝트 종료 상태 (2026-04-18):**
   - Phase A-I + G-fix + Checkpoint 2 모두 완료
   - Critical/High 미해결 0건
   - `tsc` + `next build` 통과
   - 최종 리뷰 보고서: `docs/checkpoint-2-review.md`
   - 통합 검증 보고서: `docs/phase-i-verification.md`

3. **운영 배포 전 필수 작업:**
   - Supabase Replication에 `schedule_group_info`/`schedule_member_info` 추가 (postgres_changes 선택지 확보용)
   - `docs/phase-i-verification.md §4` 수동 체크리스트 5종 실행
   - Google Sheets 원본 데이터로 `/setup` import 리허설
   - 운영 중 p95 체크인 지연 / onMemberUpdated 전파 시간 관측 (기준: `§5`)

4. **Phase I 구현 요약 (완료):**
   - 3개 E2E 시나리오를 코드 경로 정적 검증 (런타임 E2E 없이 file:line 증빙)
   - **S1 조 이동 체크인 ✅**: transferredOut/In 정확히 계산 + validateGroupAccess의 effective group 비교 + group_id_at_checkin B조 스냅샷 + A조 접근 reject
   - **S2 과거 일정 immutability 🟡**: DB 레벨 불변 확인 (group_id_at_checkin UPDATE 경로 없음, updateUser는 active schedule만 삭제). UI 제한(`AdminGroupDrillDown`이 현재 그룹 기준)은 1회성 트립 규모에서 수용
   - **S3 사전 제외 ✅**: mainMembers/excusedMembers 분리, checkinComplete는 mainMembers만 평가, ExcusedMemberCard dim 렌더
   - 상세: `docs/phase-i-verification.md` — 코드 경로 표 + 런타임 체크리스트 5종 + 성능 관측 포인트
   - 후속 필요 작업: 실제 배포 후 수동 E2E 체크리스트 실행, Checkpoint 2 에이전트 리뷰

5. **Phase H 구현 요약 (완료):**
   - `AssignmentManagementView.run()` 헬퍼가 성공 시 `broadcast(CHANNEL_GLOBAL, EVENT_MEMBER_UPDATED, {})` 자동 호출 → 4 CRUD 모두 한 곳에서 처리
   - 2개 Undo restore(Sgi/Smi)도 `router.refresh()` + `broadcastMemberUpdate()` 수동 호출
   - GroupView는 G-fix에서 `fetchLatestBriefing()` + `router.refresh()` 병행 — 0-flash 반영
   - AdminView는 기존 `router.refresh()` + `refetchAllCachedSchedules()`로 현황 갱신
   - Replication 설정 없이 broadcast로만 해결 (postgres_changes는 Phase I에서 재검토)

6. **Phase G 구현 요약 (완료):**
   - Server Actions(setup.ts): `updateScheduleGroupInfo(scheduleId, groupId, payload, existingId?)` / `updateScheduleMemberInfo(scheduleId, userId, payload, existingId?)` / `deleteScheduleGroupInfo(id)` / `deleteScheduleMemberInfo(id)`. existingId 주어지면 id UPDATE, 없으면 `onConflict`로 UPSERT — Undo 재삽입까지 동일 함수로 커버
   - `UndoSnackbar`: 재사용 가능. 5초 기본 타임아웃, 되돌리기 버튼 처리 중 disabled, role=status aria-live=polite
   - `AssignmentManagementView`: 2-sub-section(조별/인원별) 탭 + 추가/수정/삭제 버튼. 삭제 시 스냅샷 저장 → Undo 클릭 → 같은 payload로 upsert 재삽입
   - Sgi/Smi EditDialog: create 모드에선 dropdown으로 schedule/group 선택, edit 모드에선 key 필드 disabled (변경 방지)
   - setup/page.tsx에서 sgi/smi 서버 조회 추가, CurrentDataView → AssignmentManagementView 전달
   - `next build` 통과 (local + Vercel 호환)

7. **Phase F 구현 요약 (완료):**
   - page.tsx: non-shuttle 활성 일정일 때만 `getEffectiveRoster` 호출, Map 기반 `EffectiveRoster` → 클라이언트용 `EffectiveRosterClient`(memberInfos 배열)로 변환 후 전달
   - GroupView: `effectiveMembers = rosterSource(=activeMembers) × scope` + `scopedExcused` + `mainMembers` (excused 제외) + `transferredInMap` + `memberInfoMap` 파생
   - GroupCheckinView: `buildSections()` — smi.activity가 있으면 activity 그루핑, 아니면 airline ≥2개면 airline 그루핑, 아니면 flat. 각 섹션 내부에서 `sortByStatus`로 (미확인 → 불참 → 완료) 정렬
   - 제외 섹션: `<ExcusedMemberCard>` (dim, 체크인 버튼 없음) + "기타:" prefix 제거
   - MemberCard: `joinedFrom` prop으로 "⇢ [원래 조]" indigo 배지
   - 상단 카운트: `processedCount`(members 한정 탑승+불참) / members.length + (제외 N) 부가 텍스트
   - 보고 무효화 기준을 mainMembers로 전환 (`checkinComplete` useMemo)

8. **Phase E 구현 요약 (완료):**
   - 배너: `GroupFeedView` DayTabs 아래, 일정 카드 위. 카카오톡 공지 스타일 (indigo-50/500)
   - 1줄 요약: "역할 N건 · 특이사항 M건" (카운트 0이면 배너 숨김)
   - dismiss: `sessionStorage[mtrip_briefing_dismissed_{userId}] = KST YYYY-MM-DD`. 다른 날엔 다시 표시
   - 캐시: `localStorage[mtrip_briefing_{groupId}]` — useBriefingCache 훅이 서버 데이터 우선 병합
   - 바텀시트: Radix Dialog 재활용 (포커스 트랩 + aria-modal) + 85vh max-h 스크롤
   - 바텀시트 내용: 역할 섹션(trip_role + airline 배지) + 일정별 안내(일차 헤더 → 조 info 칩 + 조원 info 칩 + 메모)

9. **보류 사항 (Checkpoint 2에서 재검토):**
   - M1 query consolidation (createCheckin 6-7 DB 쿼리) — 200명 규모에선 허용 가능
   - M2 guard 추출 (createCheckin/deleteCheckin/markAbsent 중복) — 보안 경계라 중복이 오히려 명확
   - Phase I 문서화 제한: `AdminGroupDrillDown` 현재 그룹 기준 → `group_id_at_checkin` 기반 과거 모드 전환 여부
   - Phase I 문서화 제한: Admin 드릴다운에 excused 컨텍스트 미반영

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
