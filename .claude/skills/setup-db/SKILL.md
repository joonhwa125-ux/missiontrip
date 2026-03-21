---
name: setup-db
description: Supabase 데이터베이스 스키마, RLS 정책, RPC 함수를 CLAUDE.md 명세 기준으로 생성하거나 검증한다.
disable-model-invocation: true
---

## Supabase DB 셋업

CLAUDE.md의 섹션 3(데이터베이스 스키마)을 기반으로 Supabase SQL을 생성하거나 검증한다.

### 작업 범위

1. **테이블 생성 SQL** (섹션 3.1~3.5):
   - Groups, Users, Schedules, Check_ins, Group_reports
   - 모든 제약 조건(FK, UNIQUE, CHECK) 포함
   - `idx_one_active_schedule` unique partial index 포함

2. **RLS 정책** (섹션 3.7):
   - 모든 테이블 RLS ENABLE
   - 정책 그대로 생성 (groups_read, users_read, schedules_read/write, checkins_read/insert/delete, reports_read/insert)

3. **RPC 함수** (섹션 3.8):
   - `activate_schedule(target_id uuid)` — SECURITY DEFINER
   - `sync_offline_checkins(checkins jsonb)` — SECURITY DEFINER

4. **검증**: 이미 생성된 스키마가 있으면 CLAUDE.md와 비교하여 차이점 보고

### 출력 형식

실행 가능한 `.sql` 파일로 생성:
```
supabase/
└── migrations/
    ├── 001_create_tables.sql
    ├── 002_rls_policies.sql
    └── 003_rpc_functions.sql
```

$ARGUMENTS
