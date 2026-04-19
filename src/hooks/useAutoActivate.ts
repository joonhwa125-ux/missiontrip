"use client";

import { useEffect, useRef } from "react";
import { autoActivateSchedule } from "@/actions/schedule";
import { useBroadcast } from "@/hooks/useRealtime";
import { CHANNEL_GLOBAL, EVENT_SCHEDULE_ACTIVATED } from "@/lib/constants";
import type { Schedule } from "@/lib/types";

const AUTO_ACTIVATE_INTERVAL_MS = 60_000;

/**
 * 시각 도래 + 대기 상태 일정을 자동으로 활성화하는 공용 훅.
 *
 * ## 사용처
 * - 조장 뷰 (GroupView): 관리자 부재 시 조장 18명이 분산 타이머로 자동화 수행
 * - 관리자 전용 로직(미확인 경고 등)은 `useAdminScheduleEffects.useAutoActivateTimer` 참고
 *
 * ## 안전 모델
 * - RPC `auto_activate_due_schedule`가 시각 + 상태를 서버에서 원자적 검증
 * - DB UNIQUE INDEX `idx_one_active_schedule` + RPC 트랜잭션이 중복 활성화 차단
 * - `activated` 플래그로 실제 활성화 수행 여부 식별 → 중복 broadcast 방지
 *
 * ## TSG-005 교훈 반영
 * - schedules는 ref로 최신값 참조 (마운트 시점 고정 회피)
 * - useEffect 의존성은 broadcast만 — schedules 변화에 타이머 재설정 불필요
 */
export function useAutoActivate(schedules: Schedule[]) {
  const schedulesRef = useRef(schedules);
  schedulesRef.current = schedules;
  const { broadcast } = useBroadcast();

  useEffect(() => {
    let cancelled = false;
    // 백그라운드 복귀 시 setInterval tick과 visibilitychange가 짧은 간격으로
    // 동시에 check()를 호출해 RPC가 중복 발사되는 것을 방지 (code-review B-4)
    let inFlight = false;

    const check = async () => {
      if (inFlight) return;
      const now = Date.now();
      // 과거 대기 일정들 중 "가장 최신"을 target으로 선택 — RPC 정책과 일치해
      // 한 번의 호출로 최신 activate + 이전 놓친 일정 일괄 completed 처리.
      // (과거엔 find()가 sort_order 오름차순의 첫 past due를 골라
      //  RPC가 target != latest로 판정해 여러 tick이 필요했음.)
      let due: Schedule | undefined;
      let dueTime = 0;
      for (const s of schedulesRef.current) {
        if (s.is_active || s.activated_at || s.scheduled_time === null) continue;
        const t = new Date(s.scheduled_time).getTime();
        if (t > now) continue;
        if (t > dueTime) {
          dueTime = t;
          due = s;
        }
      }
      if (!due) return;

      inFlight = true;
      try {
        const res = await autoActivateSchedule(due.id);
        if (cancelled) return;
        if (res.ok && res.activated) {
          await broadcast(CHANNEL_GLOBAL, EVENT_SCHEDULE_ACTIVATED, {
            schedule_id: due.id,
            title: due.title,
            scope: due.scope,
            location: due.location,
            day_number: due.day_number,
            scheduled_time: due.scheduled_time,
            shuttle_type: due.shuttle_type,
          });
        }
      } catch {
        // 네트워크 오류는 다음 tick에 재시도
      } finally {
        inFlight = false;
      }
    };

    check();
    const timer = setInterval(check, AUTO_ACTIVATE_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [broadcast]);
}
