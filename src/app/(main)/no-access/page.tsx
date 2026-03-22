"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function NoAccessPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-app-bg px-6">
      <p className="mb-6 text-center text-lg font-medium">
        조장이 체크인을 대신 처리하고 있어요.
        <br />
        이 앱은 조장·관리자 전용입니다.
      </p>
      <button
        onClick={handleSignOut}
        className="min-h-11 rounded-xl bg-gray-200 px-6 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring"
      >
        로그아웃
      </button>
    </div>
  );
}
