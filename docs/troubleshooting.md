# Troubleshooting Log

> 개발 중 겪은 시행착오와 해결 과정을 기록한다.
> 향후 유사 문제 발생 시 빠른 진단과 해결을 위한 참고 자료.

---

## TSG-001: Google OAuth 로그인 후 세션 유지 실패 (로그인 루프)

**일시:** 2026-03-22
**심각도:** Critical — 로그인 자체가 불가능
**영향 범위:** 전체 사용자

### 증상

1. `/login`에서 [Google로 계속하기] 클릭
2. Google 계정 선택 → OAuth 성공
3. `/auth/callback`으로 리다이렉트 → 코드 교환 성공
4. `middleware.ts`에서 세션을 인식하지 못함
5. 다시 `/login`으로 리다이렉트 → **무한 루프**

### 근본 원인

Supabase SSR의 `@supabase/ssr` 패키지는 쿠키 기반 세션을 사용한다.
`/auth/callback` Route Handler에서 `exchangeCodeForSession()` 호출 시,
Supabase가 내부적으로 `setAll()`을 호출하여 세션 토큰을 쿠키에 저장한다.

**문제:** 초기 구현에서 `setAll()`이 request 객체의 쿠키만 수정하고,
최종 응답(response)의 쿠키에는 반영하지 않았다.
브라우저가 받는 redirect 응답에 `Set-Cookie` 헤더가 누락되어
다음 요청에서 세션 쿠키가 전달되지 않았다.

```
[브라우저] → /auth/callback
  → exchangeCodeForSession() 성공
  → setAll()이 request.cookies에만 저장 (response에는 미반영)
  → redirect 응답에 Set-Cookie 헤더 없음
[브라우저] → / (세션 쿠키 없음)
  → middleware: user = null → /login 리다이렉트
```

### 해결

`NextResponse.redirect()`를 먼저 생성하고,
`setAll()`에서 해당 response 객체의 쿠키에 직접 설정한다.

```typescript
// auth/callback/route.ts — 수정 후 (정상 동작)
const response = NextResponse.redirect(redirectUrl);

const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      getAll() {
        // request에서 기존 쿠키 읽기
        return request.headers
          .get("cookie")
          ?.split(";")
          .map((c) => {
            const [name, ...rest] = c.trim().split("=");
            return { name, value: rest.join("=") };
          })
          .filter((c) => c.name) ?? [];
      },
      setAll(cookiesToSet) {
        // response 객체에 직접 쿠키 설정 → 브라우저에 전달됨
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  }
);
```

### 교훈

- Supabase SSR Route Handler에서는 **반드시 최종 응답 객체에 쿠키를 설정**해야 한다
- middleware.ts의 `updateSession()`은 `NextResponse.next()`를 사용하므로 문제없지만,
  Route Handler에서 `NextResponse.redirect()`를 쓸 때는 별도 처리가 필요하다
- Supabase 공식 문서의 Route Handler 예제를 항상 참고할 것:
  https://supabase.com/docs/guides/auth/server-side/nextjs

### 진단 체크리스트 (재발 시)

- [ ] `/auth/callback`에서 `exchangeCodeForSession()` 에러 여부 확인
- [ ] 브라우저 DevTools → Network → callback 응답의 `Set-Cookie` 헤더 존재 여부
- [ ] middleware에서 `getUser()` 반환값 확인
- [ ] Supabase Dashboard → Authentication → Logs에서 세션 생성 여부

---

## TSG-002: Vercel Production 브랜치 불일치로 배포 미반영

**일시:** 2026-03-22
**심각도:** Medium — 코드 push 후 프로덕션에 반영 안 됨
**영향 범위:** 전체 배포

### 증상

1. `master` 브랜치에 push
2. Vercel Deployments에서 빌드 완료 표시
3. 사이트 접속 시 이전 코드 그대로 — 변경사항 미반영
4. 강제 새로고침(Ctrl+Shift+R)해도 동일

### 근본 원인

- Git 기본 브랜치를 `master`로 통일했지만, **Vercel Production 브랜치는 `main`**으로 설정되어 있었음
- `master`로 push하면 Vercel에서 **Preview** 배포만 생성
- 프로덕션 도메인은 여전히 `main` 브랜치의 마지막 배포를 서빙

### 해결

- Vercel Dashboard → Settings → Environments → Production 클릭
- Branch Tracking을 `main` → `master`로 변경 후 Save
- 빈 커밋 push로 새 Production 배포 트리거

### 교훈

- Git 브랜치와 Vercel Production 브랜치는 **별개 설정**. 한쪽만 바꾸면 불일치 발생
- Vercel Deployments 목록에서 **Production vs Preview 라벨**을 반드시 확인
- 배포 후 반영이 안 되면 첫 번째로 브랜치 설정을 의심할 것

### 진단 체크리스트

- [ ] Vercel Dashboard → Deployments에서 최신 커밋이 "Production"인지 "Preview"인지 확인
- [ ] Settings → Environments → Production의 Branch Tracking이 올바른 브랜치인지 확인
- [ ] `git branch -a`로 로컬/리모트 브랜치 상태 확인

---

## TSG-003: Next.js NEXT_PUBLIC_* 환경변수 동적 접근 불가 (브라우저 번들)

**일시:** 2026-03-24
**심각도:** High — 클라이언트 측 Supabase 초기화 실패
**영향 범위:** 브라우저에서 실행되는 모든 클라이언트 컴포넌트

### 증상

`lib/supabase/client.ts`에 `requireEnv(key: string)` 헬퍼를 추가하고
`process.env.NEXT_PUBLIC_SUPABASE_URL!` → `requireEnv("NEXT_PUBLIC_SUPABASE_URL")`로 변경 후
브라우저에서 "환경 변수 NEXT_PUBLIC_SUPABASE_URL이 없어요" 에러 발생.

### 근본 원인

Next.js는 빌드 시 `NEXT_PUBLIC_*` 환경변수를 **리터럴 문자열로 정적 치환**한다.

```
// 소스 코드
process.env.NEXT_PUBLIC_SUPABASE_URL

// 브라우저 번들로 변환 후
"https://xxxxx.supabase.co"  ← 값이 직접 inlining됨
```

**동적 키 접근 `process.env[key]`는 이 치환 대상이 아니다.**
브라우저 번들에는 원본 `process.env` 객체가 없으므로 `process.env["NEXT_PUBLIC_SUPABASE_URL"]`은 `undefined`를 반환한다.

```
환경   │ process.env[key]  │ process.env.NEXT_PUBLIC_*
───────┼───────────────────┼──────────────────────────
서버   │ ✅ 작동           │ ✅ 작동
브라우저│ ❌ undefined      │ ✅ 빌드 시 정적 치환됨
```

### 해결

`client.ts`는 리터럴 접근을 유지하고, 주석으로 이유를 명시한다.

```typescript
// client.ts — 브라우저 전용
// NEXT_PUBLIC_* 환경변수는 Next.js가 빌드 시 정적 치환하므로
// 반드시 리터럴로 참조해야 함 (동적 접근 process.env[key] 불가)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

> ⚠️ **주의:** 이 1차 해결에서 "server.ts에는 requireEnv 적용 가능"이라 결론 내렸으나 이는 잘못된 판단이었다.
> server.ts에 동일하게 적용하자 에러가 재발했다 → TSG-004 참조.

### 교훈

- **`NEXT_PUBLIC_*` 환경변수는 어느 파일에서든 리터럴 접근만 사용한다** — `server.ts`도 예외 없음
- 서버 전용 변수(`SUPABASE_SERVICE_ROLE_KEY` 등 `NEXT_PUBLIC_` 접두사 없는 것)만 `requireServerEnv()` 동적 접근 허용
- `middleware.ts`가 리터럴 접근을 쓰는 것도 같은 이유 — 이 패턴을 전체 코드베이스에서 일관되게 유지한다
- 새로운 유틸 함수를 여러 파일에 적용할 때, 각 파일의 실행 환경 차이를 개별 검토한다

### 진단 체크리스트

- [ ] `NEXT_PUBLIC_*` 변수를 동적 키로 접근하고 있지 않은지 확인: `grep "process.env\[" src/`
- [ ] `process.env.NEXT_PUBLIC_FOO` (리터럴 ✅) vs `process.env["NEXT_PUBLIC_FOO"]` (동적 ❌)
- [ ] 에러 발생 파일이 `"use client"` 또는 브라우저 API(`window`, `navigator`)를 사용하는지 확인
- [ ] Next.js 공식 문서 [Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables) 참고

---

## TSG-004: server.ts에 requireEnv() 적용 후 동일 에러 재발 (패턴 일반화 오류)

**일시:** 2026-03-24
**심각도:** High — Vercel 배포 후 브라우저 콘솔에 에러 지속
**영향 범위:** 인증이 필요한 모든 페이지 (SSR 실패)
**선행 이슈:** TSG-003

### 증상

TSG-003 해결 후 "server.ts는 서버 전용이니 requireEnv() 적용 가능"이라 판단하여
`server.ts`의 `NEXT_PUBLIC_SUPABASE_URL` 접근도 동적 키 방식으로 변경.
Vercel에 배포하자 동일한 에러 재발:

```
Error: 환경 변수 NEXT_PUBLIC_SUPABASE_URL가 없어요. .env.local을 확인해주세요.
  at a (117-b98045fc74f10635.js:1)
  at y (page-8481b78082139a44.js:1:5593)
  at rE (fd9d1056-be5dff4774564a1e.js:1:40341)
```

Vercel 환경변수 미설정이 원인이라 판단 → 변수 설정 확인 → 이미 설정되어 있음.
Redeploy 시도 → 에러 지속.

### 근본 원인

TSG-003의 결론이 불완전했다.
"동적 접근은 클라이언트 번들에서만 문제"라는 가정이 틀렸다.

**실제 메커니즘:**

Next.js는 `NEXT_PUBLIC_*` 변수를 **빌드 시 정적 치환**한다. 이 치환은 리터럴 접근에만 적용된다.
`server.ts`가 서버 전용 파일이라도 해당 코드가 클라이언트 번들에 포함될 수 있는
경로가 존재하며, 그 경우 동적 접근 `process.env[key]`는 `undefined`를 반환한다.

```
스택 트레이스 분석:
117-b98045fc74f10635.js   ← requireEnv() 함수 (공유 청크에 포함됨)
640-78a22547ba94a830.js   ← createClient() 호출
page-8481b78082139a44.js  ← 페이지 컴포넌트 (클라이언트 번들)
fd9d1056-...              ← React 런타임 (renderWithHooks 등)
```

`server.ts`의 `requireEnv`가 공유 청크(`117-...`)에 포함되어
React가 클라이언트 렌더링 중 이를 호출 → `process.env["NEXT_PUBLIC_SUPABASE_URL"]`
→ `undefined` → 에러 throw.

**근본 실수: 패턴 일반화 오류**

```typescript
// ❌ "서버 파일이니 괜찮겠지"라는 잘못된 가정
// server.ts
function requireEnv(key: string): string {
  return process.env[key];  // NEXT_PUBLIC_*에도 동적 접근
}
requireEnv("NEXT_PUBLIC_SUPABASE_URL")  // 클라이언트 번들 포함 시 undefined
requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
```

기존 `middleware.ts`가 이미 리터럴 접근을 쓰고 있었다.
이유를 파악하지 않고 `requireEnv()` 패턴을 일괄 적용한 것이 실수였다.

### 해결

`NEXT_PUBLIC_*`는 `server.ts`에서도 리터럴 접근으로 변경.
서버 전용 변수(`SUPABASE_SERVICE_ROLE_KEY`)만 동적 접근 유지.

```typescript
// server.ts — 최종 올바른 구현
// NEXT_PUBLIC_* → 리터럴 접근 (middleware.ts와 동일)
// SUPABASE_SERVICE_ROLE_KEY → requireServerEnv() 동적 접근 (서버 전용)
function requireServerEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`서버 환경 변수 ${key}가 없어요.`);
  return val;
}

export function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,     // ✅ 리터럴
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // ✅ 리터럴
    { ... }
  );
}

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,      // ✅ 리터럴
    requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"), // ✅ 서버 전용만 동적
    { ... }
  );
}
```

### 교훈

- **`NEXT_PUBLIC_*` 환경변수는 서버 파일 포함 전체 코드베이스에서 리터럴 접근만 사용한다**
- "서버 파일이니 괜찮겠지"는 틀린 가정 — Next.js 번들러는 서버/클라이언트 경계를 예측하기 어렵다
- 기존 패턴(`middleware.ts`의 리터럴 접근)에는 이유가 있다 — 새 패턴 도입 전 기존 코드의 의도를 먼저 파악한다
- **"Vercel 환경변수가 없어서"라는 1차 진단이 틀렸다** — 에러 메시지만 보고 인프라 문제로 단정하지 않는다

### 진단 체크리스트

- [ ] `process.env[` 패턴이 `NEXT_PUBLIC_*` 변수에 사용되고 있지 않은지 전체 검색
- [ ] Vercel 환경변수가 실제로 설정되어 있는지 확인하기 전에 먼저 코드를 검토한다
- [ ] 에러 스택 트레이스의 파일명이 `.js` 해시 형태면 클라이언트 번들 포함 가능성 확인
- [ ] 기존 코드에서 동일 케이스를 어떻게 처리했는지 참고한다 (`middleware.ts` 패턴)

---

## TSG-005: 보고 완료 후 체크인 취소→재체크인 시 자동 보고완료 (이중 상태 동기화 실패)

**일시:** 2026-03-27
**심각도:** High — 수동 보고 없이 "보고 완료!" 표시 (안전 시스템 무결성 훼손)
**영향 범위:** 조장 화면 (`/group`) 보고 흐름
**수정 횟수:** 5회 (4회 실패 후 5회차에 근본 해결)

### 증상

1. 체크인 뷰에서 전원 체크인 완료 → [보고하기] 탭 → "보고 완료!" 표시
2. 한 명의 체크인 [취소] → 미완료 상태로 복귀
3. 다시 [왔수다!] 탭 → 전원 완료
4. [← 뒤로]로 피드 복귀 → 체크인 뷰 재진입
5. **보고 버튼을 누르지 않았는데 "보고 완료!" 가 자동 표시됨**

### 근본 원인

`reported` 상태가 **부모(GroupView)**와 **자식(GroupCheckinView)** 양쪽에 각각 `useState`로 존재하는 **이중 상태(dual state)** 패턴이었다.

```
GroupView:        const [reported, setReported] = useState(...)
                           ↓ initialReported={reported}
GroupCheckinView: const [reported, setReported] = useState(initialReported)
```

`useState(initialReported)`는 **마운트 시점에만 초기값을 읽는다.** 이후 부모의 `reported`가 바뀌어도 자식의 로컬 `reported`는 자동 갱신되지 않는다. 자식이 언마운트→리마운트될 때 부모 상태의 타이밍에 따라 stale 값이 전달될 수 있다.

추가 악화 요인:
- **Supabase Realtime self-echo:** `CHANNEL_GLOBAL`이 `self: true`로 구성되어, 자신이 보낸 `group_reported` broadcast가 자신에게 다시 도달 → `allReportsState`에 재삽입
- **`allReportsState` 미정리:** 체크인 취소 시 `reported`는 리셋했지만 피드 배지용 `allReportsState`는 정리하지 않음 → 피드에서 "보고완료" 배지 유지

### 실패한 수정 시도들

| # | 접근 | 왜 실패했는가 |
|---|------|--------------|
| 1 | `reported = initialReported && allComplete` (파생값) | 전원 재체크인 시 DB 보고 이력(`initialReported=true`) + `allComplete=true` → 자동 보고완료 |
| 2 | 세션 기반 초기화 + `if (!checkinComplete) setReported(false)` effect | 부모→자식 단방향만 동기화. `allReportsState` 미정리 → 피드 배지 stale |
| 3 | `allReportsState` 정리 effect 추가 | 피드 배지는 해결. 하지만 자식 로컬 `reported`는 여전히 독립 상태 → 자식 리마운트 시 동기화 실패 |
| 4 | C-1 sync useEffect + W-3 self-echo 필터 + W-2 ref 동등성 가드 | 새 edge case(타이밍, 배칭, 리마운트 순서)에서 여전히 빈틈 발생 |

**4회 모두 같은 실수를 반복했다:** 이중 상태를 유지한 채 effect/ref/콜백으로 동기화를 시도. 동기화 대상이 2개이므로 타이밍·마운트·배칭에 따라 항상 새로운 빈틈이 발생한다.

### 해결 (5회차 — 근본 수정)

**Controlled component 패턴으로 전환.** 자식의 `useState` 자체를 제거하고 부모의 상태를 prop으로 직접 사용.

```
수정 전 (uncontrolled — 동기화 필요):
  GroupView:        const [reported] = useState(...)
                             ↓ initialReported={reported}
  GroupCheckinView: const [reported] = useState(initialReported)  ← 독립 복사본

수정 후 (controlled — 동기화 불필요):
  GroupView:        const [reported] = useState(...)  ← 단일 소유
                             ↓ reported={reported}
  GroupCheckinView: props.reported 직접 사용           ← 상태 없음
```

**GroupCheckinView 변경:**
- `useState(initialReported)` + sync `useEffect` 완전 삭제
- Props: `initialReported?: boolean` → `reported: boolean`
- `onReportReset: () => void` 콜백 추가 (체크인 취소 시 부모에게 리셋 요청)
- `setReported(true/false)` → `onReported()` / `onReportReset()` 콜백 호출로 교체

**GroupView 변경:**
- `handleReportReset` 콜백 추가: `reported=false` + `allReportsState` 정리 + `reportInvalidatedRef=true`를 일괄 처리
- Props: `initialReported` → `reported`, `onReportReset` 추가

**AdminView 변경 (동일 패턴 적용):**
- `sheetReported`를 `reportsMap`에서 `useMemo`로 파생 (별도 `useState` 없음)
- `handleSheetReportReset` 콜백 추가

### 교훈

1. **부모-자식 간 동일 의미의 상태를 양쪽에 `useState`로 두지 않는다.** `useState(props.X)`는 초기값만 읽으므로, props 변경에 반응하지 않는 "숨은 복사본"이 된다
2. **effect로 두 개의 독립 상태를 동기화하는 것은 본질적으로 불안정하다.** 타이밍, 배칭, 마운트/언마운트 순서에 따라 항상 새로운 edge case가 발생한다
3. **한 번의 실패 후에는 "같은 구조에서 다른 effect 추가"가 아니라 "구조 자체를 바꿔야 하는지" 먼저 판단한다.** 이 사례에서는 2회차에서 이미 구조 변경(controlled prop)으로 전환했어야 했다
4. **`reported`처럼 안전에 직결되는 상태는 단일 소유(single source of truth) 원칙을 엄격히 적용한다.** 편의를 위한 로컬 복사본이 안전 시스템의 무결성을 훼손할 수 있다

### 진단 체크리스트 (유사 패턴 발견 시)

- [ ] `useState(props.X)` 패턴이 있는지 검색: 이것은 props가 바뀌어도 갱신되지 않는 복사본
- [ ] 부모와 자식이 같은 의미의 상태를 각각 `useState`로 갖고 있지 않은지 확인
- [ ] 상태 동기화를 위한 `useEffect`가 2개 이상이면 구조 변경을 고려
- [ ] 안전 관련 상태(`reported`, `checked` 등)는 반드시 단일 컴포넌트에서만 소유

---

## 문서 작성 가이드

### 기록 기준
- 30분 이상 소요된 디버깅
- 원인이 비직관적이었던 문제
- 프레임워크/라이브러리 특성에 의한 문제
- 동일 문제 재발 가능성이 있는 경우

### 형식
각 이슈는 아래 구조를 따른다:
1. **증상** — 무엇이 잘못되었는가 (사실만)
2. **근본 원인** — 왜 발생했는가 (기술적 분석)
3. **해결** — 어떻게 고쳤는가 (코드 포함)
4. **교훈** — 무엇을 배웠는가 (재발 방지)
5. **진단 체크리스트** — 재발 시 빠른 확인 항목
