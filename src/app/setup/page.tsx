import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/constants";

import SetupWizard from "@/components/setup/SetupWizard";
import SetupPageTabs from "@/components/setup/SetupPageTabs";
import CurrentDataView from "@/components/setup/CurrentDataView";
import type {
  Schedule,
  Group,
  UserRole,
  GroupParty,
  ScheduleGroupInfo,
  ScheduleMemberInfo,
} from "@/lib/types";

export const metadata: Metadata = { title: "데이터 관리" };

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
    .select("id, role")
    .eq("email", user.email)
    .single();

  if (!dbUser || !isAdminRole(dbUser.role)) {
    redirect("/login?error=unauthorized");
  }

  // 현재 DB 데이터 조회 (서비스 클라이언트 — RLS 우회)
  const service = createServiceClient();
  const [schedulesRes, usersRes, groupsRes, sgiRes, smiRes] = await Promise.all([
    service.from("schedules").select("id, title, location, day_number, sort_order, scheduled_time, scope, is_active, shuttle_type, airline_leg, activated_at, created_at").order("day_number").order("sort_order"),
    service
      .from("users")
      .select("id, name, email, phone, role, group_id, party, shuttle_bus, return_shuttle_bus, airline, return_airline, trip_role")
      .order("name"),
    service.from("groups").select("id, name, bus_name").order("name"),
    // v2 Phase G: 조 브리핑
    service
      .from("schedule_group_info")
      .select("id, schedule_id, group_id, group_location, note, created_at, updated_at, updated_by"),
    // v2 Phase G: 개인 안내
    service
      .from("schedule_member_info")
      .select("id, schedule_id, user_id, temp_group_id, temp_role, excused_reason, activity, menu, note, caused_by_smi_id, created_at, updated_at, updated_by"),
  ]);

  const schedules = (schedulesRes.data ?? []) as Schedule[];
  const groups = (groupsRes.data ?? []) as Group[];
  const setupUsers = (usersRes.data ?? []) as {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: UserRole;
    group_id: string;
    party: GroupParty | null;
    shuttle_bus: string | null;
    return_shuttle_bus: string | null;
    airline: string | null;
    return_airline: string | null;
    trip_role: string | null;
  }[];
  const groupInfos = (sgiRes.data ?? []) as ScheduleGroupInfo[];
  const memberInfos = (smiRes.data ?? []) as ScheduleMemberInfo[];

  const hasData = schedules.length > 0 || setupUsers.length > 0;

  return (
    <Suspense>
      <SetupPageTabs
        hasData={hasData}
        wizard={<SetupWizard />}
        currentData={
          <CurrentDataView
            schedules={schedules}
            users={setupUsers}
            groups={groups}
            currentUserId={dbUser.id}
            groupInfos={groupInfos}
            memberInfos={memberInfos}
          />
        }
      />
    </Suspense>
  );
}
