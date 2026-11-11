/** Sales history (role-aware) + printable receipts. */
const SalesPage = {
  state: { page: 1, from: '', to: '', method: '', worker_id: '', search: '' },
  workers: [],

  async render(el) {
    const isAdmin = APP.user.role === 'admin';
    if (isAdmin && !this.workers.length) {
      try { this.workers = (await API.get('/users')).data; } catch {}
    }
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">${isAdmin ? 'Sales History' : 'My Sales'}</div>
        <div class="page-sub">${isAdmin ? 'All completed transactions — immutable; use Returns for corrections' : 'Your completed transactions'}</div></div>
        <div class="head-actions">
          <button class="btn btn-secondary btn-sm" id="exp-btn">⬇ Export CSV</button>
          <button class="btn btn-primary btn-sm" onclick="location.hash='#pos'">🛒 New Sale</button>
        </div>
      </div>
      <div class="card">
        <div class="filters">
          <div class="form-group"><label class="form-label">From</label><input type="date" class="form-control" id="f-from" value="${this.state.from}"></div>
          <div class="form-group"><label class="form-label">To</label><input type="date" class="form-control" id="f-to" value="${this.state.to}"></div>
          <div class="form-group"><label class="form-label">Payment</label>
            <select class="form-control" id="f-method">
              <option value="">All methods</option>
              ${['cash', 'mobile_money', 'bank', 'credit'].map(m => `<option value="${m}" ${this.state.method === m ? 'selected' : ''}>${m.replace('_', ' ')}</option>`).join('')}
            </select></div>
          ${isAdmin ? `<div class="form-group"><label class="form-label">Worker</label>
            <select class="form-control" id="f-worker"><option value="">All workers</option>
              ${this.workers.map(w => `<option value="${w.id}" ${String(this.state.worker_id) === String(w.id) ? 'selected' : ''}>${Fmt.esc(w.full_name)}</option>`).join('')}
            </select></div>` : ''}
          <div class="form-group" style="flex:1; min-width:170px;"><label class="form-label">Search</label>
            <input class="form-control" id="f-search" placeholder="Sale # or customer…" value="${Fmt.esc(this.state.search)}"></div>
          <button class="btn btn-secondary" id="f-apply">Filter</button>
        </div>
        <div id="sales-table"><div class="spinner"></div></div>
        <div class="pager" id="sales-pager"></div>
      </div>`;
    document.getElementById('f-apply').onclick = () => {
      Object.assign(this.state, {
        page: 1,
        from: document.getElementById('f-from').value,
        to: document.getElementById('f-to').value,
        method: document.getElementById('f-method').value,
        worker_id: document.getElementById('f-worker')?.value || '',
        search: document.getElementById('f-search').value.trim()
      });
      this.load();
    };
    document.getElementById('f-search').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('f-apply').click(); });
    document.getElementById('exp-btn').onclick = () => this.exportCsv();
    this.load();
  },

  query() {
    const s = this.state;
    return `from=${s.from}&to=${s.to}&method=${s.method}&worker_id=${s.worker_id}&search=${encodeURIComponent(s.search)}`;
  },

  async load() {
    const box = document.getElementById('sales-table');
    box.innerHTML = '<div class="spinner"></div>';
    const res = await API.get(`/sales?page=${this.state.page}&limit=20&${this.query()}`);
    box.innerHTML = `
      <div class="small muted" style="margin-bottom:8px;">${res.total} sales · total <b style="color:var(--gold);">${Fmt.currency(res.total_amount)}</b></div>
      ${Tbl.render([
        { h: 'Sale #', v: r => `<span class="mono">${r.sale_number}</span>` },
        { h: 'Date', v: r => `<span class="small">${Fmt.datetime(r.created_at)}</span>` },
        { h: 'Worker', v: r => Fmt.esc(r.worker_name) },
        { h: 'Customer', v: r => Fmt.esc(r.customer_name || 'Walk-in') },
        { h: 'Bags', cls: 'num', v: r => Fmt.num(r.total_bags) },
        { h: 'Payment', v: r => Fmt.method(r.payment_method) },
        { h: 'Total', cls: 'num', v: r => `<b>${Fmt.currency(r.total)}</b>` },
        { h: '', v: r => `<button class="btn btn-ghost btn-sm" title="Receipt" onclick="event.stopPropagation(); SalesPage.receipt(${r.id})">🧾</button>` },
      ], res.data, { rowAttrs: r => `class="clickable" onclick="SalesPage.receipt(${r.id})"` })}`;
    Tbl.pager(document.getElementById('sales-pager'), res, p => { this.state.page = p; this.load(); });
  },

  async exportCsv() {
    const res = await API.get(`/sales?page=1&limit=100&${this.query()}`);
    exportCSV(`jesaka-sales-${Fmt.today()}.csv`,
      ['Sale #', 'Date', 'Worker', 'Customer', 'Bags', 'Payment', 'Total', 'COGS'],
      res.data.map(r => [r.sale_number, r.created_at, r.worker_name, r.customer_name || '', r.total_bags, r.payment_method, r.total, r.total_cost]));
  },

  async receipt(id) {
    try {
      const sale = await API.get(`/sales/${id}`);
      this.showReceiptModal(sale);
    } catch (e) { Toast.error('Error', e.message); }
  },

  receiptHTML(s) {
    const store = APP.store;
    return `
      <div class="receipt">
        <h3>🍚 ${Fmt.esc(store.name || 'Jesaka Rice Company')}</h3>
        <div class="c small">${Fmt.esc(store.address || '')}</div>
        <div class="c small">${Fmt.esc(store.phone || '')}</div>
        <hr>
        <table style="width:100%;">
          <tr><td>Receipt:</td><td style="text-align:right;"><b>${s.sale_number}</b></td></tr>
          <tr><td>Date:</td><td style="text-align:right;">${Fmt.datetime(s.created_at)}</td></tr>
          <tr><td>Served by:</td><td style="text-align:right;">${Fmt.esc(s.worker_name)}</td></tr>
          ${s.customer_name ? `<tr><td>Customer:</td><td style="text-align:right;">${Fmt.esc(s.customer_name)}${s.customer_phone ? ' · ' + Fmt.esc(s.customer_phone) : ''}</td></tr>` : ''}
        </table>
        <hr>
        <table style="width:100%;">
          ${s.items.map(i => `
            <tr><td colspan="2"><b>${Fmt.esc(i.name)} ${i.bag_weight_kg}kg</b></td></tr>
            <tr><td>&nbsp;&nbsp;${i.qty} × ${Fmt.currency(i.unit_price)}</td><td style="text-align:right;">${Fmt.currency(i.line_total)}</td></tr>`).join('')}
        </table>
        <hr>
        <table style="width:100%;">
          <tr class="tot"><td>TOTAL</td><td style="text-align:right;">${Fmt.currency(s.total)}</td></tr>
          <tr><td>Paid via</td><td style="text-align:right; text-transform:capitalize;">${s.payment_method.replace('_', ' ')}</td></tr>
          ${s.payments?.[0]?.reference ? `<tr><td>Ref</td><td style="text-align:right;">${Fmt.esc(s.payments[0].reference)}</td></tr>` : ''}
        </table>
        ${s.returns?.length ? `<hr><div class="small">⚠ Returns processed: ${s.returns.map(r => r.return_number).join(', ')}</div>` : ''}
        <hr>
        <div class="c small">${Fmt.esc(store.receipt_footer || 'Thank you for buying from Jesaka Rice Company!')}</div>
      </div>`;
  },

  showReceiptModal(sale) {
    const html = this.receiptHTML(sale);
    Modal.open(`Receipt — ${sale.sale_number}`, html, {
      footHTML: `<button class="btn btn-secondary" onclick="Modal.close()">Close</button>
                 ${APP.user.role === 'admin' ? `<button class="btn btn-danger" onclick="Modal.close(); location.hash='#returns/${sale.id}'">↩ Process Return</button>` : ''}
                 <button class="btn btn-primary" onclick='printHTML(${JSON.stringify(html)})'>🖨 Print</button>`
    });
  }
};
