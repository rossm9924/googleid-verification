-- Product Listing Verification — Supabase schema.
-- Run this in the Supabase SQL Editor (or `supabase db` migration) once, after
-- creating your project. The serverless functions use the service-role key, so
-- Row Level Security can stay disabled (access only happens server-side).

create extension if not exists "pgcrypto";

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  -- variant fields (kept as plain columns so the table is CSV-friendly)
  manufacturer  text not null default '',
  title         text not null default '',
  gtin          text not null default '',
  sku           text not null default '',
  mpn           text not null default '',
  company       text not null default '',
  description   text not null default '',
  brand         text not null default '',
  collection    text not null default '',
  color         text not null default '',
  size          text not null default '',
  -- workflow
  query             text not null default '',
  status            text not null default 'unverified',  -- unverified | verified | no_match
  match             jsonb,                                -- the chosen Google Shopping listing
  amazon            jsonb,                                -- the chosen Amazon result (ASIN)
  walmart           jsonb,                                -- the chosen Walmart result (item id)
  source_row        jsonb,                                -- the original imported CSV row (for faithful re-export)
  last_results      jsonb not null default '[]'::jsonb,   -- cached listings from the last search
  last_searched_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists products_updated_at_idx on public.products (updated_at desc);
create index if not exists products_status_idx     on public.products (status);
create index if not exists products_gtin_idx        on public.products (gtin);
