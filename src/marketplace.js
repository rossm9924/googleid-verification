// Amazon + Walmart lookups via SerpApi (same SERPAPI_KEY as Google Shopping).
// These are opt-in ("feature flagged") in the UI because each call costs an
// extra SerpApi search credit. Amazon results carry an ASIN; Walmart results
// carry a us_item_id. Both are normalized to one shape for the review UI.
const SERPAPI_URL = 'https://serpapi.com/search.json';

export const MARKETPLACES = ['amazon', 'walmart'];

function requireArgs(apiKey, query) {
  if (!apiKey) {
    const err = new Error('SERPAPI_KEY is not set.');
    err.status = 500;
    throw err;
  }
  if (!query || !query.trim()) {
    const err = new Error('Search query is empty.');
    err.status = 400;
    throw err;
  }
}

async function callSerpApi(params) {
  const resp = await fetch(`${SERPAPI_URL}?${params.toString()}`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.error) {
    const err = new Error(data.error || `SerpApi request failed (HTTP ${resp.status})`);
    err.status = resp.status === 200 ? 502 : resp.status;
    throw err;
  }
  return data;
}

export async function searchAmazon(query, opts = {}) {
  requireArgs(opts.apiKey, query);
  const params = new URLSearchParams({
    engine: 'amazon',
    k: query,
    amazon_domain: opts.domain || 'amazon.com',
    api_key: opts.apiKey,
  });
  const data = await callSerpApi(params);
  const results = (data.organic_results || []).map((r) => ({
    marketplace: 'amazon',
    position: r.position ?? null,
    title: r.title ?? '',
    id_label: 'ASIN',
    id_value: r.asin ?? null,
    secondary_id: null,
    link: r.link ?? r.link_clean ?? null,
    thumbnail: r.thumbnail ?? null,
    price: r.price ?? (r.extracted_price != null ? `$${r.extracted_price}` : ''),
    extracted_price: r.extracted_price ?? null,
    rating: r.rating ?? null,
    reviews: r.reviews ?? null,
    source: 'Amazon',
  }));
  return { engine: 'amazon', query, results: results.filter((r) => r.id_value) };
}

export async function searchWalmart(query, opts = {}) {
  requireArgs(opts.apiKey, query);
  const params = new URLSearchParams({ engine: 'walmart', query, api_key: opts.apiKey });
  const data = await callSerpApi(params);
  const results = (data.organic_results || []).map((r) => {
    const offer = r.primary_offer || {};
    const price = offer.offer_price != null ? `$${offer.offer_price}` : '';
    return {
      marketplace: 'walmart',
      position: r.position ?? null,
      title: r.title ?? '',
      id_label: 'Walmart Item ID',
      id_value: r.us_item_id ?? null,
      secondary_id: r.product_id ?? null,
      link: r.product_page_url ?? r.link ?? null,
      thumbnail: r.thumbnail ?? null,
      price,
      extracted_price: offer.offer_price ?? null,
      rating: r.rating ?? null,
      reviews: r.reviews ?? null,
      source: r.seller_name || 'Walmart',
    };
  });
  return { engine: 'walmart', query, results: results.filter((r) => r.id_value) };
}

export function searchMarketplace(engine, query, opts = {}) {
  if (engine === 'amazon') return searchAmazon(query, opts);
  if (engine === 'walmart') return searchWalmart(query, opts);
  const err = new Error(`Unknown marketplace engine: ${engine}`);
  err.status = 400;
  throw err;
}
