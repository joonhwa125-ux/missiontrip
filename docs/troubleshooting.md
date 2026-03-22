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

## TSG-002: (템플릿) 다음 이슈 기록용

**일시:**
**심각도:** Low / Medium / High / Critical
**영향 범위:**

### 증상

### 근본 원인

### 해결

### 교훈

### 진단 체크리스트

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
