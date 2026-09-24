import {randomBytes} from 'node:crypto';

// Internal scheduling must work even when no external scheduler is configured.
// A configured key is preserved. The fallback exists only for this process and
// is never returned to the browser, saved in a file, or printed in logs.
export function ensureSchedulerSecret(config) {
  if (!config.SCHEDULER_SECRET) config.SCHEDULER_SECRET = randomBytes(32).toString('hex');
  return config.SCHEDULER_SECRET;
}
