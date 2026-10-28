CREATE TABLE IF NOT EXISTS machines (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'تولید',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS downtime_records (
  id BIGSERIAL PRIMARY KEY,
  machine_id BIGINT NOT NULL REFERENCES machines(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  category TEXT NOT NULL,
  reason TEXT NOT NULL,
  action_taken TEXT,
  reported_by TEXT NOT NULL DEFAULT 'کاربر سیستم',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT downtime_time_check CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS downtime_records_started_at_idx ON downtime_records(started_at DESC);
CREATE INDEX IF NOT EXISTS downtime_records_machine_id_idx ON downtime_records(machine_id);
CREATE TABLE IF NOT EXISTS form_definitions (
  id BIGSERIAL PRIMARY KEY,
  form_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  definition JSONB NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(form_key, version)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO machines(code, name, department) VALUES
 ('LBL-01', 'ماشین چاپ لیبل ۱', 'چاپ'),
 ('CUT-01', 'دستگاه برش ۱', 'تکمیل')
ON CONFLICT (code) DO NOTHING;
INSERT INTO form_definitions(form_key, version, title, definition, is_published)
VALUES ('downtime', 1, 'فرم ثبت توقف ماشین‌آلات',
'{"fields":[{"name":"machineId","label":"ماشین","type":"machine","required":true},{"name":"startedAt","label":"زمان شروع","type":"datetime-local","required":true},{"name":"endedAt","label":"زمان پایان","type":"datetime-local","required":false},{"name":"category","label":"دسته توقف","type":"select","required":true,"options":["خرابی فنی","تنظیمات","کمبود مواد","کیفیت","برنامه‌ریزی","سایر"]},{"name":"reason","label":"شرح علت","type":"textarea","required":true},{"name":"actionTaken","label":"اقدام انجام‌شده","type":"textarea","required":false},{"name":"reportedBy","label":"ثبت‌کننده","type":"text","required":true}]}'::jsonb,
TRUE)
ON CONFLICT (form_key, version) DO NOTHING;
