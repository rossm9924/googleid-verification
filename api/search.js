import { buildQuery, searchGoogleShopping } from '../src/serpapi.js';
import { readBody } from '../src/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = readBody(req);
    const query = (body.query && body.query.trim()) || buildQuery(body.fields || {});
    const result = await searchGoogleShopping(query, {
      apiKey: process.env.SERPAPI_KEY,
      gl: body.gl || process.env.DEFAULT_GL,
      hl: body.hl || process.env.DEFAULT_HL,
      location: body.location,
      num: body.num,
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
}
