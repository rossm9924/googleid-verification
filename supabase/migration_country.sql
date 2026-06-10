-- Run once in the Supabase SQL Editor to enable per-import country selection.
-- Stores the search location (Google gl code, e.g. 'us', 'uk') chosen at bulk
-- import so each product is reviewed/searched in its own country.
alter table public.products add column if not exists country text;
