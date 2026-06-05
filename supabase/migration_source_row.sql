-- Run this once in the Supabase SQL Editor if your `products` table was created
-- before the bulk-CSV import feature. It preserves each imported row so exports
-- can be written back in the original template format (e.g. ID, GTIN, Title,
-- Store, Store ID).
alter table public.products add column if not exists source_row jsonb;
