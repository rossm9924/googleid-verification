// Cloudflare KV-backed persistence. The whole product list lives under a single
// key as a JSON array — the direct analog of the original data/products.json
// file store. This suits a single reviewer working through products one at a
// time. (KV is eventually consistent and has no cross-request locking, so it is
// not built for many writers hammering it concurrently — fine for this use.)
const KEY = 'products';

async function readAll(kv) {
  const raw = await kv.get(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(kv, products) {
  await kv.put(KEY, JSON.stringify(products));
}

export async function listProducts(kv) {
  const products = await readAll(kv);
  return products.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getProduct(kv, id) {
  const products = await readAll(kv);
  return products.find((p) => p.id === id) || null;
}

export async function createProduct(kv, { fields, query }) {
  const products = await readAll(kv);
  const now = new Date().toISOString();
  const product = {
    id: crypto.randomUUID(),
    fields: fields || {},
    query: query || '',
    status: 'unverified', // unverified | verified | no_match
    match: null, // the chosen Google Shopping listing
    lastResults: [], // cached results from the most recent search
    lastSearchedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  products.push(product);
  await writeAll(kv, products);
  return product;
}

export async function updateProduct(kv, id, patch) {
  const products = await readAll(kv);
  const product = products.find((p) => p.id === id);
  if (!product) return null;
  Object.assign(product, patch, { id: product.id, updatedAt: new Date().toISOString() });
  await writeAll(kv, products);
  return product;
}

export async function deleteProduct(kv, id) {
  const products = await readAll(kv);
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  products.splice(idx, 1);
  await writeAll(kv, products);
  return true;
}
