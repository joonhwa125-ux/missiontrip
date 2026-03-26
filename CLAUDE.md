# 미션트립 인원관리 시스템

> **Claude Code 개발 지시서**
> 장애인표준사업장 미션트립 | 2박 3일 제주도 | 조장 중심 운영 | 구글 계정 로그인
> KWCAG 2.2 준수 | 1회성 운영 | Next.js 14 + Supabase + Vercel

---

## 자동 검증 규칙 (매 코드 작성 시 필수 확인)

> 이 섹션은 Claude가 코드를 작성/수정할 때마다 자동으로 준수해야 하는 규칙이다.
> Hook 스크립트(`.claude/scripts/check-violations.sh`)가 패턴 위반을 잡고,
> 아래 의미적 규칙은 Claude가 직접 확인한다.

### A. Ad-hoc 방지 (PRD 일치 검증)
코드 작성 시 이 문서의 명세와 불일치하는 구현을 하지 않는다.
- 새 컴포넌트/함수 작성 전: 해당 섹션(4. 화면별 기능 명세)을 재확인
- 색상값은 반드시 8.1 컬러 시스템 테이블의 값만 사용
- UI 문구는 반드시 8.2 UI 문구 테이블의 값만 사용
- "절대 금지 사항"에 해당하는 코드를 절대 생성하지 않는다
- 명세에 없는 기능을 임의로 추가하지 않는다

### B. KWCAG 2.2 접근성 (코드 작성 시 자동 적용)
TSX 파일 작성 시 아래를 기본 적용한다:
- 모든 `<button>`, `<a>` → 최소 44x44px (`min-h-11 min-w-11`)
- 모든 아이콘 → `aria-label` 또는 인접 텍스트 레이블
- 상태 변화 컨테이너 → `aria-live="polite"`
- `outline-none` 사용 시 반드시 `focus-visible:ring-2` 대체
- 색상으로 상태 표현 시 반드시 텍스트 또는 아이콘 병기
- 폰트 크기 → rem 단위만 사용 (px 금지)
- 모달 → 포커스 트랩 + `role="dialog"` + `aria-modal="true"`

### C. 클린코드 (자동 준수)
- `any` 타입 금지 → 구체적 타입 정의
- 함수 50줄 이내
- `console.log` 금지 (디버깅 완료 후 반드시 제거)
- 매직넘버 금지 → `constants.ts`에 상수 정의
- 컴포넌트당 1파일, 200줄 이내 권장

---

## 개발 환경 & 규칙

### 기술 스택
- **Framework:** Next.js 14 (App Router) — `'use client'` 최소화, 서버 컴포넌트 우선
- **Backend:** Supabase (Auth, Database, Realtime)
- **Styling:** Tailwind CSS + shadcn/ui (Radix UI 기반 접근성 내장)
- **Deploy:** Vercel
- **Language:** TypeScript (strict mode)

### 코딩 컨벤션
- 컴포넌트: PascalCase (`GroupCard.tsx`), 유틸/훅: camelCase (`useCheckin.ts`)
- CSS: Tailwind utility-first, 커스텀 색상은 `tailwind.config`에 등록
- 한글 주석 허용 (PRD와 일관성)
- rem 단위 사용 (KWCAG 1.4.4)

### 디렉토리 구조 (계획)
```
src/
├── app/
│   ├── (auth)/login/page.tsx, auth/callback/route.ts
│   ├── (main)/group/page.tsx, admin/page.tsx, no-access/page.tsx
│   ├── setup/page.tsx                    # 개발자/관리자 셋업
│   ├── layout.tsx
│   └── middleware.ts
├── actions/                              # Server Actions (모든 DB 쓰기)
│   ├── checkin.ts, schedule.ts, report.ts, setup.ts
├── components/ui/, group/, admin/, setup/, common/
├── lib/supabase/ (client.ts, server.ts, middleware.ts), types.ts, constants.ts
├── hooks/ (useCheckin.ts, useRealtime.ts, useOfflineSync.ts)
└── utils/offline.ts, sheets-parser.ts    # Google Sheets CSV 파싱
```

### 절대 금지 사항
- `text-decoration: line-through` (완료 카드)
- 오프라인 배너 상단 배치
- Polling 방식 (Realtime broadcast만 사용)
- 보고 버튼 HTML `disabled` 속성 사용 (대신 `aria-disabled` + 클릭 차단 패턴 사용)
- 색상만으로 상태 구분 (KWCAG 1.3.3)
- `focus-visible` 링 제거

---

## 0. 이 문서의 목적

이 문서는 **현재 스펙(Single Source of Truth)**이다. "지금 이렇게 구현한다"만 기술한다. 결정 배경은 `docs/decisions.md` 참조.

> **이 시스템의 목적은 '편의성'이 아닌 '안전'이다.** 장애인·비장애인이 함께하는 여행에서 이동 시마다 단 한 명의 누락도 없도록 하는 것이 핵심 가치다.

> **운영 모델: 조장 중심.** 조원은 앱 사용이 선택사항. 조장 18명이 각 조(차량)의 체크인을 주도한다. 차량당 조장 1~2명.

> **인증: 회사 구글 계정 OAuth 단일 방식.** 전 참가자(외부 지원 인력 포함) 회사 계정 보유 확인 완료.

> **핵심 사용 시나리오: 이동 전 정차 상태에서 체크인 완료.** 이동 중 네트워크 단절 시 실시간 동기화 불가 — 이는 근본적 전제다.

### 설계 원칙

- 조장 화면이 핵심 화면이다. 탭탭탭 흐름에 가장 많은 공을 들인다
- 장애/비장애 구분 로직 없음 — 접근성 갖춘 단일 UI로 모든 사용자 지원
- 안전 확인 vs 사용자 편의 → 안전 확인 우선
- 기능 추가 vs 단순함 → 단순함 우선 (1회성 서비스)

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 서비스명 | 미션트립 인원관리 시스템 |
| 여행지 | 제주도 (2박 3일) — 비행기 + 버스 이동 포함 |
| 목적 | 이동 시마다 약 200명의 인원 누락을 실시간으로 방지 |
| 운영 모델 | 조장 중심 — 조장 18명이 체크인 주도 (차량 10대, 차량당 1~2명). 조원 앱 사용은 선택 |
| 인증 | 회사 구글 계정 OAuth. 전 참가자(외부 지원 인력 포함) 회사 계정 보유 |
| 참가자 특성 | 장애인·비장애인 혼합, 수어통역사·트레블헬퍼·활동지원사 포함. 모두 동일 인터페이스 |
| 운영 기간 | 1회성. 미션트립 기간만 운영, 이후 데이터 1개월 보존 후 삭제 |
| 참가 인원 | 약 200명 / 차량(조) 10대 / 차량당 3~20명 (편차 큼) |
| 기술 스택 | Next.js 14 (App Router) + Supabase + Tailwind CSS + shadcn/ui + Vercel |

### 1.1 체크인 발생 상황 (2박 3일 예시)

| 일차 | 상황 | 이동 수단 |
|---|---|---|
| 1일차 | 김포공항 탑승 게이트 집결 | 비행기 |
| 1일차 | 제주공항 도착 인원 확인 | 비행기 |
| 1일차 | 숙소 체크인 | 버스 |
| 2일차 | 버스 탑승 (서귀포 이동) | 버스 |
| 2일차 | 점심 식당 집결 | 도보 |
| 3일차 | 제주공항 출발 집결 | 버스 |
| 수시 | 우천 등 돌발 상황 발생 시 관리자가 즉석 일정 추가 | — |

### 1.2 사용자 역할

| 역할 | 인원 | 핵심 행동 | 앱 사용 |
|---|---|---|---|
| 조장 | 18명 | 조원 카드 탭탭탭으로 체크인 처리, 최종 보고 | 필수 |
| 총괄 관리자 | 1~2명 | 일정 활성화, 전체 현황 모니터링 | 필수 |
| 참가자 (조원) | 약 180명 | 앱 사용 없음 — 조장이 대신 체크인 | 없음 |

---

## 2. 인증 설계 (Google OAuth)

### 2.1 Supabase 설정

- Supabase Dashboard → Authentication → Providers → Google 활성화
- Google Cloud Console에서 OAuth 2.0 클라이언트 ID 생성
- 승인된 리디렉션 URI: `https://{supabase-project}.supabase.co/auth/v1/callback`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`을 Supabase에 등록

### 2.2 도메인 제한 (회사 계정 외 차단)

```typescript
// middleware.ts
const ALLOWED_DOMAIN = '@linkagelab.co.kr'

if (!user.email?.endsWith(ALLOWED_DOMAIN)) {
  await supabase.auth.signOut()
  redirect('/login?error=unauthorized')
}
```

### 2.3 로그인 흐름

| 단계 | 동작 | 구현 위치 |
|---|---|---|
| 1 | [Google로 계속하기] 버튼 탭 | /login 페이지 |
| 2 | Supabase OAuth → 구글 계정 선택 | Supabase Auth 처리 |
| 3 | 콜백 수신 → 이메일 도메인 검증 | middleware.ts |
| 4 | Users 테이블에서 email로 사용자 조회 | 서버 컴포넌트 |
| 5a | 조회 성공 → role에 따라 라우팅 | leader→/group, admin→/admin, member→/no-access |
| 5b | 조회 실패 → 안내 화면 | /login?error=not-registered |

> 미등록 이메일: '등록되지 않은 계정이에요. 담당자에게 문의해주세요.' 안내 화면 표시. 별도 회원가입 플로우 없음.

### 2.4 사전 준비 — Google Sheets 기반 셋업 (`/setup`)

> Supabase Dashboard 수동 입력 대신, `/setup` 페이지에서 Google Sheets 데이터를 일괄 동기화한다.
> 조 이름 → UUID 매핑을 시스템이 자동 처리하므로 사람이 UUID를 다룰 일이 없다.

**Google Sheets 구조 (2개 시트):**

> 조구성 시트는 삭제. 참가자 시트의 "소속조" 컬럼에서 고유값을 자동 추출하여 Groups를 생성한다.
> 이메일 컬럼도 삭제. 역할에 따라 시스템이 자동 생성한다.

| 시트명 | 컬럼 | 예시 |
|---|---|---|
| 참가자 | 이름, 전화번호, 역할(조원/조장/관리자), 소속조, 배정차량 | 홍길동, 010-1234-5678, 조장, A조, 1호차 |
| 일정 | 일차, 순서, 일정명, 장소, 예정시각 | 1, 1, 김포공항 탑승 게이트 집결, 국내선 3번 게이트, 08:30 |

**이메일 자동 생성 규칙:**
- 조장/관리자 → `{이름}@linkagelab.co.kr` (LDAP 계정명 = 이름 컬럼)
- 조원 → `_member.{이름}.{행번호}@nologin.internal` (로그인 불필요, 식별용 placeholder)
- 조장/관리자 이메일 중복 시 검증 오류 (동명이인 대응 필요)

**조(Groups) 자동 추출:**
- 참가자 시트의 "소속조" 컬럼 고유값 → `Groups` 테이블 자동 INSERT
- "배정차량" 컬럼이 있으면 해당 값을 `bus_name`으로 사용 (한 차량에 여러 조 매핑 가능)
- "배정차량" 컬럼이 비어있으면 소속조 이름을 `bus_name`으로 사용 (기존 동작과 동일)

**동기화 흐름:**

1. 관리자가 `/setup`에서 Google Sheet URL 입력 + GID 2개 (참가자, 일정) (또는 CSV 파일 2개 업로드)
2. 시스템이 2개 시트 데이터를 파싱 + 검증 (역할값, 이름 필수, 소속조 필수, 조장 이메일 중복, 조당 조장 존재)
3. 미리보기 화면에서 데이터 확인 → [DB에 반영] 버튼
4. Groups → Users → Schedules 순서로 UPSERT
5. 결과 요약 표시 (조 N개, 참가자 N명, 일정 N개)

**Google Sheets 읽기 방식:**
- 시트를 "링크가 있는 모든 사용자에게 공개 (뷰어)" 설정
- CSV export URL로 서버에서 fetch: `https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={GID}`
- 클라이언트에서 Sheet ID만 입력하면 Server Action에서 시트별 CSV 다운로드 → 파싱

**재동기화 지원:**
- 출발 전 참가자 변경 시 재실행 가능
- UPSERT로 처리: 신규 → INSERT, 기존 → UPDATE (`onConflict: "email"` / `"name"` / `"day_number,sort_order"`)

---

## 3. 데이터베이스 스키마 (Supabase)

### 3.1 Groups 테이블

| 컬럼명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | 조 고유 ID |
| name | text | NOT NULL | 조 이름 (예: 1조) |
| bus_name | text | nullable | 배정 차량 (예: 1호차) |
| created_at | timestamptz | default now() | 생성 시각 |

### 3.2 Users 테이블

| 컬럼명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | 사용자 고유 ID |
| name | text | NOT NULL | 참가자 이름 |
| email | text | UNIQUE, NOT NULL | 회사 구글 계정 이메일 (로그인 키) |
| phone | text | nullable | 전화번호 (비상연락용, 예: 010-1234-5678) |
| role | text | CHECK IN ('member','leader','admin','admin_leader') | 참가자 / 조장 / 관리자 / 관리자+조장 |
| group_id | uuid | FK → Groups.id, NOT NULL | 소속 조 |
| created_at | timestamptz | default now() | 생성 시각 |

> 비상연락: 이름 + phone + 소속 조. 장애 여부 등 개인 특성 컬럼 없음. (`docs/decisions.md` 참조)

### 3.3 Schedules 테이블

> `is_active` boolean 단독 사용 금지. 아래 DB 제약을 반드시 함께 적용.

| 컬럼명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | 일정 고유 ID |
| title | text | NOT NULL | 일정명 (예: 제주공항 도착 확인) |
| location | text | nullable | 장소 (예: 1층 출구 앞) |
| day_number | int | NOT NULL, CHECK (day_number >= 1) | 일차 구분 (1, 2, 3) |
| sort_order | int | NOT NULL | 같은 day 내 표시 순서 |
| scheduled_time | timestamptz | nullable | 예정 시각 (관리자가 실시간 변경 가능) |
| is_active | boolean | default false, NOT NULL | 현재 진행 중 여부 |
| activated_at | timestamptz | nullable | 활성화 시각 (로그용) |
| created_at | timestamptz | default now() | 생성 시각 |

**필수 DB 제약:**

```sql
CREATE UNIQUE INDEX idx_one_active_schedule
  ON schedules (is_active)
  WHERE is_active = true;
```

### 3.4 Check_ins 테이블

| 컬럼명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | 체크인 고유 ID |
| user_id | uuid | FK → Users.id, NOT NULL | 체크인된 사용자 |
| schedule_id | uuid | FK → Schedules.id, NOT NULL | 해당 일정 |
| checked_at | timestamptz | default now() | 체크인 시각 |
| checked_by | text | CHECK IN ('leader','admin') | 조장 / 관리자 |
| checked_by_user_id | uuid | FK → Users.id, nullable | 체크인 처리한 사용자 (조장/관리자 추적) |
| offline_pending | boolean | default false, NOT NULL | 오프라인 미sync 여부 |
| is_absent | boolean | default false, NOT NULL | 불참 처리 여부 (조장·관리자 설정 가능) |

> `is_absent = true`인 체크인은 "불참"으로 표시. 탑승 카운트에서 제외하되 "확인 완료"로 처리하여 전원 완료를 차단하지 않는다.
> 조장은 자기 조원의 불참 처리 가능. 관리자는 전체 인원 불참 처리 가능. 불참 처리된 인원은 조장 카드에 "불참" 텍스트로 표시.

**필수 DB 제약:**

```sql
ALTER TABLE check_ins
  ADD CONSTRAINT unique_checkin UNIQUE (user_id, schedule_id);
```

→ 동일 사용자의 동일 일정 중복 체크인 불가. `ON CONFLICT DO NOTHING`.

### 3.5 Group_reports 테이블 (보고 상태 영속화)

> 보고 상태 DB 영속화. Realtime broadcast 휘발성 보완. (`docs/decisions.md` 참조)

| 컬럼명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | 보고 고유 ID |
| group_id | uuid | FK → Groups.id, NOT NULL | 보고한 조 |
| schedule_id | uuid | FK → Schedules.id, NOT NULL | 해당 일정 |
| reported_by | uuid | FK → Users.id, NOT NULL | 보고한 조장 |
| pending_count | int | NOT NULL, default 0 | 보고 시 미완료 인원 수 |
| reported_at | timestamptz | default now() | 보고 시각 |

**필수 DB 제약:**

```sql
ALTER TABLE group_reports
  ADD CONSTRAINT unique_group_report UNIQUE (group_id, schedule_id);
```

→ 동일 조의 동일 일정 중복 보고 방지. 재보고 시 `ON CONFLICT DO UPDATE`.

### 3.6 일정 상태 판별 로직

> Schedules에 별도 status 컬럼을 추가하지 않는다. 기존 컬럼 조합으로 판별한다.

```typescript
type ScheduleStatus = 'active' | 'completed' | 'waiting'

function getScheduleStatus(schedule: Schedule): ScheduleStatus {
  if (schedule.is_active) return 'active'           // 현재 진행중
  if (schedule.activated_at) return 'completed'      // 활성화된 적 있음 = 완료
  return 'waiting'                                   // 한 번도 활성화 안 됨 = 대기
}
```

### 3.7 RLS 정책 (Row Level Security)

> Supabase RLS를 반드시 활성화한다. 아래 정책이 없으면 인증된 사용자 누구나 모든 데이터를 조작할 수 있다.

```sql
-- 모든 테이블 RLS 활성화
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_reports ENABLE ROW LEVEL SECURITY;

-- Groups: 인증된 사용자 읽기 전용
CREATE POLICY "groups_read" ON groups FOR SELECT TO authenticated USING (true);

-- Users: 인증된 사용자 읽기 전용
CREATE POLICY "users_read" ON users FOR SELECT TO authenticated USING (true);

-- Schedules: 읽기 전체, 쓰기 admin만
CREATE POLICY "schedules_read" ON schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "schedules_write" ON schedules FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.email = auth.jwt() ->> 'email' AND users.role IN ('admin', 'admin_leader')
  ));

-- Check_ins: 읽기(같은 조 + admin), 쓰기(leader/admin/admin_leader)
CREATE POLICY "checkins_read" ON check_ins FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM users u1
    JOIN users u2 ON u1.group_id = u2.group_id
    WHERE u1.id = check_ins.user_id AND u2.email = auth.jwt() ->> 'email'
  )
  OR EXISTS (
    SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('admin', 'admin_leader')
  )
);
CREATE POLICY "checkins_insert" ON check_ins FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email'
    AND role IN ('leader', 'admin', 'admin_leader')
  )
);
CREATE POLICY "checkins_delete" ON check_ins FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader')
  )
);

-- Group_reports: leader/admin/admin_leader 읽기·쓰기
CREATE POLICY "reports_read" ON group_reports FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader'))
);
CREATE POLICY "reports_insert" ON group_reports FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader'))
);
CREATE POLICY "reports_update" ON group_reports FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader'))
);
```

### 3.8 RPC 함수

```sql
-- 일정 활성화 (트랜잭션으로 동시 활성화 방지)
CREATE OR REPLACE FUNCTION activate_schedule(target_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE schedules SET is_active = false, activated_at = COALESCE(activated_at, now())
    WHERE is_active = true;
  UPDATE schedules SET is_active = true, activated_at = now()
    WHERE id = target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 오프라인 체크인 일괄 동기화
CREATE OR REPLACE FUNCTION sync_offline_checkins(checkins jsonb)
RETURNS int AS $$
DECLARE
  item jsonb;
  synced int := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(checkins)
  LOOP
    INSERT INTO check_ins (user_id, schedule_id, checked_by, checked_by_user_id, checked_at)
    VALUES (
      (item->>'user_id')::uuid,
      (item->>'schedule_id')::uuid,
      item->>'checked_by',
      (item->>'checked_by_user_id')::uuid,
      (item->>'checked_at')::timestamptz
    )
    ON CONFLICT (user_id, schedule_id) DO NOTHING;
    IF FOUND THEN synced := synced + 1; END IF;
  END LOOP;
  RETURN synced;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.9 환경 변수

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...         # 서버 전용 (setup, admin 작업)
ALLOWED_EMAIL_DOMAIN=@linkagelab.co.kr        # 도메인 제한
NEXT_PUBLIC_TIMEZONE=Asia/Seoul               # 모든 시각 표시 KST 기준
```

> **시간대:** 모든 `scheduled_time`, `checked_at`, `activated_at` 등 시각 데이터는 `Asia/Seoul` (KST) 기준으로 표시한다. DB에는 `timestamptz`(UTC)로 저장하되, UI 표시 시 KST 변환.

> `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회하므로 Server Action/API Route에서만 사용. 클라이언트 노출 금지.

---

## 4. 화면별 기능 명세

### 4.1 로그인 화면 (`/login`)

- 구성: 서비스 로고 + 서비스명 + [Google로 계속하기] 버튼 하나
- 버튼: 구글 공식 가이드라인 준수 (흰 배경, G 로고)
- `error=unauthorized` → '회사 계정(@linkagelab.co.kr)으로만 로그인할 수 있어요'
- `error=not-registered` → '등록되지 않은 계정이에요. 담당자에게 문의해주세요'

---

### 4.2 조장 화면 (`/group`) — 핵심 화면

> 탑승 현장에서 조원 얼굴을 보며 탭탭탭 처리하는 흐름이 최우선이다.
> **피드 드릴다운 구조:** 일정 목록(피드) → 진행중 일정 탭 → 체크인 화면 진입.

#### 4.2.1 일정 피드 (첫 화면)

- **일차 탭:** 상단에 [1일차] [2일차] [3일차] 필터. 활성 일정의 일차가 기본 선택. 다른 일차 탭 전환 시 해당 일차 일정만 표시. 조장은 모든 일차를 **읽기 전용**으로 확인 가능 (활성화/시간수정 불가)
- **카드 정렬:** 진행중 > 대기 > 완료 순. 같은 그룹 내에서는 `sort_order` 유지. 해당 일차의 모든 일정이 완료되면 자연스럽게 원래 타임라인 순서로 복원
- **완료 일정:** dim 처리(`opacity: 0.55`) + 완료/전체 카운트 (예: ✓ 10/10명)
- **진행중 일정:** 노란 테두리(`#FEE500`) 강조 + '진행중' pill + 완료/전체 카운트 → **카드 본문 탭 → 체크인 화면 진입**
- **카드 정보 위계:** 집결장소(location)를 1줄(굵게), 목적지(title)를 2줄(작게) 표시. 장소 없으면 title이 1줄. 조장이 **지금 어디에 있어야 하는지**가 최우선 정보
- **대기 일정:** 일반 표시 (예정 시각 + 장소)
- **빈 상태:** 활성 일정 없을 때 '현재 진행 중인 일정이 없어요' 안내 문구 표시
- **전체 현황 버튼:** **진행중 일정 카드 내부 하단**에 [전체 현황 보기 >] 버튼 배치. 카드 본문 탭 → 체크인 화면, 하단 버튼 탭 → 바텀시트 (Dual-action card 패턴). `e.stopPropagation()`으로 이벤트 버블링 차단. 바텀시트에 현재 활성 일정 기준 전체 조 프로그레스 바 + 상태 배지 표시. **같은 차량(`bus_name`) 조는 시각적으로 묶어 표시.** 드릴다운 없음 — 조장 전용. 완료/대기 카드에는 버튼 미표시
- **오프라인 배너:** 하단 고정 (`position: fixed; bottom: 0`)
- Realtime으로 `schedule_activated`, `schedule_updated` 수신 시 자동 갱신

> 조장은 일정 피드에서 **확인만** 가능. 일정 활성화, 시간 변경 등 조작은 관리자 전용.

#### 4.2.2 체크인 화면 (드릴다운)

진행중 일정을 탭하면 진입하는 화면. [← 뒤로] 버튼으로 일정 피드 복귀.

- **상단 바:** '{조명} 체크인' (h1) + 집결장소 (서브텍스트) + [← 뒤로]. 조장이 어떤 조/어떤 장소에서 체크인 중인지 즉시 파악 가능
- **이니셜 동그라미 행:** 조원 전원 이니셜 원 + 완료/전체 카운트
- **조원 카드 리스트:** 미완료 상단, 완료 하단 자동 정렬. **조장 본인도 카드에 포함** — 조장도 자기 조의 조원이므로 본인 카드를 탭하여 체크인 처리
- **하단 고정:** 보고 버튼
- **일정 전환 알림:** 체크인 화면에서 작업 중 새 일정이 활성화되면 '새로운 일정이 시작되었어요: {일정명}' 토스트 표시 + [일정 피드로 이동] 링크

#### 4.2.3 이니셜 동그라미

- 미완료: 회색 배경 + 회색 점선 테두리
- 완료: 노란(`#FEE500`) 배경 + 우하단 초록 체크 점 (`14px`, `#047857`)

#### 4.2.4 조원 카드 스펙

- 카드 최소 높이: **72px** (KWCAG 2.5.5)
- **미완료:** 흰 배경 + '확인 전' + 빈 원(점선) + [탔어요!] 버튼(`#FEE500`) + [불참] 텍스트 버튼(회색, 44px 터치 영역 확보)
- **완료:** 연초록(`#EAF3DE`) 배경 + 'HH:MM 탑승 완료' + 초록 체크 원 + [취소] 버튼(회색)
- **불참:** 회색(`bg-gray-100`) 배경 + '불참' 텍스트 + [취소] 버튼(회색)
- 완료 카드 하단 자동 이동: `sort((a,b) => Number(a.checked) - Number(b.checked))`

#### 4.2.5 탭탭탭 흐름

- [탔어요!] 탭 → **확인 모달 없이 즉시 INSERT** (현장 속도 우선)
- 완료 카드 [취소] 탭 → '체크인을 취소할까요?' 확인 모달 → DELETE → 미완료 상태로 복귀
- 불참 카드 [취소] 탭 → '불참을 취소할까요?' 확인 모달 → DELETE → 미완료 상태로 복귀

#### 4.2.6 전원 완료 화면

- 미완료 수 `=== 0`이면 축하 화면 전환
- **현재 구현:** '[조명] 전원 탑승 완료!' 텍스트 + 이모지 + [보고하기] 버튼
- **Phase 2:** 컨페티 CSS 애니메이션 + 이니셜 원 `animation-delay` 0.08s 간격 순차 팝인

#### 4.2.7 보고 버튼

- **전원 확인 전 비활성:** 모든 조원이 탑승 또는 불참 처리되기 전까지 `aria-disabled` + 클릭 차단. 버튼 텍스트에 'N명 남았어요'로 비활성 사유 표시. 긴급 상황 소통은 카카오워크 사용
- **전원 확인 후 활성:** 전원 확인 완료 시 즉시 보고 가능 (확인 모달 없이 즉시 전송)
- Realtime `'admin'` 채널로 `{type:'group_reported', group_id, pending_count}` broadcast
- **보고 성공 피드백:** 보고 완료 시 '보고 완료!' 토스트 5초 표시 (`aria-live="polite"`, WCAG 2.2 상태 메시지 충분 읽기 시간)

---

### 4.3 관리자 화면 (`/admin`) — 단일 화면

> 현황과 일정을 하나의 화면에 통합. 제목 헤더 없음 (HTML `<title>`로 접근성 충족). 일반 공지는 카카오워크로 대체.

#### 4.3.1 화면 구조 (위→아래)

- **일차 탭:** [1일차] [2일차] [3일차] 필터. 활성 일정의 일차가 기본 선택
- **일정 카드 목록:** 해당 일차의 일정 카드 표시
- **[+ 일정 추가] 버튼:** 하단 고정. 일정명(필수), 장소(선택), 일차(필수), 예정시각(선택) — 4개 필드

#### 4.3.2 일정 카드

**카드 정렬:** 진행중 > 대기 > 완료 순. 같은 그룹 내에서는 `sort_order` 유지. 해당 일차의 모든 일정이 완료되면 자연스럽게 원래 타임라인 순서로 복원.

**진행중 카드:**
- 노란 테두리(`#FEE500`) 강조 + '진행중' pill
- 카드 내 정보: 일정명 + 장소 + 예정시각
- **카드 내 지표 (배지 아래 우측 정렬):** `N/M조` (font-medium) + `(N/M명)` (muted, 괄호). 조 단위가 관리자 업무 단위, 인원은 보조 정보
- **[전체 현황 보기 >] 버튼:** 카드 하단에 분리된 버튼. 탭하면 바텀시트 열림. 조장 뷰와 동일한 `bg-white/60 rounded-xl` 스타일

**대기 카드:**
- 일반 표시 (예정 시각 + 장소) + [활성화] 버튼
- [활성화] 버튼 탭 → 직접 활성화 (바텀시트 아님)

**완료 카드:**
- dim 처리(`opacity: 0.55`) + 배지 아래 `N/M조 (N/M명)` 지표 (체크 아이콘 포함)
- 완료 요약 영역 탭 → 바텀시트 (과거 현황, 읽기 전용)

#### 4.3.3 바텀시트 — 전체 현황

진행중/완료 카드의 요약 영역 탭 시 열림.

- **차량별 그룹핑:** 조 그리드를 `bus_name`으로 묶어 표시. "1호차" 섹션 아래 해당 차량의 조 카드들을 나열
- 조별 그리드 (2열): 프로그레스 바 + 완료/전체 수 + 상태 배지
- **조 카드에 조장 표시:** 조장 이름 + 전화 아이콘(`<a href="tel:">` + `aria-label="조장에게 전화"`, 44x44px)
- **조 카드 드릴다운:** 조 카드 탭 → 해당 조 전체 인원 목록 (이름 + 역할 + 전화 아이콘 + 체크인 상태). 전원 완료 시 '전원 확인 완료' 표시
- **체크인 대행:** 드릴다운 내 미탑승 인원 옆 [탔어요!] 버튼. 조장 부재 시 TF장이 직접 체크인 처리 가능 (`checked_by='admin'`)
- **불참 처리:** 드릴다운 내 미탑승 인원 옆 [불참] 버튼. 탭 → '불참 처리할까요?' 확인 모달 → `check_ins` INSERT (`is_absent=true, checked_by='admin'`). 불참 인원은 탑승 카운트에서 제외하되 전원 완료를 차단하지 않음
- **조장 권한 부여/회수:** 드릴다운 내 조원 이름 옆 [조장 지정] / [조장 해제] 버튼. 탭 → 확인 모달 → Users 테이블 `role` UPDATE
- **시간 수정:** 바텀시트 상단에 현재 예정시각 표시 + 수정 아이콘. 탭 → 시:분 picker → DB 업데이트 → `schedule_updated` broadcast → '일정 시간이 변경되었어요' 토스트

| 상태 | 배지 | 배경 | 텍스트 | 조건 |
|---|---|---|---|---|
| 보고완료 | 보고완료 | `#EAF3DE` | `#27500A` | 전원 체크인 + 보고 완료 |
| 전원확인 | 전원확인 | `#FEE500` | `#3C1E1E` | 전원 체크인, 보고 미완 |
| 진행중 | 진행중 | `#FEF9C3` | `#633806` | 1명+ 체크인, 미완료 있음 |
| 시작전 | 시작전 | bg-secondary | gray-tertiary | 체크인 0명 |

#### 4.3.4 일정 관리 기능

- **자동 활성화 (관리자 클라이언트 타이머):** 관리자 앱이 열려있는 동안 1분 간격으로 현재 시각과 대기 일정의 `scheduled_time`을 비교. 시각 도래 시 `activateSchedule` Server Action 자동 호출. 앱이 백그라운드였다가 돌아올 때(`visibilitychange` 이벤트) 밀린 활성화를 즉시 처리. 서버 cron 불필요
- **수동 조정:** TF장이 필요시 [활성화] 버튼으로 다른 일정을 수동 활성화 가능. 자동 활성화가 안 됐어도 수동 [활성화]로 언제든 체크인 시작 가능
- **미확인 경고:** 현재 활성 일정에 미확인 인원이 남아있는 상태에서 다른 일정을 활성화하려 하면 '현재 일정에 N명이 미확인 상태예요. 그래도 전환할까요?' 경고 모달 표시. 자동 활성화 시에도 동일 — 미확인 인원 있으면 자동 전환하지 않고 관리자에게 알림 토스트로 판단 요청

---

### 4.4 셋업 화면 (`/setup`) — 개발자/관리자 전용

> admin role만 접근 가능. 출발 전 데이터 초기 셋업 및 검증용.

#### 4.4.1 화면 구성

- **Step 1 — 데이터 소스 선택:**
  - [Google Sheet URL 입력] 텍스트 필드 + [불러오기] 버튼
  - 또는 [CSV 파일 업로드] 버튼 (대안)
- **Step 2 — 미리보기 + 검증:**
  - 2개 탭(참가자 / 일정)으로 파싱된 데이터 표시. 조 목록은 참가자 탭 상단에 자동 추출된 조 요약으로 표시
  - 검증 오류 행은 빨간 하이라이트 + 오류 메시지
  - 요약: 조 N개, 참가자 N명(조장 N, 조원 N, 관리자 N), 일정 N개
- **Step 3 — 반영:**
  - [DB에 반영] 버튼 → 확인 모달 "기존 데이터를 덮어씁니다. 계속할까요?"
  - 진행 상태 표시 (Groups 완료 → Users 완료 → Schedules 완료)
  - 결과: 성공 N건, 실패 N건, 중복 스킵 N건

#### 4.4.2 검증 규칙

| 검증 항목 | 조건 | 오류 메시지 |
|---|---|---|
| 이름 필수 | 이름 컬럼 비어있지 않음 | 이름이 없어요 |
| 역할값 | 조원/조장/관리자 중 하나 | 역할은 조원/조장/관리자만 가능해요 |
| 소속조 필수 | 소속조 컬럼 비어있지 않음 | 소속조가 없어요 |
| 조장/관리자 이메일 중복 | 자동 생성된 이메일 중복 없음 | {이메일} 이메일이 중복되어 있어요 |
| 조장 수 | 조당 최소 1명 | {조이름}에 조장이 없어요 |
| 일차 범위 | 1~3 | 일차는 1~3만 가능해요 |
| 일정명 필수 | 일정명 비어있지 않음 | 일정명이 없어요 |

#### 4.4.3 데이터 리셋

- [전체 데이터 초기화] 버튼 (하단, 빨간 텍스트)
- 확인 모달: "모든 체크인, 보고, 참가자 데이터가 삭제됩니다"
- check_ins → group_reports → users → schedules → groups 순서로 삭제 (FK 순서)

---

## 5. 실시간 동기화 (Supabase Realtime)

| 채널 | 이벤트 | 발생 조건 | 수신 대상 | 반응 |
|---|---|---|---|---|
| `global` | `schedule_activated` | 관리자 일정 활성화 | 전체 | 일정명 갱신 + 토스트 |
| `global` | `schedule_updated` | 관리자 일정 시간 변경 | 전체 | 예정 시각 갱신 + '일정 시간이 변경되었어요' 토스트 |
| `group:{group_id}` | `checkin_updated` | 체크인/취소/불참 처리 | 해당 조장 | 카드 즉시 업데이트 |
| `admin` | `checkin_updated` | 체크인/취소/불참 처리 | 관리자 | 현황 탭 즉시 갱신 |
| `admin` | `group_reported` | 조장 보고 | 관리자 | 배지 '보고완료' 전환 |

---

## 6. 오프라인 대응

- INSERT 실패 → 낙관적 업데이트 + 오프라인 아이콘
- `localStorage 'mtrip_pending'`에 `{user_id, schedule_id, checked_by, checked_at}` 저장
- **보고도 오프라인 큐 포함:** `localStorage 'mtrip_pending_reports'`에 `{group_id, schedule_id, pending_count}` 저장. 온라인 복귀 시 체크인 sync 완료 후 보고 sync 순서로 처리
- 하단 배너: '오프라인 상태예요. N건 저장 중 — 연결되면 자동으로 보낼게요'
- `window.addEventListener('online', sync)` → `INSERT ON CONFLICT DO NOTHING`
- 활성 일정: `localStorage 'mtrip_active_schedule'`에 캐싱

---

## 7. 접근성 (KWCAG 2.2)

| KWCAG | 항목 | 구현 |
|---|---|---|
| 1.1.1 | 비텍스트 콘텐츠 | `aria-label` 또는 텍스트 레이블 병기 |
| 1.3.3 | 감각적 특성 | 색상+텍스트+아이콘 3중 표시 |
| 1.4.3 | 명도 대비 | 4.5:1 이상 |
| 1.4.4 | 텍스트 크기 | rem 단위, 200% 확대 유지 |
| 2.4.3 | 포커스 순서 | DOM = 시각적 순서 |
| 2.5.5 | 타겟 크기 | 최소 44x44px, 카드 72px |
| 3.3.1 | 오류 식별 | 원인 텍스트 명확 표시 |
| 4.1.3 | 상태 메시지 | `aria-live='polite'` |

---

## 8. UX 톤 가이드

> **밝고 따뜻한 분위기 (카카오 스타일).** 업무 도구가 아닌 함께하는 여행의 일부.

### 컬러 시스템

| 용도 | 컬러값 | 사용처 |
|---|---|---|
| 메인 액션 | `#FEE500` | [탔어요!], 보고 버튼, 관리자 헤더 |
| 완료 카드 | `#EAF3DE` | 완료 조원 카드 배경 |
| 완료 체크 | `#047857` | 체크 원, 이니셜 완료 점 |
| 오프라인 | `#F1EFE8` | 하단 오프라인 배너 |
| 진행중 배지 | `#FED7AA` | 진행중 배지 배경 |
| 앱 배경 | `#F5F3EF` | 전체 화면 배경 |

### UI 문구

| 상황 | 문구 |
|---|---|
| 미완료 | 확인 전 |
| 완료 | HH:MM 탑승 완료 |
| 체크인 버튼 | 왔수다! |
| 전체 카운트 | N / M명 탑승 완료 |
| 전원 완료 | [조명] 전원 탑승 완료! |
| 보고 (완료) | 우리 조 다 왔수다! 보고하기 |
| 보고 (미완료) | N명 남았어요 |
| 불참 | 불참 |
| 보고 성공 | 보고 완료! |
| 일정 전환 알림 | 새로운 일정이 시작되었어요: {일정명} |
| 미확인 경고 | 현재 일정에 N명이 미확인 상태예요. 그래도 전환할까요? |
| 빈 상태 | 현재 진행 중인 일정이 없어요 |
| 전체 인원 요약 | 전체 N/M명 확인 |
| 불참 취소 | 불참을 취소할까요? |
| 오프라인 | 오프라인 상태예요. N건 저장 중 — 연결되면 자동으로 보낼게요 |

---

## 9. API 레이어 설계 (Server Actions)

> 모든 DB 쓰기 작업은 Server Action을 경유한다. 클라이언트에서 Supabase 직접 INSERT/UPDATE/DELETE 금지.
> Realtime broadcast만 클라이언트에서 직접 수행 (읽기 전용 구독 + 메시지 전송).

### 9.1 Server Actions 목록

```
src/actions/
├── checkin.ts        # 체크인 CRUD
├── schedule.ts       # 일정 활성화/추가
├── report.ts         # 조장 보고
└── setup.ts          # Google Sheets 동기화, 데이터 리셋
```

| Action | 함수명 | 권한 | 설명 |
|---|---|---|---|
| checkin.ts | `createCheckin(userId, scheduleId)` | leader, admin | 체크인 INSERT + broadcast |
| checkin.ts | `deleteCheckin(userId, scheduleId)` | leader, admin | 체크인 취소 DELETE + broadcast |
| checkin.ts | `syncOfflineCheckins(checkins[])` | leader | RPC `sync_offline_checkins` 호출 |
| schedule.ts | `activateSchedule(scheduleId)` | admin | RPC `activate_schedule` + broadcast |
| schedule.ts | `createSchedule(title, location, dayNumber, scheduledTime?)` | admin | 즉흥 일정 INSERT |
| schedule.ts | `updateScheduleTime(scheduleId, scheduledTime)` | admin | 예정 시각 변경 + broadcast |
| report.ts | `submitReport(groupId, scheduleId, pendingCount)` | leader | group_reports UPSERT + broadcast |
| setup.ts | `previewFromGoogleSheet(sheetId, gids)` | admin | 2개 시트(참가자, 일정) CSV fetch → 파싱 → 검증 → 미리보기 |
| setup.ts | `previewFromCsv(usersCsv, schedulesCsv)` | admin | CSV 2개 직접 업로드 → 파싱 → 검증 → 미리보기 |
| setup.ts | `importToDatabase(data)` | admin | 미리보기 데이터 → Groups/Users/Schedules UPSERT |
| checkin.ts | `markAbsent(userId, scheduleId)` | leader, admin | 불참 처리 INSERT (`is_absent=true`) + broadcast. 조장은 자기 조원만 |
| setup.ts | `updateUserRole(userId, newRole)` | admin | 조원↔조장 역할 변경. Users 테이블 `role` UPDATE |
| setup.ts | `resetAllData()` | admin | 전체 데이터 초기화 (FK 역순 삭제) |

### 9.2 핵심 구현 지시

| 항목 | 지시 |
|---|---|
| 구글 OAuth | `signInWithOAuth({ provider: 'google', options: { redirectTo } })` → `/auth/callback` 세션 교환 |
| 도메인 차단 | `middleware.ts`: `email.endsWith(ALLOWED_EMAIL_DOMAIN)` 실패 → signOut + redirect |
| 역할 라우팅 | leader→/group, admin→/admin, admin→/setup 접근 가능. member→/no-access (앱 접근 불가) |
| 카드 스타일 | 완료: `bg-[#EAF3DE]`, 미완료: `bg-white` |
| 카드 정렬 | `sort((a,b) => Number(a.checked) - Number(b.checked))` |
| 체크인 | 확인 모달 없이 즉시 Server Action 호출. 취소만 모달 |
| 중복 방지 | `UNIQUE(user_id, schedule_id)` + `ON CONFLICT DO NOTHING` |
| 일정 활성화 | Server Action → RPC `activate_schedule` → broadcast |
| 보고 영속화 | Server Action → group_reports UPSERT → broadcast |
| 시간 변경 | Server Action → Schedules UPDATE `scheduled_time` → `schedule_updated` broadcast |
| 조 드릴다운 | 조 카드 탭 → 바텀시트: 미확인 인원 이름 + 전화 아이콘(`<a href="tel:">`) 리스트 |
| 불참 처리 | 조장: 미완료 카드 [불참] 버튼 → 확인 모달 → INSERT (`is_absent=true, checked_by='leader'`). 관리자: 드릴다운에서 [불참] → INSERT (`is_absent=true, checked_by='admin'`). 조장은 자기 조원만 가능 |
| 차량 그룹핑 | 현황 탭에서 `bus_name`으로 조 카드를 차량별 섹션으로 묶어 표시 |
| 조장 연락처 | 조 카드에 조장 이름 + 전화 아이콘. 전화 아이콘은 `<a href="tel:">` + `aria-label` |
| 오프라인 보고 | 보고도 `localStorage 'mtrip_pending_reports'`에 큐잉. 온라인 복귀 시 체크인→보고 순서로 sync |
| 시간대 | 모든 시각 표시는 `Asia/Seoul` (KST) 기준. `new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })` |
| 불참 카드 스타일 | 조장 화면에서 불참 인원: 회색 배경 + '불참' 텍스트. 탑승 카운트에서 제외 |

---

## 10. 개발 우선순위

> Phase 0(인프라/셋업)이 선행되어야 Phase 1 개발이 가능하다.

| Phase | 기능 | 우선순위 |
|---|---|---|
| **Phase 0** | Supabase 프로젝트 + 스키마 + RLS + RPC 설정 | 선행 |
| **Phase 0** | Next.js 초기화 + 환경변수 + 인증 미들웨어 | 선행 |
| **Phase 0** | `/setup` — Google Sheets 동기화 + 데이터 검증 + 리셋 | 선행 |
| **Phase 1** | OAuth + 도메인 차단 + 역할 라우팅 | 최고 |
| **Phase 1** | 조장 체크인 (탭탭탭 + 이니셜 + 완료카드) | 최고 |
| **Phase 1** | 보고 (group_reports 영속화) | 최고 |
| **Phase 1** | 관리자 2탭 (현황/일정) + 조장 권한 부여/회수 + 체크인 대행 | 최고 |
| **Phase 1** | 일정 자동 활성화 + 수동 조정 + 즉흥 추가 | 최고 |
| **Phase 1** | Realtime 동기화 | 최고 |
| **Phase 1** | 오프라인 대응 | 최고 |
| Phase 2 | 전원 완료 축하 애니메이션 (컨페티 CSS + 이니셜 팝인) | 낮음 |
| Phase 2 | CSV 다운로드 (체크인 기록 내보내기) | 낮음 |
