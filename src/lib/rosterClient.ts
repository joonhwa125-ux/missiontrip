/**
 * 클라이언트용 effective roster 헬퍼.
 *
 * `roster.ts`는 `import "server-only"` 가드가 있어 서버 컴포넌트 전용.
 * 이 파일은 pure 함수 집합으로, 미리 fetch된 `memberInfos` 배열만 받아
 * 클라이언트 컴포넌트(Admin 대시보드 등)에서 재사용한다.
 *
 * 규칙 (서버 roster.ts와 동일):
 *  - base members: users.group_id === groupId
 *  - transferredOut: base 중 smi.temp_group_id가 다른 조로 설정
 *  - transferredIn: non-base 중 smi.temp_group_id === groupId
 *  - effective members = base - transferredOut + transferredIn
 *  - temp leader: effective members 중 smi.temp_role === 'leader'
 */

import type { ScheduleMemberInfo } from "./types";

/** 특정 조의 effective member 목록을 계산한다 (Generic으로 멤버 shape 추상화) */
export function computeEffectiveGroupMembers<T extends { id: string; group_id: string }>(
  groupId: string,
  allMembers: T[],
  memberInfos: ScheduleMemberInfo[]
): T[] {
  const baseMembers = allMembers.filter((m) => m.group_id === groupId);
  const baseMemberIds = new Set(baseMembers.map((m) => m.id));

  const transferredOutIds = new Set(
    memberInfos
      .filter(
        (smi) =>
          smi.temp_group_id &&
          smi.temp_group_id !== groupId &&
          baseMemberIds.has(smi.user_id)
      )
      .map((smi) => smi.user_id)
  );

  const transferredInIds = new Set(
    memberInfos
      .filter(
        (smi) => smi.temp_group_id === groupId && !baseMemberIds.has(smi.user_id)
      )
      .map((smi) => smi.user_id)
  );

  const transferredInMembers = allMembers.filter((m) => transferredInIds.has(m.id));

  // dedupe (방어): 동일 id가 base+transferredIn에 모두 등장하는 극단 케이스
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of [
    ...baseMembers.filter((m) => !transferredOutIds.has(m.id)),
    ...transferredInMembers,
  ]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/**
 * effective group members 중 이 일정의 임시 조장을 찾는다.
 * smi.temp_role === 'leader' 인 smi를 가진 멤버 첫 번째.
 * 여러 명이 지정된 edge case는 첫 매치 반환.
 */
export function findTempLeader<T extends { id: string }>(
  groupMembers: T[],
  memberInfos: ScheduleMemberInfo[]
): T | undefined {
  const tempLeaderIds = new Set(
    memberInfos
      .filter((smi) => smi.temp_role === "leader")
      .map((smi) => smi.user_id)
  );
  return groupMembers.find((m) => tempLeaderIds.has(m.id));
}

/**
 * 특정 사용자의 effective group id를 반환.
 * smi.temp_group_id가 설정되어 있으면 그 값, 아니면 users.group_id.
 */
export function getEffectiveGroupIdForUser(
  userId: string,
  userBaseGroupId: string,
  memberInfos: ScheduleMemberInfo[]
): string {
  const smi = memberInfos.find((s) => s.user_id === userId);
  return smi?.temp_group_id ?? userBaseGroupId;
}
