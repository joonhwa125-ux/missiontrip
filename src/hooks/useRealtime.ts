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
  onReconnected?: () => void;  // 네트워크 재연결 시 호출 (WiFi↔LTE 전환 등)
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

  // 재연결 감지용 refs
  const everConnectedRef = useRef(new Set<string>()); // 한 번 이상 SUBSCRIBED된 채널
  const erroredRef = useRef(new Set<string>());       // 연결이 끊긴 채널
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const supabase = createClient();
    const channels: RealtimeChannel[] = [];

    // 재연결 감지 핸들러 — 채널별 클로저로 생성
    // 로직: SUBSCRIBED → 정상 | CHANNEL_ERROR/TIMED_OUT → erroredRef 추가
    //       erroredRef에 있던 채널이 SUBSCRIBED → 재연결 감지 → onReconnected 호출
    //       300ms debounce로 다중 채널 동시 재연결 시 중복 호출 방지
    const makeStatusHandler = (channelName: string) => (status: string) => {
      if (status === "SUBSCRIBED") {
        if (erroredRef.current.has(channelName)) {
          erroredRef.current.delete(channelName);
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            callbacksRef.current.onReconnected?.();
          }, 300);
        }
        everConnectedRef.current.add(channelName);
      }
      if (
        (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
        everConnectedRef.current.has(channelName)
      ) {
        erroredRef.current.add(channelName);
      }
    };

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
      .subscribe(makeStatusHandler(CHANNEL_GLOBAL));

    channels.push(globalChannel);
    channelRegistry.set(CHANNEL_GLOBAL, globalChannel);

    // group:{groupId} 채널 — 조장
    if (groupId) {
      const groupChannelName = `${CHANNEL_GROUP_PREFIX}${groupId}`;
      const groupChannel = supabase
        .channel(groupChannelName, { config: { broadcast: { self: true } } })
        .on("broadcast", { event: EVENT_CHECKIN_UPDATED }, ({ payload }) => {
          callbacksRef.current.onCheckinUpdated?.(payload);
        })
        .subscribe(makeStatusHandler(groupChannelName));

      channels.push(groupChannel);
      channelRegistry.set(groupChannelName, groupChannel);
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
        .subscribe(makeStatusHandler(CHANNEL_ADMIN));

      channels.push(adminChannel);
      channelRegistry.set(CHANNEL_ADMIN, adminChannel);
    }

    channelsRef.current = channels;

    return () => {
      clearTimeout(reconnectTimerRef.current);
      erroredRef.current.clear(); // StrictMode 재마운트 시 false positive 방지
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

      // 2) 없으면 자체 채널 생성 (별도 클라이언트이므로 토픽명 동일해도 충돌 없음)
      const own = ownChannelsRef.current;
      let channel = own.get(channelName);

      if (!channel) {
        channel = supabaseRef.current.channel(channelName, {
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
