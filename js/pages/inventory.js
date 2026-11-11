/** Inventory: balances, movement history, and admin stock adjustments. */
const InventoryPage = {
  tab: 'balances',
  movState: { page: 1, product_id: '', type: '', from: '', to: '' },
  products: [], locations: [],

  async render(el) {
    const settings = await API.get('/settings');
    this.locations = settings.locations;
    this.products = (await API.get('/products?limit=100')).data;
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">Stock & Movements</div>
        <div class="page-sub">Live balances per location and a full audit of every bag in and out</div></div>
        <button class="btn btn-gold" id="adj-btn">± Adjust Stock</button>
      </div>
      <div class="tabs">
        <button class="tab ${this.tab === 'balances' ? 'active' : ''}" data-t="balances">Balances</button>
        <button class="tab ${this.tab === 'movements' ? 'active' : ''}" data-t="movements">Movement History</button>
        <button class="tab ${this.tab === 'adjustments' ? 'active' : ''}" data-t="adjustments">Adjustments</button>
      </div>
      <div id="inv-body"><div class="spinner"></div></div>`;
    el.querySelectorAll('.tab').forEach(t => t.onclick = () => {
      this.tab = t.dataset.t;
      el.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
      this.loadTab();
    });
    document.getElementById('adj-btn').onclick = () => this.adjustForm();
    this.loadTab();
  },

  async loadTab() {
    const box = document.getElementById('inv-body');
    box.innerHTML = '<div class="spinner"></div>';
    if (this.tab === 'balances') return this.loadBalances(box);
    if (this.tab === 'movements') return this.loadMovements(box);
    return this.loadAdjustments(box);
  },

  async loadBalances(box) {
    const res = await API.get('/stock/balances');
    const totalValue = res.data.reduce((s, r) => s + r.stock_value, 0);
    box.innerHTML = `<div class="card">
      <div class="card-head"><div class="card-title">Inventory Balances</div>
        <div class="small muted">Total value <b style="color:var(--gold);">${Fmt.currency(totalValue)}</b></div></div>
      ${Tbl.render([
        { h: 'Product', v: r => `<b>${Fmt.esc(r.product_name)}</b> <span class="muted">${r.bag_weight_kg}kg</span>` },
        { h: 'SKU', v: r => `<span class="mono">${r.sku}</span>` },
        { h: 'Location', v: r => `<span class="badge badge-gray">${Fmt.esc(r.location_name)}</span>` },
        { h: 'Bags', cls: 'num', v: r => r.qty <= r.reorder_level ? `<b class="neg">${Fmt.num(r.qty)}</b>` : `<b>${Fmt.num(r.qty)}</b>` },
        { h: 'Avg Cost / bag', cls: 'num', v: r => Fmt.currency(r.avg_cost) },
        { h: 'Stock Value', cls: 'num', v: r => Fmt.currency(r.stock_value) },
      ], res.data, { empty: 'No stock yet — receive stock first' })}</div>`;
  },

  async loadMovements(box) {
    const s = this.movState;
    box.innerHTML = `<div class="card">
      <div class="filters">
        <div class="form-group"><label class="form-label">Product</label>
          <select class="form-control" id="m-prod"><option value="">All products</option>
            ${this.products.map(p => `<option value="${p.id}" ${String(s.product_id) === String(p.id) ? 'selected' : ''}>${Fmt.esc(p.name)} ${p.bag_weight_kg}kg</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Type</label>
          <select class="form-control" id="m-type"><option value="">All types</option>
            ${['receipt', 'sale', 'adjustment', 'return_in', 'write_off'].map(t => `<option value="${t}" ${s.type === t ? 'selected' : ''}>${t.replace('_', ' ')}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">From</label><input type="date" class="form-control" id="m-from" value="${s.from}"></div>
        <div class="form-group"><label class="form-label">To</label><input type="date" class="form-control" id="m-to" value="${s.to}"></div>
        <button class="btn btn-secondary" id="m-apply">Filter</button>
      </div>
      <div id="m-table"></div><div class="pager" id="m-pager"></div></div>`;
    document.getElementById('m-apply').onclick = () => {
      Object.assign(s, { page: 1, product_id: document.getElementById('m-prod').value, type: document.getElementById('m-type').value,
                         from: document.getElementById('m-from').value, to: document.getElementById('m-to').value });
      this.fetchMovements();
    };
    this.fetchMovements();
  },

  async fetchMovements() {
    const s = this.movState;
    const res = await API.get(`/stock/movements?page=${s.page}&limit=25&product_id=${s.product_id}&type=${s.type}&from=${s.from}&to=${s.to}`);
    document.getElementById('m-table').innerHTML = Tbl.render([
      { h: 'When', v: r => `<span class="small">${Fmt.datetime(r.created_at)}</span>` },
      { h: 'Type', v: r => Fmt.move(r.movement_type) },
      { h: 'Product', v: r => `${Fmt.esc(r.product_name)} <span class="muted small">${r.bag_weight_kg}kg</span>` },
      { h: 'Location', v: r => `<span class="small">${Fmt.esc(r.location_name)}</span>` },
      { h: 'Qty', cls: 'num', v: r => Fmt.qtyDelta(r.qty_change) },
      { h: 'Unit cost', cls: 'num', v: r => Fmt.currency(r.unit_cost) },
      { h: 'By', v: r => `<span class="small">${Fmt.esc(r.user_name || 'system')}</span>` },
      { h: 'Note', v: r => `<span class="small muted">${Fmt.esc(r.reason || (r.reference_type ? `${r.reference_type} #${r.reference_id}` : ''))}</span>` },
    ], res.data, { empty: 'No movements match these filters' });
    Tbl.pager(document.getElementById('m-pager'), res, p => { s.page = p; this.fetchMovements(); });
  },

  async loadAdjustments(box) {
    const res = await API.get('/stock/adjustments');
    box.innerHTML = `<div class="card">
      <div class="card-head"><div class="card-title">Stock Adjustments</div>
        <div class="card-sub">Spoilage, damage, theft, supplier returns and corrections — every one has a reason and a responsible user</div></div>
      ${Tbl.render([
        { h: 'Ref', v: r => `<span class="mono">${r.adjustment_number}</span>` },
        { h: 'Date', v: r => `<span class="small">${Fmt.datetime(r.created_at)}</span>` },
        { h: 'Product', v: r => `${Fmt.esc(r.product_name)} <span class="muted small">${r.bag_weight_kg}kg</span>` },
        { h: 'Qty', cls: 'num', v: r => Fmt.qtyDelta(r.qty_change) },
        { h: 'Type', v: r => `<span class="badge ${['spoilage', 'damage', 'theft'].includes(r.reason_type) ? 'badge-red' : 'badge-gold'}">${r.reason_type.replace(/_/g, ' ')}</span>` },
        { h: 'Reason', v: r => `<span class="small">${Fmt.esc(r.reason)}</span>` },
        { h: 'Cost impact', cls: 'num', v: r => r.qty_change < 0 ? `<span class="neg">−${Fmt.currency(r.total_cost)}</span>` : Fmt.currency(r.total_cost) },
        { h: 'By', v: r => `<span class="small">${Fmt.esc(r.adjusted_by_name)}</span>` },
      ], res.data, { empty: 'No adjustments recorded' })}</div>`;
  },

  adjustForm() {
    Modal.open('Adjust Stock', `
      <form id="adj-form">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Product <span class="req">*</span></label>
            <select class="form-control" name="product_id" required><option value="">— Select —</option>
              ${this.products.map(p => `<option value="${p.id}">${Fmt.esc(p.name)} ${p.bag_weight_kg}kg (${Fmt.num(p.total_qty)} in stock)</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Location <span class="req">*</span></label>
            <select class="form-control" name="location_id">
              ${this.locations.map(l => `<option value="${l.id}">${Fmt.esc(l.name)}</option>`).join('')}
            </select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Quantity change <span class="req">*</span></label>
            <input class="form-control" name="qty_change" type="number" placeholder="-3 removes, +3 adds" required>
            <div class="form-hint">Negative removes bags (spoilage, theft…), positive adds (count correction)</div></div>
          <div class="form-group"><label class="form-label">Type <span class="req">*</span></label>
            <select class="form-control" name="reason_type">
              <option value="spoilage">Spoilage</option><option value="damage">Damage</option>
              <option value="theft">Theft</option><option value="return_to_supplier">Return to supplier</option>
              <option value="correction">Count correction</option>
            </select></div>
        </div>
        <div class="form-group"><label class="form-label">Reason <span class="req">*</span></label>
          <input class="form-control" name="reason" placeholder="Explain what happened" required minlength="3"></div>
      </form>`, {
      footHTML: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
                 <button class="btn btn-gold" id="adj-save">Apply Adjustment</button>`
    });
    document.getElementById('adj-save').onclick = async () => {
      const f = document.getElementById('adj-form');
      if (!f.reportValidity()) return;
      const fd = Object.fromEntries(new FormData(f).entries());
      try {
        const r = await API.post('/stock/adjustments', {
          product_id: +fd.product_id, location_id: +fd.location_id,
          qty_change: +fd.qty_change, reason_type: fd.reason_type, reason: fd.reason
        });
        Toast.success('Adjustment applied', r.adjustment_number);
        Modal.close(); this.loadTab();
      } catch (e) { Toast.error('Adjustment failed', e.message); }
    };
  }
};
