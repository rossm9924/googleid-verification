// Product Listing Verification — frontend logic (vanilla JS).
const state = {
  fields: [],
  products: [],
  current: null, // currently loaded product record, or null for a new/unsaved one
  results: [], // results from the most recent search
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) node.append(c?.nodeType ? c : document.createTextNode(c ?? ''));
  return node;
};

/* ---------- API helpers ---------- */
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

/* ---------- Field helpers ---------- */
function collectFields() {
  const out = {};
  for (const { key } of state.fields) {
    const input = document.getElementById(`field-${key}`);
    out[key] = input ? input.value.trim() : '';
  }
  return out;
}

function buildQuery(fields) {
  return state.fields
    .map(({ key }) => (fields[key] || '').trim())
    .filter(Boolean)
    .join(', ');
}

function syncQueryPreview() {
  $('#queryInput').value = buildQuery(collectFields());
}

function renderForm() {
  const form = $('#productForm');
  form.innerHTML = '';
  for (const { key, label } of state.fields) {
    const wide = ['title', 'description'].includes(key);
    const input = el('input', { id: `field-${key}`, type: 'text', autocomplete: 'off' });
    input.addEventListener('input', syncQueryPreview);
    const field = el('div', { className: `field${wide ? ' field--wide' : ''}` }, el('label', { htmlFor: `field-${key}` }, label), input);
    form.append(field);
  }
}

function setFormValues(fields = {}) {
  for (const { key } of state.fields) {
    const input = document.getElementById(`field-${key}`);
    if (input) input.value = fields[key] || '';
  }
  syncQueryPreview();
}

/* ---------- Status badge ---------- */
const STATUS_LABEL = { verified: 'Verified', no_match: 'No match', unverified: 'Unverified' };
function statusBadge(status) {
  const b = el('span', { className: `badge badge--${status}` }, STATUS_LABEL[status] || status);
  return b;
}

/* ---------- Sidebar ---------- */
function renderProductList() {
  const filter = $('#productSearch').value.trim().toLowerCase();
  const list = $('#productList');
  list.innerHTML = '';
  const items = state.products.filter((p) => {
    if (!filter) return true;
    return (p.query || '').toLowerCase().includes(filter) || JSON.stringify(p.fields).toLowerCase().includes(filter);
  });
  $('#productListEmpty').classList.toggle('hidden', state.products.length > 0);

  for (const p of items) {
    const title = p.fields.title || p.query || '(untitled product)';
    const item = el(
      'li',
      { className: `product-item${state.current?.id === p.id ? ' active' : ''}` },
      el('div', { className: 'product-item__title' }, title),
      el('div', { className: 'product-item__meta' }, statusBadge(p.status))
    );
    item.addEventListener('click', () => loadProduct(p.id));
    list.append(item);
  }
}

/* ---------- Editor state ---------- */
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

  // Show cached results if present, else clear.
  if (product?.lastResults?.length) {
    state.results = product.lastResults;
    renderResults(product.lastResults, `Showing ${product.lastResults.length} cached listing(s) from the last search.`);
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
}

async function loadProduct(id) {
  try {
    const { product } = await api(`/api/products/${id}`);
    showEditor(product);
  } catch (e) {
    toast(e.message, 'bad');
  }
}

/* ---------- Match rendering ---------- */
function renderMatch(match) {
  const panel = $('#matchPanel');
  const body = $('#matchBody');
  if (!match) {
    panel.classList.add('hidden');
    body.innerHTML = '';
    return;
  }
  panel.classList.remove('hidden');
  body.innerHTML = '';
  const img = match.thumbnail
    ? el('img', { src: match.thumbnail, alt: '' })
    : el('div', { className: 'placeholder' }, 'no image');
  const meta = el(
    'div',
    { className: 'match-summary__meta' },
    el('strong', {}, match.title || '(no title)'),
    el('span', { className: 'card__source' }, match.source || ''),
    el('span', { className: 'card__price' }, match.price || ''),
    match.product_id ? el('span', { className: 'muted' }, `product_id: ${match.product_id}`) : document.createTextNode('')
  );
  if (match.product_link) {
    const link = el('a', { href: match.product_link, target: '_blank', rel: 'noopener' }, 'Open on Google ↗');
    meta.append(link);
  }
  body.append(el('div', { className: 'match-summary' }, img, meta));
}

/* ---------- Results rendering ---------- */
function resultCard(r, idx) {
  const isMatch = state.current?.match && (
    (r.product_id && r.product_id === state.current.match.product_id) ||
    (r.product_link && r.product_link === state.current.match.product_link) ||
    (r.title === state.current.match.title && r.source === state.current.match.source)
  );

  const thumb = el(
    'div',
    { className: 'card__thumb' },
    r.thumbnail ? el('img', { src: r.thumbnail, alt: '', loading: 'lazy' }) : el('span', { className: 'placeholder' }, 'no image')
  );

  const body = el(
    'div',
    { className: 'card__body' },
    el('div', { className: 'card__title' }, r.title || '(no title)'),
    r.source ? el('div', { className: 'card__source' }, r.source) : document.createTextNode(''),
    r.price ? el('div', { className: 'card__price' }, r.price) : document.createTextNode(''),
    r.rating ? el('div', { className: 'card__rating' }, `★ ${r.rating}${r.reviews ? ` (${r.reviews})` : ''}`) : document.createTextNode(''),
    r.delivery ? el('div', { className: 'card__delivery' }, r.delivery) : document.createTextNode('')
  );

  const matchBtn = el('button', { className: `btn btn--sm ${isMatch ? '' : 'btn--primary'}`, type: 'button' }, isMatch ? '✓ Matched' : 'This is the match');
  matchBtn.addEventListener('click', () => selectMatch(r));

  const foot = el('div', { className: 'card__foot' }, matchBtn);
  if (r.product_link) foot.append(el('a', { href: r.product_link, target: '_blank', rel: 'noopener' }, 'View ↗'));

  return el('div', { className: `card${isMatch ? ' is-match' : ''}` }, thumb, body, foot);
}

function renderResults(results, statusMsg) {
  const grid = $('#results');
  grid.innerHTML = '';
  const status = $('#resultsStatus');
  if (!results.length) {
    status.textContent = statusMsg || 'No listings found for this query.';
    status.classList.remove('hidden');
    $('#resultsCount').textContent = '';
    return;
  }
  status.classList.add('hidden');
  $('#resultsCount').textContent = `${results.length} listing(s)`;
  results.forEach((r, i) => grid.append(resultCard(r, i)));
}

/* ---------- Actions ---------- */
async function doSearch() {
  const query = $('#queryInput').value.trim() || buildQuery(collectFields());
  if (!query) {
    toast('Fill in at least one field to build a query.', 'bad');
    return;
  }
  const btn = $('#searchBtn');
  btn.disabled = true;
  btn.textContent = 'Searching…';
  $('#resultsStatus').textContent = 'Searching Google Shopping…';
  $('#resultsStatus').classList.remove('hidden');
  try {
    const data = await api('/api/search', {
      method: 'POST',
      body: { query, gl: $('#glInput').value.trim() || 'us', hl: $('#hlInput').value.trim() || 'en' },
    });
    state.results = data.results;
    renderResults(data.results, data.results_state ? `${data.results_state}` : undefined);
    // If editing a saved product, cache the results on it.
    if (state.current?.id) {
      const { product } = await api(`/api/products/${state.current.id}`, {
        method: 'PATCH',
        body: { lastResults: data.results },
      });
      state.current = product;
    }
    toast(`Found ${data.results.length} listing(s).`, 'ok');
  } catch (e) {
    $('#resultsStatus').textContent = e.message;
    toast(e.message, 'bad');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Search Google Shopping';
  }
}

async function saveProduct() {
  const fields = collectFields();
  if (!Object.values(fields).some(Boolean)) {
    toast('Add at least one field before saving.', 'bad');
    return;
  }
  try {
    let product;
    if (state.current?.id) {
      ({ product } = await api(`/api/products/${state.current.id}`, { method: 'PATCH', body: { fields } }));
      toast('Product updated.', 'ok');
    } else {
      ({ product } = await api('/api/products', { method: 'POST', body: { fields } }));
      toast('Product saved.', 'ok');
    }
    state.current = product;
    await refreshProducts();
    showEditor(product);
  } catch (e) {
    toast(e.message, 'bad');
  }
}

// Ensure the product exists (auto-save if new) before recording a verification decision.
async function ensureSaved() {
  if (state.current?.id) return state.current;
  const fields = collectFields();
  const { product } = await api('/api/products', { method: 'POST', body: { fields } });
  state.current = product;
  await refreshProducts();
  return product;
}

async function selectMatch(result) {
  try {
    const product = await ensureSaved();
    // Persist the latest results too so the match shows in context next load.
    const { product: updated } = await api(`/api/products/${product.id}/match`, {
      method: 'POST',
      body: { match: result, status: 'verified' },
    });
    state.current = updated;
    if (state.results.length) {
      await api(`/api/products/${product.id}`, { method: 'PATCH', body: { lastResults: state.results } });
    }
    await refreshProducts();
    showEditor({ ...updated, lastResults: state.results });
    toast('Match verified ✓', 'ok');
  } catch (e) {
    toast(e.message, 'bad');
  }
}

async function markNoMatch() {
  try {
    const product = await ensureSaved();
    const { product: updated } = await api(`/api/products/${product.id}/match`, {
      method: 'POST',
      body: { match: null, status: 'no_match' },
    });
    state.current = updated;
    await refreshProducts();
    showEditor({ ...updated, lastResults: state.results });
    toast('Marked as “no match”.', 'ok');
  } catch (e) {
    toast(e.message, 'bad');
  }
}

async function clearMatch() {
  if (!state.current?.id) return renderMatch(null);
  try {
    const { product } = await api(`/api/products/${state.current.id}/match`, {
      method: 'POST',
      body: { match: null, status: 'unverified' },
    });
    state.current = product;
    await refreshProducts();
    showEditor({ ...product, lastResults: state.results });
    toast('Match cleared.');
  } catch (e) {
    toast(e.message, 'bad');
  }
}

async function deleteProduct() {
  if (!state.current?.id) return;
  if (!confirm('Delete this product and its verification record?')) return;
  try {
    await api(`/api/products/${state.current.id}`, { method: 'DELETE' });
    await refreshProducts();
    newProduct();
    toast('Product deleted.');
  } catch (e) {
    toast(e.message, 'bad');
  }
}

/* ---------- Bootstrap ---------- */
async function refreshProducts() {
  const { products } = await api('/api/products');
  state.products = products;
  renderProductList();
}

async function init() {
  try {
    const { fields, serpapiConfigured } = await api('/api/fields');
    state.fields = fields;
    renderForm();
    const status = $('#apiStatus');
    status.textContent = serpapiConfigured ? 'SerpApi connected' : 'SerpApi key missing';
    status.classList.add(serpapiConfigured ? 'ok' : 'bad');
  } catch (e) {
    toast(`Failed to load: ${e.message}`, 'bad');
  }

  $('#searchBtn').addEventListener('click', doSearch);
  $('#saveBtn').addEventListener('click', saveProduct);
  $('#deleteBtn').addEventListener('click', deleteProduct);
  $('#newProductBtn').addEventListener('click', newProduct);
  $('#markNoMatchBtn').addEventListener('click', markNoMatch);
  $('#clearMatchBtn').addEventListener('click', clearMatch);
  $('#productSearch').addEventListener('input', renderProductList);

  await refreshProducts();
  newProduct();
}

init();
