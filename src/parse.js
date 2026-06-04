// Smart-paste field detection. Given an arbitrary blob a user pastes (a title,
// a UPC, "SKU: ABC123", a messy mix), figure out which product fields it maps
// to. Uses Claude when ANTHROPIC_API_KEY is configured, and always has a
// rules-based fallback so the feature works without a key.
import { PRODUCT_FIELDS } from './serpapi.js';

const FIELD_KEYS = PRODUCT_FIELDS.map((f) => f.key);

const LABEL_ALIASES = {
  manufacturer: 'manufacturer', manufacture: 'manufacturer', mfr: 'manufacturer', maker: 'manufacturer',
  title: 'title', name: 'title', product: 'title', 'product name': 'title', 'product title': 'title', item: 'title',
  gtin: 'gtin', upc: 'gtin', ean: 'gtin', barcode: 'gtin', 'upc-a': 'gtin', 'upc a': 'gtin', isbn: 'gtin',
  sku: 'sku',
  mpn: 'mpn', 'manufacturer part number': 'mpn', 'part number': 'mpn', 'part no': 'mpn', 'part #': 'mpn', model: 'mpn', 'model number': 'mpn',
  company: 'company', vendor: 'company', supplier: 'company', seller: 'company',
  description: 'description', desc: 'description',
  brand: 'brand', collection: 'collection', series: 'collection', line: 'collection',
  color: 'color', colour: 'color', size: 'size',
};

export function heuristicParse(text) {
  const fields = {};
  const raw = String(text || '').trim();
  if (!raw) return fields;

  // 1) Labelled pairs "Label: value" / "Label = value". The value is lazy and
  // stops at the next label, a separator (; | newline), or end of string — so
  // "Brand: Mattel | MPN: ABC-123" splits correctly and "MPN: ABC-123" keeps
  // its hyphen (we don't treat "-" as a label separator).
  const labelRe = /([A-Za-z][A-Za-z .#/]{1,30}?)\s*[:=]\s*(.+?)(?=(?:\s+[A-Za-z][A-Za-z .#/]{1,30}?\s*[:=])|[;|\n]|$)/g;
  const usedSpans = [];
  for (const m of raw.matchAll(labelRe)) {
    const key = LABEL_ALIASES[m[1].trim().toLowerCase()];
    if (key && !fields[key]) { fields[key] = m[2].trim(); usedSpans.push(m[0]); }
  }
  // 2) A bare 12–14 digit run is a GTIN/UPC/EAN
  if (!fields.gtin) {
    const g = raw.match(/(?<!\d)(\d{12,14})(?!\d)/);
    if (g) fields.gtin = g[1];
  }
  // 3) Whatever text is left over (no label, not the GTIN) becomes the Title
  if (!fields.title) {
    let left = raw;
    for (const u of usedSpans) left = left.replace(u, ' ');
    if (fields.gtin) left = left.replace(fields.gtin, ' ');
    left = left.replace(/[;|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (left.length >= 3 && /[A-Za-z]/.test(left)) fields.title = left;
  }
  return fields;
}

export async function aiParse(text, apiKey) {
  const system =
    `You extract structured product attributes from pasted text. Return ONLY a JSON object whose keys are exactly: ${FIELD_KEYS.join(', ')}. ` +
    `Use an empty string for anything you cannot determine — never guess. Guidance: "gtin" is a 12–14 digit UPC/EAN/GTIN/ISBN barcode; ` +
    `"mpn" is the manufacturer part number or model number; "title" is the product name. Output JSON only, no prose.`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      // Cache the (static) field-schema system prompt across calls.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user', content: `Extract the product fields from:\n"""\n${text}\n"""` },
        { role: 'assistant', content: '{' }, // prefill to force JSON
      ],
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data?.error?.message || `Anthropic request failed (HTTP ${resp.status})`);
    err.status = resp.status;
    throw err;
  }
  let out = '{' + (data.content || []).map((b) => b.text || '').join('');
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  const parsed = JSON.parse(out.slice(start, end + 1));
  const fields = {};
  for (const k of FIELD_KEYS) {
    const v = parsed[k];
    if (typeof v === 'string' && v.trim()) fields[k] = v.trim();
  }
  return fields;
}

export async function parseText(text, { apiKey } = {}) {
  if (apiKey) {
    try {
      const fields = await aiParse(text, apiKey);
      if (Object.keys(fields).length) return { fields, source: 'ai' };
    } catch {
      // fall through to heuristic
    }
  }
  return { fields: heuristicParse(text), source: 'heuristic' };
}
