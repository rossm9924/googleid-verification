import { buildQuery } from '../src/serpapi.js';
import { getRedis } from '../src/redis.js';
import { listProducts, createProduct, createProducts } from '../src/store.js';
import { readBody, cleanFields } from '../src/http.js';

export default async function handler(req, res) {
  try {
    const redis = getRedis();
    if (req.method === 'GET') {
      return res.status(200).json({ products: await listProducts(redis) });
    }
    if (req.method === 'POST') {
      const body = readBody(req);
      // Bulk import: { items: [{ fields }, ...] }
      if (Array.isArray(body.items)) {
        const items = body.items
          .map((it) => cleanFields(it.fields || it))
          .filter((f) => Object.values(f).some(Boolean))
          .map((fields) => ({ fields, query: buildQuery(fields) }));
        const products = await createProducts(redis, items);
        return res.status(201).json({ products });
      }
      // Single create
      const fields = cleanFields(body.fields);
      const product = await createProduct(redis, { fields, query: buildQuery(fields) });
      return res.status(201).json({ product });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
}
