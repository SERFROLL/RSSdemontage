-- User-supplied name is a comment; only an administrator writes employee names.
CREATE TABLE IF NOT EXISTS operational_access_history (
 id BIGSERIAL PRIMARY KEY,
 request_id TEXT NOT NULL,
 telegram_id TEXT NOT NULL,
 event TEXT NOT NULL,
 actor TEXT NOT NULL,
 details JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS operational_access_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 administrator TEXT
);
INSERT INTO operational_access_settings(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS operational_access_outbox (
 key TEXT PRIMARY KEY,
 chat_id TEXT NOT NULL,
 body JSONB NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt TIMESTAMPTZ NOT NULL DEFAULT now(),
 delivered_at TIMESTAMPTZ
);

INSERT INTO operational_access_history(request_id,telegram_id,event,actor,details)
SELECT id,telegram_id,'migrated',COALESCE(decided_by,telegram_id),jsonb_build_object('comment',name,'status',status,'employee',employee)
FROM operational_access_requests;
