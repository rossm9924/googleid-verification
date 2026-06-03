// Cloudflare Worker entrypoint. Static assets in public/ are served directly by
// the platform (configured in wrangler.jsonc); this Worker only handles the
// /api/* routes. The SerpApi key and KV namespace arrive via the `env` binding.
import { PRODUCT_FIELDS, buildQuery, searchGoogleShopping } from './serpapi.js';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from './store.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const fail = (message, status = 500) => json({ error: message }, status);

function cleanFieldsFrom(fields) {
  const clean = {};
  for (const { key } of PRODUCT_FIELDS) {
    if (fields && typeof fields[key] === 'string') clean[key] = fields[key].trim();
  }
  return clean;
}

async function readJson(request) {
  return request.json().catch(() => ({}));
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    // Anything that isn't an API call and wasn't matched as a static asset.
    if (!pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }

    try {
      if (pathname === '/api/fields' && method === 'GET') {
        return json({ fields: PRODUCT_FIELDS, serpapiConfigured: Boolean(env.SERPAPI_KEY) });
      }

      if (pathname === '/api/search' && method === 'POST') {
        const body = await readJson(request);
        const query = (body.query && body.query.trim()) || buildQuery(body.fields || {});
        const result = await searchGoogleShopping(query, {
          apiKey: env.SERPAPI_KEY,
          gl: body.gl || env.DEFAULT_GL,
          hl: body.hl || env.DEFAULT_HL,
          location: body.location,
          num: body.num,
        });
        return json(result);
      }

      if (pathname === '/api/products') {
        if (method === 'GET') {
          return json({ products: await listProducts(env.PRODUCTS_KV) });
        }
        if (method === 'POST') {
          const body = await readJson(request);
          const fields = cleanFieldsFrom(body.fields);
          const product = await createProduct(env.PRODUCTS_KV, { fields, query: buildQuery(fields) });
          return json({ product }, 201);
        }
      }

      const m = pathname.match(/^\/api\/products\/([^/]+)(\/match)?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const isMatchRoute = Boolean(m[2]);

        if (isMatchRoute && method === 'POST') {
          const body = await readJson(request);
          const valid = ['verified', 'no_match', 'unverified'];
          const status = valid.includes(body.status)
            ? body.status
            : body.match
              ? 'verified'
              : 'unverified';
          const product = await updateProduct(env.PRODUCTS_KV, id, { match: body.match || null, status });
          return product ? json({ product }) : fail('Product not found', 404);
        }

        if (!isMatchRoute && method === 'GET') {
          const product = await getProduct(env.PRODUCTS_KV, id);
          return product ? json({ product }) : fail('Product not found', 404);
        }

        if (!isMatchRoute && method === 'PATCH') {
          const body = await readJson(request);
          const patch = {};
          if (body.fields && typeof body.fields === 'object') {
            const fields = cleanFieldsFrom(body.fields);
            patch.fields = fields;
            patch.query = buildQuery(fields);
          }
          if (Array.isArray(body.lastResults)) {
            patch.lastResults = body.lastResults;
            patch.lastSearchedAt = new Date().toISOString();
          }
          const product = await updateProduct(env.PRODUCTS_KV, id, patch);
          return product ? json({ product }) : fail('Product not found', 404);
        }

        if (!isMatchRoute && method === 'DELETE') {
          const ok = await deleteProduct(env.PRODUCTS_KV, id);
          return ok ? new Response(null, { status: 204 }) : fail('Product not found', 404);
        }
      }

      return fail('Not found', 404);
    } catch (e) {
      return fail(e.message || 'Internal server error', e.status || 500);
    }
  },
};
