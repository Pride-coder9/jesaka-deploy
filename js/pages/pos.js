/** Point of Sale: camera QR scanning (jsQR), USB-scanner/typed codes, cart, receipt. */
const PosPage = {
  cart: [], // { product_id, sku, name, bag, price, qty, stock }
  method: 'cash',
  stream: null,
  scanTimer: null,
  lastScan: 0,

  async render(el) {
    this.cart = [];
    this.method = 'cash';
    el.innerHTML = `
      <div class="pos-grid">
        <div>
          <div class="card">
            <div class="card-head">
              <div><div class="card-title">Scan Product QR</div><div class="card-sub">Camera, USB scanner, or type the SKU</div></div>
              <button class="btn btn-secondary btn-sm" id="cam-btn">📷 Start Camera</button>
            </div>
            <div class="scan-box" id="scan-box">
              <div class="scan-idle" id="scan-idle">Camera is off.<br>Use “Start Camera” to scan QR codes,<br>or type / scan a code below.</div>
              <video id="scan-video" playsinline style="display:none;"></video>
              <div class="scan-frame" id="scan-frame" style="display:none;"></div>
            </div>
            <canvas id="scan-canvas" style="display:none;"></canvas>
            <form id="code-form" style="display:flex; gap:8px; margin-top:12px;">
              <input class="form-control" id="code-input" placeholder="Scan or type SKU / QR code, then Enter…" autocomplete="off">
              <button class="btn btn-primary" type="submit">Find</button>
            </form>
            <div id="hit"></div>
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">Quick Pick</div><div class="card-sub">Tap a product to add it</div></div>
            <div class="quick-grid" id="quick-grid"><div class="spinner"></div></div>
          </div>
        </div>

        <div class="card" style="position:sticky; top:70px;">
          <div class="card-head"><div class="card-title">🧺 Current Sale</div>
            <button class="btn btn-ghost btn-sm" id="clear-cart">Clear</button></div>
          <div id="cart-box"></div>
          <div style="margin-top:12px;">
            <label class="form-label">Payment method</label>
            <div class="pay-methods" id="pay-methods">
              ${[['cash', '💵 Cash'], ['mobile_money', '📱 MoMo'], ['bank', '🏦 Bank'], ['credit', '📝 Credit']]
                .map(([m, l]) => `<button type="button" class="pay-btn ${m === 'cash' ? 'on' : ''}" data-m="${m}">${l}</button>`).join('')}
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Customer name <span class="muted">(optional)</span></label>
                <input class="form-control" id="cust-name" placeholder="Walk-in"></div>
              <div class="form-group"><label class="form-label">Customer phone</label>
                <input class="form-control" id="cust-phone" placeholder="+256…"></div>
            </div>
            <div class="form-group" id="ref-group" style="display:none;">
              <label class="form-label">Payment reference</label>
              <input class="form-control" id="pay-ref" placeholder="MoMo / bank transaction ID">
            </div>
            <button class="btn btn-primary btn-lg btn-block" id="complete-btn">Complete Sale</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('cam-btn').onclick = () => this.stream ? this.stopCamera() : this.startCamera();
    document.getElementById('code-form').onsubmit = e => { e.preventDefault(); this.lookup(document.getElementById('code-input').value.trim()); };
    document.getElementById('clear-cart').onclick = () => { this.cart = []; this.renderCart(); };
    document.getElementById('complete-btn').onclick = () => this.complete();
    document.getElementById('pay-methods').querySelectorAll('.pay-btn').forEach(b => b.onclick = () => {
      this.method = b.dataset.m;
      document.querySelectorAll('.pay-btn').forEach(x => x.classList.toggle('on', x === b));
      document.getElementById('ref-group').style.display = ['mobile_money', 'bank'].includes(this.method) ? 'block' : 'none';
    });
    document.getElementById('code-input').focus();

    this.renderCart();
    this.loadQuickPick();
  },

  async loadQuickPick() {
    try {
      const res = await API.get('/products?active=1&limit=30');
      document.getElementById('quick-grid').innerHTML = res.data.map(p => `
        <button class="quick-item" onclick='PosPage.addProduct(${JSON.stringify({
          id: p.id, sku: p.sku, name: p.name, bag: p.bag_weight_kg, price: p.selling_price, stock: p.total_qty
        }).replace(/'/g, "&#39;")})'>
          <div class="qn">${Fmt.esc(p.name)} ${p.bag_weight_kg}kg</div>
          <div class="qp">${Fmt.currency(p.selling_price)}</div>
          <div class="qs">${Fmt.num(p.total_qty)} in stock</div>
        </button>`).join('') || '<div class="empty">No products yet</div>';
    } catch (e) {
      document.getElementById('quick-grid').innerHTML = `<div class="empty">${Fmt.esc(e.message)}</div>`;
    }
  },

  async lookup(code) {
    if (!code) return;
    const input = document.getElementById('code-input');
    try {
      const p = await API.get(`/products/lookup?code=${encodeURIComponent(code)}`);
      this.addProduct({ id: p.id, sku: p.sku, name: p.name, bag: p.bag_weight_kg, price: p.selling_price, stock: p.available_qty });
      document.getElementById('hit').innerHTML = `
        <div class="product-hit">
          <div style="font-size:1.6rem;">✅</div>
          <div style="flex:1;">
            <b>${Fmt.esc(p.name)} — ${p.bag_weight_kg}kg bag</b>
            <div class="small muted">${p.sku} · ${Fmt.num(p.available_qty)} in stock · ${Fmt.currency(p.selling_price)}</div>
          </div>
        </div>`;
      input.value = '';
      input.focus();
    } catch (e) {
      Toast.error('Not found', e.message);
      input.select();
    }
  },

  addProduct(p) {
    if (p.stock <= 0) return Toast.error('Out of stock', `${p.name} ${p.bag}kg has no stock at the sales point`);
    const line = this.cart.find(c => c.product_id === p.id);
    if (line) {
      if (line.qty + 1 > line.stock) return Toast.error('Stock limit', `Only ${line.stock} bags available`);
      line.qty++;
    } else {
      this.cart.push({ product_id: p.id, sku: p.sku, name: p.name, bag: p.bag, price: p.price, qty: 1, stock: p.stock });
    }
    this.beep();
    this.renderCart();
  },

  setQty(productId, qty) {
    const line = this.cart.find(c => c.product_id === productId);
    if (!line) return;
    qty = Math.floor(Number(qty) || 0);
    if (qty <= 0) this.cart = this.cart.filter(c => c !== line);
    else if (qty > line.stock) { Toast.error('Stock limit', `Only ${line.stock} bags available`); line.qty = line.stock; }
    else line.qty = qty;
    this.renderCart();
  },

  renderCart() {
    const box = document.getElementById('cart-box');
    if (!box) return;
    if (!this.cart.length) {
      box.innerHTML = '<div class="empty" style="padding:24px;"><div class="icon">🛒</div>Scan or pick a product to begin</div>';
      document.getElementById('complete-btn').disabled = true;
      return;
    }
    const total = this.cart.reduce((s, c) => s + c.qty * c.price, 0);
    box.innerHTML = this.cart.map(c => `
      <div class="cart-item">
        <div style="flex:1; min-width:0;">
          <div style="font-size:.85rem; font-weight:600;">${Fmt.esc(c.name)} ${c.bag}kg</div>
          <div class="small muted">${Fmt.currency(c.price)} × ${c.qty} = <b style="color:var(--text);">${Fmt.currency(c.price * c.qty)}</b></div>
        </div>
        <div class="qty-step">
          <button onclick="PosPage.setQty(${c.product_id}, ${c.qty - 1})">−</button>
          <input type="number" min="1" max="${c.stock}" value="${c.qty}" onchange="PosPage.setQty(${c.product_id}, this.value)">
          <button onclick="PosPage.setQty(${c.product_id}, ${c.qty + 1})">+</button>
        </div>
        <button class="btn btn-ghost btn-sm" title="Remove" onclick="PosPage.setQty(${c.product_id}, 0)">🗑</button>
      </div>`).join('') + `
      <div class="cart-total-row" style="margin-top:10px;"><span class="muted">Items</span><span>${this.cart.reduce((s, c) => s + c.qty, 0)} bags</span></div>
      <div class="cart-total-row"><span style="font-weight:700;">Total</span><span class="cart-grand">${Fmt.currency(total)}</span></div>`;
    document.getElementById('complete-btn').disabled = false;
  },

  async complete() {
    if (!this.cart.length) return;
    const btn = document.getElementById('complete-btn');
    btn.disabled = true; btn.textContent = 'Processing…';
    try {
      const sale = await API.post('/sales', {
        items: this.cart.map(c => ({ product_id: c.product_id, qty: c.qty })),
        payment_method: this.method,
        payment_reference: document.getElementById('pay-ref').value.trim() || null,
        customer_name: document.getElementById('cust-name').value.trim() || null,
        customer_phone: document.getElementById('cust-phone').value.trim() || null
      });
      this.cart = [];
      this.renderCart();
      document.getElementById('cust-name').value = '';
      document.getElementById('cust-phone').value = '';
      document.getElementById('pay-ref').value = '';
      document.getElementById('hit').innerHTML = '';
      Toast.success('Sale completed', `${sale.sale_number} — ${Fmt.currency(sale.total)}`);
      SalesPage.showReceiptModal(sale);
      this.loadQuickPick(); // refresh stock counts
    } catch (e) {
      Toast.error('Sale failed', e.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Complete Sale';
    }
  },

  // ---------- Camera scanning ----------
  async startCamera() {
    const video = document.getElementById('scan-video');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
      return Toast.error('Camera unavailable', 'Allow camera access, or type the SKU / use a USB scanner instead.');
    }
    video.srcObject = this.stream;
    await video.play();
    document.getElementById('scan-idle').style.display = 'none';
    video.style.display = 'block';
    document.getElementById('scan-frame').style.display = 'block';
    document.getElementById('cam-btn').textContent = '⏹ Stop Camera';

    const canvas = document.getElementById('scan-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.scanTimer = setInterval(() => {
      if (!video.videoWidth) return;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = window.jsQR?.(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (qr?.data && Date.now() - this.lastScan > 1600) {
        this.lastScan = Date.now();
        this.lookup(qr.data.trim());
      }
    }, 220);
  },

  stopCamera() {
    clearInterval(this.scanTimer);
    this.scanTimer = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    const video = document.getElementById('scan-video');
    if (video) {
      video.style.display = 'none';
      document.getElementById('scan-idle').style.display = 'block';
      document.getElementById('scan-frame').style.display = 'none';
      const btn = document.getElementById('cam-btn');
      if (btn) btn.textContent = '📷 Start Camera';
    }
  },

  beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 1200; g.gain.value = .08;
      o.start(); o.stop(ctx.currentTime + .09);
    } catch {}
  }
};
