# Phase I — v2 통합 검증 보고서

> **목적**: v2 확장의 3대 E2E 시나리오를 코드-레벨로 정적 추적하여 논리적 구멍을 식별한다.
> E2E 자동화 미구현 상태이므로 **실제 런타임 검증 체크리스트**(§4)를 함께 제공한다.
> 기준 커밋: Phase H 완료 시점 (2026-04-18).

---

## 1. Scenario 1 — 조 이동 체크인 (temp_group_id)

### 시나리오
- User **U** 원래 소속 **A조**
- Admin이 smi 생성: `{schedule_id: S, user_id: U, temp_group_id: B_ID}`
- A조 조장(`A_leader`)과 B조 조장(`B_leader`)이 각자 `/group` 진입
- B_leader가 U를 체크인

### 코드 경로 추적

| 단계 | 위치 | 동작 | 결과 |
|---|---|---|---|
| A_leader: roster 계산 | [roster.ts:78-93](src/lib/roster.ts#L78-L93) | `transferredOutIds`에 U 추가 (temp_group_id=B_ID, != A_ID, base에 존재) | U가 `activeMembers`에서 제외 ✅ |
| A_leader: 체크인 화면 | [GroupView.tsx:313](src/components/group/GroupView.tsx#L313) | `mainMembers = effectiveMembers - excused`. U가 activeMembers에 없음 | U는 A조 명단에서 완전히 사라짐 |
| A_leader: 브리핑 | [page.tsx:186-201](src/app/(main)/group/page.tsx#L186-L201) | smi by_user 쿼리가 base 멤버(U 포함)의 smi를 로드 | U의 smi가 briefing.memberInfos에 존재 ✅ |
| A_leader: 브리핑 시트 | [BriefingSheet.tsx:244-251](src/components/group/BriefingSheet.tsx#L244-L251) | `temp_group_id` 있으면 Chip(tone=warn) 렌더 | "조이동 · B조" 표시 ✅ (Issue 2 fix) |
| B_leader: roster 계산 | [roster.ts:95-118](src/lib/roster.ts#L95-L118) | `transferredInUserIds`에 U 추가 (temp_group_id=B_ID, !base_member_ids) | U가 `activeMembers`에 합류, `transferredIn`에 origin_group_name=A조 ✅ |
| B_leader: MemberCard | [MemberCard.tsx](src/components/group/MemberCard.tsx#L45-L52) | `joinedFrom` prop → indigo "⇢ A조" 배지 | "합류" 표시 ✅ |
| B_leader: 체크인 동작 | [checkin.ts:131-177](src/actions/checkin.ts#L131-L177) | `validateGroupAccess`에서 actor+target의 effective group ID 비교 | 둘 다 B_ID → 통과 ✅ |
| group_id_at_checkin 스냅샷 | [checkin.ts:156-166](src/actions/checkin.ts#L156-L166) | `targetGroupAtCheckin = getEffectiveGroupId(U, S)` = B_ID | check_ins.group_id_at_checkin = B_ID ✅ |
| A_leader 체크인 시도(차단 검증) | [checkin.ts:118-127](src/actions/checkin.ts#L118-L127) | actorGroupId(A_ID) !== targetGroupId(B_ID) | "자기 조원만 처리할 수 있어요" 반환 ✅ |
| 보고 무효화 | [checkin.ts:230-238](src/actions/checkin.ts#L230-L238) | B_leader 취소 시 `getEffectiveGroupId(U, S)` = B_ID → B조 report 무효화 | 대상 보고만 정확히 무효화 ✅ |

### 결과: ✅ **PASS**
- 이동IN 조장이 체크인 시 `group_id_at_checkin = B_ID`로 스냅샷됨.
- 이동OUT 조장은 체크인 UI에서 U를 볼 수 없고, 브리핑에서 "조이동 · B조" 칩으로 정보 노출됨 (Issue 2 fix).
- 권한 격리는 effective group 기준으로 서버 Action에서 강제됨.

### 미세 이슈 (수용 가능)
- **Race condition**: Admin이 smi 변경 후 broadcast 도달 전(~500ms) A_leader가 U를 체크인 시도 → Server Action에서 reject, UI가 잠깐 stale. `fetchLatestBriefing`이 client-fetch해서 브리핑은 즉시 반영되지만 effectiveRoster는 router.refresh 대기. (Phase I-stretch 옵션)

---

## 2. Scenario 2 — 과거 일정 immutability

### 시나리오
- 1일차 일정 완료 (U가 A조 소속으로 체크인: `group_id_at_checkin = A_ID`)
- Admin이 `/setup`에서 U의 소속조를 A → B로 변경
- 1일차의 체크인 기록이 원래(A조) 기준 그대로인지 확인

### 코드 경로 추적

| 단계 | 위치 | 동작 | 결과 |
|---|---|---|---|
| group_id_at_checkin 할당 | [checkin.ts:156-166](src/actions/checkin.ts#L156-L166) | INSERT 시점에만 세팅, UPDATE 경로 없음 | 체크인 후 불변 ✅ |
| updateUser 조 변경 감지 | [setup.ts:677-697](src/actions/setup.ts#L677-L697) | `groupChanged` 시 `activeSchedule`의 check_ins만 DELETE | 과거 일정 check_ins 보존 ✅ |
| DB 불변 검증 | schema | check_ins.group_id_at_checkin 컬럼은 FK(ON DELETE SET NULL) | 조 자체를 삭제해도 NULL로 남을 뿐 과거 기록 보존 ✅ |

### 결과: 🟡 **PARTIAL PASS (DB ✅ / UI 제한 있음)**

**DB 레벨**:
- `group_id_at_checkin`은 체크인 INSERT 시점에만 세팅되며, 이후 어떤 코드 경로에서도 UPDATE하지 않음. 완전 불변 ✅
- `updateUser`는 활성 일정의 check_ins만 삭제하며, 과거 완료 일정은 손대지 않음 ✅

**UI 표시 제한**:
- `AdminGroupDrillDown` [L52-55](src/components/admin/AdminGroupDrillDown.tsx#L52-L55)에서 `members.filter(m => m.group_id === group.id)` 사용 → **현재 그룹** 기준으로만 필터
- 과거 일정의 A조 드릴다운을 열었을 때 "체크인 당시 A조였다가 지금은 B조"인 유저는 A조 리스트에 나타나지 않음
- DB에는 기록이 남아 있지만 UI 브라우징으로는 혼란 가능

**판단**:
- 1회성 3일 트립 규모에서는 mid-trip 조 변경이 거의 없으므로 수용 가능
- 감사 필요 시 DB(`check_ins.group_id_at_checkin`)로 직접 조회 가능
- **자동 수정하지 않음** — `AdminGroupDrillDown`을 `group_id_at_checkin` 기반으로 전환하려면 과거/현재 schedule 구분 분기 + 멤버 리스트 재계산 필요 (비트리비얼 리팩토링, Checkpoint 2 또는 후속 phase에서 재검토)

---

## 3. Scenario 3 — 사전 제외(excused) 흐름

### 시나리오
- Admin이 smi 생성: `{schedule_id: S, user_id: U, excused_reason: "숙소 휴식"}`
- A조 조장이 체크인 화면 진입
- U는 제외 섹션에 dim 표시되어야 하고, 전원 완료 판정에서 빠져야 함

### 코드 경로 추적

| 단계 | 위치 | 동작 | 결과 |
|---|---|---|---|
| roster 계산 | [roster.ts:120-136](src/lib/roster.ts#L120-L136) | `excusedFromBase`: baseMember 중 smi.excused_reason 있는 U 추가 | excusedMembers = [U] ✅ |
| activeMembers 규칙 | [roster.ts:138-156](src/lib/roster.ts#L138-L156) | 제외 인원도 activeMembers에 **포함** (체크인 뷰에서 별도 섹션에 표시하기 위함) | U가 activeMembers에 있음 ✅ |
| GroupView 분리 | [GroupView.tsx:305-315](src/components/group/GroupView.tsx#L305-L315) | `mainMembers = effectiveMembers - excusedIdSet`, `scopedExcused = filterByScope(excused)` | mainMembers에 U 없음, excusedMembers에 U ✅ |
| checkinComplete 계산 | [GroupView.tsx:335-338](src/components/group/GroupView.tsx#L335-L338) | `mainMembers.every(m => ids.has(m.id))` — excused 제외됨 | 제외자가 체크인 없어도 전원완료 가능 ✅ |
| GroupCheckinView 카운트 | [GroupCheckinView.tsx:356-359](src/components/group/GroupCheckinView.tsx#L356-L359) | `processedCount`는 members(=mainMembers) 한정 | 상단 "확인 N/M" 분모에서 제외 ✅ |
| 제외 섹션 렌더 | [GroupCheckinView.tsx:529-552](src/components/group/GroupCheckinView.tsx#L529-L552) | `<ExcusedMemberCard>` dim, 체크인 버튼 없음 | "제외 N명" 배지 + reason 칩 표시 ✅ |
| 이니셜 원 | [GroupCheckinView.tsx:367-375](src/components/group/GroupCheckinView.tsx#L367-L375) | `sorted` = members(mainMembers) 기반 | 원 행에 제외자 미노출 ✅ |

### 결과: ✅ **PASS**

### 미세 이슈 (문서화만)
- **Admin 드릴다운은 excused를 반영하지 않음**: `AdminGroupDrillDown`에 smi 컨텍스트가 없어 excused 유저도 "확인 전"으로 표시됨. 현장에서 관리자가 excused 유저에게 "왔수다" 버튼 눌러도 동작은 함 (의도와 다르지만 안전 측면에서 해로움 없음 — 실제 출석 기록이 생성됨). 향후 개선 여지. Checkpoint 2에서 논의.

---

## 4. 런타임 검증 체크리스트 (배포 전 수동 테스트)

**사전 조건**:
- 두 개 이상의 조(A, B)와 최소 각 조당 1인 이상의 유저 세팅
- Admin 계정 + A조장 계정 + B조장 계정 (3개 브라우저/탭)
- 최소 1개 schedule 활성화

### 체크리스트 1 — 조 이동 흐름
- [ ] Admin `/setup/배정` 탭에서 A조 U의 인원별 배정 추가: `조이동 → B조`
- [ ] 저장 즉시 A조장 `/group`에서 U가 명단에서 사라지는지 (5초 내, Realtime broadcast)
- [ ] A조장 브리핑 열면 U의 "조이동 · B조" 칩 보이는지
- [ ] B조장 `/group`에서 U가 "⇢ A조" 합류 배지와 함께 보이는지
- [ ] B조장이 U "왔수다" 탭 → 성공 토스트
- [ ] DB `check_ins` 테이블에서 U의 `group_id_at_checkin`이 B조 ID인지 확인
- [ ] A조장이 "왔수다" 시도 (상상 가능한 UI 통해) → "자기 조원만 처리할 수 있어요" 에러

### 체크리스트 2 — 과거 일정 immutability
- [ ] 1일차 일정 활성화 → 전원 체크인 완료
- [ ] 1일차 deactivate → 2일차 일정 활성화
- [ ] Admin `/setup/참가자` 탭에서 U의 소속조를 A→B로 수정
- [ ] 2일차에서는 U가 B조로 표시됨
- [ ] 1일차 완료 카드의 체크인 집계가 유지되는지 (전 A조 인원 모두 "확인 완료")
- [ ] DB `check_ins`에서 1일차 U 레코드의 `group_id_at_checkin`이 A조 ID인 채로 남아있는지
- [ ] *(제한)* 현재 admin 드릴다운은 `users.group_id` 기준이므로 1일차 A조 드릴다운에서 U 미노출 → **수용된 제한사항** (DB는 무결)

### 체크리스트 3 — 사전 제외(excused)
- [ ] Admin `/setup/배정` 탭에서 A조 U의 인원별 배정 추가: `제외 사유 → 숙소 휴식`
- [ ] A조장 `/group` 체크인 화면에서 "제외 1명" 배지 + 맨 아래 dim 카드로 U 표시
- [ ] U 제외 상태에서 상단 카운트가 "{mainMembers 수}명"으로 분모 계산
- [ ] 나머지 조원 모두 체크인 → "전원 확인 끝!" 축하 화면 뜨는지 (제외자 없는 것처럼)
- [ ] 보고하기 버튼 활성화되는지
- [ ] Admin이 U의 excused 삭제 (Undo 테스트 포함) → 5초 내 Undo → 다시 dim 표시
- [ ] Excused 삭제 후 U가 체크인 대상으로 정상 복귀

### 체크리스트 4 — Undo 스낵바 (Phase G)
- [ ] sgi 삭제 → 스낵바 5초 표시
- [ ] 되돌리기 클릭 → sgi 복원, broadcast 수신 시 leader 앱 브리핑 즉시 반영
- [ ] 5초 경과 후 되돌리기 버튼 사라짐 (스낵바 자동 닫힘)
- [ ] 스낵바 role=status / aria-live=polite 확인 (스크린 리더 announce)

### 체크리스트 5 — Realtime flash 검증 (G-fix + Phase H)
- [ ] A조장 체크인 화면 사용 중 Admin이 smi 생성
- [ ] 브리핑 배너 카운트가 깜빡임 없이 갱신되는지 (fetchLatestBriefing)
- [ ] 체크인 명단 순서 변경 시 router.refresh 대기 시간 동안 stale UI 허용 (<1s)
- [ ] 온라인 ↔ 오프라인 전환 시 브리핑이 localStorage 캐시로 복원되는지

---

## 5. 성능 관측 포인트 (보류 항목)

| 항목 | 위치 | 측정 대상 | 수용 기준 |
|---|---|---|---|
| M1: createCheckin 쿼리 수 | [checkin.ts:131-177](src/actions/checkin.ts#L131-L177) | 1번 체크인 시 `canActorCheckin` + `getEffectiveGroupId`(×2) + INSERT = 4~6 쿼리 | 200명 스케일 p95 < 300ms |
| onMemberUpdated 라운드트립 | GroupView.onMemberUpdated | broadcast → fetchLatestBriefing + router.refresh 완료까지 | p95 < 1s (LTE 기준) |
| 브리핑 시트 초기 렌더 | [BriefingSheet.tsx](src/components/group/BriefingSheet.tsx) | 블록 수 × 멤버 수 정렬/그루핑 | 20 조 × 3일 × 각 10 info ≈ 600 블록. 모바일 기기에서 50ms 미만 기대 |

---

## 6. 요약

| 시나리오 | 결과 | 비고 |
|---|---|---|
| **S1: 조 이동 체크인** | ✅ PASS | Issue 2 fix가 보내는 쪽 UX 구멍 메움 |
| **S2: 과거 일정 immutability** | 🟡 DB ✅ / UI 제한 | 관리자 드릴다운이 현재 소속 기준. 1회성 트립 규모에서 수용 |
| **S3: 사전 제외 흐름** | ✅ PASS | 조장 뷰 완벽 처리. 관리자 뷰는 smi 무관 — 후속 개선 여지 |

**Phase I 판정**: **통과** (문서화된 제한사항과 함께)

**후속 필요 작업**:
1. 실제 배포 후 위 체크리스트 수동 테스트 (E2E 자동화 미구현)
2. Checkpoint 2에서 agent 리뷰 (code-analyzer + a11y-checker + review-prd) 통해 v2 전체 품질 확인
3. Admin 드릴다운에 smi 컨텍스트 추가 여부 결정 (Phase I의 미세 이슈들)
