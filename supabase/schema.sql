-- 미션트립 인원관리 시스템 Supabase 스키마
-- Supabase Dashboard → SQL Editor에서 실행

-- ===== 1. 테이블 생성 =====

CREATE TABLE IF NOT EXISTS groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
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
  shuttle_bus text,                                -- 출발 셔틀버스 배정 (예: 판교 출발 1)
  return_shuttle_bus text,                         -- 귀가 셔틀버스 배정
  airline     text,                                -- 탑승 항공사 (제주항공, 티웨이 등)
  trip_role   text,                                -- 여행 기간 내내 유지되는 역할 (키 수령, 가이드 등)
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
  activated_at    timestamptz,
  scope           text        NOT NULL DEFAULT 'all',  -- 일정 대상 (all | advance | rear)
  shuttle_type    text,                               -- 셔틀 타입 (departure | return | null)
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT unique_schedule_position UNIQUE (day_number, sort_order)
);

-- 동시 활성 일정 1개 제한
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_schedule
  ON schedules (is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS check_ins (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id         uuid        NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  checked_at          timestamptz DEFAULT now(),
  checked_by          text        NOT NULL CHECK (checked_by IN ('leader', 'admin', 'temp_leader')),
  checked_by_user_id  uuid        REFERENCES users(id) ON DELETE SET NULL,
  offline_pending     boolean     NOT NULL DEFAULT false,
  is_absent           boolean     NOT NULL DEFAULT false,  -- 불참 처리 여부
  absence_reason      text,                                -- 불참 사유 (숙소/근무/의료/기타)
  absence_location    text,                                -- 부재 위치 (병원명 등, 선택)
  group_id_at_checkin uuid        REFERENCES groups(id) ON DELETE SET NULL,
                                                           -- 체크인 시점 조 스냅샷 (immutable)
  CONSTRAINT unique_checkin UNIQUE (user_id, schedule_id)
);

-- 일정×조 메타데이터 (층수, 순환순서, 활동장소, 관리자 메모)
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

-- 일정×사용자 메타데이터 (조 이동, 임시 권한, 사전 제외, 활동/메뉴 배정)
CREATE TABLE IF NOT EXISTS schedule_member_info (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     uuid        NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  temp_group_id   uuid        REFERENCES groups(id) ON DELETE SET NULL,
  temp_role       text        CHECK (temp_role IN ('leader', 'member')),
  excused_reason  text,                              -- 사전 제외 사유 (숙소 휴식, 병원 동행, 근무)
  activity        text,                              -- 활동 배정 (해먹, 숲걷기, 족욕)
  menu            text,                              -- 개인별 메뉴 (음료, 음식, 채식)
  note            text,                              -- 조장에게 전달할 특이사항
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  updated_by      uuid        REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT unique_schedule_member UNIQUE (schedule_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  schedule_id   uuid        NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  reported_by   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pending_count int         NOT NULL DEFAULT 0,
  reported_at   timestamptz DEFAULT now(),
  CONSTRAINT unique_group_report UNIQUE (group_id, schedule_id)
);

CREATE TABLE IF NOT EXISTS shuttle_reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shuttle_bus   text        NOT NULL,
  schedule_id   uuid        NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  reported_by   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pending_count int         NOT NULL DEFAULT 0,
  reported_at   timestamptz DEFAULT now(),
  CONSTRAINT unique_shuttle_report UNIQUE (shuttle_bus, schedule_id)
);

-- ===== 2. RLS 활성화 =====

ALTER TABLE groups                ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins             ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shuttle_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_group_info   ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_member_info  ENABLE ROW LEVEL SECURITY;

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

-- INSERT: 영구 권한자 OR 임시 조장 (3-way binding: schedule + is_active + temp_group)
CREATE POLICY "checkins_insert" ON check_ins
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email'
        AND role IN ('leader', 'admin', 'admin_leader')
    )
    OR EXISTS (
      SELECT 1
      FROM schedule_member_info smi
      JOIN users     me     ON me.id = smi.user_id
      JOIN schedules s      ON s.id  = smi.schedule_id
      JOIN users     target ON target.id = check_ins.user_id
      WHERE me.email = auth.jwt() ->> 'email'
        AND smi.temp_role = 'leader'
        AND smi.schedule_id = check_ins.schedule_id
        AND s.is_active = true
        AND target.group_id = smi.temp_group_id
    )
  );

-- DELETE: 영구 권한자 OR 임시 조장 (3-way binding 동일)
CREATE POLICY "checkins_delete" ON check_ins
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email' AND role IN ('leader', 'admin', 'admin_leader')
    )
    OR EXISTS (
      SELECT 1
      FROM schedule_member_info smi
      JOIN users     me     ON me.id = smi.user_id
      JOIN schedules s      ON s.id  = smi.schedule_id
      JOIN users     target ON target.id = check_ins.user_id
      WHERE me.email = auth.jwt() ->> 'email'
        AND smi.temp_role = 'leader'
        AND smi.schedule_id = check_ins.schedule_id
        AND s.is_active = true
        AND target.group_id = smi.temp_group_id
    )
  );

-- schedule_group_info: 읽기 전체, 쓰기 admin만
CREATE POLICY "sgi_read" ON schedule_group_info
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sgi_write" ON schedule_group_info
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email'
            AND role IN ('admin', 'admin_leader'))
  );

-- schedule_member_info: 자기자신 + admin + 같은 조 조장 읽기, admin만 쓰기 (자가 승격 방지)
CREATE POLICY "smi_read" ON schedule_member_info
  FOR SELECT TO authenticated USING (
    user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    OR EXISTS (
      SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email'
        AND role IN ('admin', 'admin_leader')
    )
    OR EXISTS (
      SELECT 1
      FROM users me
      JOIN users target ON target.id = schedule_member_info.user_id
      WHERE me.email = auth.jwt() ->> 'email'
        AND me.role IN ('leader', 'admin_leader')
        AND me.group_id = COALESCE(schedule_member_info.temp_group_id, target.group_id)
    )
  );

CREATE POLICY "smi_write" ON schedule_member_info
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE email = auth.jwt() ->> 'email'
            AND role IN ('admin', 'admin_leader'))
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

-- 오프라인 체크인 일괄 동기화 (불참 사유 + 그룹 스냅샷 지원)
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
      user_id, schedule_id, checked_by, checked_by_user_id, checked_at,
      is_absent, absence_reason, absence_location, group_id_at_checkin
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

-- updated_at 자동 갱신 트리거 함수
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

-- ===== 5. 성능 인덱스 =====

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_group_id ON users(group_id);
CREATE INDEX IF NOT EXISTS idx_checkins_schedule_id ON check_ins(schedule_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_schedule ON check_ins(user_id, schedule_id);
CREATE INDEX IF NOT EXISTS idx_reports_schedule ON group_reports(schedule_id);

-- v2: 일정별 메타데이터 인덱스
CREATE INDEX IF NOT EXISTS idx_smi_schedule_id   ON schedule_member_info(schedule_id);
CREATE INDEX IF NOT EXISTS idx_smi_user_id       ON schedule_member_info(user_id);
CREATE INDEX IF NOT EXISTS idx_smi_temp_group_id ON schedule_member_info(temp_group_id)
  WHERE temp_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_smi_temp_role     ON schedule_member_info(temp_role)
  WHERE temp_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sgi_schedule_id   ON schedule_group_info(schedule_id);
CREATE INDEX IF NOT EXISTS idx_sgi_group_id      ON schedule_group_info(group_id);
CREATE INDEX IF NOT EXISTS idx_checkins_group_id_at_checkin
  ON check_ins(group_id_at_checkin) WHERE group_id_at_checkin IS NOT NULL;

-- ===== 6. Realtime 활성화 =====
-- Supabase Dashboard → Database → Replication 에서
-- check_ins, group_reports, schedules 테이블 활성화 필요
