// SyncCentric API — convert a GTIN/UPC/EAN to Amazon ASIN(s).
// https://help.synccentric.com/en/articles/4809741  (GET /api/v3/products/search)
// Key is passed in from the caller (env binding); never exposed to the browser.
const SYNC_URL = 'https://app.synccentric.com/api/v3/products/search';
const FIELDS = ['asin', 'title', 'brand', 'upc', 'ean', 'large_image', 'small_image', 'category'];

// UPC-A is 12 digits; everything else (EAN-13/GTIN-14/EAN-8) we send as `ean`.
function identifierType(digits) {
  return digits.length === 12 ? 'upc' : 'ean';
}

export async function lookupAmazonByGtin(gtin, opts = {}) {
  const apiKey = opts.apiKey;
  if (!apiKey) {
    const err = new Error('SYNCCENTRIC_API_KEY is not set.');
    err.status = 500;
    throw err;
  }
  const digits = String(gtin || '').replace(/\D/g, '');
  if (!digits) {
    const err = new Error('No GTIN/UPC provided for the Amazon lookup.');
    err.status = 400;
    throw err;
  }

  const params = new URLSearchParams();
  params.append('identifier[]', digits);
  params.append('type', identifierType(digits));
  params.append('locale', opts.locale || 'US');
  for (const f of FIELDS) params.append('fields[]', f);

  const resp = await fetch(`${SYNC_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  // Not in their catalog → treat as "no match" so the caller can fall back.
  if (resp.status === 404) return { engine: 'amazon', query: digits, results: [] };

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.errors?.[0]?.title || `SyncCentric request failed (HTTP ${resp.status})`;
    const err = new Error(msg);
    err.status = resp.status;
    throw err;
  }

  const results = (data.data || [])
    .map((d) => {
      const a = d.attributes || {};
      if (!a.asin) return null;
      return {
        marketplace: 'amazon',
        position: null,
        title: a.title || '',
        id_label: 'ASIN',
        id_value: a.asin,
        secondary_id: a.upc || a.ean || null,
        link: `https://www.amazon.com/dp/${a.asin}`,
        thumbnail: a.small_image || a.large_image || null,
        price: '',
        extracted_price: null,
        rating: null,
        reviews: null,
        source: a.brand ? `Amazon · ${a.brand}` : 'Amazon (SyncCentric)',
      };
    })
    .filter(Boolean);

  return { engine: 'amazon', query: digits, results };
}
