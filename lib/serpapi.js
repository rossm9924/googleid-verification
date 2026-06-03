// Thin wrapper around the SerpApi Google Shopping engine.
// Keeps the API key server-side; the browser never sees it.
const SERPAPI_URL = 'https://serpapi.com/search.json';

// Ordered list of variant fields. The search query is built by joining the
// non-empty values with commas, mirroring how a person would paste identifying
// details into Google Shopping (e.g. "Hasbro Monopoly FIFA World Cup, 5010996385284").
export const PRODUCT_FIELDS = [
  { key: 'sku', label: 'SKU' },
  { key: 'gtin', label: 'GTIN' },
  { key: 'title', label: 'Title' },
  { key: 'mpn', label: 'Manufacturer Part Number' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'company', label: 'Company' },
  { key: 'description', label: 'Description' },
  { key: 'brand', label: 'Brand' },
  { key: 'collection', label: 'Collection' },
  { key: 'color', label: 'Color' },
  { key: 'size', label: 'Size' },
];

export function buildQuery(fields = {}) {
  return PRODUCT_FIELDS.map(({ key }) => (fields[key] || '').trim())
    .filter(Boolean)
    .join(', ');
}

// Pull only the fields the review UI needs out of each shopping result.
function normalizeResult(r = {}) {
  return {
    position: r.position ?? null,
    title: r.title ?? '',
    product_id: r.product_id ?? null,
    product_link: r.product_link ?? r.link ?? null,
    source: r.source ?? '',
    price: r.price ?? '',
    extracted_price: r.extracted_price ?? null,
    rating: r.rating ?? null,
    reviews: r.reviews ?? null,
    snippet: r.snippet ?? '',
    thumbnail: r.thumbnail ?? r.serpapi_thumbnail ?? null,
    delivery: r.delivery ?? '',
  };
}

export async function searchGoogleShopping(query, opts = {}) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    const err = new Error('SERPAPI_KEY is not set. Add it to your .env file.');
    err.status = 500;
    throw err;
  }
  if (!query || !query.trim()) {
    const err = new Error('Search query is empty. Fill in at least one product field.');
    err.status = 400;
    throw err;
  }

  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: query,
    api_key: apiKey,
    gl: opts.gl || process.env.DEFAULT_GL || 'us',
    hl: opts.hl || process.env.DEFAULT_HL || 'en',
  });
  if (opts.location) params.set('location', opts.location);
  if (opts.num) params.set('num', String(opts.num));

  const resp = await fetch(`${SERPAPI_URL}?${params.toString()}`);
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok || data.error) {
    const err = new Error(data.error || `SerpApi request failed (HTTP ${resp.status})`);
    err.status = resp.status === 200 ? 502 : resp.status;
    throw err;
  }

  const results = Array.isArray(data.shopping_results)
    ? data.shopping_results.map(normalizeResult)
    : [];

  return {
    query,
    query_displayed: data.search_information?.query_displayed || query,
    results_state: data.search_information?.shopping_results_state || null,
    results,
  };
}
