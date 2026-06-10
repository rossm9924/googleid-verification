// Product Listing Verification — frontend logic (vanilla JS).
const state = {
  fields: [],
  serpapiConfigured: false,
  barcodeConfigured: false,
  marketplaceConfigured: false,
  storageConfigured: false,
  aiParseConfigured: false,
  amazonOn: localStorage.getItem('amazonOn') === '1',
  walmartOn: localStorage.getItem('walmartOn') === '1',
  countryGl: localStorage.getItem('countryGl') || 'us',
  products: [],
  current: null, // currently loaded product record, or null for a new/unsaved one
  results: [], // results from the most recent search
  marketplaceResults: { amazon: [], walmart: [] },
  review: { active: false, ids: [], index: 0, unverifiedOnly: false, mp: { amazon: [], walmart: [] } },
};

// Reference (barcode) lookups cached by GTIN for the session.
const referenceCache = new Map();

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) {
    if (c == null || c === false) continue;
    node.append(c?.nodeType ? c : document.createTextNode(c));
  }
  return node;
};

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const resp = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (resp.status === 204) return null;
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

/* ---------- Clipboard ---------- */
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = '✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1100);
  }
}

/* ---------- Search location (country) ---------- */
// name = SerpApi `location` value; gl/hl = Google country/language; amazon_domain
// + locale drive Amazon (SerpApi / SyncCentric). Omitted Amazon fields fall back
// to amazon.com / US on the server.
const COUNTRIES = [
  { name: 'United States', gl: 'us', hl: 'en', amazon_domain: 'amazon.com', locale: 'US' },
  { name: 'United Kingdom', gl: 'uk', hl: 'en', amazon_domain: 'amazon.co.uk', locale: 'GB' },
  { name: 'Canada', gl: 'ca', hl: 'en', amazon_domain: 'amazon.ca', locale: 'CA' },
  { name: 'Australia', gl: 'au', hl: 'en', amazon_domain: 'amazon.com.au', locale: 'AU' },
  { name: 'Germany', gl: 'de', hl: 'de', amazon_domain: 'amazon.de', locale: 'DE' },
  { name: 'France', gl: 'fr', hl: 'fr', amazon_domain: 'amazon.fr', locale: 'FR' },
  { name: 'Italy', gl: 'it', hl: 'it', amazon_domain: 'amazon.it', locale: 'IT' },
  { name: 'Spain', gl: 'es', hl: 'es', amazon_domain: 'amazon.es', locale: 'ES' },
  { name: 'Netherlands', gl: 'nl', hl: 'nl', amazon_domain: 'amazon.nl', locale: 'NL' },
  { name: 'Mexico', gl: 'mx', hl: 'es', amazon_domain: 'amazon.com.mx', locale: 'MX' },
  { name: 'Brazil', gl: 'br', hl: 'pt', amazon_domain: 'amazon.com.br', locale: 'BR' },
  { name: 'India', gl: 'in', hl: 'en', amazon_domain: 'amazon.in', locale: 'IN' },
  { name: 'Japan', gl: 'jp', hl: 'ja', amazon_domain: 'amazon.co.jp', locale: 'JP' },
  { name: 'Sweden', gl: 'se', hl: 'sv', amazon_domain: 'amazon.se', locale: 'SE' },
  { name: 'Poland', gl: 'pl', hl: 'pl', amazon_domain: 'amazon.pl', locale: 'PL' },
  { name: 'Turkey', gl: 'tr', hl: 'tr', amazon_domain: 'amazon.com.tr', locale: 'TR' },
  { name: 'United Arab Emirates', gl: 'ae', hl: 'en', amazon_domain: 'amazon.ae', locale: 'AE' },
  { name: 'Saudi Arabia', gl: 'sa', hl: 'en', amazon_domain: 'amazon.sa', locale: 'SA' },
  { name: 'Singapore', gl: 'sg', hl: 'en', amazon_domain: 'amazon.sg', locale: 'SG' },
  { name: 'Ireland', gl: 'ie', hl: 'en' },
  { name: 'New Zealand', gl: 'nz', hl: 'en' },
  { name: 'South Africa', gl: 'za', hl: 'en' },
  { name: 'Switzerland', gl: 'ch', hl: 'de' },
  { name: 'Austria', gl: 'at', hl: 'de' },
  { name: 'Belgium', gl: 'be', hl: 'nl' },
  { name: 'Norway', gl: 'no', hl: 'no' },
  { name: 'Denmark', gl: 'dk', hl: 'da' },
  { name: 'Finland', gl: 'fi', hl: 'fi' },
  { name: 'Portugal', gl: 'pt', hl: 'pt' },
  { name: 'Greece', gl: 'gr', hl: 'el' },
  { name: 'Hong Kong', gl: 'hk', hl: 'en' },
  { name: 'South Korea', gl: 'kr', hl: 'ko' },
  { name: 'Argentina', gl: 'ar', hl: 'es' },
  { name: 'Chile', gl: 'cl', hl: 'es' },
  { name: 'Colombia', gl: 'co', hl: 'es' },
];

function currentCountry() {
  return COUNTRIES.find((c) => c.gl === state.countryGl) || COUNTRIES[0];
}
function searchLocale() {
  const c = currentCountry();
  return { location: c.name, gl: c.gl, hl: c.hl, amazon_domain: c.amazon_domain || 'amazon.com', locale: c.locale || 'US' };
}
function populateCountrySelect(sel) {
  if (!sel) return;
  sel.innerHTML = '';
  COUNTRIES.forEach((c) => {
    const o = el('option', { value: c.gl }, c.name);
    if (c.gl === state.countryGl) o.selected = true;
    sel.append(o);
  });
}
function setCountry(gl) {
  state.countryGl = gl;
  localStorage.setItem('countryGl', gl);
  ['#locationSelect', '#reviewLocationSelect'].forEach((s) => { const node = $(s); if (node) node.value = gl; });
}

/* ---------- Fields ---------- */
function collectFields() {
  const out = {};
  for (const { key } of state.fields) {
    const input = document.getElementById(`field-${key}`);
    out[key] = input ? input.value.trim() : '';
  }
  return out;
}

function buildQuery(fields) {
  return state.fields.map(({ key }) => (fields[key] || '').trim()).filter(Boolean).join(', ');
}

function syncQueryPreview() {
  $('#queryInput').value = buildQuery(collectFields());
  toggleReferencePanel();
}

function renderForm() {
  const form = $('#productForm');
  form.innerHTML = '';
  for (const { key, label } of state.fields) {
    const wide = ['title', 'description'].includes(key);
    const input = el('input', { id: `field-${key}`, type: 'text', autocomplete: 'off' });
    input.addEventListener('input', syncQueryPreview);
    form.append(el('div', { className: `field${wide ? ' field--wide' : ''}` }, el('label', { htmlFor: `field-${key}` }, label), input));
  }
}

function setFormValues(fields = {}) {
  for (const { key } of state.fields) {
    const input = document.getElementById(`field-${key}`);
    if (input) input.value = fields[key] || '';
  }
  syncQueryPreview();
}

function currentGtin() {
  const input = document.getElementById('field-gtin');
  return input ? input.value.trim() : (state.current?.fields?.gtin || '');
}

/* ---------- Status badge ---------- */
const STATUS_LABEL = { verified: 'Verified', no_match: 'No match', unverified: 'Unverified' };
const statusBadge = (status) => el('span', { className: `badge badge--${status}` }, STATUS_LABEL[status] || status);

/* ---------- Sidebar ---------- */
function renderProductList() {
  const filter = $('#productSearch').value.trim().toLowerCase();
  const list = $('#productList');
  list.innerHTML = '';
  $('#productCount').textContent = state.products.length ? `${state.products.length}` : '';
  $('#productListEmpty').classList.toggle('hidden', state.products.length > 0);

  const items = state.products.filter((p) =>
    !filter || (p.query || '').toLowerCase().includes(filter) || JSON.stringify(p.fields).toLowerCase().includes(filter)
  );

  for (const p of items) {
    const title = p.fields.title || p.query || '(untitled product)';
    const item = el('li', { className: `product-item${state.current?.id === p.id ? ' active' : ''}` },
      el('div', { className: 'product-item__title' }, title),
      el('div', { className: 'product-item__meta' }, statusBadge(p.status)));
    item.addEventListener('click', () => loadProduct(p.id));
    list.append(item);
  }
}

function upsertLocalProduct(product) {
  const i = state.products.findIndex((p) => p.id === product.id);
  if (i >= 0) state.products[i] = product;
  else state.products.unshift(product);
}

/* ---------- Editor ---------- */
function showEditor(product) {
  state.current = product;
  const isExisting = Boolean(product?.id);
  $('#formTitle').textContent = isExisting ? 'Edit Product' : 'Add Product';
  $('#deleteBtn').classList.toggle('hidden', !isExisting);

  const badge = $('#statusBadge');
  if (isExisting) {
    badge.className = `badge badge--${product.status}`;
    badge.textContent = STATUS_LABEL[product.status] || product.status;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  setFormValues(product?.fields || {});
  renderMatch(product?.match || null);
  updateMarketplaceVisibility(product);

  if (product?.lastResults?.length) {
    state.results = product.lastResults;
    renderResultsInto($('#results'), product.lastResults, {
      matchObj: product.match,
      onMatch: selectMatch,
      statusEl: $('#resultsStatus'),
      countEl: $('#resultsCount'),
      statusMsg: `Showing ${product.lastResults.length} cached listing(s) from the last search.`,
    });
  } else {
    state.results = [];
    $('#results').innerHTML = '';
    $('#resultsCount').textContent = '';
    $('#resultsStatus').textContent = 'Run a search to see Google Shopping listings.';
    $('#resultsStatus').classList.remove('hidden');
  }
  $('#markNoMatchBtn').classList.toggle('hidden', !isExisting);
  renderProductList();
}

function newProduct() {
  showEditor(null);
  setFormValues({});
  $('#queryInput').value = '';
  $('#referenceBody').innerHTML = '';
  clearPaste();
  toggleReferencePanel();
}

async function loadProduct(id) {
  try {
    const { product } = await api(`/api/products/${id}`);
    showEditor(product);
    // Auto-fetch the reference image for context (cached per GTIN).
    if (product.fields?.gtin) renderReferenceInto($('#referenceBody'), product.fields.gtin);
  } catch (e) {
    toast(e.message, 'bad');
  }
}

/* ---------- Match panel ---------- */
function renderMatch(match) {
  const panel = $('#matchPanel');
  const body = $('#matchBody');
  if (!match) { panel.classList.add('hidden'); body.innerHTML = ''; return; }
  panel.classList.remove('hidden');
  body.innerHTML = '';
  const img = match.thumbnail ? el('img', { src: match.thumbnail, alt: '' }) : el('div', { className: 'placeholder' }, 'no image');
  const meta = el('div', { className: 'match-summary__meta' },
    el('strong', {}, match.title || '(no title)'),
    el('span', { className: 'card__source' }, match.source || ''),
    el('span', { className: 'card__price' }, match.price || ''));
  meta.append(idsBlock(match));
  if (match.product_link) meta.append(el('a', { href: match.product_link, target: '_blank', rel: 'noopener' }, 'Open on Google ↗'));
  body.append(el('div', { className: 'match-summary' }, img, meta));
}

/* ---------- Listing identifiers + copy ---------- */
function idRow(label, value) {
  if (!value) return null;
  const btn = el('button', { className: 'copy-btn', type: 'button', title: `Copy ${label}` }, 'copy');
  btn.addEventListener('click', () => copyText(String(value), btn));
  return el('div', { className: 'id-row' },
    el('span', { className: 'id-label' }, label),
    el('span', { className: 'id-val', title: String(value) }, String(value)), btn);
}

function idsBlock(r) {
  const rows = [
    ['Catalog ID', r.catalog_id],
    ['Product ID', r.listing_product_id],
    ['GPC ID', r.gpcid],
    ['MID', r.mid],
    ['SerpApi ID', r.product_id],
  ].map(([l, v]) => idRow(l, v)).filter(Boolean);

  const block = el('div', { className: 'card__ids' }, ...rows);
  if (rows.length) {
    const all = [
      ['catalog_id', r.catalog_id], ['product_id', r.listing_product_id], ['gpcid', r.gpcid],
      ['mid', r.mid], ['serpapi_product_id', r.product_id], ['source', r.source],
      ['price', r.price], ['title', r.title], ['product_link', r.product_link],
    ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
    const copyAll = el('button', { className: 'copy-btn', type: 'button' }, 'copy all');
    copyAll.addEventListener('click', () => copyText(all, copyAll));
    block.append(el('div', { className: 'id-row' }, copyAll));
  }
  return block;
}

/* ---------- Results ---------- */
function sameListing(a, b) {
  if (!a || !b) return false;
  if (a.catalog_id && b.catalog_id) return a.catalog_id === b.catalog_id;
  if (a.product_id && b.product_id) return a.product_id === b.product_id;
  if (a.product_link && b.product_link) return a.product_link === b.product_link;
  return a.title === b.title && a.source === b.source;
}

function resultCard(r, { matchObj, onMatch }) {
  const isMatch = sameListing(r, matchObj);
  const thumb = el('div', { className: 'card__thumb' },
    r.thumbnail ? el('img', { src: r.thumbnail, alt: '', loading: 'lazy' }) : el('span', { className: 'placeholder' }, 'no image'));

  const body = el('div', { className: 'card__body' },
    el('div', { className: 'card__title' }, r.title || '(no title)'),
    r.source && el('div', { className: 'card__source' }, r.source),
    r.price && el('div', { className: 'card__price' }, r.price),
    r.rating && el('div', { className: 'card__rating' }, `★ ${r.rating}${r.reviews ? ` (${r.reviews})` : ''}`),
    r.delivery && el('div', { className: 'card__delivery' }, r.delivery),
    idsBlock(r));

  const matchBtn = el('button', { className: `btn btn--sm ${isMatch ? '' : 'btn--primary'}`, type: 'button' }, isMatch ? '✓ Matched' : 'This is the match');
  matchBtn.addEventListener('click', () => onMatch(r));
  const foot = el('div', { className: 'card__foot' }, matchBtn);
  if (r.product_link) foot.append(el('a', { href: r.product_link, target: '_blank', rel: 'noopener' }, 'View ↗'));

  return el('div', { className: `card${isMatch ? ' is-match' : ''}` }, thumb, body, foot);
}

function renderResultsInto(grid, results, { matchObj, onMatch, statusEl, countEl, statusMsg }) {
  grid.innerHTML = '';
  if (statusEl) {
    if (!results.length) {
      statusEl.textContent = statusMsg || 'No listings found for this query.';
      statusEl.classList.remove('hidden');
    } else {
      statusEl.classList.add('hidden');
    }
  }
  if (countEl) countEl.textContent = results.length ? `${results.length} listing(s)` : '';
  results.forEach((r) => grid.append(resultCard(r, { matchObj, onMatch })));
}

/* ---------- Reference (barcode) ---------- */
function toggleReferencePanel() {
  $('#referencePanel').classList.toggle('hidden', !currentGtin());
}

async function fetchReference(gtin, force = false) {
  if (!force && referenceCache.has(gtin)) return referenceCache.get(gtin);
  const data = await api(`/api/barcode?gtin=${encodeURIComponent(gtin)}`);
  referenceCache.set(gtin, data);
  return data;
}

async function renderReferenceInto(container, gtin, { force = false } = {}) {
  if (!container) return;
  if (!gtin) { container.innerHTML = ''; container.append(el('div', { className: 'muted' }, 'No GTIN on this product.')); return; }

  if (!state.barcodeConfigured) {
    container.innerHTML = '';
    const link = el('a', { href: `https://www.barcodelookup.com/${encodeURIComponent(gtin)}`, target: '_blank', rel: 'noopener', className: 'btn btn--sm' }, 'Open on Barcode Lookup ↗');
    container.append(el('div', { className: 'reference-meta' },
      el('div', { className: 'muted' }, 'Barcode Lookup API key not set (BARCODELOOKUP_KEY). Showing a link instead of the image.'), link));
    return;
  }

  container.innerHTML = '';
  container.append(el('div', { className: 'muted' }, 'Looking up GTIN…'));
  try {
    const data = await fetchReference(gtin, force);
    container.innerHTML = '';
    if (!data.found || !data.products.length) {
      container.append(el('div', { className: 'placeholder' }, 'Not found'),
        el('div', { className: 'reference-meta' }, el('div', { className: 'muted' }, `No Barcode Lookup match for ${gtin}.`)));
      return;
    }
    const p = data.products[0];
    const img = p.image ? el('img', { src: p.image, alt: p.title || '' }) : el('div', { className: 'placeholder' }, 'no image');
    const meta = el('div', { className: 'reference-meta' },
      el('div', { className: 'r-title' }, p.title || '(no title)'),
      p.manufacturer && el('div', {}, `Manufacturer: ${p.manufacturer}`),
      p.brand && el('div', {}, `Brand: ${p.brand}`),
      p.category && el('div', { className: 'muted' }, p.category),
      el('div', { className: 'muted' }, `GTIN ${p.barcode_number || gtin}`));
    if (p.images.length > 1) {
      const thumbs = el('div', { className: 'reference-thumbs' });
      p.images.slice(0, 6).forEach((u) => {
        const t = el('img', { src: u, alt: '' });
        t.addEventListener('click', () => { img.src = u; });
        thumbs.append(t);
      });
      meta.append(thumbs);
    }
    container.append(img, meta);
  } catch (e) {
    container.innerHTML = '';
    container.append(el('div', { className: 'muted' }, `Barcode lookup failed: ${e.message}`));
  }
}

/* ---------- Smart paste (detect fields from pasted text) ---------- */
async function detectPaste() {
  const text = $('#pasteText').value.trim();
  if (!text) { toast('Paste something first.', 'bad'); return; }
  const btn = $('#pasteDetectBtn');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Detecting…';
  try {
    const { fields, source } = await api('/api/parse', { method: 'POST', body: { text } });
    renderPasteResult(fields, source);
  } catch (e) {
    toast(e.message, 'bad');
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

function renderPasteResult(fields, source) {
  const box = $('#pasteResult');
  box.innerHTML = '';
  box.classList.remove('hidden');
  const keys = Object.keys(fields);
  if (!keys.length) {
    box.append(el('div', { className: 'muted' }, 'No fields detected. Try adding labels like “UPC:”, “SKU:”, “Brand:”.'));
    return;
  }
  box.append(el('div', { className: 'muted' }, `Detected ${keys.length} field(s) ${source === 'ai' ? 'with AI' : 'by rules'} — review and edit, then apply:`));
  const rows = el('div', { className: 'paste-rows' });
  for (const k of keys) {
    const inc = el('input', { type: 'checkbox', checked: true });
    const sel = el('select', {});
    state.fields.forEach((f) => {
      const o = el('option', { value: f.key }, f.label);
      if (f.key === k) o.selected = true;
      sel.append(o);
    });
    const val = el('input', { type: 'text', value: fields[k] });
    rows.append(el('div', { className: 'paste-row' }, inc, sel, val));
  }
  box.append(rows);
  const apply = el('button', { className: 'btn btn--primary btn--sm', type: 'button' }, 'Apply to form');
  apply.addEventListener('click', () => applyPasteRows(rows));
  const discard = el('button', { className: 'btn btn--ghost btn--sm', type: 'button' }, 'Discard');
  discard.addEventListener('click', clearPaste);
  box.append(el('div', { className: 'actions' }, apply, discard));
}

function applyPasteRows(rows) {
  let n = 0;
  rows.querySelectorAll('.paste-row').forEach((r) => {
    const include = r.querySelector('input[type="checkbox"]').checked;
    const key = r.querySelector('select').value;
    const val = r.querySelector('input[type="text"]').value.trim();
    if (include && val) {
      const input = document.getElementById(`field-${key}`);
      if (input) { input.value = val; n++; }
    }
  });
  syncQueryPreview();
  clearPaste();
  toast(`Applied ${n} field(s) to the form.`, 'ok');
}

function clearPaste() {
  $('#pasteResult').classList.add('hidden');
  $('#pasteResult').innerHTML = '';
  $('#pasteText').value = '';
}

/* ---------- Marketplace (Amazon / Walmart) ---------- */
function enabledMarketplaces() {
  const list = [];
  if (state.amazonOn) list.push('amazon');
  if (state.walmartOn) list.push('walmart');
  return list;
}

// A single captured-id row (label, value, copy, optional link + remove).
function capturedRow(label, value, { link, onRemove } = {}) {
  const copyBtn = el('button', { className: 'copy-btn', type: 'button' }, 'copy');
  copyBtn.addEventListener('click', () => copyText(String(value), copyBtn));
  const row = el('div', { className: 'captured-id' },
    el('span', { className: 'ci-label' }, label),
    el('span', { className: 'ci-val' }, String(value)), copyBtn);
  if (link) row.append(el('a', { href: link, target: '_blank', rel: 'noopener' }, 'view ↗'));
  if (onRemove) {
    const rm = el('button', { className: 'copy-btn', type: 'button' }, 'remove');
    rm.addEventListener('click', onRemove);
    row.append(rm);
  }
  return row;
}

// Render the verified-ID rows for a product into any container. Returns the
// number of rows. `onRemove(engine)` is wired on marketplace rows when provided.
function renderVerifiedInto(box, product, onRemove) {
  box.innerHTML = '';
  const rows = [];
  const storeId = deriveStoreId(product || {});
  if (storeId) rows.push(capturedRow('Store ID', storeId));
  const m = product?.match;
  const googleId = m && (m.catalog_id || m.listing_product_id || m.product_id);
  if (googleId) rows.push(capturedRow('Google catalog ID', googleId, { link: m.product_link }));
  if (product?.amazon?.id_value) {
    rows.push(capturedRow('Amazon ASIN', product.amazon.id_value, { link: product.amazon.link, onRemove: onRemove ? () => onRemove('amazon') : undefined }));
  }
  if (product?.walmart?.id_value) {
    rows.push(capturedRow('Walmart item ID', product.walmart.id_value, { link: product.walmart.link, onRemove: onRemove ? () => onRemove('walmart') : undefined }));
  }
  rows.forEach((r) => box.append(r));
  return rows.length;
}

// Top-of-editor verified summary; fills in as matches/marketplace IDs confirm.
function renderVerifiedIds(product) {
  const n = renderVerifiedInto($('#verifiedIds'), product, (engine) => useMarketplace(engine, null));
  $('#verifiedPanel').classList.toggle('hidden', n === 0);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Normalize a marketplace result into the payload we persist on a product.
function mpPayload(result) {
  return result
    ? { id_label: result.id_label, id_value: result.id_value, secondary_id: result.secondary_id, title: result.title, link: result.link, price: result.price, thumbnail: result.thumbnail }
    : null;
}

function marketplaceCard(r, { selectedId, onUse }) {
  const isSel = selectedId && selectedId === r.id_value;
  const thumb = el('div', { className: 'card__thumb' },
    r.thumbnail ? el('img', { src: r.thumbnail, alt: '', loading: 'lazy' }) : el('span', { className: 'placeholder' }, 'no image'));
  const idCopy = el('button', { className: 'copy-btn', type: 'button' }, 'copy');
  idCopy.addEventListener('click', () => copyText(String(r.id_value), idCopy));
  const body = el('div', { className: 'card__body' },
    el('div', { className: 'card__title' }, r.title || '(no title)'),
    el('div', { className: 'id-row' }, el('span', { className: 'id-label' }, r.id_label), el('span', { className: 'card__mp-id' }, r.id_value), idCopy),
    r.price && el('div', { className: 'card__price' }, r.price),
    r.rating && el('div', { className: 'card__rating' }, `★ ${r.rating}${r.reviews ? ` (${r.reviews})` : ''}`),
    r.source && el('div', { className: 'card__source' }, r.source));
  const useBtn = el('button', { className: `btn btn--sm ${isSel ? '' : 'btn--primary'}`, type: 'button' }, isSel ? `✓ ${r.id_label} saved` : `Use this ${r.id_label}`);
  useBtn.addEventListener('click', () => onUse(r));
  const foot = el('div', { className: 'card__foot' }, useBtn);
  if (r.link) foot.append(el('a', { href: r.link, target: '_blank', rel: 'noopener' }, 'View ↗'));
  return el('div', { className: `card${isSel ? ' is-match' : ''}` }, thumb, body, foot);
}

function renderMarketplaceSection(engine) {
  const grid = $(`#${engine}Results`);
  const section = $(`#${engine}Section`);
  const results = state.marketplaceResults[engine] || [];
  section.classList.remove('hidden');
  grid.innerHTML = '';
  if (!results.length) { grid.append(el('div', { className: 'muted' }, `No ${engine} results.`)); return; }
  const selectedId = state.current?.[engine]?.id_value;
  results.forEach((r) => grid.append(marketplaceCard(r, { selectedId, onUse: (res) => useMarketplace(engine, res) })));
}

async function searchMarketplaces(query, gtin) {
  const engines = enabledMarketplaces();
  if (!engines.length || !query) return;
  $('#marketplacePanel').classList.remove('hidden');
  const loc = searchLocale();
  for (const engine of engines) {
    const grid = $(`#${engine}Results`);
    $(`#${engine}Section`).classList.remove('hidden');
    grid.innerHTML = '';
    grid.append(el('div', { className: 'muted' }, `Searching ${engine}…`));
    try {
      const data = await api('/api/marketplace', { method: 'POST', body: { engine, query, gtin, amazon_domain: loc.amazon_domain, locale: loc.locale } });
      state.marketplaceResults[engine] = data.results;
      renderMarketplaceSection(engine);
    } catch (e) {
      grid.innerHTML = '';
      grid.append(el('div', { className: 'muted' }, `${engine} lookup failed: ${e.message}`));
    }
  }
}

async function useMarketplace(engine, result) {
  try {
    const product = await ensureSaved();
    const { product: updated } = await api(`/api/products/${product.id}`, { method: 'PATCH', body: { [engine]: mpPayload(result) } });
    state.current = { ...updated, lastResults: state.results.length ? state.results : updated.lastResults };
    upsertLocalProduct(updated);
    renderVerifiedIds(state.current);
    renderMarketplaceSection(engine);
    toast(result ? `${result.id_label} saved ✓` : `${engine} ID cleared`, result ? 'ok' : '');
  } catch (e) { toast(e.message, 'bad'); }
}

function updateMarketplaceVisibility(product) {
  const show = state.amazonOn || state.walmartOn;
  $('#marketplacePanel').classList.toggle('hidden', !show);
  $('#amazonSection').classList.add('hidden');
  $('#walmartSection').classList.add('hidden');
  $('#amazonResults').innerHTML = '';
  $('#walmartResults').innerHTML = '';
  state.marketplaceResults = { amazon: [], walmart: [] };
  $('#marketplaceStatus').textContent = show
    ? `Run a search to fetch ${enabledMarketplaces().join(' & ')} results.`
    : '';
  renderVerifiedIds(product);
}

/* ---------- Match recording (shared) ---------- */
async function recordMatch(productId, match, status) {
  const { product } = await api(`/api/products/${productId}/match`, { method: 'POST', body: { match: match || null, status } });
  upsertLocalProduct(product);
  return product;
}

/* ---------- Actions (editor) ---------- */
async function doSearch() {
  const query = $('#queryInput').value.trim() || buildQuery(collectFields());
  if (!query) { toast('Fill in at least one field to build a query.', 'bad'); return; }
  const btn = $('#searchBtn');
  btn.disabled = true; btn.textContent = 'Searching…';
  $('#resultsStatus').textContent = 'Searching Google Shopping…';
  $('#resultsStatus').classList.remove('hidden');
  try {
    const loc = searchLocale();
    const data = await api('/api/search', { method: 'POST', body: { query, location: loc.location, gl: loc.gl, hl: loc.hl } });
    state.results = data.results;
    renderResultsInto($('#results'), data.results, {
      matchObj: state.current?.match, onMatch: selectMatch,
      statusEl: $('#resultsStatus'), countEl: $('#resultsCount'),
      statusMsg: data.results_state || undefined,
    });
    if (state.current?.id) {
      const { product } = await api(`/api/products/${state.current.id}`, { method: 'PATCH', body: { lastResults: data.results } });
      state.current = product; upsertLocalProduct(product);
    }
    if (currentGtin()) renderReferenceInto($('#referenceBody'), currentGtin());
    if (enabledMarketplaces().length) searchMarketplaces(query, currentGtin());
    toast(`Found ${data.results.length} listing(s).`, 'ok');
  } catch (e) {
    $('#resultsStatus').textContent = e.message;
    toast(e.message, 'bad');
  } finally {
    btn.disabled = false; btn.textContent = 'Search Google Shopping';
  }
}

async function saveProduct() {
  const fields = collectFields();
  if (!Object.values(fields).some(Boolean)) { toast('Add at least one field before saving.', 'bad'); return; }
  try {
    let product;
    if (state.current?.id) {
      ({ product } = await api(`/api/products/${state.current.id}`, { method: 'PATCH', body: { fields } }));
      toast('Product updated.', 'ok');
    } else {
      ({ product } = await api('/api/products', { method: 'POST', body: { fields } }));
      toast('Product saved.', 'ok');
    }
    upsertLocalProduct(product);
    showEditor(product);
  } catch (e) { toast(e.message, 'bad'); }
}

async function ensureSaved() {
  if (state.current?.id) return state.current;
  const { product } = await api('/api/products', { method: 'POST', body: { fields: collectFields() } });
  state.current = product; upsertLocalProduct(product);
  return product;
}

async function selectMatch(result) {
  try {
    const product = await ensureSaved();
    if (state.results.length) await api(`/api/products/${product.id}`, { method: 'PATCH', body: { lastResults: state.results } });
    const updated = await recordMatch(product.id, result, 'verified');
    showEditor({ ...updated, lastResults: state.results.length ? state.results : updated.lastResults });
    toast('Match verified ✓', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

async function markNoMatch() {
  try {
    const product = await ensureSaved();
    const updated = await recordMatch(product.id, null, 'no_match');
    showEditor({ ...updated, lastResults: state.results.length ? state.results : updated.lastResults });
    toast('Marked as “no match”.', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
}

async function clearMatch() {
  if (!state.current?.id) { renderMatch(null); return; }
  try {
    const updated = await recordMatch(state.current.id, null, 'unverified');
    showEditor({ ...updated, lastResults: state.results.length ? state.results : updated.lastResults });
    toast('Match cleared.');
  } catch (e) { toast(e.message, 'bad'); }
}

async function deleteProduct() {
  if (!state.current?.id) return;
  if (!confirm('Delete this product and its verification record?')) return;
  try {
    await api(`/api/products/${state.current.id}`, { method: 'DELETE' });
    state.products = state.products.filter((p) => p.id !== state.current.id);
    newProduct(); renderProductList();
    toast('Product deleted.');
  } catch (e) { toast(e.message, 'bad'); }
}

async function lookupBarcodeManual() {
  const gtin = currentGtin();
  if (!gtin) { toast('Enter a GTIN first.', 'bad'); return; }
  $('#referencePanel').classList.remove('hidden');
  renderReferenceInto($('#referenceBody'), gtin, { force: true });
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const HEADER_ALIASES = {
  manufacturer: 'manufacturer', manufacture: 'manufacturer',
  title: 'title', name: 'title', 'product name': 'title', product: 'title',
  gtin: 'gtin', upc: 'gtin', ean: 'gtin', barcode: 'gtin',
  sku: 'sku',
  mpn: 'mpn', 'manufacturer part number': 'mpn', 'part number': 'mpn',
  company: 'company',
  description: 'description', desc: 'description',
  brand: 'brand', collection: 'collection',
  color: 'color', colour: 'color', size: 'size',
};

function csvToItems(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { items: [], error: 'Need a header row plus at least one data row.' };
  const origHeader = rows[0].map((h) => h.trim());
  const validKeys = new Set(state.fields.map((f) => f.key));
  // Map each column to a known field key (for searching); unrecognized columns
  // (ID, Store, Store ID, …) are still preserved in sourceRow for export.
  const mapped = origHeader.map((h) => {
    const n = h.toLowerCase();
    return HEADER_ALIASES[n] || (validKeys.has(n) ? n : null);
  });
  if (!mapped.some(Boolean)) return { items: [], error: 'No recognized columns — include at least Title or GTIN.' };
  const items = rows.slice(1).map((r) => {
    const fields = {};
    const sourceRow = []; // ordered [key, value] pairs (jsonb preserves array order)
    origHeader.forEach((h, i) => {
      const v = r[i] != null ? String(r[i]).trim() : '';
      if (h) sourceRow.push([h, v]);
      const key = mapped[i];
      if (key && v) fields[key] = v;
    });
    return { fields, sourceRow };
  }).filter((it) => Object.values(it.fields).some(Boolean) || it.sourceRow.some(([, v]) => v));
  return { items, mapped: mapped.filter(Boolean), columns: origHeader.filter(Boolean) };
}

/* ---------- Bulk import ---------- */
function openBulk() {
  $('#bulkColumns').textContent = state.fields.map((f) => f.label).join(', ');
  $('#bulkText').value = '';
  $('#bulkPreview').textContent = '';
  $('#bulkModal').classList.remove('hidden');
}
function closeBulk() { $('#bulkModal').classList.add('hidden'); }

function previewBulk() {
  const text = $('#bulkText').value;
  if (!text.trim()) { $('#bulkPreview').textContent = ''; return null; }
  const { items, error, mapped } = csvToItems(text);
  if (error) { $('#bulkPreview').textContent = `⚠ ${error}`; return null; }
  $('#bulkPreview').textContent = `${items.length} product(s) ready · columns: ${mapped.join(', ')}`;
  return items;
}

async function runBulk(startReview) {
  const items = previewBulk();
  if (!items || !items.length) { toast('Nothing to import — check the CSV.', 'bad'); return; }
  try {
    const payload = items.map((it) => ({ fields: it.fields, source_row: it.sourceRow }));
    const { products } = await api('/api/products', { method: 'POST', body: { items: payload } });
    products.forEach(upsertLocalProduct);
    renderProductList();
    closeBulk();
    toast(`Imported ${products.length} product(s).`, 'ok');
    if (startReview) enterReview(products.map((p) => p.id));
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------- Export (round-trips the imported template, e.g. ID, GTIN, Title, Store, Store ID) ---------- */
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// sourceRow is an ordered array of [key, value] pairs (older rows may be objects).
function srcKeys(sr) { return Array.isArray(sr) ? sr.map(([k]) => k) : Object.keys(sr || {}); }
function srcMap(sr) { return Array.isArray(sr) ? Object.fromEntries(sr) : (sr || {}); }

// The verified identifier written into the "Store ID" column. Prefers the
// marketplace id when the row's Store is Amazon/Walmart, otherwise the chosen
// Google listing's catalog/product id.
function deriveStoreId(p) {
  const m = srcMap(p.sourceRow);
  const store = String(m.Store ?? m.store ?? '').toLowerCase();
  if (store.includes('amazon') && p.amazon?.id_value) return p.amazon.id_value;
  if (store.includes('walmart') && p.walmart?.id_value) return p.walmart.id_value;
  if (p.match) return p.match.catalog_id || p.match.listing_product_id || p.match.product_id || '';
  return p.amazon?.id_value || p.walmart?.id_value || '';
}

function downloadCSV(text, name) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function exportCSV() {
  if (!state.products.length) { toast('No products to export.', 'bad'); return; }
  // Reproduce the imported columns exactly when available, filling Store ID.
  const withSrc = state.products.filter((p) => srcKeys(p.sourceRow).length);
  let columns = [];
  if (withSrc.length) {
    for (const p of withSrc) for (const k of srcKeys(p.sourceRow)) if (!columns.includes(k)) columns.push(k);
  } else {
    columns = ['ID', 'GTIN', 'Title', 'Store', 'Store ID'];
  }
  let storeIdKey = columns.find((c) => c.toLowerCase().replace(/[_\s]/g, '') === 'storeid');
  if (!storeIdKey) { storeIdKey = 'Store ID'; columns.push(storeIdKey); }

  const lines = [columns.map(csvCell).join(',')];
  for (const p of state.products) {
    const src = srcMap(p.sourceRow);
    const row = columns.map((c) => {
      if (c === storeIdKey) return deriveStoreId(p) || src[c] || '';
      if (c in src) return src[c];
      const lc = c.toLowerCase();
      if (lc === 'gtin') return p.fields.gtin || '';
      if (lc === 'title') return p.fields.title || '';
      return '';
    });
    lines.push(row.map(csvCell).join(','));
  }
  downloadCSV(lines.join('\n'), `store-ids-${new Date().toISOString().slice(0, 10)}.csv`);
  const filled = state.products.filter((p) => deriveStoreId(p)).length;
  toast(`Exported ${state.products.length} row(s) — ${filled} with a Store ID.`, 'ok');
}

/* ---------- Review (swipe) mode ---------- */
function reviewList() {
  let ids = state.review.ids.length ? state.review.ids : state.products.map((p) => p.id);
  ids = ids.filter((id) => state.products.some((p) => p.id === id));
  if (state.review.unverifiedOnly) {
    ids = ids.filter((id) => state.products.find((p) => p.id === id)?.status === 'unverified');
  }
  return ids;
}

function enterReview(ids = []) {
  state.review.ids = ids.length ? ids : state.products.map((p) => p.id);
  state.review.index = 0;
  const list = reviewList();
  if (!list.length) { toast('No products to review.', 'bad'); return; }
  state.review.active = true;
  $('#reviewOverlay').classList.remove('hidden');
  renderReviewCurrent();
}

function exitReview() {
  state.review.active = false;
  $('#reviewOverlay').classList.add('hidden');
  renderProductList();
}

function reviewGo(delta) {
  const list = reviewList();
  if (!list.length) { exitReview(); return; }
  const next = state.review.index + delta;
  if (next >= list.length) { finishReview(); return; } // advanced past the last item
  state.review.index = Math.max(0, next);
  renderReviewCurrent();
}

// Stop reviewing (either at the end, or early via the Done button) and export.
function finishReview() {
  exitReview();
  exportCSV();
}

async function renderReviewCurrent() {
  const list = reviewList();
  if (!list.length) { exitReview(); return; }
  if (state.review.index >= list.length) state.review.index = list.length - 1;
  const id = list[state.review.index];
  $('#reviewCounter').textContent = `${state.review.index + 1} / ${list.length}`;

  let product = state.products.find((p) => p.id === id);
  try { ({ product } = await api(`/api/products/${id}`)); upsertLocalProduct(product); } catch {}

  // Meta
  const fieldsSummary = state.fields
    .filter((f) => product.fields[f.key])
    .map((f) => el('div', {}, el('span', { className: 'muted' }, `${f.label}: `), product.fields[f.key]));
  // Show the original imported row values (e.g. ID, Store) when present.
  const srcPairs = Array.isArray(product.sourceRow) ? product.sourceRow : Object.entries(product.sourceRow || {});
  const srcSummary = srcPairs
    .filter(([k, v]) => v && !/^title$|^gtin$|store id/i.test(k))
    .map(([k, v]) => el('div', {}, el('span', { className: 'muted' }, `${k}: `), v));
  // Verified IDs at the very top of the review panel.
  renderVerifiedInto($('#reviewVerified'), product, (engine) => reviewUseMarketplace(id, engine, null));
  $('#reviewMeta').innerHTML = '';
  $('#reviewMeta').append(
    el('div', { className: 'r-title', style: 'font-weight:600' }, product.fields.title || '(untitled product)'),
    ...fieldsSummary,
    ...srcSummary,
    el('div', { className: 'r-query' }, product.query || ''));

  // Status badge
  const sb = $('#reviewStatus');
  sb.className = `badge badge--${product.status}`;
  sb.textContent = STATUS_LABEL[product.status] || product.status;

  // Reference image
  renderReferenceInto($('#reviewReference'), product.fields.gtin || '');

  // Listings: use cached, else auto-search
  const grid = $('#reviewResults');
  const statusEl = $('#reviewResultsStatus');
  const onMatch = (r) => reviewSelectMatch(id, r);
  if (product.lastResults?.length) {
    renderResultsInto(grid, product.lastResults, { matchObj: product.match, onMatch, statusEl, countEl: null });
  } else if (product.query) {
    grid.innerHTML = ''; statusEl.classList.remove('hidden'); statusEl.textContent = 'Searching Google Shopping…';
    try {
      const sl = searchLocale();
      const data = await api('/api/search', { method: 'POST', body: { query: product.query, location: sl.location, gl: sl.gl, hl: sl.hl } });
      const { product: up } = await api(`/api/products/${id}`, { method: 'PATCH', body: { lastResults: data.results } });
      upsertLocalProduct(up);
      // Only render if still on this product
      if (reviewList()[state.review.index] === id) {
        renderResultsInto(grid, data.results, { matchObj: up.match, onMatch, statusEl, countEl: null });
      }
    } catch (e) { statusEl.textContent = e.message; statusEl.classList.remove('hidden'); }
  } else {
    grid.innerHTML = ''; statusEl.textContent = 'This product has no query (no fields filled).'; statusEl.classList.remove('hidden');
  }

  // Marketplace (Amazon / Walmart) lookups in review, when toggled on.
  state.review.mp = { amazon: [], walmart: [] };
  for (const engine of ['amazon', 'walmart']) $(`#reviewMp${cap(engine)}`).classList.add('hidden');
  for (const engine of enabledMarketplaces()) {
    const section = $(`#reviewMp${cap(engine)}`);
    const mgrid = $(`#review${cap(engine)}Results`);
    section.classList.remove('hidden');
    mgrid.innerHTML = '';
    mgrid.append(el('div', { className: 'muted' }, `Searching ${engine}…`));
    const mloc = searchLocale();
    api('/api/marketplace', { method: 'POST', body: { engine, query: product.query, gtin: product.fields.gtin, amazon_domain: mloc.amazon_domain, locale: mloc.locale } })
      .then((data) => {
        if (reviewList()[state.review.index] !== id) return; // moved on
        state.review.mp[engine] = data.results;
        renderReviewMpSection(engine, product);
      })
      .catch((e) => { mgrid.innerHTML = ''; mgrid.append(el('div', { className: 'muted' }, `${engine} failed: ${e.message}`)); });
  }
}

function renderReviewMpSection(engine, product) {
  const grid = $(`#review${cap(engine)}Results`);
  const results = state.review.mp[engine] || [];
  grid.innerHTML = '';
  if (!results.length) { grid.append(el('div', { className: 'muted' }, `No ${engine} results.`)); return; }
  const selectedId = product[engine]?.id_value;
  results.forEach((r) => grid.append(marketplaceCard(r, { selectedId, onUse: (res) => reviewUseMarketplace(product.id, engine, res) })));
}

async function reviewUseMarketplace(productId, engine, result) {
  try {
    const { product } = await api(`/api/products/${productId}`, { method: 'PATCH', body: { [engine]: mpPayload(result) } });
    upsertLocalProduct(product);
    renderVerifiedInto($('#reviewVerified'), product, (e) => reviewUseMarketplace(productId, e, null));
    renderReviewMpSection(engine, product);
    toast(result ? `${result.id_label} saved ✓` : `${engine} ID cleared`, result ? 'ok' : '');
  } catch (e) { toast(e.message, 'bad'); }
}

async function reviewSelectMatch(productId, result) {
  try {
    await recordMatch(productId, result, 'verified');
    toast('Match verified ✓ — next', 'ok');
    advanceReview();
  } catch (e) { toast(e.message, 'bad'); }
}

async function reviewNoMatch() {
  const list = reviewList();
  const id = list[state.review.index];
  if (!id) return;
  try {
    await recordMatch(id, null, 'no_match');
    toast('Marked “no match” — next');
    advanceReview();
  } catch (e) { toast(e.message, 'bad'); }
}

// After a decision: if filtering to unverified the list shrinks, so stay at the
// same index (which now points at the next item); otherwise move forward one.
function advanceReview() {
  if (state.review.unverifiedOnly) {
    const list = reviewList();
    if (!list.length) { toast('All reviewed 🎉', 'ok'); finishReview(); return; }
    if (state.review.index >= list.length) state.review.index = list.length - 1;
    renderReviewCurrent();
  } else {
    reviewGo(1);
  }
}

/* ---------- Bootstrap ---------- */
async function refreshProducts() {
  const { products } = await api('/api/products');
  state.products = products;
  renderProductList();
}

function bindReviewGestures() {
  document.addEventListener('keydown', (e) => {
    if (!state.review.active) return;
    if (e.key === 'ArrowRight') reviewGo(1);
    else if (e.key === 'ArrowLeft') reviewGo(-1);
    else if (e.key === 'Escape') exitReview();
  });
  const body = $('#reviewOverlay');
  let x0 = null;
  body.addEventListener('touchstart', (e) => { x0 = e.changedTouches[0].clientX; }, { passive: true });
  body.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 70) reviewGo(dx < 0 ? 1 : -1);
    x0 = null;
  }, { passive: true });
}

async function init() {
  try {
    const meta = await api('/api/fields');
    state.fields = meta.fields;
    state.serpapiConfigured = meta.serpapiConfigured;
    state.barcodeConfigured = meta.barcodeConfigured;
    state.marketplaceConfigured = meta.marketplaceConfigured;
    state.storageConfigured = meta.storageConfigured;
    state.aiParseConfigured = meta.aiParseConfigured;
    renderForm();
    const status = $('#apiStatus');
    const bits = [
      meta.serpapiConfigured ? 'SerpApi ✓' : 'SerpApi ✗',
      meta.barcodeConfigured ? 'Barcode ✓' : 'Barcode ✗',
      meta.storageConfigured ? 'Storage ✓' : 'Storage ✗',
    ];
    status.textContent = bits.join(' · ');
    status.classList.add(meta.serpapiConfigured && meta.storageConfigured ? 'ok' : 'bad');
  } catch (e) {
    toast(`Failed to load: ${e.message}`, 'bad');
  }

  $('#searchBtn').addEventListener('click', doSearch);
  $('#saveBtn').addEventListener('click', saveProduct);
  $('#deleteBtn').addEventListener('click', deleteProduct);
  $('#newProductBtn').addEventListener('click', newProduct);
  $('#markNoMatchBtn').addEventListener('click', markNoMatch);
  $('#clearMatchBtn').addEventListener('click', clearMatch);
  $('#lookupBarcodeBtn').addEventListener('click', lookupBarcodeManual);
  $('#productSearch').addEventListener('input', renderProductList);

  // Search location (country) — dropdowns in the editor and review bar, kept in sync.
  populateCountrySelect($('#locationSelect'));
  populateCountrySelect($('#reviewLocationSelect'));
  $('#locationSelect').addEventListener('change', (e) => setCountry(e.target.value));
  $('#reviewLocationSelect').addEventListener('change', (e) => {
    setCountry(e.target.value);
    if (state.review.active) renderReviewCurrent();
  });
  $('#pasteDetectBtn').addEventListener('click', detectPaste);
  $('#pasteMode').textContent = state.aiParseConfigured ? '(AI on)' : '(rules-based)';

  // Marketplace toggles (Amazon / Walmart)
  // Amazon/Walmart toggles exist in both the editor and the review bar; keep them in sync.
  const setMarketplaceToggle = (engine, on) => {
    state[`${engine}On`] = on;
    localStorage.setItem(`${engine}On`, on ? '1' : '0');
    [`#${engine}Toggle`, `#review${cap(engine)}Toggle`].forEach((sel) => { const c = $(sel); if (c) c.checked = on; });
  };
  for (const engine of ['amazon', 'walmart']) {
    [`#${engine}Toggle`, `#review${cap(engine)}Toggle`].forEach((sel) => {
      const c = $(sel);
      if (!c) return;
      c.checked = state[`${engine}On`];
      if (!state.marketplaceConfigured) c.disabled = true;
    });
    $(`#${engine}Toggle`).addEventListener('change', (e) => {
      setMarketplaceToggle(engine, e.target.checked);
      updateMarketplaceVisibility(state.current);
      const query = $('#queryInput').value.trim();
      if (e.target.checked && query) searchMarketplaces(query, currentGtin());
    });
    $(`#review${cap(engine)}Toggle`).addEventListener('change', (e) => {
      setMarketplaceToggle(engine, e.target.checked);
      if (state.review.active) renderReviewCurrent();
    });
  }

  // Bulk
  $('#bulkImportBtn').addEventListener('click', openBulk);
  $('#bulkCloseBtn').addEventListener('click', closeBulk);
  $('#bulkText').addEventListener('input', previewBulk);
  $('#bulkRunBtn').addEventListener('click', () => runBulk(true));
  $('#bulkImportOnlyBtn').addEventListener('click', () => runBulk(false));
  $('#bulkSampleBtn').addEventListener('click', () => {
    $('#bulkText').value = 'Manufacturer,Title,GTIN,SKU\nHasbro,Monopoly FIFA World Cup,5010996385284,MON-FIFA\nMattel,UNO Card Game,0078206000957,UNO-001';
    previewBulk();
  });
  $('#bulkFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { $('#bulkText').value = reader.result; previewBulk(); };
    reader.readAsText(file);
  });

  // Export + review
  $('#exportBtn').addEventListener('click', exportCSV);
  $('#reviewModeBtn').addEventListener('click', () => enterReview());
  $('#reviewExit').addEventListener('click', exitReview);
  $('#reviewDone').addEventListener('click', finishReview);
  $('#reviewPrev').addEventListener('click', () => reviewGo(-1));
  $('#reviewNext').addEventListener('click', () => reviewGo(1));
  $('#reviewNoMatch').addEventListener('click', reviewNoMatch);
  $('#reviewUnverifiedOnly').addEventListener('change', (e) => {
    state.review.unverifiedOnly = e.target.checked;
    state.review.index = 0;
    renderReviewCurrent();
  });
  bindReviewGestures();

  await refreshProducts();
  newProduct();
}

init();
