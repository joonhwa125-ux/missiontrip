-- 미션트립 인원관리 시스템 Supabase 스키마
-- Supabase Dashboard → SQL Editor에서 실행

-- ===== 1. 테이블 생성 =====

CREATE TABLE IF NOT EXISTS groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  bus_name    text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  email       text        NOT NULL UNIQUE,
  phone       text,
  role        text        NOT NULL CHECK (role IN ('member', 'leader', 'admin', 'admin_leader')),
  group_id    uuid        NOT NULL REFERENCES groups(id),
  party       text,                                -- 선발/후발 구분 (advance | rear | null)
  shuttle_bus text,                                -- 셔틀버스 배정 (예: 판교 출발 1)
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text        NOT NULL,
  location        text,
  day_number      int         NOT NULL CHECK (day_number >= 1),
  sort_order      int         NOT NULL,
  scheduled_time  timestamptz,
  is_active       boolean     NOT NULL DEFAULT false,
  is_shuttle      boolean     NOT NULL DEFAULT false,  -- 셔틀 일정 여부
  activated_at    timestamptz,
  scope           text        NOT NULL DEFAULT 'all',  -- 일정 대상 (all | advance | rear)
  created_at      timestamptz DEFAULT now()
);

-- 동시 활성 일정 1개 제한
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_schedule
  ON schedules (is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS check_ins (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES users(id),
  schedule_id         uuid        NOT NULL REFERENCES schedules(id),
  checked_at          timestamptz DEFAULT now(),
  checked_by          text        NOT NULL CHECK (checked_by IN ('leader', 'admin')),
  checked_by_user_id  uuid        REFERENCES users(id),
  offline_pending     boolean     NOT NULL DEFAULT false,
  is_absent           boolean     NOT NULL DEFAULT false,  -- 불참 처리 여부
  CONSTRAINT unique_checkin UNIQUE (user_id, schedule_id)
);

CREATE TABLE IF NOT EXISTS group_reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid        NOT NULL REFERENCES groups(id),
  schedule_id   uuid        NOT NULL REFERENCES schedules(id),
  reported_by   uuid        NOT NULL REFERENCES users(id),
  pending_count int         NOT NULL DEFAULT 0,
  reported_at   timestamptz DEFAULT now(),
  CONSTRAINT unique_group_report UNIQUE (group_id, schedule_id)
);

CREATE TABLE IF NOT EXISTS shuttle_reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shuttle_bus   text        NOT NULL,
  schedule_id   uuid        NOT NULL REFERENCES schedules(id),
  reported_by   uuid        NOT NULL REFERENCES users(id),
  pending_count int         NOT NULL DEFAULT 0,
  reported_at   timestamptz DEFAULT now(),
  CONSTRAINT unique_shuttle_report UNIQUE (shuttle_bus, schedule_id)
);

-- ===== 2. RLS 활성화 =====

ALTER TABLE groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shuttle_reports ENABLE ROW LEVEL SECURITY;

-- ===== 3. RLS 정책 =====

-- Groups: 인증된 사용자 읽기 전용
CREATE POLICY "groups_read" ON groups
  FOR SELECT TO authenticated USING (true);

-- Users: 인증된 사용자 읽기
CREATE POLICY "users_read" ON users
  FOR SELECT TO authenticated USING (true);

-- Schedules: 읽기 전체, 쓰기 admin만
CREATE POLICY "schedules_read" ON schedules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "schedules_write" ON schedules
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE users.email = auth.jwt() ->> 'email' AND users.role IN ('admin', 'admin_leader')
  ));

-- Check_ins: 읽기(같은 조 + admin), 쓰기(leader/admin)
CREATE POLICY "checkins_read" ON check_ins
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users u1
      JOIN users u2 ON u1.group_id = u2.group_id
      WHERE u1.id = check_ins.user_id
        AND u2.email = auth.jwt() ->> 'email'
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('admin', 'admin_leader')
    )
  );

CREATE POLICY "checkins_insert" ON check_ins
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email'
        AND role IN ('leader', 'admin', 'admin_leader')
    )
  );

CREATE POLICY "checkins_delete" ON check_ins
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader')
    )
  );

-- Group_reports: leader/admin 읽기·쓰기
CREATE POLICY "reports_read" ON group_reports
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader'))
  );

CREATE POLICY "reports_insert" ON group_reports
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader'))
  );

CREATE POLICY "reports_update" ON group_reports
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader'))
  );

-- Shuttle_reports: 조장/관리자 읽기, 쓰기
CREATE POLICY "shuttle_reports_read" ON shuttle_reports
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader'))
  );

CREATE POLICY "shuttle_reports_insert" ON shuttle_reports
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader'))
  );

CREATE POLICY "shuttle_reports_update" ON shuttle_reports
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader'))
  );

-- ===== 4. RPC 함수 =====

-- 일정 활성화 (트랜잭션으로 동시 활성화 방지)
CREATE OR REPLACE FUNCTION activate_schedule(target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 현재 활성 일정 비활성화 (activated_at 기록 보존)
  UPDATE schedules
  SET is_active = false,
      activated_at = COALESCE(activated_at, now())
  WHERE is_active = true;

  -- 새 일정 활성화
  UPDATE schedules
  SET is_active = true,
      activated_at = now()
  WHERE id = target_id;
END;
$$;

-- 오프라인 체크인 일괄 동기화
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
    INSERT INTO check_ins (user_id, schedule_id, checked_by, checked_by_user_id, checked_at)
    VALUES (
      (item->>'user_id')::uuid,
      (item->>'schedule_id')::uuid,
      item->>'checked_by',
      NULLIF(item->>'checked_by_user_id', '')::uuid,
      COALESCE((item->>'checked_at')::timestamptz, now())
    )
    ON CONFLICT (user_id, schedule_id) DO NOTHING;

    IF FOUND THEN
      synced := synced + 1;
    END IF;
  END LOOP;

  RETURN synced;
END;
$$;

-- ===== 5. 성능 인덱스 =====

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_group_id ON users(group_id);
CREATE INDEX IF NOT EXISTS idx_checkins_schedule_id ON check_ins(schedule_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_schedule ON check_ins(user_id, schedule_id);
CREATE INDEX IF NOT EXISTS idx_reports_schedule ON group_reports(schedule_id);

-- ===== 6. Realtime 활성화 =====
-- Supabase Dashboard → Database → Replication 에서
-- check_ins, group_reports, schedules 테이블 활성화 필요
