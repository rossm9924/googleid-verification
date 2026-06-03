# Product Listing Verification Dashboard

A dashboard for matching product variants to **Google Shopping** listings (via
[SerpApi](https://serpapi.com/playground?engine=google_shopping)) so a reviewer
can manually verify which listing corresponds to each product. Runs on
**Cloudflare Workers**.

## How it works

1. Enter a product's variant details into the form (SKU, GTIN, Title,
   Manufacturer Part Number, Brand, etc.).
2. The non-empty fields are concatenated into a single search query, separated
   by commas — e.g. `Hasbro Monopoly FIFA World Cup, 5010996385284`. The
   compiled query is shown and is editable before you search.
3. Click **Search Google Shopping** to fetch live listings through SerpApi.
4. Review the returned listings and click **This is the match** on the correct
   one (or **Mark "no match"**). The decision is saved against the product.

Products and their verification decisions are stored in **Cloudflare KV**, so
review work persists. Saved products appear in the left sidebar with a status
badge (Unverified / Verified / No match).

## Architecture

- **Worker** (`src/worker.js`) — handles the `/api/*` routes and proxies SerpApi
  so the API key stays server-side. Static files in `public/` are served
  directly from Cloudflare's edge (configured in `wrangler.jsonc`); requests
  that don't match a file fall through to the Worker.
- **Storage** (`src/store.js`) — Cloudflare KV, with the product list stored as a
  single JSON document.
- **Frontend** (`public/`) — vanilla HTML/CSS/JS, no build step.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # then add your SerpApi key
npm run dev                      # wrangler dev -> http://127.0.0.1:8787
```

`wrangler dev` simulates KV locally, so no Cloudflare account is needed just to
run it. (Secrets come from `.dev.vars`, which is gitignored.)

## Deploying to Cloudflare

You need a Cloudflare account and either `wrangler login` (interactive) or a
`CLOUDFLARE_API_TOKEN`.

```bash
# 1. Create the KV namespace and copy the printed id into wrangler.jsonc
#    (the "id" under kv_namespaces).
npx wrangler kv namespace create PRODUCTS_KV

# 2. Deploy the Worker + static assets.
npx wrangler deploy

# 3. Set your SerpApi key as a secret on the deployed Worker.
npx wrangler secret put SERPAPI_KEY
```

After deploy, Wrangler prints the public URL
(`https://googleid-verification.<your-subdomain>.workers.dev`).

### Configuration

| Setting       | Where                         | Description                                   |
| ------------- | ----------------------------- | --------------------------------------------- |
| `SERPAPI_KEY` | Worker secret / `.dev.vars`   | SerpApi private key (https://serpapi.com/manage-api-key) |
| `PRODUCTS_KV` | `wrangler.jsonc` KV binding   | KV namespace holding products + decisions.    |
| `DEFAULT_GL`  | `wrangler.jsonc` vars         | Default Google country code (default `us`).   |
| `DEFAULT_HL`  | `wrangler.jsonc` vars         | Default Google language code (default `en`).  |

## API reference

| Method & path                  | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `GET /api/fields`              | Field definitions + whether SerpApi is configured.   |
| `POST /api/search`             | Run a search (`{ query }` or `{ fields }`, + `gl`/`hl`). |
| `GET /api/products`            | List saved products.                                 |
| `GET /api/products/:id`        | Get one product.                                     |
| `POST /api/products`           | Create a product from `{ fields }`.                  |
| `PATCH /api/products/:id`      | Update fields / cache `lastResults`.                 |
| `POST /api/products/:id/match` | Record a verification decision (`{ match, status }`).|
| `DELETE /api/products/:id`     | Delete a product.                                    |
