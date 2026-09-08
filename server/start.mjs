import { nodeRuntime } from "./runtime.mjs";
import { migrate, bootstrapOwner } from "./migrate.mjs";

async function main() {
  const runtime = nodeRuntime();
  if (!runtime.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");
  if (runtime.MINI_APP_URL) {
    const url = new URL(runtime.MINI_APP_URL);
    if (url.protocol !== "https:") throw new Error("MINI_APP_URL must use HTTPS");
    process.env.VINEXT_TRUSTED_HOSTS = url.host;
  }
  if (runtime.BOT_ENABLED === "true" && (!runtime.MINI_APP_URL || !runtime.SCHEDULER_SECRET || !runtime.TELEGRAM_WEBHOOK_SECRET)) {
    throw new Error("MINI_APP_URL, SCHEDULER_SECRET and TELEGRAM_WEBHOOK_SECRET are required to enable the bot");
  }
  await migrate(runtime.pool);
  await bootstrapOwner(runtime.DB, runtime);
  const { startProdServer } = await import("vinext/server/prod-server");
  const { server, port } = await startProdServer({ port: Number(process.env.PORT || 8080), host: "0.0.0.0" });
  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const result = await fetch(`http://127.0.0.1:${port}/api/scheduler`, {
        method: "POST", headers: { authorization: "Bearer " + runtime.SCHEDULER_SECRET },
        signal: AbortSignal.timeout(55000),
      });
      if (!result.ok) console.error("Scheduled check failed");
    } catch { console.error("Scheduled check interrupted"); }
    finally { busy = false; }
  }
  const timer = runtime.BOT_ENABLED === "true" ? setInterval(tick, 60000) : undefined;
  if (timer) { timer.unref(); void tick(); }
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    if (timer) clearInterval(timer);
    setTimeout(() => process.exit(1), 15000).unref();
    await new Promise(resolve => server.close(resolve));
    runtime.BUCKET.close();
    await runtime.pool.end();
    process.exit(0);
  }
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
main().catch(() => { console.error("Startup failed: check runtime settings and database access"); process.exit(1); });
