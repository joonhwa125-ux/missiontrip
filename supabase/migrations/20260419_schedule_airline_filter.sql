-- v2 후속: schedules.airline_filter 추가
-- 적용 대상: 기존 schedules 테이블
--
-- 배경:
--   schedules.scope는 '전체/선발/후발' 3가지만 허용해 비행편별 필터링 불가.
--   예: 1호차(1조+2조)는 전원 티웨이 탑승인데, '김포공항 집결(제주항공)' 일정이
--       scope='선발'이라는 이유만으로 조장 화면에 노출됨.
--
-- 해결:
--   schedules에 airline_filter(nullable) 추가 → users.airline/return_airline과 부분 매칭.
--   조의 대상 조원 중 해당 항공사 탑승자가 0명이면 일정 숨김.
--
-- 매칭 규칙 (Server/Client 공통):
--   schedule.airline_filter가 null이면 필터 적용 안 함 (기존 scope만 사용)
--   not null이면 user.airline.includes(filter) OR user.return_airline.includes(filter) 중 한 명이라도 true여야 표시
--   (includes 기반 — "티웨이" 필터가 users의 "티웨이 항공"/"티웨이" 모두 매칭)
--
-- 원칙: Additive only. nullable이라 기존 일정/코드 영향 없음.

BEGIN;

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS airline_filter text;

COMMENT ON COLUMN schedules.airline_filter IS
  '비행편 필터 키워드 (예: 티웨이, 제주항공, 이스타, 에어서울). '
  'users.airline/return_airline 부분 매칭으로 해당 탑승자 유무 판정. '
  'null이면 필터 적용 안 함.';

COMMIT;
