import { searchAmazon, searchWalmart, MARKETPLACES } from '../src/marketplace.js';
import { lookupAmazonByGtin } from '../src/synccentric.js';
import { buildQuery } from '../src/serpapi.js';
import { readBody } from '../src/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = readBody(req);
    const engine = body.engine;
    if (!MARKETPLACES.includes(engine)) {
      return res.status(400).json({ error: `engine must be one of: ${MARKETPLACES.join(', ')}` });
    }
    const query = (body.query && body.query.trim()) || buildQuery(body.fields || {});
    const gtin = String(body.gtin || (body.fields && body.fields.gtin) || '').replace(/\D/g, '');

    if (engine === 'amazon') {
      // Prefer SyncCentric (GTIN/UPC → ASIN) when we have a GTIN and a key.
      if (gtin && process.env.SYNCCENTRIC_API_KEY) {
        const r = await lookupAmazonByGtin(gtin, { apiKey: process.env.SYNCCENTRIC_API_KEY, locale: body.locale });
        if (r.results.length) return res.status(200).json({ ...r, source: 'synccentric' });
      }
      // Fall back to SerpApi Amazon search (e.g. rows without a GTIN).
      if (process.env.SERPAPI_KEY && query) {
        const r = await searchAmazon(query, { apiKey: process.env.SERPAPI_KEY, domain: body.amazon_domain });
        return res.status(200).json({ ...r, source: 'serpapi' });
      }
      return res.status(200).json({ engine: 'amazon', query, results: [] });
    }

    // Walmart via SerpApi
    const r = await searchWalmart(query, { apiKey: process.env.SERPAPI_KEY });
    return res.status(200).json({ ...r, source: 'serpapi' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
}
