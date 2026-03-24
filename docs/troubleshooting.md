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

`requireEnv()` 패턴은 서버 전용 파일(`server.ts`)에만 적용한다.
클라이언트 파일(`client.ts`)은 리터럴 접근을 유지하고, 주석으로 이유를 명시한다.

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

// server.ts — 서버 전용 (requireEnv 적용 가능)
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`환경 변수 ${key}가 없어요.`);
  return val;
}
```

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
