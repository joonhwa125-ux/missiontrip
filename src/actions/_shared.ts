import { revalidatePath } from "next/cache";

// /admin + /group 캐시 무효화 헬퍼 (체크인·일정·보고 액션 공통)
export function revalidateMainPaths() {
  revalidatePath("/admin");
  revalidatePath("/group");
}

// /admin + /group + /setup 캐시 무효화 헬퍼 (setup 액션 공통)
export function revalidateAllPaths() {
  revalidateMainPaths();
  revalidatePath("/setup");
}
