/** Receive stock from suppliers: line items + transport/other landed costs. */
const ReceivePage = {
  products: [], suppliers: [], locations: [], lines: [],

  async render(el) {
    const [prods, sups, settings] = await Promise.all([
      API.get('/products?active=1&limit=100'), API.get('/suppliers'), API.get('/settings')
    ]);
    this.products = prods.data;
    this.suppliers = sups.data.filter(s => s.is_active);
    this.locations = settings.locations;
    this.lines = [{ product_id: '', qty: '', unit_cost: '' }];

    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">Receive Stock</div>
        <div class="page-sub">Transport & other costs are spread into each bag's landed cost automatically</div></div>
      </div>
      <div class="card">
        <form id="rec-form">
          <div class="form-row-3">
            <div class="form-group"><label class="form-label">Supplier</label>
              <select class="form-control" id="rec-supplier"><option value="">— Select supplier —</option>
                ${this.suppliers.map(s => `<option value="${s.id}">${Fmt.esc(s.name)}</option>`).join('')}
              </select></div>
            <div class="form-group"><label class="form-label">Deliver to <span class="req">*</span></label>
              <select class="form-control" id="rec-location">
                ${this.locations.map(l => `<option value="${l.id}">${Fmt.esc(l.name)}</option>`).join('')}
              </select></div>
            <div class="form-group"><label class="form-label">Invoice / reference #</label>
              <input class="form-control" id="rec-invoice" placeholder="Supplier invoice no."></div>
          </div>
          <div class="card" style="background:var(--bg-2); margin-bottom:14px;">
            <div class="card-head"><div class="card-title">Line Items</div>
              <button type="button" class="btn btn-secondary btn-sm" id="rec-add-line">＋ Add Line</button></div>
            <div id="rec-lines"></div>
          </div>
          <div class="form-row-3">
            <div class="form-group"><label class="form-label">Transport cost</label>
              <input class="form-control" id="rec-transport" type="number" min="0" value="0"></div>
            <div class="form-group"><label class="form-label">Other costs (loading, levies…)</label>
              <input class="form-control" id="rec-other" type="number" min="0" value="0"></div>
            <div class="form-group"><label class="form-label">Notes</label>
              <input class="form-control" id="rec-notes"></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div class="small muted">Goods: <b id="rec-goods" style="color:var(--text);">—</b> · Grand total: <b id="rec-grand" style="color:var(--gold);">—</b></div>
            <button class="btn btn-primary btn-lg" type="submit">📥 Receive Stock</button>
          </div>
        </form>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Recent Receipts</div></div>
        <div id="rec-history"><div class="spinner"></div></div>
      </div>`;

    document.getElementById('rec-add-line').onclick = () => { this.lines.push({ product_id: '', qty: '', unit_cost: '' }); this.renderLines(); };
    document.getElementById('rec-form').onsubmit = e => { e.preventDefault(); this.submit(); };
    ['rec-transport', 'rec-other'].forEach(id => document.getElementById(id).addEventListener('input', () => this.totals()));
    this.renderLines();
    this.loadHistory();
  },

  renderLines() {
    document.getElementById('rec-lines').innerHTML = this.lines.map((l, i) => `
      <div class="form-row-3" style="align-items:end; margin-bottom:8px;">
        <div class="form-group" style="margin:0;"><label class="form-label">Product</label>
          <select class="form-control rec-prod" data-i="${i}">
            <option value="">— Select —</option>
            ${this.products.map(p => `<option value="${p.id}" data-cost="${p.buying_price}" ${l.product_id == p.id ? 'selected' : ''}>${Fmt.esc(p.name)} ${p.bag_weight_kg}kg (${p.sku})</option>`).join('')}
          </select></div>
        <div class="form-group" style="margin:0;"><label class="form-label">Bags</label>
          <input class="form-control rec-qty" data-i="${i}" type="number" min="1" value="${l.qty}"></div>
        <div style="display:flex; gap:8px; align-items:end;">
          <div class="form-group" style="margin:0; flex:1;"><label class="form-label">Unit cost</label>
            <input class="form-control rec-cost" data-i="${i}" type="number" min="0" value="${l.unit_cost}"></div>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-bottom:2px;" onclick="ReceivePage.removeLine(${i})" ${this.lines.length === 1 ? 'disabled' : ''}>🗑</button>
        </div>
      </div>`).join('');
    document.querySelectorAll('.rec-prod').forEach(s => s.onchange = e => {
      const i = +e.target.dataset.i;
      this.lines[i].product_id = e.target.value;
      const cost = e.target.selectedOptions[0]?.dataset.cost;
      if (cost && !this.lines[i].unit_cost) { this.lines[i].unit_cost = +cost; this.renderLines(); }
      this.totals();
    });
    document.querySelectorAll('.rec-qty').forEach(inp => inp.oninput = e => { this.lines[+e.target.dataset.i].qty = e.target.value; this.totals(); });
    document.querySelectorAll('.rec-cost').forEach(inp => inp.oninput = e => { this.lines[+e.target.dataset.i].unit_cost = e.target.value; this.totals(); });
    this.totals();
  },

  removeLine(i) { this.lines.splice(i, 1); this.renderLines(); },

  totals() {
    const goods = this.lines.reduce((s, l) => s + (+l.qty || 0) * (+l.unit_cost || 0), 0);
    const extras = (+document.getElementById('rec-transport').value || 0) + (+document.getElementById('rec-other').value || 0);
    document.getElementById('rec-goods').textContent = Fmt.currency(goods);
    document.getElementById('rec-grand').textContent = Fmt.currency(goods + extras);
  },

  async submit() {
    const items = this.lines
      .filter(l => l.product_id && +l.qty > 0)
      .map(l => ({ product_id: +l.product_id, qty: +l.qty, unit_cost: +l.unit_cost || 0 }));
    if (!items.length) return Toast.error('No items', 'Add at least one product line with a quantity');
    try {
      const r = await API.post('/stock/receipts', {
        supplier_id: +document.getElementById('rec-supplier').value || null,
        location_id: +document.getElementById('rec-location').value,
        invoice_ref: document.getElementById('rec-invoice').value.trim() || null,
        transport_cost: +document.getElementById('rec-transport').value || 0,
        other_cost: +document.getElementById('rec-other').value || 0,
        notes: document.getElementById('rec-notes').value.trim() || null,
        items
      });
      Toast.success('Stock received', `${r.receipt_number} — ${Fmt.currency(r.total_cost)}`);
      this.render(document.getElementById('content'));
    } catch (e) { Toast.error('Receive failed', e.message); }
  },

  async loadHistory() {
    const res = await API.get('/stock/receipts?limit=10');
    document.getElementById('rec-history').innerHTML = Tbl.render([
      { h: 'Receipt #', v: r => `<span class="mono">${r.receipt_number}</span>` },
      { h: 'Date', v: r => `<span class="small">${Fmt.date(r.received_at)}</span>` },
      { h: 'Supplier', v: r => Fmt.esc(r.supplier_name || '—') },
      { h: 'Invoice', v: r => `<span class="small mono">${Fmt.esc(r.invoice_ref || '—')}</span>` },
      { h: 'Bags', cls: 'num', v: r => Fmt.num(r.total_bags) },
      { h: 'Transport', cls: 'num', v: r => Fmt.currency(r.transport_cost) },
      { h: 'Total Cost', cls: 'num', v: r => `<b>${Fmt.currency(r.total_cost)}</b>` },
      { h: '', v: r => `<button class="btn btn-ghost btn-sm" onclick="ReceivePage.view(${r.id})">👁</button>` },
    ], res.data, { empty: 'No stock received yet' });
  },

  async view(id) {
    const r = await API.get(`/stock/receipts/${id}`);
    Modal.open(`Receipt ${r.receipt_number}`, `
      <div class="small muted" style="margin-bottom:10px;">
        ${Fmt.esc(r.supplier_name || 'No supplier')} → ${Fmt.esc(r.location_name)} · ${Fmt.datetime(r.received_at)}<br>
        Received by ${Fmt.esc(r.received_by_name)} ${r.invoice_ref ? `· Invoice ${Fmt.esc(r.invoice_ref)}` : ''}
      </div>
      ${Tbl.render([
        { h: 'Product', v: i => `${Fmt.esc(i.name)} ${i.bag_weight_kg}kg` },
        { h: 'Bags', cls: 'num', v: i => Fmt.num(i.qty) },
        { h: 'Unit cost', cls: 'num', v: i => Fmt.currency(i.unit_cost) },
        { h: 'Landed cost', cls: 'num', v: i => `<b>${Fmt.currency(i.landed_unit_cost)}</b>` },
        { h: 'Line total', cls: 'num', v: i => Fmt.currency(i.line_total) },
      ], r.items)}
      <div class="cart-total-row" style="margin-top:10px;"><span>Goods</span><span>${Fmt.currency(r.goods_cost)}</span></div>
      <div class="cart-total-row"><span>Transport + other</span><span>${Fmt.currency(r.transport_cost + r.other_cost)}</span></div>
      <div class="cart-total-row"><b>Total</b><b class="cart-grand">${Fmt.currency(r.total_cost)}</b></div>`,
      { wide: true, footHTML: '<button class="btn btn-secondary" onclick="Modal.close()">Close</button>' });
  }
};
