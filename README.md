# Product Listing Verification Dashboard

A dashboard for matching product variants to **Google Shopping** listings (via
[SerpApi](https://serpapi.com/playground?engine=google_shopping)) so a reviewer
can manually verify which listing corresponds to each product. It can also pull
the canonical product image from the **GTIN** (Barcode Lookup) and look up
**Amazon ASINs** / **Walmart item IDs** (SerpApi). Data is stored in
**Supabase**. Deploys to **Vercel**.

## Features

- **Variant fields** → compiled into a comma-separated query (order:
  Manufacturer, Title, GTIN, SKU, …); editable before searching.
- **Google Shopping listings** with each result's **Catalog ID / Product ID /
  GPC ID / MID / SerpApi ID**, each copyable (and "copy all").
- **Reference image** from the GTIN via Barcode Lookup, for side-by-side comparison.
- **Amazon / Walmart lookups** (opt-in toggles) to capture **ASINs** and
  **Walmart item IDs** against each product.
- **Bulk CSV import** (paste or upload) and **CSV export** of all products +
  matched IDs.
- **Swipe review mode** to step through products quickly (keyboard / touch).

## Layout

```
index.html, app.js, styles.css   # static frontend (served from the root)
api/
  fields.js          # GET  /api/fields        (config flags + field list)
  search.js          # POST /api/search        (Google Shopping via SerpApi)
  marketplace.js     # POST /api/marketplace   (Amazon / Walmart via SerpApi)
  barcode.js         # GET  /api/barcode       (Barcode Lookup by GTIN)
  products.js        # GET/POST /api/products   (+ bulk import)
  products/[id].js   # GET/PATCH/DELETE /api/products/:id
  products/[id]/match.js   # POST verification decision
src/                 # serpapi, marketplace, barcode, store, supabase, http
supabase/schema.sql  # run once to create the products table
```

## Environment variables

| Variable                    | Required | Purpose                                                |
| --------------------------- | -------- | ------------------------------------------------------ |
| `SERPAPI_KEY`               | yes      | Google Shopping + Amazon + Walmart (same key).         |
| `SUPABASE_URL`              | yes      | Supabase project URL.                                  |
| `SUPABASE_SERVICE_ROLE_KEY` | yes      | Supabase service-role key (server-side only).          |
| `BARCODELOOKUP_KEY`         | no       | Barcode Lookup API key for the reference image.        |

> Don't commit a `.env`; set these in Vercel project settings. The Supabase
> service-role key is used only in serverless functions and never sent to the browser.

## Setup

1. **Supabase:** create a project → SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql).
   Copy the project URL and the **service_role** key into Vercel env vars above.
   (If your table predates the bulk-import feature, also run
   [`supabase/migration_source_row.sql`](supabase/migration_source_row.sql).)
2. **SerpApi:** set `SERPAPI_KEY` (covers Google, Amazon, Walmart).
3. **(Optional) Barcode Lookup:** set `BARCODELOOKUP_KEY` for the GTIN image.
4. Deploy (Vercel auto-deploys on push). The header shows live status:
   `SerpApi ✓ · Barcode ✓ · Storage ✓`.

## Local development

```bash
npm install
npm i -g vercel
vercel link && vercel env pull   # writes .env.local
vercel dev                       # http://localhost:3000
```
