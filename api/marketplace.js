import { searchMarketplace, MARKETPLACES } from '../src/marketplace.js';
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
    const result = await searchMarketplace(engine, query, {
      apiKey: process.env.SERPAPI_KEY,
      domain: body.amazon_domain,
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
}
