# 카카오워크 봇 연동 검토 문서

> 일정 활성화 시 조장 TF 톡방에 알림 메시지 푸시

## 목적

관리자가 일정을 활성화하면, 카카오워크 조장 TF 톡방에 자동으로 알림 메시지를 보낸다.
메시지에는 일정명 + 앱 URL이 포함되어, 조장이 바로 체크인 화면에 진입할 수 있다.

## 기술 방식: Incoming Webhook

카카오워크의 **Incoming Webhook**을 사용한다.
별도 OAuth 인증 없이, Webhook URL에 HTTP POST만 하면 메시지가 전송된다.

### 구현 위치

`src/actions/schedule.ts`의 `activateSchedule` Server Action 내부에서,
일정 활성화 성공 후 `fetch()`로 Webhook URL에 POST한다.

### 메시지 예시

```json
{
  "text": "[미션트립] 새 일정이 시작되었어요!\n\n일정: 제주공항 도착 확인\n장소: 1층 출구 앞\n\n체크인 하러 가기: https://counting-star.vercel.app/group"
}
```

### 코드 스케치

```typescript
// src/actions/schedule.ts - activateSchedule 내부
const KAKAOWORK_WEBHOOK_URL = process.env.KAKAOWORK_WEBHOOK_URL;

if (KAKAOWORK_WEBHOOK_URL) {
  try {
    await fetch(KAKAOWORK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[미션트립] 새 일정이 시작되었어요!\n\n일정: ${schedule.title}\n장소: ${schedule.location ?? "미정"}\n\n체크인 하러 가기: ${process.env.NEXT_PUBLIC_APP_URL}/group`,
      }),
    });
  } catch {
    // Webhook 실패해도 일정 활성화는 정상 진행
  }
}
```

### 환경 변수

```env
KAKAOWORK_WEBHOOK_URL=https://api.kakaowork.com/v1/messages/incoming/{webhook_id}
NEXT_PUBLIC_APP_URL=https://counting-star.vercel.app
```

## 카카오워크 권한 요구사항

### 봇/Webhook 생성 가능 권한

| 권한 레벨 | 봇 생성 | Webhook 생성 | 설명 |
|---|---|---|---|
| 슈퍼 관리자 | O | O | 워크스페이스 최고 권한 |
| 관리자 | O | O | 워크스페이스 관리 권한 |
| 봇 개발자 | O | O | 슈퍼 관리자가 지정한 봇 개발 권한 |
| 일반 사용자 | X | X | 봇/Webhook 생성 불가 |

### 필요 조치

1. 카카오워크 **슈퍼 관리자** 또는 **관리자**에게 Incoming Webhook 생성 요청
2. 또는 본인 계정에 **봇 개발자** 권한 부여 요청
3. Webhook 생성 후 발급되는 URL을 환경 변수에 등록

### Webhook 생성 경로

카카오워크 관리자 > 봇 관리 > Incoming Webhook > 새 Webhook 생성 > 대상 톡방 선택

## 구현 난이도

- **매우 낮음** (fetch 1회 호출)
- 기존 `activateSchedule` Server Action에 5~10줄 추가
- Webhook URL만 확보되면 즉시 구현 가능
- 실패 시에도 일정 활성화에 영향 없음 (fire-and-forget)

## 다음 단계

1. 카카오워크 관리자에게 Incoming Webhook URL 발급 요청
2. 발급 후 `.env.local`에 `KAKAOWORK_WEBHOOK_URL` 추가
3. `activateSchedule`에 fetch 로직 추가
4. 테스트 후 Vercel 환경 변수에도 등록
