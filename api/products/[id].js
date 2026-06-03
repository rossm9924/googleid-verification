import { buildQuery } from '../../src/serpapi.js';
import { getRedis } from '../../src/redis.js';
import { getProduct, updateProduct, deleteProduct } from '../../src/store.js';
import { readBody, cleanFields } from '../../src/http.js';

export default async function handler(req, res) {
  const { id } = req.query;
  try {
    const redis = getRedis();

    if (req.method === 'GET') {
      const product = await getProduct(redis, id);
      return product ? res.status(200).json({ product }) : res.status(404).json({ error: 'Product not found' });
    }

    if (req.method === 'PATCH') {
      const body = readBody(req);
      const patch = {};
      if (body.fields && typeof body.fields === 'object') {
        const fields = cleanFields(body.fields);
        patch.fields = fields;
        patch.query = buildQuery(fields);
      }
      if (Array.isArray(body.lastResults)) {
        patch.lastResults = body.lastResults;
        patch.lastSearchedAt = new Date().toISOString();
      }
      const product = await updateProduct(redis, id, patch);
      return product ? res.status(200).json({ product }) : res.status(404).json({ error: 'Product not found' });
    }

    if (req.method === 'DELETE') {
      const ok = await deleteProduct(redis, id);
      return ok ? res.status(204).end() : res.status(404).json({ error: 'Product not found' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
}
