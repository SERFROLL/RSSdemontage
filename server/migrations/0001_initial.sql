CREATE TABLE documents (
  seq integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  namespace text NOT NULL,
  document_id text NOT NULL,
  version integer NOT NULL,
  kind text NOT NULL,
  pid text,
  date text NOT NULL,
  author text NOT NULL,
  editor text NOT NULL,
  created_at text NOT NULL,
  request_key text NOT NULL,
  request_hash text NOT NULL,
  payload text NOT NULL
);
CREATE UNIQUE INDEX documents_version ON documents(namespace, document_id, version);
CREATE UNIQUE INDEX documents_request ON documents(namespace, request_key);
CREATE INDEX documents_kind ON documents(namespace, kind);
CREATE INDEX documents_pid_date ON documents(namespace, pid, date);
CREATE TABLE notifications (
  key text PRIMARY KEY,
  status text NOT NULL,
  chat_id text NOT NULL,
  created_at text NOT NULL,
  message_id text,
  error text
);
