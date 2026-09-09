// Run explicitly on this app's production host: node server/telegram-description.mjs --apply
// Only profile descriptions are changed. The token never leaves the runtime environment
// except in HTTPS requests to the official Telegram Bot API, and is never logged.
// https://core.telegram.org/bots/api#setmydescription (maximum 512 characters)
// https://core.telegram.org/bots/api#setmyshortdescription (maximum 120 characters)
const description = "Учёт демонтажа кабеля ведётся через кнопку «Открыть учёт». Файлы и сообщения из переписки в учёт не переносятся.";
const shortDescription = "Учёт ведётся через кнопку «Открыть учёт». Файлы и сообщения из переписки в учёт не переносятся.";
const methods = new Set(["getMe", "getMyDescription", "getMyShortDescription", "setMyDescription", "setMyShortDescription"]);
let stage = "validate";

async function call(method, body = {}) {
  if (!methods.has(method)) throw new Error("Method not allowed");
  stage = method;
  const response = await fetch("https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error("Telegram request failed");
  return result.result;
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--apply") {
    console.error("Usage: node server/telegram-description.mjs --apply");
    process.exitCode = 1;
    return;
  }
  if (process.env.APP_MODE !== "production" || process.env.ADMIN_TELEGRAM_ID !== "459770971" || !process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Unexpected production configuration");
  }
  if (description.length > 512 || shortDescription.length > 120) throw new Error("Description is too long");
  const bot = await call("getMe");
  stage = "identity";
  if (bot.is_bot !== true || bot.username?.toLowerCase() !== "rsskablebot") throw new Error("Unexpected bot identity");
  for (const language_code of ["", "ru"]) {
    const currentDescription = await call("getMyDescription", { language_code });
    const currentShortDescription = await call("getMyShortDescription", { language_code });
    if (currentDescription.description !== description) {
      if (await call("setMyDescription", { language_code, description }) !== true) throw new Error("Description not acknowledged");
    }
    if (currentShortDescription.short_description !== shortDescription) {
      if (await call("setMyShortDescription", { language_code, short_description: shortDescription }) !== true) throw new Error("Short description not acknowledged");
    }
    const savedDescription = await call("getMyDescription", { language_code });
    const savedShortDescription = await call("getMyShortDescription", { language_code });
    stage = "verify";
    if (savedDescription.description !== description || savedShortDescription.short_description !== shortDescription) {
      throw new Error("Description verification failed");
    }
  }
  console.log("BOT_DESCRIPTION_OK: @rsskablebot, default and ru descriptions verified. No messages sent.");
}

main().catch(() => {
  // Do not print fetch errors, response bodies or stacks: they can contain the credential URL.
  console.error("BOT_DESCRIPTION_FAILED at " + stage + "; no credentials logged. The same command can be retried safely.");
  process.exitCode = 1;
});
