-- v2 후속: schedule_group_info.location_detail → group_location 리네임
-- 적용 대상: 20260419_drop_rotation_sublocation.sql 이후
--
-- 배경:
--   - 관리자가 UI / Google Sheets / DB 세 곳을 왕래하며 작업함
--   - UI 레이블 "조 위치" ↔ DB 컬럼 "location_detail" 불일치는 혼란 유발
--   - 통일: UI/Sheets/DB 모두 "조 위치" (group_location) 동일 용어로 매핑
--
-- 원칙: 데이터 보존 (RENAME COLUMN). 값·제약·인덱스 모두 유지.

BEGIN;

ALTER TABLE schedule_group_info
  RENAME COLUMN location_detail TO group_location;

COMMIT;
