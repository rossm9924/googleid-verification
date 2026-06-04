// Lazily build a Supabase client from env vars. The service-role key is used
// because these calls run server-side only (in Vercel functions); it is never
// shipped to the browser. Falls back to other common key names so it works
// whether you set it by hand or via the Vercel Supabase integration.
import { createClient } from '@supabase/supabase-js';

let client;

export function getDb() {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    const err = new Error(
      'Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the project environment, and run supabase/schema.sql.'
    );
    err.status = 503;
    throw err;
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function storageConfigured() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  return Boolean(url && key);
}
