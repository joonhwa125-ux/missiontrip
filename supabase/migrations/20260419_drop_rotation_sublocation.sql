-- v2 후속: schedule_group_info의 rotation, sub_location 컬럼 제거
-- 적용 대상: 20260417_v2_schedule_metadata.sql 적용된 DB
--
-- 배경:
--   1. rotation(순환순서): 카카오 A/B조 1건에 거의 국한 → 메모로 대체 가능
--   2. sub_location(활동장소): 모든 용처가 메모로 대체 가능.
--      레이블도 types("활동장소") / Edit Dialog("활동 장소") / Briefing("장소") 3가지로 불일치
--   3. 개인 안내 activity("활동")와 이름이 유사해 관리자 혼란 유발
--
-- 결과: 조 브리핑 필드가 location_detail + note 2개로 축소 (YAGNI)
-- 유지: location_detail(층/위치) — 포도원/고등어쌈밥 좌석 층 구분에 구조화 Chip 유리

BEGIN;

ALTER TABLE schedule_group_info DROP COLUMN IF EXISTS rotation;
ALTER TABLE schedule_group_info DROP COLUMN IF EXISTS sub_location;

COMMIT;
