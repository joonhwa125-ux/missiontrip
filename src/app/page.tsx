import { redirect } from "next/navigation";

// 루트 접속 → 미들웨어에서 역할별 홈으로 리다이렉트
// 미들웨어를 통과한 경우 (인증 완료) → 기본 /group으로 이동
export default function HomePage() {
  redirect("/group");
}
