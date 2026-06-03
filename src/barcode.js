// Barcode Lookup API client (https://www.barcodelookup.com/api-documentation).
// Given a GTIN/UPC/EAN it returns the canonical product details + image(s) so a
// reviewer can compare the real product against the Google Shopping listings.
// The key is passed in from the caller (env binding); never exposed to the browser.
const BARCODE_URL = 'https://api.barcodelookup.com/v3/products';

function normalizeProduct(p = {}) {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
  return {
    barcode_number: p.barcode_number || '',
    title: p.title || p.product_name || '',
    manufacturer: p.manufacturer || '',
    brand: p.brand || '',
    category: p.category || '',
    mpn: p.mpn || '',
    model: p.model || '',
    color: p.color || '',
    size: p.size || '',
    description: p.description || '',
    images,
    image: images[0] || null,
  };
}

export async function lookupBarcode(gtin, opts = {}) {
  const apiKey = opts.apiKey;
  if (!apiKey) {
    const err = new Error('Barcode lookup is not configured. Add BARCODELOOKUP_KEY to the project environment.');
    err.status = 503;
    throw err;
  }
  const barcode = String(gtin || '').trim();
  if (!barcode) {
    const err = new Error('No GTIN/barcode provided. Fill in the GTIN field first.');
    err.status = 400;
    throw err;
  }

  const params = new URLSearchParams({ barcode, formatted: 'y', key: apiKey });
  const resp = await fetch(`${BARCODE_URL}?${params.toString()}`);

  // The API returns 404 when a barcode isn't in their database — treat as "not found".
  if (resp.status === 404) {
    return { found: false, barcode, products: [] };
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.message || (Array.isArray(data?.errors) && data.errors[0]) || `Barcode lookup failed (HTTP ${resp.status})`;
    const err = new Error(typeof msg === 'string' ? msg : 'Barcode lookup failed');
    err.status = resp.status;
    throw err;
  }

  const products = Array.isArray(data.products) ? data.products.map(normalizeProduct) : [];
  return { found: products.length > 0, barcode, products };
}
