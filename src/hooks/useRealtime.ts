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

// 채널 레지스트리: useRealtime과 useBroadcast 간 동일 topic 채널 공유
const channelRegistry = new Map<string, RealtimeChannel>();

interface RealtimeCallbacks {
  onScheduleActivated?: (payload: { schedule_id: string; title: string }) => void;
  onScheduleUpdated?: (payload: { schedule_id: string; scheduled_time: string }) => void;
  onCheckinUpdated?: (payload: { user_id: string; schedule_id: string; action: "insert" | "delete"; is_absent?: boolean }) => void;
  onGroupReported?: (payload: { group_id: string; schedule_id: string; pending_count: number }) => void;
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
      .on("broadcast", { event: EVENT_GROUP_REPORTED }, ({ payload }) => {
        callbacksRef.current.onGroupReported?.(payload);
      })
      .subscribe();

    channels.push(globalChannel);
    channelRegistry.set(CHANNEL_GLOBAL, globalChannel);

    // group:{groupId} 채널 — 조장
    if (groupId) {
      const groupChannel = supabase
        .channel(`${CHANNEL_GROUP_PREFIX}${groupId}`, { config: { broadcast: { self: true } } })
        .on("broadcast", { event: EVENT_CHECKIN_UPDATED }, ({ payload }) => {
          callbacksRef.current.onCheckinUpdated?.(payload);
        })
        .subscribe();

      channels.push(groupChannel);
      channelRegistry.set(`${CHANNEL_GROUP_PREFIX}${groupId}`, groupChannel);
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
      channelRegistry.set(CHANNEL_ADMIN, adminChannel);
    }

    channelsRef.current = channels;

    return () => {
      channels.forEach((ch) => {
        // 레지스트리에서도 제거
        channelRegistry.forEach((val, key) => {
          if (val === ch) channelRegistry.delete(key);
        });
        supabase.removeChannel(ch);
      });
    };
  }, [groupId, isAdmin]);

  return channelsRef;
}

// CR-001: broadcast 전용 — useRealtime 채널을 우선 재사용하여 중복 구독 방지
export function useBroadcast() {
  const supabaseRef = useRef(createClient());
  // useBroadcast 자체가 생성한 채널만 추적 (cleanup 대상)
  const ownChannelsRef = useRef(new Map<string, RealtimeChannel>());

  useEffect(() => {
    const supabase = supabaseRef.current;
    const own = ownChannelsRef.current;
    return () => {
      own.forEach((ch) => supabase.removeChannel(ch));
      own.clear();
    };
  }, []);

  const broadcast = useCallback(
    async (channelName: string, event: string, payload: Record<string, unknown>) => {
      // 1) useRealtime이 이미 구독 중인 채널 재사용
      const existing = channelRegistry.get(channelName);
      if (existing) {
        await existing.send({ type: "broadcast", event, payload });
        return;
      }

      // 2) 없으면 자체 채널 생성 (suffix로 topic 충돌 방지)
      const own = ownChannelsRef.current;
      let channel = own.get(channelName);

      if (!channel) {
        channel = supabaseRef.current.channel(`${channelName}:send`, {
          config: { broadcast: { self: true } },
        });
        await new Promise<void>((resolve) => {
          channel!.subscribe((status) => {
            if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              resolve();
            }
          });
        });
        own.set(channelName, channel);
      }

      await channel.send({ type: "broadcast", event, payload });
    },
    []
  );

  return { broadcast };
}
