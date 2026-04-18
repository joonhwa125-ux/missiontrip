/**
 * v2: 일정별 동적 명단 계산 (server-side only)
 *
 * schedule_member_info에 등록된 조 이동/사전 제외를 반영하여
 * 특정 일정에 대한 특정 조의 실효 명단을 반환한다.
 *
 * ## 호출 기준 (단일 소스)
 * - `src/app/(main)/group/page.tsx` 에서만 호출한다 (서버 컴포넌트).
 * - 클라이언트에서 직접 호출 금지 (RLS 우회를 위해 service client 사용).
 *
 * ## Backward Compatibility
 * - scheduleId가 null이거나 schedule_member_info에 해당 일정 데이터가 없으면
 *   baseMembers를 그대로 반환한다 (v2 이전 동작과 동일).
 *
 * ## 반환 규칙
 * - activeMembers: baseMembers - transferredOut + transferredIn (중복 제거)
 *   (제외 인원은 activeMembers에 **포함**됨 — 체크인 화면에서 "제외" 섹션에 표시)
 * - excusedMembers: excused_reason != null인 멤버만 (activeMembers의 서브셋)
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type {
  GroupMember,
  EffectiveRoster,
  ScheduleMemberInfo,
  Group,
} from "@/lib/types";

export async function getEffectiveRoster(params: {
  scheduleId: string | null;
  groupId: string;
  baseMembers: GroupMember[];
  allGroups: Group[];
}): Promise<EffectiveRoster> {
  const { scheduleId, groupId, baseMembers, allGroups } = params;
  const groupNameMap = new Map<string, string>(allGroups.map((g) => [g.id, g.name]));

  // scheduleId가 없으면 v2 이전 동작으로 즉시 반환
  if (!scheduleId) {
    return {
      activeMembers: baseMembers,
      excusedMembers: [],
      transferredOut: [],
      transferredIn: [],
      memberInfoMap: new Map(),
    };
  }

  const supabase = createServiceClient();

  // 이 일정의 모든 schedule_member_info 레코드
  const { data: smiRows, error } = await supabase
    .from("schedule_member_info")
    .select("id, schedule_id, user_id, temp_group_id, temp_role, excused_reason, activity, menu, note, caused_by_smi_id, created_at, updated_at, updated_by")
    .eq("schedule_id", scheduleId);

  if (error || !smiRows || smiRows.length === 0) {
    // 메타데이터 없으면 v2 이전 동작
    return {
      activeMembers: baseMembers,
      excusedMembers: [],
      transferredOut: [],
      transferredIn: [],
      memberInfoMap: new Map(),
    };
  }

  const smis = smiRows as ScheduleMemberInfo[];
  const memberInfoMap = new Map<string, ScheduleMemberInfo>(
    smis.map((smi) => [smi.user_id, smi])
  );
  const baseMemberIds = new Set(baseMembers.map((m) => m.id));

  // (1) 다른 조로 이동 OUT — baseMembers 중 temp_group_id가 다른 조로 설정된 멤버
  const transferredOutIds = new Set<string>();
  const transferredOut: EffectiveRoster["transferredOut"] = [];
  for (const smi of smis) {
    if (
      smi.temp_group_id &&
      smi.temp_group_id !== groupId &&
      baseMemberIds.has(smi.user_id)
    ) {
      transferredOutIds.add(smi.user_id);
      const base = baseMembers.find((m) => m.id === smi.user_id);
      if (base) {
        transferredOut.push({
          ...base,
          target_group_name: groupNameMap.get(smi.temp_group_id) ?? "다른 조",
        });
      }
    }
  }

  // (2) 다른 조에서 합류 IN — temp_group_id가 이 조로 설정된 비-base 멤버
  const transferredInUserIds = smis
    .filter(
      (smi) =>
        smi.temp_group_id === groupId && !baseMemberIds.has(smi.user_id)
    )
    .map((smi) => smi.user_id);

  let transferredIn: EffectiveRoster["transferredIn"] = [];
  if (transferredInUserIds.length > 0) {
    const { data: transferInUsers } = await supabase
      .from("users")
      .select("id, name, party, airline, return_airline, trip_role, group_id")
      .in("id", transferredInUserIds);

    transferredIn = (transferInUsers ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      party: (u.party as "advance" | "rear" | null) ?? null,
      airline: u.airline ?? null,
      return_airline: u.return_airline ?? null,
      trip_role: u.trip_role ?? null,
      origin_group_name: groupNameMap.get(u.group_id) ?? "다른 조",
    }));
  }

  // (3) 제외 인원 — base 중 excused_reason이 설정된 멤버 (이동 나간 인원 제외)
  //     + transferredIn 중 excused_reason이 설정된 멤버
  const excusedFromBase = baseMembers.filter((m) => {
    if (transferredOutIds.has(m.id)) return false;
    const smi = memberInfoMap.get(m.id);
    return !!smi?.excused_reason;
  });
  const excusedFromTransferIn: GroupMember[] = transferredIn
    .filter((t) => !!memberInfoMap.get(t.id)?.excused_reason)
    .map((t) => ({
      id: t.id,
      name: t.name,
      party: t.party,
      airline: t.airline,
      return_airline: t.return_airline,
      trip_role: t.trip_role,
    }));
  const excusedMembers = [...excusedFromBase, ...excusedFromTransferIn];

  // (4) 실효 명단 = base - 이동OUT + 이동IN (제외 인원은 포함)
  //     방어적 dedupe: 같은 id가 base와 transferredIn 양쪽에 존재하는 경우 대비
  const activeMembersRaw: GroupMember[] = [
    ...baseMembers.filter((m) => !transferredOutIds.has(m.id)),
    ...transferredIn.map((t) => ({
      id: t.id,
      name: t.name,
      party: t.party,
      airline: t.airline,
      return_airline: t.return_airline,
      trip_role: t.trip_role,
    })),
  ];
  const seenIds = new Set<string>();
  const activeMembers: GroupMember[] = [];
  for (const m of activeMembersRaw) {
    if (seenIds.has(m.id)) continue;
    seenIds.add(m.id);
    activeMembers.push(m);
  }

  return {
    activeMembers,
    excusedMembers,
    transferredOut,
    transferredIn,
    memberInfoMap,
  };
}
