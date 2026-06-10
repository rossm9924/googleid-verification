// Persistence layer backed by Supabase (Postgres). Each product is a row with
// the variant fields as real columns (so the table is human-readable and can be
// imported/exported as CSV directly from the Supabase dashboard), plus jsonb
// columns for the chosen match and the cached search results. The Supabase
// client is passed in so this module stays easy to unit test with a fake.
import { PRODUCT_FIELDS } from './serpapi.js';

const TABLE = 'products';
const FIELD_KEYS = PRODUCT_FIELDS.map((f) => f.key);

function wrap(error) {
  const err = new Error(error?.message || 'Database error');
  err.status = 500;
  err.cause = error;
  return err;
}

function rowToProduct(row) {
  const fields = {};
  for (const k of FIELD_KEYS) fields[k] = row[k] || '';
  return {
    id: row.id,
    fields,
    query: row.query || '',
    status: row.status || 'unverified',
    country: row.country || null,
    match: row.match || null,
    amazon: row.amazon || null,
    walmart: row.walmart || null,
    sourceRow: row.source_row || null,
    lastResults: row.last_results || [],
    lastSearchedAt: row.last_searched_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fieldsToColumns(fields = {}) {
  const cols = {};
  for (const k of FIELD_KEYS) cols[k] = (fields[k] || '').toString();
  return cols;
}

export async function listProducts(db) {
  const { data, error } = await db.from(TABLE).select('*').order('updated_at', { ascending: false });
  if (error) throw wrap(error);
  return (data || []).map(rowToProduct);
}

export async function getProduct(db, id) {
  const { data, error } = await db.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw wrap(error);
  return data ? rowToProduct(data) : null;
}

export async function createProduct(db, { fields, query, sourceRow }) {
  const row = { ...fieldsToColumns(fields), query: query || '', status: 'unverified', last_results: [] };
  if (sourceRow) row.source_row = sourceRow;
  const { data, error } = await db.from(TABLE).insert(row).select().single();
  if (error) throw wrap(error);
  return rowToProduct(data);
}

// Bulk insert (used by CSV import). Chunked so large files don't blow past
// request/statement limits.
export async function createProducts(db, items) {
  if (!items.length) return [];
  const CHUNK = 500;
  const created = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    const rows = items.slice(i, i + CHUNK).map(({ fields, query, sourceRow, country }) => {
      const row = { ...fieldsToColumns(fields), query: query || '', status: 'unverified', last_results: [] };
      if (sourceRow) row.source_row = sourceRow;
      if (country) row.country = country;
      return row;
    });
    let { data, error } = await db.from(TABLE).insert(rows).select();
    // Degrade gracefully if the optional `country` column isn't there yet.
    if (error && /country/i.test(error.message || '')) {
      const stripped = rows.map(({ country, ...rest }) => rest);
      ({ data, error } = await db.from(TABLE).insert(stripped).select());
    }
    if (error) throw wrap(error);
    created.push(...(data || []).map(rowToProduct));
  }
  return created;
}

export async function updateProduct(db, id, patch) {
  const row = { updated_at: new Date().toISOString() };
  if (patch.fields) Object.assign(row, fieldsToColumns(patch.fields));
  if ('query' in patch) row.query = patch.query;
  if ('status' in patch) row.status = patch.status;
  if ('country' in patch) row.country = patch.country;
  if ('match' in patch) row.match = patch.match;
  if ('amazon' in patch) row.amazon = patch.amazon;
  if ('walmart' in patch) row.walmart = patch.walmart;
  if ('lastResults' in patch) row.last_results = patch.lastResults;
  if ('lastSearchedAt' in patch) row.last_searched_at = patch.lastSearchedAt;
  let { data, error } = await db.from(TABLE).update(row).eq('id', id).select().maybeSingle();
  if (error && 'country' in row && /country/i.test(error.message || '')) {
    const { country, ...rest } = row;
    ({ data, error } = await db.from(TABLE).update(rest).eq('id', id).select().maybeSingle());
  }
  if (error) throw wrap(error);
  return data ? rowToProduct(data) : null;
}

export async function deleteProduct(db, id) {
  const { data, error } = await db.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw wrap(error);
  return Array.isArray(data) && data.length > 0;
}
