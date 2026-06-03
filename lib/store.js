// Tiny JSON-file persistence layer. No external DB needed.
// Stores an array of product records in data/products.json and writes
// atomically (write temp file + rename) so a crash mid-write can't corrupt it.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_FILE = join(DATA_DIR, 'products.json');

// Serialize writes so concurrent requests can't clobber each other.
let writeChain = Promise.resolve();

async function readAll() {
  if (!existsSync(DB_FILE)) return [];
  try {
    const raw = await readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(products) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(products, null, 2), 'utf8');
  await rename(tmp, DB_FILE);
}

// Run a read-modify-write under the shared lock and return the result.
function mutate(fn) {
  const next = writeChain.then(async () => {
    const products = await readAll();
    const result = await fn(products);
    await writeAll(products);
    return result;
  });
  // Keep the chain alive even if this mutation rejects.
  writeChain = next.catch(() => {});
  return next;
}

export async function listProducts() {
  const products = await readAll();
  return products.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getProduct(id) {
  const products = await readAll();
  return products.find((p) => p.id === id) || null;
}

export function createProduct({ fields, query }) {
  return mutate((products) => {
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
    return product;
  });
}

export function updateProduct(id, patch) {
  return mutate((products) => {
    const product = products.find((p) => p.id === id);
    if (!product) return null;
    Object.assign(product, patch, { id: product.id, updatedAt: new Date().toISOString() });
    return product;
  });
}

export function deleteProduct(id) {
  return mutate((products) => {
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    products.splice(idx, 1);
    return true;
  });
}
