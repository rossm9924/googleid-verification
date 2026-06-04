// Product Listing Verification — frontend logic (vanilla JS).
const state = {
  fields: [],
  serpapiConfigured: false,
  barcodeConfigured: false,
  marketplaceConfigured: false,
  storageConfigured: false,
  amazonOn: localStorage.getItem('amazonOn') === '1',
  walmartOn: localStorage.getItem('walmartOn') === '1',
  products: [],
  current: null, // currently loaded product record, or null for a new/unsaved one
  results: [], // results from the most recent search
  marketplaceResults: { amazon: [], walmart: [] },
  review: { active: false, ids: [], index: 0, unverifiedOnly: false },
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

/* ---------- Marketplace (Amazon / Walmart) ---------- */
function enabledMarketplaces() {
  const list = [];
  if (state.amazonOn) list.push('amazon');
  if (state.walmartOn) list.push('walmart');
  return list;
}

function renderCapturedIds(product) {
  const box = $('#capturedIds');
  box.innerHTML = '';
  const rows = [];
  for (const engine of ['amazon', 'walmart']) {
    const m = product?.[engine];
    if (!m?.id_value) continue;
    const copyBtn = el('button', { className: 'copy-btn', type: 'button' }, 'copy');
    copyBtn.addEventListener('click', () => copyText(String(m.id_value), copyBtn));
    const remove = el('button', { className: 'copy-btn', type: 'button' }, 'remove');
    remove.addEventListener('click', () => useMarketplace(engine, null));
    const row = el('div', { className: 'captured-id' },
      el('span', { className: 'ci-label' }, m.id_label || engine),
      el('span', { className: 'ci-val' }, m.id_value), copyBtn, remove);
    if (m.link) row.append(el('a', { href: m.link, target: '_blank', rel: 'noopener' }, 'view ↗'));
    rows.push(row);
  }
  rows.forEach((r) => box.append(r));
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

async function searchMarketplaces(query) {
  const engines = enabledMarketplaces();
  if (!engines.length || !query) return;
  $('#marketplacePanel').classList.remove('hidden');
  for (const engine of engines) {
    const grid = $(`#${engine}Results`);
    $(`#${engine}Section`).classList.remove('hidden');
    grid.innerHTML = '';
    grid.append(el('div', { className: 'muted' }, `Searching ${engine}…`));
    try {
      const data = await api('/api/marketplace', { method: 'POST', body: { engine, query } });
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
    const payload = result ? {
      id_label: result.id_label, id_value: result.id_value, secondary_id: result.secondary_id,
      title: result.title, link: result.link, price: result.price, thumbnail: result.thumbnail,
    } : null;
    const { product: updated } = await api(`/api/products/${product.id}`, { method: 'PATCH', body: { [engine]: payload } });
    state.current = { ...updated, lastResults: state.results.length ? state.results : updated.lastResults };
    upsertLocalProduct(updated);
    renderCapturedIds(state.current);
    renderMarketplaceSection(engine);
    toast(result ? `${result.id_label} saved ✓` : `${engine} ID cleared`, result ? 'ok' : '');
  } catch (e) { toast(e.message, 'bad'); }
}

function updateMarketplaceVisibility(product) {
  const hasCaptured = product?.amazon?.id_value || product?.walmart?.id_value;
  const show = state.amazonOn || state.walmartOn || hasCaptured;
  $('#marketplacePanel').classList.toggle('hidden', !show);
  $('#amazonSection').classList.add('hidden');
  $('#walmartSection').classList.add('hidden');
  $('#amazonResults').innerHTML = '';
  $('#walmartResults').innerHTML = '';
  state.marketplaceResults = { amazon: [], walmart: [] };
  $('#marketplaceStatus').textContent = enabledMarketplaces().length
    ? `Run a search to fetch ${enabledMarketplaces().join(' & ')} results.`
    : 'Enable Amazon/Walmart above to look up IDs.';
  renderCapturedIds(product || {});
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
    const data = await api('/api/search', { method: 'POST', body: { query, gl: $('#glInput').value.trim() || 'us', hl: $('#hlInput').value.trim() || 'en' } });
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
    if (enabledMarketplaces().length) searchMarketplaces(query);
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
  const validKeys = new Set(state.fields.map((f) => f.key));
  const header = rows[0].map((h) => {
    const norm = h.trim().toLowerCase();
    return HEADER_ALIASES[norm] || (validKeys.has(norm) ? norm : null);
  });
  if (!header.some(Boolean)) return { items: [], error: 'No recognized columns in the header row.' };
  const items = rows.slice(1).map((r) => {
    const fields = {};
    header.forEach((key, i) => { if (key && r[i] != null) fields[key] = String(r[i]).trim(); });
    return { fields };
  }).filter((it) => Object.values(it.fields).some(Boolean));
  return { items, mapped: header.filter(Boolean) };
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
    const { products } = await api('/api/products', { method: 'POST', body: { items } });
    products.forEach(upsertLocalProduct);
    renderProductList();
    closeBulk();
    toast(`Imported ${products.length} product(s).`, 'ok');
    if (startReview) enterReview(products.map((p) => p.id));
  } catch (e) { toast(e.message, 'bad'); }
}

/* ---------- Export ---------- */
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportCSV() {
  if (!state.products.length) { toast('No products to export.', 'bad'); return; }
  const fieldKeys = state.fields.map((f) => f.key);
  const header = ['id', 'status', ...fieldKeys, 'query', 'matched_title', 'matched_source', 'matched_price', 'matched_catalog_id', 'matched_product_id', 'matched_gpcid', 'matched_mid', 'matched_link', 'amazon_asin', 'amazon_link', 'walmart_id', 'walmart_link'];
  const lines = [header.join(',')];
  for (const p of state.products) {
    const m = p.match || {};
    const a = p.amazon || {};
    const w = p.walmart || {};
    const row = [p.id, p.status, ...fieldKeys.map((k) => p.fields[k] || ''), p.query,
      m.title, m.source, m.price, m.catalog_id, m.listing_product_id, m.gpcid, m.mid, m.product_link,
      a.id_value, a.link, w.id_value, w.link];
    lines.push(row.map(csvCell).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `product-verification-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(`Exported ${state.products.length} product(s).`, 'ok');
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
  state.review.index = Math.max(0, Math.min(list.length - 1, state.review.index + delta));
  renderReviewCurrent();
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
  $('#reviewMeta').innerHTML = '';
  $('#reviewMeta').append(
    el('div', { className: 'r-title', style: 'font-weight:600' }, product.fields.title || '(untitled product)'),
    ...fieldsSummary,
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
      const data = await api('/api/search', { method: 'POST', body: { query: product.query } });
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
    if (!list.length) { exitReview(); toast('All reviewed 🎉', 'ok'); return; }
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

  // Marketplace toggles (Amazon / Walmart)
  const amzToggle = $('#amazonToggle');
  const wmtToggle = $('#walmartToggle');
  amzToggle.checked = state.amazonOn;
  wmtToggle.checked = state.walmartOn;
  if (!state.marketplaceConfigured) { amzToggle.disabled = true; wmtToggle.disabled = true; }
  const onToggle = (engine, checkbox) => {
    state[`${engine}On`] = checkbox.checked;
    localStorage.setItem(`${engine}On`, checkbox.checked ? '1' : '0');
    updateMarketplaceVisibility(state.current);
    const query = $('#queryInput').value.trim();
    if (checkbox.checked && query) searchMarketplaces(query);
  };
  amzToggle.addEventListener('change', () => onToggle('amazon', amzToggle));
  wmtToggle.addEventListener('change', () => onToggle('walmart', wmtToggle));

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
