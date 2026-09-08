import pg from "pg";

// Only application SQL goes through this adapter; values always remain parameters.
export function postgresSql(sql) {
  const ignore = /^\s*INSERT OR IGNORE\b/i.test(sql);
  let query = sql.replace(/^\s*INSERT OR IGNORE\b/i, "INSERT");
  let parameter = 0;
  query = query.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?/g,
    token => token === "?" ? "$" + (++parameter) : token);
  if (ignore) {
    query = /\bRETURNING\b/i.test(query)
      ? query.replace(/\bRETURNING\b/i, "ON CONFLICT DO NOTHING RETURNING")
      : query.replace(/;?\s*$/, " ON CONFLICT DO NOTHING");
  }
  return query;
}

export function createPool(config = process.env) {
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const url = new URL(config.DATABASE_URL);
  // Keep certificate validation under our control, including for provider URLs.
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.toString(), max: 10,
    connectionTimeoutMillis: 10000, statement_timeout: 30000,
    ssl: config.DATABASE_SSL === "false" ? false : {
      rejectUnauthorized: true,
      ...(config.DATABASE_CA_CERT ? { ca: config.DATABASE_CA_CERT.replaceAll("\\n", "\n") } : {}),
    },
  });
  pool.on("error", () => console.error("Database connection interrupted"));
  return pool;
}

const WRITE_LOCK = 724201;
export function createDatabase(pool) {
  function prepare(sql) {
    const text = postgresSql(sql);
    const write = /^\s*(INSERT|UPDATE|DELETE)\b/i.test(text);
    const statement = values => ({
      text, values, write,
      async first() { return (await execute({ text, values, write })).rows[0] ?? null; },
      async all() { return { results: (await execute({ text, values, write })).rows }; },
      async run() { const result = await execute({ text, values, write }); return { success: true, meta: { changes: result.rowCount } }; },
    });
    return { ...statement([]), bind: (...values) => statement(values) };
  }
  async function transaction(statements) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // PostgreSQL has concurrent writers. Take the lock before the guarded INSERT
      // gets its snapshot so the SQLite optimistic-write semantics are preserved.
      await client.query("SELECT pg_advisory_xact_lock($1)", [WRITE_LOCK]);
      const results = [];
      for (const statement of statements) results.push(await client.query(statement.text, statement.values));
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async function execute(statement) {
    return statement.write ? (await transaction([statement]))[0] : pool.query(statement.text, statement.values);
  }
  return { prepare, async batch(statements) {
    return (await transaction(statements)).map(result => ({ results: result.rows, success: true }));
  } };
}
