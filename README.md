# Product Listing Verification Dashboard

A dashboard for matching product variants to **Google Shopping** listings (via
[SerpApi](https://serpapi.com/playground?engine=google_shopping)) so a reviewer
can manually verify which listing corresponds to each product. Deploys to
**Vercel** (static frontend + serverless functions + Upstash Redis).

## How it works

1. Enter a product's variant details into the form (SKU, GTIN, Title,
   Manufacturer Part Number, Brand, etc.).
2. The non-empty fields are concatenated into a single search query, separated
   by commas — e.g. `Hasbro Monopoly FIFA World Cup, 5010996385284`. The
   compiled query is shown and is editable before you search.
3. Click **Search Google Shopping** to fetch live listings through SerpApi.
4. Review the returned listings and click **This is the match** on the correct
   one (or **Mark "no match"**). The decision is saved against the product.

Products and their verification decisions are stored in **Upstash Redis**, so
review work persists. Saved products appear in the left sidebar with a status
badge (Unverified / Verified / No match).

## Layout

```
index.html, app.js, styles.css   # static frontend (served from the root)
api/
  fields.js                      # GET  /api/fields
  search.js                      # POST /api/search  (SerpApi proxy)
  products.js                    # GET/POST /api/products
  products/[id].js               # GET/PATCH/DELETE /api/products/:id
  products/[id]/match.js         # POST /api/products/:id/match
src/                             # shared logic (serpapi, store, redis, http)
```

The SerpApi key lives only in the serverless functions (`process.env.SERPAPI_KEY`);
the browser never sees it.

## Deploying on Vercel

This repo is zero-config: static files at the root + serverless functions in
`api/`. Connect the GitHub repo to a Vercel project (Framework Preset =
**Other**, no build command) and pushes deploy automatically.

### Required environment variables

| Variable                  | Set by                                | Purpose                                  |
| ------------------------- | ------------------------------------- | ---------------------------------------- |
| `SERPAPI_KEY`             | you (Project → Settings → Env Vars)   | SerpApi private key.                     |
| `KV_REST_API_URL` *or* `UPSTASH_REDIS_REST_URL`     | Upstash integration | Redis REST URL.   |
| `KV_REST_API_TOKEN` *or* `UPSTASH_REDIS_REST_TOKEN` | Upstash integration | Redis REST token. |

> **Do not commit a `.env` file.** Vercel does not deploy with a committed
> `.env`; it reads env vars from the project settings. A committed `.env` would
> only leak your key into git.

### One-time setup

1. **Add the SerpApi key:** Project → **Settings** → **Environment Variables** →
   add `SERPAPI_KEY`, then redeploy. (Search works once this is set.)
2. **Add storage:** Project → **Storage** → connect an **Upstash Redis** database
   (Vercel Marketplace). It auto-injects the Redis env vars above. Redeploy.
   (Saving / verifying matches works once this is set.)

## Local development

```bash
npm install
npm i -g vercel        # if you don't have the CLI
vercel link            # link to your Vercel project
vercel env pull        # pulls env vars into .env.local
vercel dev             # http://localhost:3000
```
