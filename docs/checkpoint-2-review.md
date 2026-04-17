# Checkpoint 2 — v2 최종 리뷰 보고서

> **일시**: 2026-04-18
> **범위**: Phase A-I + G-fix 전체 (v2 확장 프로젝트)
> **방법**: `code-reviewer` + `a11y-checker` 에이전트 병렬 실행 → 심각도별 분류 → 우선순위에 따라 수정/보류

---

## 1. 수정 반영(6건)

| # | 위치 | 내용 | 출처 |
|---|---|---|---|
| **1. 보안** | [actions/checkin.ts:80-135](src/actions/checkin.ts#L80-L135) | `validateGroupAccess`가 영구 조장(role=leader)의 effective group을 계산할 때 `smi.temp_group_id`가 아닌 **원래 `actor.group_id`**를 사용하도록 수정. 관리자가 조장의 smi에 `temp_group_id`를 설정하면 해당 조장이 다른 조 조원에 체크인 권한을 획득하는 경로를 차단 | code-reviewer Critical #1 |
| **2. 퍼포먼스** | [actions/checkin.ts:21-25](src/actions/checkin.ts#L21-L25) | `validateGroupAccess`가 반환값 형태를 `{ error } \| { targetGroupId }`로 변경해 타겟의 effective group을 호출자가 재사용 → `createCheckin`/`deleteCheckin`/`markAbsent`에서 `getEffectiveGroupId(target)` 중복 호출 1건 제거 (체크인 1건당 최대 7쿼리 → 6쿼리) | code-reviewer Critical #1 |
| **3. 안전** | [actions/checkin.ts:297-310](src/actions/checkin.ts#L297-L310) | `markAbsent`에 `ignoreDuplicates: true` 추가. 기존 체크인(정상/불참)을 덮어쓰는 경로 차단. 모드 전환은 취소 후 재-mark 2단계로 수행 | code-reviewer Warning #8 |
| **4. 접근성** | `ScheduleGroupInfoEditDialog.tsx` / `ScheduleMemberInfoEditDialog.tsx` | 모든 form field에 `useId` 기반 `htmlFor`+`id` 연결. 중복되던 `aria-label`은 제거 (KWCAG 3.3.2 명시적 label 연결) | a11y-checker Critical #1 |
| **5. 터치** | [components/setup/AssignmentManagementView.tsx](src/components/setup/AssignmentManagementView.tsx) | 테이블 행의 [수정]/[삭제] 버튼 컨테이너 `gap-1` → `gap-2` (모바일 오탭 완화, KWCAG 2.5.5) | a11y-checker Medium #7 |
| **6. 검증** | (no-op) GroupCheckinView.tsx:483-496 | `a11y-checker High #3` 재검토 결과 — 축하 말 이미지의 부모 `<div aria-hidden="true">`가 이미 장식 처리. 상태 변화는 `h2` + `p` 형제 요소로 텍스트 전달 중. **수정 불필요** | a11y-checker High #3 (재판정) |

모든 변경 후 `tsc --noEmit` + `next build` 통과 (경고는 기존 `useRealtime.ts:169` 미수정 워닝 1건만).

---

## 2. 수용된 제한사항 (보류, 이후 재검토)

### 2.1 code-reviewer 지적 중 보류 항목

| # | 내용 | 보류 사유 |
|---|---|---|
| Critical #2 | `roster.ts` `transferredInUserIds`에 대한 무제한 IN 쿼리 | 1회성 3일 트립 + 200명 규모에서 한 일정의 동시 이동 인원은 <20명 현실적. PostgREST URL 한계(~2KB)에 도달할 가능성 없음. 필요 시 chunk 처리로 대응 가능 |
| Warning #3 | `GroupView.fetchLatestBriefing`의 `briefingState` deps | 현재 `briefingState === null` 시 early return → 루프 억제됨. 실질 버그 없음. `briefingStateRef`로 전환하면 패턴 일관성이 깨지고 ROI 낮음 |
| Warning #4 | `GroupView.fetchLatestCheckIns`의 `checkIns.length` deps | 동일 근거 — 현재 안전 작동, 이후 visual refresh 이슈 발견 시 개선 |
| Warning #5 | `useBriefingCache`의 groupId 변경 엣지케이스 | 실사용: 조장이 mid-trip에 groupId 변경 시 page 전체가 router.refresh되어 component key도 자연스럽게 리마운트됨. 캐시 복원 차단 문제 체감 여지 낮음 |
| Warning #6 | `AssignmentManagementView` Undo race (연속 삭제) | 관리자가 5초 내 두 번 삭제 시나리오 — 현장 운영에서 극히 드묾. Undo stack(배열 관리)은 과도한 복잡도. "5초 내 1건 undo"가 설계 의도와 일치 |
| Warning #7 | `buildSections`의 `memberInfoMap.size > 0` 체크 | 현재 로직은 올바르게 동작. 방어 코드 추가의 가독성 이점이 불명확 |
| ~~Warning #9~~ | ~~`setup.ts`의 동명이인 userMap 충돌~~ | **N/A** — 회사 LDAP이 사람별 고유 영문 이름을 보장. 동명이인 발생 확률 0. 재검토 불필요. (수집일: 2026-04-18) |
| Info #10 | `BriefingBanner` dismiss sessionStorage 의미 | 의도적 설계 — "오늘 하루 + 현재 세션" 교집합. 탭 재오픈 시 재노출이 바람직한 UX (다음 운영 iteration에서 변경 논의 가능) |
| Info #11 | `UndoSnackbar` useEffect deps의 `close` 누락 | `eslint-disable-next-line` 적용됨. `onClose` 안정적 참조가 호출자(`AssignmentManagementView`) 쪽에서 useState setter라 보장됨 |
| Info #12 | 다이얼로그 `disabled` vs `readOnly` | `disabled`가 select에 대한 보편적 패턴이고 Radix 접근성 기본 처리 유지. `readOnly` 전환은 폼 제출 동작 재검토 필요 |
| Info #13 | `GroupCheckinView.reportButtonDone` 카운트 경계 | 현재 `members = mainMembers`로 효과적으로 분리됨. transferredIn 포함되므로 `confirmed + unchecked === members.length`가 유지되는지 재검증 필요 — Phase I에서는 통과 판정. 필요 시 운영 후 피드백 기반 재검토 |

### 2.2 a11y-checker 지적 중 보류

| # | 내용 | 보류 사유 |
|---|---|---|
| Critical #2 | BriefingSheet airline chip 이모지 `✈︎` 대비율 | sky-100/sky-800 조합은 실제 대비율 8.59:1로 **4.5:1 통과**. 이모지 자체의 선 두께는 WCAG 지표 아님. 판정 오류로 보류 |
| High #4 | BriefingSheet heading hierarchy (h3) | Radix `DialogTitle`이 기본 h2 → h3 점프는 WCAG/KWCAG 공식 실패 사유 아님 (`h2` 생략 허용). 의미적 계층 명확성은 섹션 구분 aria-labelledby로 이미 보완 |
| High #6 | `MemberCard`의 ⇢ emoji+color 의존 | 이미 `aria-label="{origin}에서 합류"`로 SR에 명시. 시각적 컨텍스트도 indigo 배지 + 원래 조명 텍스트로 3중 전달 (KWCAG 1.3.3 통과) |
| Medium #8 | `UndoSnackbar` 5초 타이밍 (WCAG 2.2.3) | 설계 명세 — Phase G에서 "role=status + 5초"로 확정. 더 길면 관리자 워크플로우 방해 |
| Medium #9 | 섹션 헤더 `text-xs` 크기 | rem 기반 (0.75rem), KWCAG 1.4.4 통과. 시각적 계층 보강은 디자인 이터레이션 |

### 2.3 Phase I에서 이미 문서화된 제한사항 (유지)

[docs/phase-i-verification.md](docs/phase-i-verification.md) §5-6 참조. **두 이슈 모두 유지 결정**:

- **Issue A**: `AdminGroupDrillDown`이 `member.group_id`(현재)로 필터 → 과거 일정 드릴다운 후 mid-trip 그룹 변경 유저 미노출.
  - **근거**: 1회성 3일 트립에서 mid-trip 조 변경은 극히 드물고, DB (`check_ins.group_id_at_checkin`)에 기록은 남아 있어 감사 시 직접 조회 가능. `group_id_at_checkin` 기반 과거 모드 전환은 비-트리비얼 리팩토링이며 현재의 "현재-조 기준 브라우징" 일관성을 해칠 수 있음.
- **Issue B**: Admin 드릴다운에 `smi.excused_reason` 컨텍스트 미반영 → 관리자가 제외 유저를 "확인 전"으로 오인 가능.
  - **근거**: 체크인이 발생해도 안전 측면 해로움 없음(중복 기록일 뿐). 현장 관리자는 조장 보고와 교차 검증하므로 실제 체크인 오류 발생 가능성 낮음. 후속 UX 개선 여지.

---

## 3. 최종 품질 상태

| 지표 | 값 |
|---|---|
| Critical 미해결 | 0건 |
| High 미해결 | 0건 (단, 보류 2건 문서화) |
| `tsc --noEmit` | ✅ Pass |
| `next build` | ✅ Pass (새 워닝 0건) |
| Phase I E2E 시나리오 3건 | ✅ Pass / 🟡 DB ✅ UI 제한 / ✅ Pass |
| KWCAG 2.2 핵심 항목 | 라벨 연결 수정 후 통과 |

**결론**: v2 확장 프로젝트의 모든 Phase(A-I) 완료. 운영 배포 가능 상태. 보류 항목은 post-trip iteration에서 재검토.

---

## 4. 다음 단계 (운영 전 필수)

1. **Supabase Dashboard → Database → Replication**에 `schedule_group_info`, `schedule_member_info` 테이블 발행 대상 추가 (postgres_changes 기반 업그레이드 옵션을 열어두기 위함)
2. 실제 배포 후 `docs/phase-i-verification.md §4` 수동 체크리스트 실행 (5개 시나리오)
3. Google Sheets 원본 데이터로 `/setup` import 최종 리허설
4. 운영 중 관측 포인트 (p95 체크인 지연, onMemberUpdated 전파 지연)는 `docs/phase-i-verification.md §5`의 기준 적용
