import { getRedis } from '../../../src/redis.js';
import { updateProduct } from '../../../src/store.js';
import { readBody } from '../../../src/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { id } = req.query;
  try {
    const redis = getRedis();
    const body = readBody(req);
    const valid = ['verified', 'no_match', 'unverified'];
    const status = valid.includes(body.status) ? body.status : body.match ? 'verified' : 'unverified';
    const product = await updateProduct(redis, id, { match: body.match || null, status });
    return product ? res.status(200).json({ product }) : res.status(404).json({ error: 'Product not found' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
}
