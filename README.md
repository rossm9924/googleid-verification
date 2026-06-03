# Product Listing Verification Dashboard

A small dashboard for matching product variants to **Google Shopping** listings
(via [SerpApi](https://serpapi.com/playground?engine=google_shopping)) so a
reviewer can manually verify which listing corresponds to each product.

## How it works

1. Enter a product's variant details into the form (SKU, GTIN, Title,
   Manufacturer Part Number, Brand, etc.).
2. The non-empty fields are concatenated into a single search query, separated
   by commas — e.g. `Hasbro Monopoly FIFA World Cup, 5010996385284`. The
   compiled query is shown and is editable before you search.
3. Click **Search Google Shopping** to fetch live listings through SerpApi.
4. Review the returned listings and click **This is the match** on the correct
   one (or **Mark "no match"**). The decision is saved against the product.

Products and their verification decisions are persisted to a JSON file
(`data/products.json`), so review work survives restarts. Saved products appear
in the left sidebar with a status badge (Unverified / Verified / No match).

## Architecture

- **Backend** — Node + Express (`server.js`). Proxies SerpApi so the API key
  stays server-side, and exposes a small REST API for products. Persistence is a
  zero-dependency atomic JSON file store (`lib/store.js`).
- **Frontend** — vanilla HTML/CSS/JS in `public/`. No build step.

## Setup

```bash
npm install
cp .env.example .env   # then add your SerpApi key
npm start              # http://localhost:3000
```

`npm run dev` starts the server with `--watch` for auto-reload.

### Environment variables (`.env`)

| Variable      | Required | Description                                              |
| ------------- | -------- | -------------------------------------------------------- |
| `SERPAPI_KEY` | yes      | Your SerpApi private key (https://serpapi.com/manage-api-key) |
| `PORT`        | no       | Server port (default `3000`).                            |
| `DEFAULT_GL`  | no       | Default Google country code (default `us`).              |
| `DEFAULT_HL`  | no       | Default Google language code (default `en`).             |

> The `.env` file is gitignored — never commit your real key.

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
