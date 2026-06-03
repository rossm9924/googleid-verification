// Persistence layer backed by Upstash Redis. The whole product list lives under
// a single key as a JSON document — the direct analog of the original
// data/products.json file store, which suits a single reviewer working through
// products one at a time. The Redis client is passed in so this module stays
// easy to unit test with a fake.
import { randomUUID } from 'node:crypto';

const KEY = 'products';

async function readAll(redis) {
  const data = await redis.get(KEY);
  if (!data) return [];
  // @upstash/redis usually auto-deserializes JSON, but tolerate a raw string too.
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function writeAll(redis, products) {
  await redis.set(KEY, JSON.stringify(products));
}

export async function listProducts(redis) {
  const products = await readAll(redis);
  return products.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getProduct(redis, id) {
  const products = await readAll(redis);
  return products.find((p) => p.id === id) || null;
}

export async function createProduct(redis, { fields, query }) {
  const products = await readAll(redis);
  const now = new Date().toISOString();
  const product = {
    id: randomUUID(),
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
  await writeAll(redis, products);
  return product;
}

// Create many products in one write (used by bulk CSV import).
export async function createProducts(redis, items) {
  const products = await readAll(redis);
  const now = new Date().toISOString();
  const created = items.map(({ fields, query }) => ({
    id: randomUUID(),
    fields: fields || {},
    query: query || '',
    status: 'unverified',
    match: null,
    lastResults: [],
    lastSearchedAt: null,
    createdAt: now,
    updatedAt: now,
  }));
  products.push(...created);
  await writeAll(redis, products);
  return created;
}

export async function updateProduct(redis, id, patch) {
  const products = await readAll(redis);
  const product = products.find((p) => p.id === id);
  if (!product) return null;
  Object.assign(product, patch, { id: product.id, updatedAt: new Date().toISOString() });
  await writeAll(redis, products);
  return product;
}

export async function deleteProduct(redis, id) {
  const products = await readAll(redis);
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  products.splice(idx, 1);
  await writeAll(redis, products);
  return true;
}
