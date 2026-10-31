const sb = (CONFIG.SUPABASE_URL && window.supabase) ? supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;
if (CONFIG.EMAILJS_PUBLIC_KEY && window.emailjs) emailjs.init({ publicKey: CONFIG.EMAILJS_PUBLIC_KEY });

const SAMPLE = [
  { id: 's1', name: 'Kuli Kuli Small Pack', description: 'Crunchy groundnut snack, 100g', price: 1500 },
  { id: 's2', name: 'Kuli Kuli Medium Pack', description: 'Crunchy groundnut snack, 250g', price: 3000 },
  { id: 's3', name: 'Kuli Kuli Large Pack', description: 'Crunchy groundnut snack, 500g', price: 5500 },
  { id: 's4', name: 'Kuli Kuli Party Box', description: 'Share-with-everyone box, 1.5kg', price: 12000 }
];

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = n => '₦' + Number(n).toLocaleString('en-NG');
let products = [], categories = [], activeCat = 'All';
let user = null, isOwner = false, authMode = 'login', editingId = null;
let cart = JSON.parse(localStorage.getItem('svcart') || '[]');

// Mini floating loader
let busy = 0;
const busyOn = () => { busy++; $('miniLoader').classList.remove('hidden'); };
const busyOff = () => { busy = Math.max(0, busy - 1); if (!busy) $('miniLoader').classList.add('hidden'); };
const withBusy = fn => async e => { e.preventDefault(); busyOn(); try { await fn(e); } catch (err) { console.error(err); } finally { busyOff(); } };

// ---------- Data ----------
async function loadData() {
  try {
  if (!sb) { products = SAMPLE; categories = []; }
  else {
    const [c, p] = await Promise.all([
      sb.from('categories').select('*').order('sort').order('name'),
      sb.from('products').select('*').order('created_at')
    ]);
    categories = c.data || [];
    products = p.error ? SAMPLE : (p.data || []);
  }
  } catch (e) { console.warn(e); products = SAMPLE; categories = []; }
  renderChips(); renderProducts();
}
function renderChips() {
  const names = ['All', ...categories.map(c => c.name)];
  $('chips').innerHTML = names.length > 1 ? names.map(n =>
    `<button class="chip ${n === activeCat ? 'active' : ''}" data-cat="${esc(n)}">${esc(n)}</button>`).join('') : '';
  $('chips').querySelectorAll('.chip').forEach(b => b.onclick = () => { activeCat = b.dataset.cat; renderChips(); renderProducts(); });
  $('pCat').innerHTML = '<option value="">No category</option>' + categories.map(c => `<option>${esc(c.name)}</option>`).join('');
}
function renderProducts() {
  const list = products.filter(p => (activeCat === 'All' || p.category === activeCat) && (isOwner || p.in_stock !== false));
  $('products').innerHTML = list.length ? list.map(p => `
    <div class="card">
      ${p.in_stock === false ? '<span class="sold">Sold out</span>' : ''}
      <div class="img">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : '🥜'}</div>
      <div class="body">
        <h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>
        <span class="price">${naira(p.price)}</span>
        <button onclick="addToCart('${esc(p.id)}')" ${p.in_stock === false ? 'disabled' : ''}>Add to cart</button>
        ${isOwner ? `<div class="ocontrols"><button onclick="editProduct('${esc(p.id)}')">Edit</button><button class="del" onclick="deleteProduct('${esc(p.id)}')">Delete</button></div>` : ''}
      </div>
    </div>`).join('') : '<p>No products here yet.</p>';
}

// ---------- Cart ----------
function saveCart() { localStorage.setItem('svcart', JSON.stringify(cart)); renderCart(); }
function addToCart(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  const c = cart.find(x => x.id === id);
  c ? c.qty++ : cart.push({ id, name: p.name, price: Number(p.price), qty: 1 });
  saveCart();
}
function changeQty(id, d) {
  const c = cart.find(x => x.id === id); if (!c) return;
  c.qty += d; if (c.qty <= 0) cart = cart.filter(x => x.id !== id);
  saveCart();
}
const cartTotal = () => cart.reduce((s, c) => s + c.price * c.qty, 0);
function renderCart() {
  $('cartCount').textContent = cart.reduce((s, c) => s + c.qty, 0);
  $('cartTotal').textContent = naira(cartTotal());
  $('cartItems').innerHTML = cart.length ? cart.map(c => `
    <div class="line"><span>${esc(c.name)}<br><small>${naira(c.price)}</small></span>
    <span class="qty"><button onclick="changeQty('${esc(c.id)}',-1)">−</button>${c.qty}<button onclick="changeQty('${esc(c.id)}',1)">+</button></span></div>`).join('')
    : '<p>Your cart is empty.</p>';
}
$('cartBtn').onclick = () => $('cartPanel').classList.remove('hidden');
$('closeCart').onclick = () => $('cartPanel').classList.add('hidden');

// ---------- Auth ----------
function setAuthMode(m) {
  authMode = m;
  $('tabLogin').classList.toggle('active', m === 'login');
  $('tabSignup').classList.toggle('active', m === 'signup');
  $('authSubmit').textContent = m === 'login' ? 'Login' : 'Create account';
  $('authMsg').textContent = '';
}
$('tabLogin').onclick = () => setAuthMode('login');
$('tabSignup').onclick = () => setAuthMode('signup');
$('closeAuth').onclick = () => $('authView').classList.add('hidden');
$('authBtn').onclick = async () => {
  if (user) { if (sb) await sb.auth.signOut(); }
  else $('authView').classList.remove('hidden');
};
$('authForm').onsubmit = withBusy(async e => {
  e.preventDefault();
  if (!sb) { $('authMsg').textContent = 'Add your Supabase keys in config.js first.'; return; }
  const email = $('authEmail').value.trim(), password = $('authPass').value;
  const res = authMode === 'login'
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });
  if (res.error) { $('authMsg').textContent = res.error.message; return; }
  if (authMode === 'signup' && !res.data.session) { $('authMsg').textContent = 'Check your email to confirm your account.'; return; }
  $('authView').classList.add('hidden');
});
async function setUser(u) {
  user = u;
  $('authBtn').textContent = u ? 'Logout' : 'Login';
  if (u && !$('coEmail').value) $('coEmail').value = u.email;
  isOwner = false;
  if (u && sb) { try { const { data } = await sb.rpc('is_owner'); isOwner = data === true; } catch (e) { console.warn(e); } }
  $('fab').classList.toggle('hidden', !isOwner);
  if (!isOwner) { $('fabMenu').classList.add('hidden'); $('ordersPanel').classList.add('hidden'); }
  renderProducts();
}
const sessionReady = sb
  ? sb.auth.getSession().then(({ data }) => { setTimeout(() => setUser(data.session?.user || null), 0); }).catch(console.warn)
  : Promise.resolve();
if (sb) sb.auth.onAuthStateChange((_e, s) => { setTimeout(() => setUser(s?.user || null), 0); });

// ---------- Checkout ----------
$('checkoutForm').onsubmit = withBusy(async e => {
  e.preventDefault();
  const msg = $('coMsg'); msg.textContent = '';
  if (!cart.length) { msg.textContent = 'Your cart is empty.'; return; }
  if (!sb) { msg.textContent = 'Add your Supabase keys in config.js first.'; return; }
  if (!user) { $('authView').classList.remove('hidden'); return; }
  $('placeBtn').disabled = true;
  const order = {
    user_id: user.id, name: $('coName').value.trim(), email: $('coEmail').value.trim(),
    phone: $('coPhone').value.trim(), address: $('coAddress').value.trim(),
    items: cart, total: cartTotal()
  };
  const { data, error } = await sb.from('orders').insert(order).select().single();
  if (error) { msg.textContent = error.message; $('placeBtn').disabled = false; return; }
  const params = {
    order_id: String(data.id).slice(0, 8), customer_name: order.name, phone: order.phone,
    address: order.address, total: naira(order.total), customer_email: order.email,
    items: cart.map(c => `${c.qty} x ${c.name}`).join('\n')
  };
  let customerOk = false, emailErr = '';
  if (CONFIG.EMAILJS_PUBLIC_KEY && window.emailjs) {
    const res = await Promise.allSettled([
      emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_TEMPLATE_CUSTOMER, { ...params, to_email: order.email }),
      emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_TEMPLATE_CUSTOMER, { ...params, to_email: CONFIG.OWNER_EMAIL })
    ]);
    customerOk = res[0].status === 'fulfilled';
    res.forEach(r => { if (r.status === 'rejected') { console.warn('Email failed', r.reason); emailErr = emailErr || (r.reason?.text || r.reason?.message || String(r.reason)); } });
  } else emailErr = 'Email is not set up on this site yet.';
  showThanks(order, params, customerOk, emailErr);
  cart = []; saveCart();
  $('checkoutForm').reset(); $('coEmail').value = user.email;
  $('cartPanel').classList.add('hidden');
  $('placeBtn').disabled = false;
});

function showThanks(order, p, ok, err) {
  $('thanksBody').innerHTML = `
    <h3>Thank you, ${esc(order.name.split(' ')[0])}!</h3>
    <p class="tsub">Your order <strong>#${esc(p.order_id)}</strong> has been received.</p>
    <div class="tbox">${(order.items || []).map(i => `<div class="trow"><span>${esc(i.qty)} x ${esc(i.name)}</span><span>${naira(i.price * i.qty)}</span></div>`).join('')}
      <div class="trow ttotal"><span>Total</span><span>${naira(order.total)}</span></div></div>
    <div class="tdet"><strong>Delivery details</strong><br>${esc(order.name)}<br>${esc(order.phone)}<br>${esc(order.address)}</div>
    <p class="tnote">${ok ? `A receipt was sent to <strong>${esc(order.email)}</strong>.` : `Your order is saved, but we couldn't send the email receipt.<br><small>${esc(err)}</small>`}</p>
    <p class="tnote">We will contact you shortly to confirm payment and delivery.</p>`;
  $('thanksModal').classList.remove('hidden');
}
$('thanksClose').onclick = () => $('thanksModal').classList.add('hidden');

// ---------- Owner tools ----------
$('fab').onclick = () => $('fabMenu').classList.toggle('hidden');
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).classList.add('hidden'));

$('mProduct').onclick = () => { editingId = null; $('pmTitle').textContent = 'Add product'; $('productForm').reset(); $('pStock').checked = true; $('pMsg').textContent = ''; $('fabMenu').classList.add('hidden'); $('productModal').classList.remove('hidden'); };
function editProduct(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  editingId = id; $('pmTitle').textContent = 'Edit product';
  $('pName').value = p.name; $('pPrice').value = p.price; $('pDesc').value = p.description || '';
  $('pCat').value = p.category || ''; $('pStock').checked = p.in_stock !== false; $('pImg').value = ''; $('pMsg').textContent = '';
  $('productModal').classList.remove('hidden');
}
async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  busyOn(); const { error } = await sb.from('products').delete().eq('id', id); busyOff();
  if (error) return alert(error.message);
  loadData();
}
$('productForm').onsubmit = withBusy(async e => {
  e.preventDefault();
  const msg = $('pMsg'); msg.textContent = 'Saving...'; $('pSave').disabled = true;
  try {
    const row = {
      name: $('pName').value.trim(), price: Number($('pPrice').value), description: $('pDesc').value.trim(),
      category: $('pCat').value || null, in_stock: $('pStock').checked
    };
    const file = $('pImg').files[0];
    if (file) {
      const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const up = await sb.storage.from('product-images').upload(path, file);
      if (up.error) throw up.error;
      row.image_url = sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    const res = editingId ? await sb.from('products').update(row).eq('id', editingId) : await sb.from('products').insert(row);
    if (res.error) throw res.error;
    $('productModal').classList.add('hidden');
    loadData();
  } catch (err) { msg.textContent = err.message; }
  $('pSave').disabled = false;
});

$('mCategory').onclick = () => { $('categoryForm').reset(); $('cMsg').textContent = ''; $('fabMenu').classList.add('hidden'); $('categoryModal').classList.remove('hidden'); };
$('categoryForm').onsubmit = withBusy(async e => {
  e.preventDefault();
  const { error } = await sb.from('categories').insert({ name: $('cName').value.trim(), sort: categories.length + 1 });
  if (error) { $('cMsg').textContent = error.message; return; }
  $('categoryModal').classList.add('hidden'); loadData();
});

$('mOrders').onclick = () => { $('fabMenu').classList.add('hidden'); $('ordersPanel').classList.remove('hidden'); loadOrders(); };
$('closeOrders').onclick = () => $('ordersPanel').classList.add('hidden');
async function loadOrders() {
  const box = $('ordersList'); box.innerHTML = 'Loading...';
  busyOn(); const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }); busyOff();
  if (error) { box.textContent = error.message; return; }
  box.innerHTML = data.length ? data.map(o => `
    <div class="order">
      <strong>#${esc(String(o.id).slice(0, 8))}</strong> · ${new Date(o.created_at).toLocaleString('en-NG')}<br>
      ${esc(o.name)} · ${esc(o.phone)}<br>${esc(o.email || '')}<br>${esc(o.address)}<br>
      ${(o.items || []).map(i => `${esc(i.qty)} x ${esc(i.name)}`).join('<br>')}<br>
      <strong>${naira(o.total)}</strong><br>
      <select onchange="setStatus('${esc(o.id)}',this.value)">
        ${['new', 'confirmed', 'delivered', 'cancelled'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>`).join('') : '<p>No orders yet.</p>';
}
async function setStatus(id, status) { busyOn(); await sb.from('orders').update({ status }).eq('id', id); busyOff(); }

// ---------- Footer + loader ----------
$('yr').textContent = new Date().getFullYear();
$('ftEmail').textContent = CONFIG.OWNER_EMAIL || '';
$('ftPhone').textContent = CONFIG.PHONE || '';
if (CONFIG.INSTAGRAM) { $('ftIg').textContent = '@' + CONFIG.INSTAGRAM; $('ftIg').href = 'https://instagram.com/' + CONFIG.INSTAGRAM; }

renderCart();
const t0 = Date.now();
const hideLoader = () => {
  const l = $('loader'); if (!l) return;
  l.classList.add('done'); setTimeout(() => l.remove(), 800);
};
Promise.race([
  Promise.all([loadData(), sessionReady]),
  new Promise(r => setTimeout(r, 4000))
]).catch(console.error).finally(() => setTimeout(hideLoader, Math.max(0, 2400 - (Date.now() - t0))));
