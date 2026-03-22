import { redirect } from "next/navigation";

// 조원 셀프 체크인 기능 미제공 — /no-access로 리다이렉트
export default function CheckinPage() {
  redirect("/no-access");
}
