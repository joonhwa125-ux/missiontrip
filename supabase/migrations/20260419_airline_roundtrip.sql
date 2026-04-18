-- v2 후속: 왕복 항공편 지원 + 중간 일차 비행 유연성
-- 적용 대상: 20260417_v2_schedule_metadata.sql 적용된 DB
--
-- 추가 사항:
--   1. users.return_airline — 오는편 항공사 (기존 users.airline은 가는편 의미로 재정의)
--   2. schedules.airline_leg — 해당 일정이 어떤 항공편 방향인지 (outbound/return/null)
--
-- 원칙: Additive only. 기존 데이터/코드 영향 없음 (모두 nullable).
-- 일차 하드코딩 제거 효과: 브리핑 카드가 `airline_leg` 값으로 어느 일차든 대응 가능.

BEGIN;

-- ================================================================
-- 1. users.return_airline 추가
-- ================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS return_airline text;

COMMENT ON COLUMN users.airline IS
  '가는편 항공사 (제주, 티웨이, 현지 합류 등). 브리핑에서 가는편 비행 일정 일차에 표시';
COMMENT ON COLUMN users.return_airline IS
  '오는편 항공사 (제주, 티웨이, 현지 합류 등). 브리핑에서 오는편 비행 일정 일차에 표시';

-- ================================================================
-- 2. schedules.airline_leg 추가
-- ================================================================

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS airline_leg text
  CHECK (airline_leg IN ('outbound', 'return'));

COMMENT ON COLUMN schedules.airline_leg IS
  '항공 구간 (outbound=가는편 / return=오는편 / null=비행 일정 아님). '
  '브리핑에서 해당 일차에 어떤 항공사 섹션을 노출할지 결정';

COMMIT;
