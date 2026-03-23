"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CHANNEL_GLOBAL,
  CHANNEL_ADMIN,
  CHANNEL_GROUP_PREFIX,
  EVENT_SCHEDULE_ACTIVATED,
  EVENT_SCHEDULE_UPDATED,
  EVENT_CHECKIN_UPDATED,
  EVENT_GROUP_REPORTED,
} from "@/lib/constants";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface RealtimeCallbacks {
  onScheduleActivated?: (payload: { schedule_id: string; title: string }) => void;
  onScheduleUpdated?: (payload: { schedule_id: string; scheduled_time: string }) => void;
  onCheckinUpdated?: (payload: { user_id: string; schedule_id: string; action: "insert" | "delete"; is_absent?: boolean }) => void;
  onGroupReported?: (payload: { group_id: string; pending_count: number }) => void;
}

// global + group:{groupId} 채널 구독
export function useRealtime(
  groupId: string | null,
  isAdmin: boolean,
  callbacks: RealtimeCallbacks
) {
  const channelsRef = useRef<RealtimeChannel[]>([]);

  // 항상 최신 콜백을 ref로 유지 — deps 없이 매 렌더 후 갱신해 스테일 클로저 방지
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  useEffect(() => {
    const supabase = createClient();
    const channels: RealtimeChannel[] = [];

    // global 채널 — 전체 사용자 (일정 + 체크인 이벤트)
    const globalChannel = supabase
      .channel(CHANNEL_GLOBAL, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: EVENT_SCHEDULE_ACTIVATED }, ({ payload }) => {
        callbacksRef.current.onScheduleActivated?.(payload);
      })
      .on("broadcast", { event: EVENT_SCHEDULE_UPDATED }, ({ payload }) => {
        callbacksRef.current.onScheduleUpdated?.(payload);
      })
      .on("broadcast", { event: EVENT_CHECKIN_UPDATED }, ({ payload }) => {
        callbacksRef.current.onCheckinUpdated?.(payload);
      })
      .subscribe();

    channels.push(globalChannel);

    // group:{groupId} 채널 — 조장
    if (groupId) {
      const groupChannel = supabase
        .channel(`${CHANNEL_GROUP_PREFIX}${groupId}`, { config: { broadcast: { self: true } } })
        .on("broadcast", { event: EVENT_CHECKIN_UPDATED }, ({ payload }) => {
          callbacksRef.current.onCheckinUpdated?.(payload);
        })
        .subscribe();

      channels.push(groupChannel);
    }

    // admin 채널 — 관리자 (보고 + 체크인 업데이트 수신)
    if (isAdmin) {
      const adminChannel = supabase
        .channel(CHANNEL_ADMIN, { config: { broadcast: { self: true } } })
        .on("broadcast", { event: EVENT_GROUP_REPORTED }, ({ payload }) => {
          callbacksRef.current.onGroupReported?.(payload);
        })
        .on("broadcast", { event: EVENT_CHECKIN_UPDATED }, ({ payload }) => {
          callbacksRef.current.onCheckinUpdated?.(payload);
        })
        .subscribe();

      channels.push(adminChannel);
    }

    channelsRef.current = channels;

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [groupId, isAdmin]);

  return channelsRef;
}

// CR-001: broadcast 전용 persistent 채널 관리
// 매 호출마다 채널 생성/해제를 반복하지 않고, 채널을 Map에 캐싱하여 재사용
export function useBroadcast() {
  const supabaseRef = useRef(createClient());
  const channelMapRef = useRef(new Map<string, RealtimeChannel>());

  useEffect(() => {
    const supabase = supabaseRef.current;
    const map = channelMapRef.current;
    return () => {
      map.forEach((ch) => supabase.removeChannel(ch));
      map.clear();
    };
  }, []);

  const broadcast = useCallback(
    async (channelName: string, event: string, payload: Record<string, unknown>) => {
      const map = channelMapRef.current;
      let channel = map.get(channelName);

      if (!channel) {
        channel = supabaseRef.current.channel(channelName, { config: { broadcast: { self: true } } });
        await new Promise<void>((resolve) => {
          channel!.subscribe((status) => {
            if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              resolve();
            }
          });
        });
        map.set(channelName, channel);
      }

      await channel.send({ type: "broadcast", event, payload });
    },
    []
  );

  return { broadcast };
}
