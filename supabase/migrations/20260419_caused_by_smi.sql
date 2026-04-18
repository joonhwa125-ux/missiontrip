-- v2 Phase J+: 인원별 배정의 부모-자식 관계 (대체 조장 자동 연쇄 삭제)
--
-- 목적
--   한 조원(예: liam.j)을 다른 조로 이동 + 임시 조장으로 지정할 때
--   원래 조의 대체 조장(예: blue.kk)도 배정하는데, 이 두 배정이
--   별개로 존재하면 나중에 이동자 배정 삭제 시 대체 조장 배정이 고아로 남음.
--   부모 배정이 삭제되면 자식 배정도 DB에서 CASCADE로 자동 삭제되도록 연결.
--
-- 원칙
--   * Additive only — 기존 컬럼/데이터 변경 없음. nullable 컬럼 1개 추가.
--   * Idempotent — 여러 번 실행해도 안전 (`IF NOT EXISTS`).
--   * Rollback — `ALTER TABLE schedule_member_info DROP COLUMN IF EXISTS caused_by_smi_id;`

BEGIN;

-- 1. caused_by_smi_id 컬럼 추가 (self-reference FK)
ALTER TABLE schedule_member_info
  ADD COLUMN IF NOT EXISTS caused_by_smi_id uuid
    REFERENCES schedule_member_info(id) ON DELETE CASCADE;

COMMENT ON COLUMN schedule_member_info.caused_by_smi_id IS
  '이 배정이 다른 배정의 부수로 생성된 경우(예: 이동자의 원래 조 대체 조장) 부모 배정의 id.
   부모 배정이 삭제되면 ON DELETE CASCADE로 자동 삭제됨.
   null이면 독립 배정(관리자가 직접 생성).';

-- 2. 자식 행을 빠르게 찾기 위한 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_smi_caused_by
  ON schedule_member_info(caused_by_smi_id)
  WHERE caused_by_smi_id IS NOT NULL;

COMMIT;

-- ================================================================
-- 검증 쿼리 (실행 후 아래 쿼리로 설치 확인)
-- ================================================================
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'schedule_member_info'
--   AND column_name = 'caused_by_smi_id';
--
-- 기대 결과: 1 row
--   column_name       | data_type | is_nullable
--   ------------------+-----------+-------------
--   caused_by_smi_id  | uuid      | YES
