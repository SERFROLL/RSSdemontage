import {randomBytes,createHmac} from 'node:crypto';

// Stable across deploys, scoped to this bot, and never exposed to the client.
export function ensureWebhookSecret(config) {
  if (!config.TELEGRAM_WEBHOOK_SECRET && config.TELEGRAM_BOT_TOKEN)
    config.TELEGRAM_WEBHOOK_SECRET=createHmac('sha256',config.TELEGRAM_BOT_TOKEN).update('rssdemontage:telegram-webhook:v1').digest('hex');
  return config.TELEGRAM_WEBHOOK_SECRET;
}

// Internal scheduling must work even when no external scheduler is configured.
// A configured key is preserved. The fallback exists only for this process and
// is never returned to the browser, saved in a file, or printed in logs.
export function ensureSchedulerSecret(config) {
  if (!config.SCHEDULER_SECRET) config.SCHEDULER_SECRET = randomBytes(32).toString('hex');
  return config.SCHEDULER_SECRET;
}
