CREATE TABLE accounting_documents (
 id text PRIMARY KEY NOT NULL, namespace text NOT NULL, document_id text NOT NULL,
 source_version integer NOT NULL, source_seq integer NOT NULL REFERENCES documents(seq) ON DELETE CASCADE,
 kind text NOT NULL, operation_date text NOT NULL, created_at text NOT NULL, reverses_version integer,
 UNIQUE(namespace,document_id,source_version)
);
CREATE TABLE stock_accounts (
 id text PRIMARY KEY NOT NULL, namespace text NOT NULL, kind text NOT NULL,
 unit text NOT NULL CHECK(unit IN ('mm','g')), owner_pid text,
 UNIQUE(id,unit), CHECK((kind='pid' AND owner_pid IS NOT NULL AND unit='mm') OR (kind<>'pid' AND owner_pid IS NULL))
);
CREATE TABLE document_lines (
 id text PRIMARY KEY NOT NULL, accounting_document_id text NOT NULL REFERENCES accounting_documents(id) ON DELETE CASCADE,
 origin_pid text NOT NULL, cable_id text NOT NULL, operation_date text NOT NULL,
 line_role text NOT NULL, source_line_id text REFERENCES document_lines(id)
);
CREATE INDEX document_lines_origin ON document_lines(origin_pid,cable_id,operation_date);
CREATE INDEX document_lines_document ON document_lines(accounting_document_id);
CREATE TABLE quantity_values (
 id text PRIMARY KEY NOT NULL, line_id text NOT NULL REFERENCES document_lines(id) ON DELETE CASCADE,
 role text NOT NULL, value_kind text NOT NULL, unit text NOT NULL CHECK(unit IN ('mm','g')),
 value_base bigint NOT NULL CHECK(value_base BETWEEN 0 AND 9007199254740991),
 formula_code text, formula_version integer, source_reference text,
 UNIQUE(line_id,role), UNIQUE(id,unit), UNIQUE(id,line_id)
);
CREATE TABLE quantity_inputs (
 result_value_id text NOT NULL REFERENCES quantity_values(id) ON DELETE CASCADE,
 input_value_id text NOT NULL REFERENCES quantity_values(id), input_role text NOT NULL,
 PRIMARY KEY(result_value_id,input_role)
);
CREATE TABLE ledger_entries (
 id text PRIMARY KEY NOT NULL, line_id text NOT NULL REFERENCES document_lines(id) ON DELETE CASCADE,
 account_id text NOT NULL, value_id text NOT NULL, unit text NOT NULL,
 sign integer NOT NULL CHECK(sign IN (-1,1)), reverses_entry_id text REFERENCES ledger_entries(id),
 FOREIGN KEY(account_id,unit) REFERENCES stock_accounts(id,unit),
 FOREIGN KEY(value_id,unit) REFERENCES quantity_values(id,unit),
 FOREIGN KEY(value_id,line_id) REFERENCES quantity_values(id,line_id)
);
CREATE INDEX ledger_entries_line ON ledger_entries(line_id);
CREATE INDEX ledger_entries_account ON ledger_entries(account_id);
CREATE TABLE coil_entries (
 id text PRIMARY KEY NOT NULL, line_id text NOT NULL REFERENCES document_lines(id) ON DELETE CASCADE,
 delta_count bigint NOT NULL, reverses_entry_id text REFERENCES coil_entries(id)
);
CREATE TABLE opening_batches (
 namespace text NOT NULL, pid text NOT NULL,
 accounting_document_id text NOT NULL REFERENCES accounting_documents(id) ON DELETE CASCADE,
 pid_stock_checked integer NOT NULL CHECK(pid_stock_checked=1), main_stock_checked integer NOT NULL CHECK(main_stock_checked=1),
 confirmed_at text NOT NULL, confirmed_by text NOT NULL, PRIMARY KEY(namespace,pid)
);
CREATE TABLE accounting_write_checks (token text PRIMARY KEY NOT NULL, valid integer NOT NULL CHECK(valid=1));

-- Every line balances separately for each physical unit. Check at COMMIT, after
-- all the legs have arrived; a half-posted document rolls back with its source.
CREATE FUNCTION enforce_cable_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM ledger_entries e JOIN quantity_values q ON q.id=e.value_id
  WHERE e.line_id=NEW.line_id GROUP BY e.unit HAVING SUM(e.sign*q.value_base)<>0
 ) THEN RAISE EXCEPTION 'Unbalanced cable journal line'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER cable_journal_balanced AFTER INSERT ON ledger_entries
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_cable_journal_balance();
