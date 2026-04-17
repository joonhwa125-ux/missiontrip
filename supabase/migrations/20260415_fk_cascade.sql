-- FK CASCADE / SET NULL 마이그레이션
-- 적용 대상: 이미 배포된 Supabase DB
-- 실행 방법: Supabase Dashboard → SQL Editor에서 실행
--
-- 변경 사항:
-- 1. check_ins.user_id → ON DELETE CASCADE (사용자 삭제 시 체크인 자동 삭제)
-- 2. check_ins.schedule_id → ON DELETE CASCADE (일정 삭제 시 체크인 자동 삭제)
-- 3. check_ins.checked_by_user_id → ON DELETE SET NULL (체크인 처리자 삭제 시 NULL, 기록 보존)
-- 4. group_reports.group_id → ON DELETE CASCADE
-- 5. group_reports.schedule_id → ON DELETE CASCADE
-- 6. group_reports.reported_by → ON DELETE CASCADE
-- 7. shuttle_reports.schedule_id → ON DELETE CASCADE
-- 8. shuttle_reports.reported_by → ON DELETE CASCADE
--
-- 이 변경으로 deleteUser/deleteSchedule의 자식 행 선삭제 로직이 불필요해짐.

BEGIN;

-- check_ins: user_id
ALTER TABLE check_ins
  DROP CONSTRAINT IF EXISTS check_ins_user_id_fkey,
  ADD CONSTRAINT check_ins_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- check_ins: schedule_id
ALTER TABLE check_ins
  DROP CONSTRAINT IF EXISTS check_ins_schedule_id_fkey,
  ADD CONSTRAINT check_ins_schedule_id_fkey
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;

-- check_ins: checked_by_user_id (nullable FK → SET NULL)
ALTER TABLE check_ins
  DROP CONSTRAINT IF EXISTS check_ins_checked_by_user_id_fkey,
  ADD CONSTRAINT check_ins_checked_by_user_id_fkey
    FOREIGN KEY (checked_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- group_reports: group_id
ALTER TABLE group_reports
  DROP CONSTRAINT IF EXISTS group_reports_group_id_fkey,
  ADD CONSTRAINT group_reports_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

-- group_reports: schedule_id
ALTER TABLE group_reports
  DROP CONSTRAINT IF EXISTS group_reports_schedule_id_fkey,
  ADD CONSTRAINT group_reports_schedule_id_fkey
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;

-- group_reports: reported_by
ALTER TABLE group_reports
  DROP CONSTRAINT IF EXISTS group_reports_reported_by_fkey,
  ADD CONSTRAINT group_reports_reported_by_fkey
    FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE CASCADE;

-- shuttle_reports: schedule_id
ALTER TABLE shuttle_reports
  DROP CONSTRAINT IF EXISTS shuttle_reports_schedule_id_fkey,
  ADD CONSTRAINT shuttle_reports_schedule_id_fkey
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;

-- shuttle_reports: reported_by
ALTER TABLE shuttle_reports
  DROP CONSTRAINT IF EXISTS shuttle_reports_reported_by_fkey,
  ADD CONSTRAINT shuttle_reports_reported_by_fkey
    FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE CASCADE;

COMMIT;