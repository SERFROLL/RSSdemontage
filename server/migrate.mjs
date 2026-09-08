import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(724202)");
    await client.query("CREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    const directory = new URL("./migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter(name => name.endsWith(".sql")).sort()) {
      const sql = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query("SELECT checksum FROM app_migrations WHERE name=$1", [name]);
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum) throw new Error("An applied migration was modified");
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO app_migrations(name, checksum) VALUES ($1, $2)", [name, checksum]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function bootstrapOwner(db, config = process.env) {
  const id = config.ADMIN_TELEGRAM_ID;
  const existing = await db.prepare("SELECT payload FROM documents WHERE namespace=? AND document_id=? ORDER BY version DESC LIMIT 1").bind("production", "admin:owner").first();
  if (existing) {
    if (id && JSON.parse(existing.payload).telegramId !== id) throw new Error("ADMIN_TELEGRAM_ID differs from the existing owner");
    return;
  }
  if (await db.prepare("SELECT seq FROM documents WHERE namespace=? LIMIT 1").bind("production").first()) return;
  if (!/^\d{5,20}$/.test(id || "")) throw new Error("ADMIN_TELEGRAM_ID is required for the initial empty database");
  const now = new Date().toISOString();
  const payload = JSON.stringify({ name: config.ADMIN_NAME || "Администратор", roles: ["admin", "observer"], telegramId: id, active: true });
  await db.prepare("INSERT OR IGNORE INTO documents(namespace,document_id,version,kind,pid,date,author,editor,created_at,request_key,request_hash,payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind("production", "admin:owner", 1, "user", null, now.slice(0,10), "admin:owner", "admin:owner", now, "bootstrap-owner", "bootstrap", payload).run();
}
