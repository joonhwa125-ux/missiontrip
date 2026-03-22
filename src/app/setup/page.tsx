import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetupWizard from "@/components/setup/SetupWizard";

export default async function SetupPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  // admin 역할 확인
  const { data: dbUser } = await supabase
    .from("users")
    .select("role")
    .eq("email", user.email)
    .single();

  if (!dbUser || dbUser.role !== "admin") {
    redirect("/login?error=unauthorized");
  }

  return <SetupWizard />;
}
