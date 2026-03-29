"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useBroadcast } from "@/hooks/useRealtime";
import {
  CHANNEL_GLOBAL,
  CHANNEL_ADMIN,
  CHANNEL_GROUP_PREFIX,
  EVENT_CHECKIN_UPDATED,
} from "@/lib/constants";

/** 체크인 변경 broadcast 훅
 *  - 일반 일정: global + group:{id} + admin 3채널
 *  - 셔틀 일정: global + admin 2채널 (같은 버스 여러 조장이 global로 수신)
 */
export function useBroadcastCheckin(groupId: string, scheduleId: string | undefined, isShuttle = false) {
  const { broadcast } = useBroadcast();
  const router = useRouter();

  return useCallback(
    async (userId: string, action: "insert" | "delete", isAbsent = false) => {
      const payload = {
        user_id: userId,
        schedule_id: scheduleId ?? "",
        action,
        is_absent: isAbsent,
      };
      try {
        if (isShuttle) {
          await Promise.all([
            broadcast(CHANNEL_GLOBAL, EVENT_CHECKIN_UPDATED, payload),
            broadcast(CHANNEL_ADMIN, EVENT_CHECKIN_UPDATED, payload),
          ]);
        } else {
          await Promise.all([
            broadcast(CHANNEL_GLOBAL, EVENT_CHECKIN_UPDATED, payload),
            broadcast(`${CHANNEL_GROUP_PREFIX}${groupId}`, EVENT_CHECKIN_UPDATED, payload),
            broadcast(CHANNEL_ADMIN, EVENT_CHECKIN_UPDATED, payload),
          ]);
        }
      } catch {
        // broadcast 실패 시 DB 데이터는 이미 저장됨 — 서버 데이터로 강제 갱신
        router.refresh();
      }
    },
    [groupId, scheduleId, isShuttle, broadcast, router]
  );
}
