import 'dotenv/config';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRODUCT_FIELDS, buildQuery, searchGoogleShopping } from './lib/serpapi.js';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from './lib/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(__dirname, 'public')));

// Wrap an async handler so thrown errors hit the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Expose the field definitions so the frontend renders the form from one source of truth.
app.get('/api/fields', (req, res) => {
  res.json({ fields: PRODUCT_FIELDS, serpapiConfigured: Boolean(process.env.SERPAPI_KEY) });
});

// Run a Google Shopping search. Accepts either an explicit `query` or `fields`
// to compile one from. Does NOT persist anything by itself.
app.post(
  '/api/search',
  wrap(async (req, res) => {
    const { fields, query: explicitQuery, gl, hl, location, num } = req.body || {};
    const query = (explicitQuery && explicitQuery.trim()) || buildQuery(fields || {});
    const result = await searchGoogleShopping(query, { gl, hl, location, num });
    res.json(result);
  })
);

app.get(
  '/api/products',
  wrap(async (req, res) => {
    res.json({ products: await listProducts() });
  })
);

app.get(
  '/api/products/:id',
  wrap(async (req, res) => {
    const product = await getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  })
);

// Create a product from variant fields (compiles the query on save).
app.post(
  '/api/products',
  wrap(async (req, res) => {
    const { fields } = req.body || {};
    const cleanFields = {};
    for (const { key } of PRODUCT_FIELDS) {
      if (fields && typeof fields[key] === 'string') cleanFields[key] = fields[key].trim();
    }
    const query = buildQuery(cleanFields);
    const product = await createProduct({ fields: cleanFields, query });
    res.status(201).json({ product });
  })
);

// Patch a product: edit fields, store the latest search results, etc.
app.patch(
  '/api/products/:id',
  wrap(async (req, res) => {
    const patch = {};
    const { fields, lastResults } = req.body || {};
    if (fields && typeof fields === 'object') {
      const cleanFields = {};
      for (const { key } of PRODUCT_FIELDS) {
        if (typeof fields[key] === 'string') cleanFields[key] = fields[key].trim();
      }
      patch.fields = cleanFields;
      patch.query = buildQuery(cleanFields);
    }
    if (Array.isArray(lastResults)) {
      patch.lastResults = lastResults;
      patch.lastSearchedAt = new Date().toISOString();
    }
    const product = await updateProduct(req.params.id, patch);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  })
);

// Record Sasha's verification decision for a product.
app.post(
  '/api/products/:id/match',
  wrap(async (req, res) => {
    const { match, status } = req.body || {};
    const validStatuses = ['verified', 'no_match', 'unverified'];
    const nextStatus = validStatuses.includes(status) ? status : match ? 'verified' : 'unverified';
    const product = await updateProduct(req.params.id, {
      match: match || null,
      status: nextStatus,
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product });
  })
);

app.delete(
  '/api/products/:id',
  wrap(async (req, res) => {
    const ok = await deleteProduct(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Product not found' });
    res.status(204).end();
  })
);

// Centralized error handler -> JSON.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  const configured = Boolean(process.env.SERPAPI_KEY);
  console.log(`Product verification dashboard running at http://localhost:${PORT}`);
  if (!configured) {
    console.warn('WARNING: SERPAPI_KEY is not set. Searches will fail until you add it to .env');
  }
});
