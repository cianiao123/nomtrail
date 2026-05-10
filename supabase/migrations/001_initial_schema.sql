-- Lumina Travel — Initial Database Schema
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- ============================================================
-- 1. trips — 行程主表
-- ============================================================
CREATE TABLE IF NOT EXISTS trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  title           TEXT NOT NULL DEFAULT '未命名行程',
  destination     TEXT NOT NULL DEFAULT '',
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  start_date      DATE,
  end_date        DATE,
  adults          INT NOT NULL DEFAULT 1,
  children        INT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'CNY',
  budget_min      INT NOT NULL DEFAULT 0,
  budget_max      INT NOT NULL DEFAULT 10000,
  preferences     TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','generated','edited','finalized')),
  cover_image_url TEXT,
  is_public       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. days — 行程天数
-- ============================================================
CREATE TABLE IF NOT EXISTS days (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_index  INT NOT NULL,
  date       DATE NOT NULL,
  notes      TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trip_id, day_index)
);

-- ============================================================
-- 3. activities — 每日活动
-- ============================================================
CREATE TABLE IF NOT EXISTS activities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id           UUID NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  "order"          INT NOT NULL DEFAULT 1000,
  type             TEXT NOT NULL DEFAULT 'other'
                   CHECK (type IN ('attraction','food','hotel','transport','other')),
  poi_name         TEXT DEFAULT '',
  poi_address      TEXT DEFAULT '',
  poi_lat          DOUBLE PRECISION,
  poi_lng          DOUBLE PRECISION,
  start_time       TEXT DEFAULT '',
  end_time         TEXT DEFAULT '',
  duration_minutes INT DEFAULT 60,
  estimated_cost   INT DEFAULT 0,
  notes            TEXT DEFAULT '',
  is_generated     BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. itinerary_versions — 行程版本快照
-- ============================================================
CREATE TABLE IF NOT EXISTS itinerary_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  version_number    INT NOT NULL,
  days_snapshot     JSONB NOT NULL DEFAULT '[]',
  change_description TEXT NOT NULL DEFAULT '',
  parent_version_id UUID,
  is_current        BOOLEAN NOT NULL DEFAULT true,
  critique_result   JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. agent_sessions — Agent 对话会话
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id     TEXT NOT NULL UNIQUE,
  user_id       TEXT NOT NULL DEFAULT 'local-user',
  trip_id       UUID REFERENCES trips(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running','awaiting_confirmation','completed','error')),
  state_data    JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. agent_action_logs — Agent 操作日志
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_action_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT now(),
  node_name  TEXT NOT NULL DEFAULT '',
  intent     TEXT DEFAULT '',
  input_text TEXT DEFAULT '',
  output_text TEXT DEFAULT '',
  duration_ms INT DEFAULT 0,
  error_text TEXT DEFAULT ''
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_days_trip ON days(trip_id);
CREATE INDEX IF NOT EXISTS idx_activities_day ON activities(day_id);
CREATE INDEX IF NOT EXISTS idx_versions_trip ON itinerary_versions(trip_id);
CREATE INDEX IF NOT EXISTS idx_sessions_thread ON agent_sessions(thread_id);
CREATE INDEX IF NOT EXISTS idx_logs_session ON agent_action_logs(session_id);

-- ============================================================
-- RLS (Row Level Security) — 基础策略
-- ============================================================
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE days ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_action_logs ENABLE ROW LEVEL SECURITY;

-- 开发阶段：允许所有操作（后续接入 Auth 后改为按 user_id 过滤）
CREATE POLICY "Allow all for development" ON trips FOR ALL USING (true);
CREATE POLICY "Allow all for development" ON days FOR ALL USING (true);
CREATE POLICY "Allow all for development" ON activities FOR ALL USING (true);
CREATE POLICY "Allow all for development" ON itinerary_versions FOR ALL USING (true);
CREATE POLICY "Allow all for development" ON agent_sessions FOR ALL USING (true);
CREATE POLICY "Allow all for development" ON agent_action_logs FOR ALL USING (true);
