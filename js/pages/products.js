/** Product & QR code management (admin). */
const ProductsPage = {
  state: { page: 1, search: '', active: '' },
  suppliers: [],

  async render(el) {
    this.suppliers = (await API.get('/suppliers')).data;
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">Products & QR Codes</div>
        <div class="page-sub">Rice varieties, bag sizes, prices and printable QR labels</div></div>
        <button class="btn btn-primary" id="add-btn">＋ Add Product</button>
      </div>
      <div class="card">
        <div class="filters">
          <div class="form-group" style="flex:1; min-width:200px;"><label class="form-label">Search</label>
            <input class="form-control" id="p-search" placeholder="Name, SKU or brand…" value="${Fmt.esc(this.state.search)}"></div>
          <div class="form-group"><label class="form-label">Status</label>
            <select class="form-control" id="p-active">
              <option value="">All</option><option value="1" ${this.state.active === '1' ? 'selected' : ''}>Active</option>
              <option value="0" ${this.state.active === '0' ? 'selected' : ''}>Inactive</option>
            </select></div>
        </div>
        <div id="p-table"><div class="spinner"></div></div>
        <div class="pager" id="p-pager"></div>
      </div>`;
    document.getElementById('add-btn').onclick = () => this.form();
    document.getElementById('p-search').addEventListener('input', debounce(() => {
      this.state.search = document.getElementById('p-search').value.trim(); this.state.page = 1; this.load();
    }));
    document.getElementById('p-active').onchange = e => { this.state.active = e.target.value; this.state.page = 1; this.load(); };
    this.load();
  },

  async load() {
    const res = await API.get(`/products?page=${this.state.page}&limit=15&search=${encodeURIComponent(this.state.search)}&active=${this.state.active}`);
    this.rows = res.data;
    document.getElementById('p-table').innerHTML = Tbl.render([
      { h: 'Product', v: r => `<b>${Fmt.esc(r.name)}</b> <span class="muted">${r.bag_weight_kg}kg</span><div class="small muted">${Fmt.esc(r.brand || '')}</div>` },
      { h: 'SKU / QR', v: r => `<span class="mono">${r.sku}</span>` },
      { h: 'Supplier', v: r => `<span class="small">${Fmt.esc(r.supplier_name || '—')}</span>` },
      { h: 'Buy', cls: 'num', v: r => Fmt.currency(r.buying_price) },
      { h: 'Sell', cls: 'num', v: r => `<b style="color:var(--gold);">${Fmt.currency(r.selling_price)}</b>` },
      { h: 'Stock', cls: 'num', v: r => r.total_qty <= r.reorder_level ? `<b class="neg">${Fmt.num(r.total_qty)}</b>` : Fmt.num(r.total_qty) },
      { h: 'Status', v: r => r.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Inactive</span>' },
      { h: '', cls: 'nowrap', v: (r, i) => `
        <button class="btn btn-ghost btn-sm" title="QR label" onclick="ProductsPage.qr(${r.id})">🔳</button>
        <button class="btn btn-ghost btn-sm" title="Edit" onclick="ProductsPage.form(${i})">✏️</button>` },
    ], res.data);
    Tbl.pager(document.getElementById('p-pager'), res, p => { this.state.page = p; this.load(); });
  },

  form(idx) {
    const p = idx != null ? this.rows[idx] : null;
    Modal.open(p ? `Edit — ${p.name} ${p.bag_weight_kg}kg` : 'Add Product', `
      <form id="prod-form">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Rice name/type <span class="req">*</span></label>
            <input class="form-control" name="name" value="${Fmt.esc(p?.name || '')}" required></div>
          <div class="form-group"><label class="form-label">Brand</label>
            <input class="form-control" name="brand" value="${Fmt.esc(p?.brand || '')}"></div>
        </div>
        <div class="form-row-3">
          <div class="form-group"><label class="form-label">Bag weight (kg) <span class="req">*</span></label>
            <input class="form-control" name="bag_weight_kg" type="number" step="0.5" min="0.5" value="${p?.bag_weight_kg || 25}" required></div>
          <div class="form-group"><label class="form-label">Buying price <span class="req">*</span></label>
            <input class="form-control" name="buying_price" type="number" min="0" value="${p?.buying_price ?? ''}" required></div>
          <div class="form-group"><label class="form-label">Selling price <span class="req">*</span></label>
            <input class="form-control" name="selling_price" type="number" min="0" value="${p?.selling_price ?? ''}" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Supplier</label>
            <select class="form-control" name="supplier_id"><option value="">— None —</option>
              ${this.suppliers.map(s => `<option value="${s.id}" ${p?.supplier_id === s.id ? 'selected' : ''}>${Fmt.esc(s.name)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Reorder level (bags)</label>
            <input class="form-control" name="reorder_level" type="number" min="0" value="${p?.reorder_level ?? 10}"></div>
        </div>
        ${p ? `<div class="form-group"><label class="checkbox-row"><input type="checkbox" name="is_active" ${p.is_active ? 'checked' : ''}> Active (available for sale)</label></div>
               <div class="form-hint">SKU <span class="mono">${p.sku}</span> is permanent — QR labels already printed stay valid.</div>`
            : `<div class="form-group"><label class="form-label">SKU <span class="muted">(optional — auto-generated if blank)</span></label>
               <input class="form-control" name="sku" placeholder="e.g. JRC-KAISO-25KG"></div>`}
      </form>`, {
      footHTML: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
                 <button class="btn btn-primary" id="prod-save">${p ? 'Save Changes' : 'Create Product'}</button>`
    });
    document.getElementById('prod-save').onclick = async () => {
      const f = document.getElementById('prod-form');
      if (!f.reportValidity()) return;
      const fd = Object.fromEntries(new FormData(f).entries());
      const body = {
        name: fd.name, brand: fd.brand || null, bag_weight_kg: +fd.bag_weight_kg,
        buying_price: +fd.buying_price, selling_price: +fd.selling_price,
        supplier_id: fd.supplier_id ? +fd.supplier_id : null, reorder_level: +fd.reorder_level || 0,
        ...(p ? { is_active: f.querySelector('[name=is_active]').checked ? 1 : 0 } : (fd.sku ? { sku: fd.sku } : {}))
      };
      try {
        if (p) await API.put(`/products/${p.id}`, body);
        else await API.post('/products', body);
        Toast.success(p ? 'Product updated' : 'Product created');
        Modal.close(); this.load();
      } catch (e) { Toast.error('Save failed', e.message); }
    };
  },

  qr(id) {
    const p = this.rows.find(r => r.id === id);
    // QR label rendered client-side from the product's QR payload (its SKU).
    const gen = qrcode(0, 'M');
    gen.addData(p.sku);
    gen.make();
    const src = gen.createDataURL(6, 8);
    const label = `
      <div class="qr-label" style="text-align:center;">
        <img src="${src}" alt="QR" style="width:220px; height:220px; background:#fff; padding:10px; border-radius:10px;">
        <div style="font-weight:800; font-size:1.05rem; margin-top:10px; color:inherit;">${Fmt.esc(p.name)} — ${p.bag_weight_kg}kg</div>
        <div class="mono" style="font-size:.95rem;">${p.sku}</div>
        <div style="font-size:.9rem;">${Fmt.currency(p.selling_price)}</div>
      </div>`;
    Modal.open(`QR Label — ${p.sku}`, label, {
      footHTML: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>
                 <button class="btn btn-primary" onclick='printHTML(${JSON.stringify(label)})'>🖨 Print Label</button>`
    });
  }
};
