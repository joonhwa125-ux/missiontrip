"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CHANNEL_GLOBAL,
  CHANNEL_ADMIN,
  CHANNEL_GROUP_PREFIX,
  EVENT_SCHEDULE_ACTIVATED,
  EVENT_SCHEDULE_UPDATED,
  EVENT_NOTICE,
  EVENT_CHECKIN_UPDATED,
  EVENT_GROUP_REPORTED,
} from "@/lib/constants";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface RealtimeCallbacks {
  onScheduleActivated?: (payload: { schedule_id: string; title: string }) => void;
  onScheduleUpdated?: (payload: { schedule_id: string; scheduled_time: string }) => void;
  onNotice?: (payload: { message: string }) => void;
  onCheckinUpdated?: (payload: { user_id: string; schedule_id: string; action: "insert" | "delete" }) => void;
  onGroupReported?: (payload: { group_id: string; pending_count: number }) => void;
}

// global + group:{groupId} 채널 구독
export function useRealtime(
  groupId: string | null,
  isAdmin: boolean,
  callbacks: RealtimeCallbacks
) {
  const channelsRef = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const channels: RealtimeChannel[] = [];

    // global 채널 — 전체 사용자
    const globalChannel = supabase
      .channel(CHANNEL_GLOBAL)
      .on("broadcast", { event: EVENT_SCHEDULE_ACTIVATED }, ({ payload }) => {
        callbacks.onScheduleActivated?.(payload);
      })
      .on("broadcast", { event: EVENT_SCHEDULE_UPDATED }, ({ payload }) => {
        callbacks.onScheduleUpdated?.(payload);
      })
      .on("broadcast", { event: EVENT_NOTICE }, ({ payload }) => {
        callbacks.onNotice?.(payload);
      })
      .subscribe();

    channels.push(globalChannel);

    // group:{groupId} 채널 — 조장
    if (groupId) {
      const groupChannel = supabase
        .channel(`${CHANNEL_GROUP_PREFIX}${groupId}`)
        .on("broadcast", { event: EVENT_CHECKIN_UPDATED }, ({ payload }) => {
          callbacks.onCheckinUpdated?.(payload);
        })
        .subscribe();

      channels.push(groupChannel);
    }

    // admin 채널 — 관리자
    if (isAdmin) {
      const adminChannel = supabase
        .channel(CHANNEL_ADMIN)
        .on("broadcast", { event: EVENT_GROUP_REPORTED }, ({ payload }) => {
          callbacks.onGroupReported?.(payload);
        })
        .subscribe();

      channels.push(adminChannel);
    }

    channelsRef.current = channels;

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, isAdmin]);

  return channelsRef;
}

// broadcast 메시지 전송 헬퍼
export function useBroadcast() {
  const supabase = createClient();

  const broadcast = useCallback(
    async (channelName: string, event: string, payload: Record<string, unknown>) => {
      const channel = supabase.channel(channelName);
      await channel.subscribe();
      await channel.send({ type: "broadcast", event, payload });
      supabase.removeChannel(channel);
    },
    [supabase]
  );

  return { broadcast };
}
