# 개발 진행 상황

> 세션 간 컨텍스트 유실로 인한 중복 작업 방지를 위해 관리한다.
> 각 단계 완료 시 즉시 업데이트한다.

---

## Phase 0: 인프라/셋업

| 항목 | 상태 | 완료일 | 비고 |
|---|---|---|---|
| Next.js 14 프로젝트 초기화 | ✅ 완료 | 2026-03-22 | App Router, TypeScript strict |
| Supabase 프로젝트 생성 | ✅ 완료 | 2026-03-22 | Mission Trip (joonhwa125-ux's Org) |
| 환경변수 설정 (.env.local) | ✅ 완료 | 2026-03-22 | SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY |
| Vercel 배포 | ✅ 완료 | 2026-03-22 | 환경변수 설정 완료 |
| Google OAuth 설정 (Supabase) | ✅ 완료 | 2026-03-22 | Google Cloud Console + Supabase Provider |

## Phase 0: DB 스키마

| 항목 | 상태 | 완료일 | 비고 |
|---|---|---|---|
| groups 테이블 | ✅ 완료 | 2026-03-22 | |
| users 테이블 | ✅ 완료 | 2026-03-22 | email UNIQUE |
| schedules 테이블 | ✅ 완료 | 2026-03-22 | idx_one_active_schedule 포함 |
| check_ins 테이블 | ✅ 완료 | 2026-03-22 | unique_checkin 제약 포함 |
| group_reports 테이블 | ✅ 완료 | 2026-03-22 | unique_group_report 제약 포함 |
| RLS 정책 전체 | ✅ 완료 | 2026-03-22 | groups_read, users_read, schedules_read/write, checkins_read/insert/delete, reports_read/insert |
| RPC: activate_schedule | ✅ 완료 | 2026-03-22 | SECURITY DEFINER |
| RPC: sync_offline_checkins | ✅ 완료 | 2026-03-22 | SECURITY DEFINER |
| 테스트 데이터 INSERT | ✅ 완료 | 2026-03-22 | 조 2개, 참가자 (admin: liam.j@linkagelab.co.kr 포함), 일정 2개 |

## Phase 1: 핵심 기능 코드

| 항목 | 상태 | 완료일 | 비고 |
|---|---|---|---|
| 로그인 페이지 (/login) | ✅ 완료 | 2026-03-22 | Google OAuth, 에러 메시지 |
| Auth callback (/auth/callback) | ✅ 완료 | 2026-03-22 | 쿠키 설정 이슈 해결 (TSG-001) |
| Middleware (인증+역할 라우팅) | ✅ 완료 | 2026-03-22 | 도메인 제한, 미등록 차단, 역할별 리다이렉트 |
| 조장 화면 (/group) | ✅ 완료 | 2026-03-22 | GroupCheckinView, MemberCard |
| 관리자 화면 (/admin) | ✅ 완료 | 2026-03-22 | AdminView, StatusTab, ScheduleTab, NoticeTab |
| Server Actions | ✅ 완료 | 2026-03-22 | checkin.ts, schedule.ts, report.ts, setup.ts |
| Realtime hooks | ✅ 완료 | 2026-03-22 | useRealtime.ts (broadcast 구독+전송) |
| 오프라인 대응 | ✅ 완료 | 2026-03-22 | useOfflineSync.ts, offline.ts |
| 로그인 동작 테스트 | ✅ 완료 | 2026-03-22 | Google 로그인 → 역할 라우팅 정상 확인 |

## Phase 1: 미완료

| 항목 | 상태 | 비고 |
|---|---|---|
| E2E 흐름 검증 (체크인→보고→관리자 현황) | ⬜ 미시작 | 로그인 후 실제 체크인/보고 흐름 테스트 필요 |
| /setup 페이지 동작 검증 | ⬜ 미시작 | Google Sheets import 테스트 |
| Realtime 실시간 동기화 검증 | ⬜ 미시작 | 2개 브라우저로 broadcast 테스트 |
| Vercel 배포 후 프로덕션 검증 | ⬜ 미시작 | 최신 코드 배포 + 동작 확인 |

## 운영 안정성 수정 (2026-03-22)

| 항목 | 상태 | 완료일 | 비고 |
|---|---|---|---|
| [FIX-001] useRealtime 콜백 스테일 클로저 | ✅ 완료 | 2026-03-22 | callbacksRef 패턴 도입 |
| [FIX-002] 체크인/취소/보고 에러 토스트 | ✅ 완료 | 2026-03-22 | GroupCheckinView 에러 피드백 추가 |
| [FIX-003] Middleware DB N+1 최적화 | ✅ 완료 | 2026-03-22 | / 와 /setup 경로에서만 role 조회 |
| [FIX-004] schedule.ts .maybeSingle() | ✅ 완료 | 2026-03-22 | 즉흥 일정 추가 시 0건 day 처리 |
| [FIX-005] offline.ts try-catch | ✅ 완료 | 2026-03-22 | QuotaExceededError 처리 + boolean 반환 |
| [FIX-006] iOS Safari dvh + safe-area | ✅ 완료 | 2026-03-22 | viewportFit=cover, pb-safe, 100dvh override |

> 상세 내용: `docs/stability-fixes.md` 참조

## Phase 2: 추가 기능

| 항목 | 상태 | 비고 |
|---|---|---|
| 참가자 셀프 체크인 (/checkin) | ⬜ 미시작 | role=member 전용 |
| CSV 다운로드 | ⬜ 미시작 | 체크인 기록 내보내기 |

---

## 업데이트 규칙

- 각 항목 완료 시 상태를 `✅ 완료`로 변경하고 완료일 기입
- 새로운 작업 발견 시 해당 Phase에 행 추가
- 세션 시작 시 이 문서를 먼저 확인하여 중복 작업 방지
