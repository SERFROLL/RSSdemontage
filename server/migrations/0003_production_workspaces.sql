-- Independent, non-destructive cutover. Legacy accounting remains available for rollback.
CREATE TABLE IF NOT EXISTS operational_state (
 id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL,
 payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS operational_identities (
 employee TEXT PRIMARY KEY, telegram_id TEXT NOT NULL UNIQUE,
 is_admin BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS operational_events (
 revision INTEGER PRIMARY KEY, request_key TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL, actor TEXT NOT NULL, payload JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS operational_document_versions (
 document_id TEXT NOT NULL, revision INTEGER NOT NULL REFERENCES operational_events(revision),
 payload JSONB NOT NULL, PRIMARY KEY(document_id,revision)
);
CREATE TABLE IF NOT EXISTS operational_postings (
 id BIGSERIAL PRIMARY KEY, revision INTEGER NOT NULL REFERENCES operational_events(revision),
 document_id TEXT NOT NULL, effective_date DATE NOT NULL,
 warehouse TEXT NOT NULL, material TEXT NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('g','coil')),
 quantity BIGINT NOT NULL, reverses BIGINT REFERENCES operational_postings(id)
);
CREATE INDEX IF NOT EXISTS operational_postings_balance ON operational_postings(warehouse,material,effective_date);
CREATE TABLE IF NOT EXISTS operational_sessions (
 token_hash TEXT PRIMARY KEY, employee TEXT NOT NULL REFERENCES operational_identities(employee),
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS operational_login_requests (
 token_hash TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE,
 employee TEXT REFERENCES operational_identities(employee),
 expires_at TIMESTAMPTZ NOT NULL, consumed BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS operational_rate_limits (
 bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS operational_backups (
 id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 reason TEXT NOT NULL, revision INTEGER, payload JSONB NOT NULL
);
