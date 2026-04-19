-- v2 후속: schedules.notice 컬럼 추가
-- 적용 대상: 기존 schedules 테이블
--
-- 배경:
--   조장이 일정별 공통 안내(예: "카드키·조식쿠폰 수령", "18시 사전행사") 를 일정 단위로 확인할 수단 부재.
--   group_info.note에 18개 조 반복 입력은 관리 부담 큼 → 일정 단위 필드 추가.
--
-- 역할:
--   BriefingSheet 일정 섹션 헤더 아래 "공지" 블록으로 표시 (nullable — 있을 때만 렌더).
--   모든 조장에게 동일하게 노출되는 공통 안내.
--
-- 네이밍:
--   - 'announcement'·'info'는 "개인 안내"와 혼동 가능 → 'notice'(공지) 선택.
--   - UI/CSV 레이블도 '공지'로 통일.
--
-- 원칙: Additive only. nullable이라 기존 일정/코드 영향 없음.

BEGIN;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS notice text;

COMMENT ON COLUMN schedules.notice IS
  '일정별 공통 안내 (모든 조장에게 동일). '
  '예: "수하물 찾으면 조 단위로 나가 가이드 만남", "버스에서 방장이 카드키·조식쿠폰 수령". '
  'null이면 공지 블록 렌더 안 함.';

COMMIT;
