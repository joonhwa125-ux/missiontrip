-- v2 확장: 일정별 명단/메타데이터 + 불참 사유 + 항공사 + 브리핑
-- 적용 대상: 이미 배포된 Supabase DB
-- 실행 방법: Supabase Dashboard → SQL Editor에서 실행
--
-- 원칙: Additive only — 기존 코드와 완전히 backward compatible
--   * 기존 테이블에는 nullable 컬럼만 추가
--   * 새 테이블은 비어있는 상태로 시작 (기존 로직 영향 없음)
--   * 기존 RLS 정책은 OR 분기로만 확장 (축소하지 않음)
--
-- 교차 검증 반영 사항:
--   1. security-architect: RLS 3-way binding (schedule_id + is_active + temp_group_id)
--   2. code-analyzer: check_ins.group_id_at_checkin 스냅샷 컬럼
--   3. security-architect: schedule_member_info 쓰기 admin-only (자가 승격 방지)
--   4. tech-researcher: updated_at + updated_by 최소 감사 (1회성 서비스 규모)
--   5. security-architect: checked_by에 'temp_leader' 추가 (audit 구분)

BEGIN;

-- ================================================================
-- 1. users 테이블 확장 (항공사, 여행 역할)
-- ================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS airline   text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trip_role text;

COMMENT ON COLUMN users.airline IS
  '탑승 항공사 (제주항공, 티웨이 등). 비행 일정 UI에서 그룹핑/배지 표시';
COMMENT ON COLUMN users.trip_role IS
  '여행 기간 내내 유지되는 역할 설명 (키 수령, 시각장애인 가이드 등). 브리핑 카드에 표시';

-- ================================================================
-- 2. check_ins 테이블 확장 (불참 상세 + 그룹 스냅샷)
-- ================================================================

ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS absence_reason      text;
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS absence_location    text;
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS group_id_at_checkin uuid
  REFERENCES groups(id) ON DELETE SET NULL;

COMMENT ON COLUMN check_ins.absence_reason IS
  '불참 사유 (숙소 / 근무 / 의료 / 기타: {자유텍스트})';
COMMENT ON COLUMN check_ins.absence_location IS
  '부재 위치 (의료일 때 병원명 등, 선택)';
COMMENT ON COLUMN check_ins.group_id_at_checkin IS
  '체크인 시점의 조 스냅샷 (immutable). 조 이동 이후에도 과거 기록이 당시 조 기준으로 보존됨';

-- checked_by CHECK 제약 확장: 'temp_leader' 추가 (audit 구분용)
-- 기존 이름은 PostgreSQL 기본 명명 규칙 기준으로 처리
ALTER TABLE check_ins DROP CONSTRAINT IF EXISTS check_ins_checked_by_check;
ALTER TABLE check_ins ADD CONSTRAINT check_ins_checked_by_check
  CHECK (checked_by IN ('leader', 'admin', 'temp_leader'));

-- ================================================================
-- 3. schedule_group_info 테이블 신규 (일정×조 메타데이터)
-- ================================================================

CREATE TABLE IF NOT EXISTS schedule_group_info (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     uuid        NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  group_id        uuid        NOT NULL REFERENCES groups(id)    ON DELETE CASCADE,

  location_detail text,                              -- '1층', '2층', 'A홀'
  rotation        text,                              -- '식사먼저', '투어먼저', '1그룹'
  sub_location    text,                              -- '해먹존', '족욕존'
  note            text,                              -- 관리자가 조장에게 전달할 메모

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  updated_by      uuid        REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT unique_schedule_group UNIQUE (schedule_id, group_id)
);

COMMENT ON TABLE schedule_group_info IS
  '일정×조 메타데이터: 층수, 순환순서, 활동장소, 관리자 메모';

-- ================================================================
-- 4. schedule_member_info 테이블 신규 (일정×사용자 메타데이터)
-- ================================================================

CREATE TABLE IF NOT EXISTS schedule_member_info (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     uuid        NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,

  temp_group_id   uuid        REFERENCES groups(id) ON DELETE SET NULL,
                                                     -- 이 일정에서만 소속될 조
  temp_role       text        CHECK (temp_role IN ('leader', 'member')),
                                                     -- 이 일정에서만 부여할 역할
  excused_reason  text,                              -- 사전 제외 사유 (숙소 휴식 / 병원 동행 / 근무)
  activity        text,                              -- 활동 배정 (해먹 / 숲걷기 / 족욕)
  menu            text,                              -- 개인별 메뉴 (음료 / 음식 / 채식)
  note            text,                              -- 조장에게 전달할 특이사항

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  updated_by      uuid        REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT unique_schedule_member UNIQUE (schedule_id, user_id)
);

COMMENT ON TABLE schedule_member_info IS
  '일정×사용자 메타데이터: 조 이동, 임시 권한, 사전 제외, 활동/메뉴 배정';

-- ================================================================
-- 5. RLS 활성화
-- ================================================================

ALTER TABLE schedule_group_info  ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_member_info ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- 6. RLS 정책: schedule_group_info
-- ================================================================

-- 읽기: 모든 인증자 (브리핑은 조장/관리자 모두에게 노출)
DROP POLICY IF EXISTS "sgi_read" ON schedule_group_info;
CREATE POLICY "sgi_read" ON schedule_group_info
  FOR SELECT TO authenticated USING (true);

-- 쓰기: admin / admin_leader만
DROP POLICY IF EXISTS "sgi_write" ON schedule_group_info;
CREATE POLICY "sgi_write" ON schedule_group_info
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email'
        AND role IN ('admin', 'admin_leader')
    )
  );

-- ================================================================
-- 7. RLS 정책: schedule_member_info
-- ================================================================
-- 읽기 범위를 좁힘 (self / admin / 같은 조 조장)
-- 쓰기는 admin-only (자가 승격 방지)

-- 읽기: 본인 + admin + 같은 조(원래 or 임시) 조장
DROP POLICY IF EXISTS "smi_read" ON schedule_member_info;
CREATE POLICY "smi_read" ON schedule_member_info
  FOR SELECT TO authenticated USING (
    -- 본인
    user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    -- 또는 admin
    OR EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email'
        AND role IN ('admin', 'admin_leader')
    )
    -- 또는 같은 조 조장 (원래 조 또는 임시 조)
    OR EXISTS (
      SELECT 1
      FROM users me
      JOIN users target ON target.id = schedule_member_info.user_id
      WHERE me.email = auth.jwt() ->> 'email'
        AND me.role IN ('leader', 'admin_leader')
        AND me.group_id = COALESCE(schedule_member_info.temp_group_id, target.group_id)
    )
  );

-- 쓰기: admin / admin_leader만 (자가 승격 절대 불가)
DROP POLICY IF EXISTS "smi_write" ON schedule_member_info;
CREATE POLICY "smi_write" ON schedule_member_info
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email'
        AND role IN ('admin', 'admin_leader')
    )
  );

-- ================================================================
-- 8. check_ins RLS 정책 확장: temp_role 'leader' 허용
-- ================================================================
-- 3-way binding:
--   (1) smi.schedule_id = check_ins.schedule_id      ← 특정 일정에만 한정
--   (2) s.is_active = true                           ← 활성 일정일 때만
--   (3) target.group_id = smi.temp_group_id          ← 배정된 조의 멤버만

DROP POLICY IF EXISTS "checkins_insert" ON check_ins;
CREATE POLICY "checkins_insert" ON check_ins
  FOR INSERT TO authenticated WITH CHECK (
    -- (a) 영구 권한자 (기존 로직, 변경 없음)
    EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email'
        AND role IN ('leader', 'admin', 'admin_leader')
    )
    -- (b) 임시 조장 — 3-way binding
    OR EXISTS (
      SELECT 1
      FROM schedule_member_info smi
      JOIN users     me     ON me.id = smi.user_id
      JOIN schedules s      ON s.id  = smi.schedule_id
      JOIN users     target ON target.id = check_ins.user_id
      WHERE me.email    = auth.jwt() ->> 'email'
        AND smi.temp_role = 'leader'
        AND smi.schedule_id = check_ins.schedule_id
        AND s.is_active = true
        AND target.group_id = smi.temp_group_id
    )
  );

DROP POLICY IF EXISTS "checkins_delete" ON check_ins;
CREATE POLICY "checkins_delete" ON check_ins
  FOR DELETE TO authenticated USING (
    -- (a) 영구 권한자
    EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email'
        AND role IN ('leader', 'admin', 'admin_leader')
    )
    -- (b) 임시 조장 — 3-way binding
    OR EXISTS (
      SELECT 1
      FROM schedule_member_info smi
      JOIN users     me     ON me.id = smi.user_id
      JOIN schedules s      ON s.id  = smi.schedule_id
      JOIN users     target ON target.id = check_ins.user_id
      WHERE me.email    = auth.jwt() ->> 'email'
        AND smi.temp_role = 'leader'
        AND smi.schedule_id = check_ins.schedule_id
        AND s.is_active = true
        AND target.group_id = smi.temp_group_id
    )
  );

-- ================================================================
-- 9. sync_offline_checkins RPC 확장 (불참 사유 + 그룹 스냅샷 지원)
-- ================================================================

CREATE OR REPLACE FUNCTION sync_offline_checkins(checkins jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item   jsonb;
  synced int := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(checkins)
  LOOP
    INSERT INTO check_ins (
      user_id,
      schedule_id,
      checked_by,
      checked_by_user_id,
      checked_at,
      is_absent,
      absence_reason,
      absence_location,
      group_id_at_checkin
    )
    VALUES (
      (item->>'user_id')::uuid,
      (item->>'schedule_id')::uuid,
      item->>'checked_by',
      NULLIF(item->>'checked_by_user_id', '')::uuid,
      COALESCE((item->>'checked_at')::timestamptz, now()),
      COALESCE((item->>'is_absent')::boolean, false),
      NULLIF(item->>'absence_reason', ''),
      NULLIF(item->>'absence_location', ''),
      NULLIF(item->>'group_id_at_checkin', '')::uuid
    )
    ON CONFLICT (user_id, schedule_id) DO NOTHING;

    IF FOUND THEN
      synced := synced + 1;
    END IF;
  END LOOP;

  RETURN synced;
END;
$$;

-- ================================================================
-- 10. updated_at 자동 갱신 트리거
-- ================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sgi_updated_at ON schedule_group_info;
CREATE TRIGGER trg_sgi_updated_at
  BEFORE UPDATE ON schedule_group_info
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_smi_updated_at ON schedule_member_info;
CREATE TRIGGER trg_smi_updated_at
  BEFORE UPDATE ON schedule_member_info
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ================================================================
-- 11. 성능 인덱스
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_smi_schedule_id
  ON schedule_member_info(schedule_id);
CREATE INDEX IF NOT EXISTS idx_smi_user_id
  ON schedule_member_info(user_id);
CREATE INDEX IF NOT EXISTS idx_smi_temp_group_id
  ON schedule_member_info(temp_group_id)
  WHERE temp_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_smi_temp_role
  ON schedule_member_info(temp_role)
  WHERE temp_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sgi_schedule_id
  ON schedule_group_info(schedule_id);
CREATE INDEX IF NOT EXISTS idx_sgi_group_id
  ON schedule_group_info(group_id);

CREATE INDEX IF NOT EXISTS idx_checkins_group_id_at_checkin
  ON check_ins(group_id_at_checkin)
  WHERE group_id_at_checkin IS NOT NULL;

-- ================================================================
-- 12. Realtime 활성화 안내
-- ================================================================
-- Supabase Dashboard → Database → Replication 에서
-- schedule_group_info, schedule_member_info 테이블을 Realtime 발행 대상에 추가 필요
--  (조장 앱의 member_info_updated broadcast가 필요하면)

COMMIT;
