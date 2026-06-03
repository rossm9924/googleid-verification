// Lazily build an Upstash Redis client from whatever connection env vars the
// Vercel integration provides. The legacy "Vercel KV" integration sets
// KV_REST_API_URL / KV_REST_API_TOKEN; the current Upstash Marketplace
// integration sets UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. We accept
// either so the app works regardless of which you connected.
import { Redis } from '@upstash/redis';

let client;

export function getRedis() {
  if (client) return client;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    const err = new Error(
      'Storage is not configured. Connect an Upstash Redis database to this Vercel project (Storage tab / Marketplace) and redeploy.'
    );
    err.status = 503;
    throw err;
  }
  client = new Redis({ url, token });
  return client;
}
