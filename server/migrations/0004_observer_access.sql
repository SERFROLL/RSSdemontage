ALTER TABLE operational_identities ADD COLUMN IF NOT EXISTS is_observer BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS operational_access_requests (
 id TEXT PRIMARY KEY,
 telegram_id TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 username TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('draft','pending','approved','rejected')),
 employee TEXT,
 decided_by TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
