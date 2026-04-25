"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canCheckin, isAdminRole } from "@/lib/constants";
import { revalidateMainPaths, requireActiveSchedule } from "./_shared";
import type { ActionResult, OfflinePendingCheckin, CheckedBy, ShuttleType, CheckIn } from "@/lib/types";

/**
 * 체크인 row의 모든 컬럼 셀렉트 spec — 클라이언트 CheckIn 타입과 1:1 매핑.
 * createCheckin/markAbsent 응답에 일관 사용.
 */
const CHECKIN_COLS =
  "id, user_id, schedule_id, checked_at, checked_by, checked_by_user_id, offline_pending, is_absent, absence_reason, absence_location, group_id_at_checkin";

/**
 * 체크인 INSERT — Checkpoint 2 정책의 단일 진실의 출처.
 *
 * ## 정책
 * 같은 (user_id, schedule_id)에 이미 row가 있으면 **모드 전환 차단**:
 *  - markAbsent로 불참 처리된 row를 createCheckin이 정상으로 덮어쓸 수 없다.
 *  - createCheckin으로 정상 처리된 row를 markAbsent가 불참으로 덮어쓸 수 없다.
 *  - 모드 전환은 "취소(DELETE) → 재처리"의 2단계로만 가능.
 *
 * ## 동작
 * 1. INSERT 시도
 * 2. 성공 → 새 row 반환
 * 3. UNIQUE(user_id,schedule_id) 충돌(error code 23505) → 기존 row 조회 후 반환
 *    (UI는 기존 상태 그대로 유지, 사용자에게 에러 노출 안 함)
 * 4. 그 외 에러 → 실패 반환
 *
 * ## race-safety
 * - PostgreSQL UNIQUE 제약 + ON CONFLICT 처리가 DB 레벨에서 원자성 보장
 * - "선조회 후 INSERT" 패턴(과거 markAbsent)은 두 쿼리 사이에 race window가 있었으나
 *   이 패턴은 INSERT-first라 race window가 0
 *
 * ## 호출 컨텍스트
 * createCheckin (is_absent=false), markAbsent (is_absent=true) 양쪽에서 사용.
 */
async function insertCheckinExclusive(
  supabase: ReturnType<typeof createServiceClient>,
  payload: {
    user_id: string;
    schedule_id: string;
    checked_by: CheckedBy;
    checked_by_user_id: string;
    is_absent?: boolean;
    absence_reason?: string | null;
    absence_location?: string | null;
    group_id_at_checkin: string | null;
  }
): Promise<ActionResult<CheckIn>> {
  const { data: inserted, error: insertError } = await supabase
    .from("check_ins")
    .insert(payload)
    .select(CHECKIN_COLS)
    .single();

  if (!insertError && inserted) {
    return { ok: true, data: inserted as CheckIn };
  }

  // PostgreSQL UNIQUE 충돌 → 기존 row 조회 후 반환 (모드 전환 차단)
  if (insertError && insertError.code === "23505") {
    const { data: existing } = await supabase
      .from("check_ins")
      .select(CHECKIN_COLS)
      .eq("user_id", payload.user_id)
      .eq("schedule_id", payload.schedule_id)
      .maybeSingle();
    if (existing) {
      return { ok: true, data: existing as CheckIn };
    }
    // 충돌 직후 다른 actor가 DELETE한 극단 케이스 — 사용자에게 일반 에러 노출
    return { ok: false, error: "처리 중 충돌이 발생했어요. 다시 시도해주세요." };
  }

  return { ok: false, error: "처리 중 오류가 발생했어요" };
}

/**
 * v2: actor가 특정 일정의 임시 조장인지 확인.
 * member 역할이어도 temp_role='leader'면 해당 일정에 한해 체크인 가능.
 */
async function isTempLeaderFor(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  scheduleId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("schedule_member_info")
    .select("id")
    .eq("user_id", userId)
    .eq("schedule_id", scheduleId)
    .eq("temp_role", "leader")
    .maybeSingle();
  return !!data;
}

/**
 * v2: 체크인 권한 사전 검증 — 역할 기반 OR 임시 조장 기반
 * - 기존: canCheckin(role) 만으로 판단 (leader/admin/admin_leader)
 * - v2: 위 조건 실패 시 schedule_member_info.temp_role='leader' 체크
 */
async function canActorCheckin(
  supabase: ReturnType<typeof createServiceClient>,
  actor: { id: string; role: string },
  targetUserId: string,
  scheduleId: string
): Promise<boolean> {
  if (actor.id === targetUserId) return true;
  if (canCheckin(actor.role)) return true;
  return await isTempLeaderFor(supabase, actor.id, scheduleId);
}

/**
 * v2: 특정 일정에서 사용자의 실효 조 ID를 반환
 * - temp_group_id가 설정되어 있으면 그것
 * - 아니면 users.group_id 원본
 */
async function getEffectiveGroupId(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  scheduleId: string
): Promise<string | null> {
  const { data: smi } = await supabase
    .from("schedule_member_info")
    .select("temp_group_id")
    .eq("user_id", userId)
    .eq("schedule_id", scheduleId)
    .maybeSingle();

  if (smi?.temp_group_id) return smi.temp_group_id;

  const { data: user } = await supabase
    .from("users")
    .select("group_id")
    .eq("id", userId)
    .maybeSingle();

  return user?.group_id ?? null;
}

/**
 * 조장의 자기 조원/버스 접근 권한 검증.
 *
 * **반환값 계약**:
 *  - `{ error }`: 권한 없음 / 유효하지 않음 → 호출자는 그대로 return
 *  - `{ targetGroupId }`: 통과. 일반 일정이면 타겟의 effective group(= 체크인 스냅샷용 값)
 *                        셔틀/admin 경로에서는 null
 *
 * v2 변경:
 *  - scheduleId 파라미터 추가 (일반 일정에서 effective group 계산에 사용)
 *  - 일반 일정 검증 시 **actor는 원래 그룹**, **target은 effective group** 비교
 *    (Checkpoint 2 보안 수정: 영구 조장이 smi.temp_group_id로 타 조 조원에 접근하는 경로 차단)
 *  - targetGroupId를 반환해 호출자가 `group_id_at_checkin` 스냅샷 / 보고 무효화에 재활용
 *    (Checkpoint 2 퍼포먼스 수정: `getEffectiveGroupId(target)` 중복 호출 1건 제거)
 *  - 셔틀 일정은 기존 로직 유지 (temp_group_id는 셔틀 일정 대상이 아님)
 */
async function validateGroupAccess(
  supabase: ReturnType<typeof createServiceClient>,
  actor: { id: string; role: string; group_id: string; shuttle_bus?: string | null; return_shuttle_bus?: string | null },
  targetUserId: string,
  scheduleId: string,
  shuttleType: ShuttleType | null = null
): Promise<{ error: ActionResult } | { targetGroupId: string | null }> {
  if (isAdminRole(actor.role)) {
    // admin은 그룹 제한 없음. 일반 일정이면 스냅샷용 타겟 그룹 계산
    const targetGroupId = shuttleType
      ? null
      : await getEffectiveGroupId(supabase, targetUserId, scheduleId);
    return { targetGroupId };
  }

  if (shuttleType === "departure") {
    if (!actor.shuttle_bus) {
      return { error: { ok: false, error: "셔틀 담당 조장만 처리할 수 있어요" } };
    }
    const { data } = await supabase
      .from("users")
      .select("shuttle_bus")
      .eq("id", targetUserId)
      .single();
    if (data?.shuttle_bus !== actor.shuttle_bus) {
      return { error: { ok: false, error: "내 버스 탑승자만 처리할 수 있어요" } };
    }
    return { targetGroupId: null };
  }

  if (shuttleType === "return") {
    if (!actor.return_shuttle_bus) {
      return { error: { ok: false, error: "귀가 셔틀 담당 조장만 처리할 수 있어요" } };
    }
    const { data } = await supabase
      .from("users")
      .select("return_shuttle_bus")
      .eq("id", targetUserId)
      .single();
    if (data?.return_shuttle_bus !== actor.return_shuttle_bus) {
      return { error: { ok: false, error: "내 버스 탑승자만 처리할 수 있어요" } };
    }
    return { targetGroupId: null };
  }

  // v2: 일반 일정 — effective group 기준 비교
  // 보안: 영구 조장(permanent leader)은 **본인의 원래 그룹**만 유효 권한 범위.
  //       자신의 smi.temp_group_id가 다른 조로 설정되어 있어도 그 조 멤버는 건드릴 수 없다.
  //       (leader 권한을 다른 조로 이전하려면 해당 조 멤버 중 한 명에게 smi.temp_role='leader' 지정)
  //       temp_leader(role=member + smi.temp_role=leader)만 smi.temp_group_id 기반 범위를 사용.
  const actorGroupId = canCheckin(actor.role)
    ? actor.group_id
    : await getEffectiveGroupId(supabase, actor.id, scheduleId);
  const targetGroupId = await getEffectiveGroupId(supabase, targetUserId, scheduleId);

  if (!actorGroupId || !targetGroupId) {
    return { error: { ok: false, error: "사용자 정보를 찾을 수 없어요" } };
  }
  if (actorGroupId !== targetGroupId) {
    return { error: { ok: false, error: "자기 조원만 처리할 수 있어요" } };
  }
  return { targetGroupId };
}

// 체크인 INSERT (조장/관리자 대리 체크인)
// 근본 수정 (2026-04-26): 진짜 row를 반환해 클라이언트가 낙관적 temp를 즉시 교체하도록 함.
//                        prop sync race(stale RSC가 낙관적 temp를 wipe하던 버그) 차단.
export async function createCheckin(
  userId: string,
  scheduleId: string,
  shuttleType: ShuttleType | null = null
): Promise<ActionResult<CheckIn>> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "권한이 없어요" };

  const supabase = createServiceClient();

  // Phase B: 활성 일정에만 쓰기 허용 (조장 뷰가 대기/완료도 열람 가능해짐)
  const activeCheck = await requireActiveSchedule(supabase, scheduleId);
  if (!activeCheck.ok) return { ok: false, error: activeCheck.error };

  // v2: 역할 기반 OR 임시 조장 기반 권한 체크 (본인 포함)
  const allowed = await canActorCheckin(supabase, actor, userId, scheduleId);
  if (!allowed) return { ok: false, error: "권한이 없어요" };

  const access = await validateGroupAccess(supabase, actor, userId, scheduleId, shuttleType);
  if ("error" in access) return { ok: false, error: access.error.error };

  // v2: checked_by — admin / temp_leader / leader 구분
  const checkedBy: CheckedBy = isAdminRole(actor.role)
    ? "admin"
    : canCheckin(actor.role)
    ? "leader"
    : "temp_leader";

  // v2: group_id_at_checkin — 체크인 시점의 조 스냅샷 (immutable 기록)
  //     셔틀은 null, 일반 일정은 validateGroupAccess가 이미 계산한 값 재사용
  const targetGroupAtCheckin = access.targetGroupId;

  // 근본 수정 (2026-04-26 코드 리뷰 반영):
  //   기존 코드는 upsert(merge mode)를 사용 → 충돌 시 기존 row를 덮어써 Checkpoint 2 정책을 위반.
  //   (markAbsent로 처리된 row를 createCheckin이 정상으로 덮어쓰는 시나리오 발생 가능)
  //   insertCheckinExclusive로 통일하여 INSERT-first + 충돌 시 기존 보존 패턴 적용.
  const result = await insertCheckinExclusive(supabase, {
    user_id: userId,
    schedule_id: scheduleId,
    checked_by: checkedBy,
    checked_by_user_id: actor.id,
    group_id_at_checkin: targetGroupAtCheckin,
  });

  if (!result.ok) return result;

  revalidateMainPaths();
  return result;
}

// 체크인 취소 DELETE
export async function deleteCheckin(
  userId: string,
  scheduleId: string,
  shuttleType: ShuttleType | null = null
): Promise<ActionResult> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "권한이 없어요" };

  const supabase = createServiceClient();

  // Phase B: 완료된 일정의 체크인 취소는 완전 차단 (②C 정책)
  const activeCheck = await requireActiveSchedule(supabase, scheduleId);
  if (!activeCheck.ok) return activeCheck;

  const allowed = await canActorCheckin(supabase, actor, userId, scheduleId);
  if (!allowed) return { ok: false, error: "권한이 없어요" };

  const access = await validateGroupAccess(supabase, actor, userId, scheduleId, shuttleType);
  if ("error" in access) return access.error;

  const { error } = await supabase
    .from("check_ins")
    .delete()
    .eq("user_id", userId)
    .eq("schedule_id", scheduleId);

  if (error) {
    return { ok: false, error: "취소 처리 중 오류가 발생했어요" };
  }

  // 체크인 취소 → 보고 기록도 무효화 (stale reported 상태 방지)
  if (shuttleType) {
    // 셔틀 일정: shuttle_reports 무효화
    let targetShuttleBus: string | null;
    if (isAdminRole(actor.role)) {
      if (shuttleType === "departure") {
        const { data } = await supabase.from("users").select("shuttle_bus").eq("id", userId).single();
        targetShuttleBus = data?.shuttle_bus ?? null;
      } else {
        const { data } = await supabase.from("users").select("return_shuttle_bus").eq("id", userId).single();
        targetShuttleBus = data?.return_shuttle_bus ?? null;
      }
    } else {
      targetShuttleBus = shuttleType === "departure" ? (actor.shuttle_bus ?? null) : (actor.return_shuttle_bus ?? null);
    }
    if (targetShuttleBus) {
      await supabase
        .from("shuttle_reports")
        .delete()
        .eq("shuttle_bus", targetShuttleBus)
        .eq("schedule_id", scheduleId);
    }
  } else {
    // 일반 일정: group_reports 무효화 (v2: effective group 기준 — validateGroupAccess가 이미 계산)
    if (access.targetGroupId) {
      await supabase
        .from("group_reports")
        .delete()
        .eq("group_id", access.targetGroupId)
        .eq("schedule_id", scheduleId);
    }
  }

  revalidateMainPaths();
  return { ok: true };
}

// 불참 처리 INSERT (is_absent=true)
// v2: absence_reason, absence_location 파라미터 추가
// 근본 수정 (2026-04-26): createCheckin과 동일하게 진짜 row 반환 — prop sync race 차단.
const ABSENCE_TEXT_MAX_LENGTH = 200;
export async function markAbsent(
  userId: string,
  scheduleId: string,
  shuttleType: ShuttleType | null = null,
  absenceReason: string | null = null,
  absenceLocation: string | null = null
): Promise<ActionResult<CheckIn>> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "권한이 없어요" };

  // v2: 자유 텍스트 필드 길이 제한 (DB 낭비 방지 + CSV 포뮬러 인젝션 1차 방어)
  const sanitizedReason =
    absenceReason && absenceReason.trim()
      ? absenceReason.trim().slice(0, ABSENCE_TEXT_MAX_LENGTH)
      : null;
  const sanitizedLocation =
    absenceLocation && absenceLocation.trim()
      ? absenceLocation.trim().slice(0, ABSENCE_TEXT_MAX_LENGTH)
      : null;

  const supabase = createServiceClient();

  // Phase B: 활성 일정에만 불참 처리 허용
  const activeCheck = await requireActiveSchedule(supabase, scheduleId);
  if (!activeCheck.ok) return { ok: false, error: activeCheck.error };

  const allowed = await canActorCheckin(supabase, actor, userId, scheduleId);
  if (!allowed) return { ok: false, error: "권한이 없어요" };

  const access = await validateGroupAccess(supabase, actor, userId, scheduleId, shuttleType);
  if ("error" in access) return { ok: false, error: access.error.error };

  const checkedBy: CheckedBy = isAdminRole(actor.role)
    ? "admin"
    : canCheckin(actor.role)
    ? "leader"
    : "temp_leader";

  const targetGroupAtCheckin = access.targetGroupId;

  // 근본 수정 (2026-04-26 코드 리뷰 반영):
  //   "선조회 후 INSERT" 패턴은 두 쿼리 사이 race window가 있어 동시 createCheckin과
  //   충돌 시 23505 에러가 사용자에게 노출됐다. insertCheckinExclusive로 통일하여
  //   INSERT-first + 충돌 시 기존 보존 패턴 적용. Checkpoint 2 정책은 헬퍼가 보장.
  const result = await insertCheckinExclusive(supabase, {
    user_id: userId,
    schedule_id: scheduleId,
    checked_by: checkedBy,
    checked_by_user_id: actor.id,
    is_absent: true,
    absence_reason: sanitizedReason,
    absence_location: sanitizedLocation,
    group_id_at_checkin: targetGroupAtCheckin,
  });

  if (!result.ok) return result;

  revalidateMainPaths();
  return result;
}

// 오프라인 체크인 일괄 동기화
// v2: temp_leader (member with temp_role='leader') 도 sync 허용
//     - 본인이 queue한 각 item의 schedule_id 기준으로 권한 재검증
export async function syncOfflineCheckins(
  checkins: OfflinePendingCheckin[]
): Promise<ActionResult<number>> {
  const actor = await getCurrentUser();
  if (!actor) return { ok: false, error: "권한이 없어요" };

  if (!Array.isArray(checkins) || checkins.length === 0) {
    return { ok: false, error: "동기화할 데이터가 없어요" };
  }
  if (checkins.length > 500) {
    return { ok: false, error: "한 번에 동기화할 수 있는 최대 건수를 초과했어요" };
  }
  // v2: 'temp_leader'도 허용
  const VALID_CHECKED_BY: CheckedBy[] = ["leader", "admin", "temp_leader"];
  for (const item of checkins) {
    if (!VALID_CHECKED_BY.includes(item.checked_by)) {
      return { ok: false, error: "유효하지 않은 체크인 데이터예요" };
    }
  }

  const supabase = createServiceClient();

  // Phase B 정책 일관성: 오프라인 큐에 담긴 체크인이 네트워크 복귀 시점에
  //   일정이 이미 종료된 상태라면 서버에 반영하지 않는다 (쓰기는 활성 일정에만 허용).
  //   활성 일정에 해당하는 item만 필터링 후 RPC에 전달.
  const uniqueScheduleIds = Array.from(new Set(checkins.map((c) => c.schedule_id)));
  const { data: scheduleRows } = await supabase
    .from("schedules")
    .select("id, is_active")
    .in("id", uniqueScheduleIds);
  const activeScheduleIds = new Set(
    (scheduleRows ?? []).filter((s) => s.is_active).map((s) => s.id)
  );
  const filteredCheckins = checkins.filter((c) => activeScheduleIds.has(c.schedule_id));
  if (filteredCheckins.length === 0) {
    return { ok: true, data: 0 };
  }

  // 권한 체크: 영구 권한자가 아니면 각 item의 schedule_id에 대해 temp_leader 권한 확인
  if (!canCheckin(actor.role)) {
    for (const c of filteredCheckins) {
      if (c.user_id === actor.id) continue;
      const ok = await isTempLeaderFor(supabase, actor.id, c.schedule_id);
      if (!ok) return { ok: false, error: "권한이 없어요" };
    }
  }

  const { data, error } = await supabase.rpc("sync_offline_checkins", {
    checkins: filteredCheckins,
  });

  if (error) {
    return { ok: false, error: "동기화 중 오류가 발생했어요" };
  }

  revalidateMainPaths();
  return { ok: true, data: data as number };
}
