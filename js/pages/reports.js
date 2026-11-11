/** Reports: P&L (+snapshots), sales summary, worker performance, stock valuation. */
const ReportsPage = {
  tab: 'pl',
  from: Fmt.monthStart(),
  to: Fmt.today(),
  chart: null,

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">Reports & Profit/Loss</div>
        <div class="page-sub">Every figure reconciles with sales, inventory cost, returns and expenses</div></div>
      </div>
      <div class="card">
        <div class="filters">
          <div class="form-group"><label class="form-label">From</label><input type="date" class="form-control" id="r-from" value="${this.from}"></div>
          <div class="form-group"><label class="form-label">To</label><input type="date" class="form-control" id="r-to" value="${this.to}"></div>
          <button class="btn btn-primary" id="r-apply">Run Report</button>
          <button class="btn btn-secondary" id="r-print">🖨 Print</button>
        </div>
        <div class="tabs">
          <button class="tab ${this.tab === 'pl' ? 'active' : ''}" data-t="pl">Profit & Loss</button>
          <button class="tab ${this.tab === 'sales' ? 'active' : ''}" data-t="sales">Sales Summary</button>
          <button class="tab ${this.tab === 'workers' ? 'active' : ''}" data-t="workers">Worker Performance</button>
          <button class="tab ${this.tab === 'valuation' ? 'active' : ''}" data-t="valuation">Stock Valuation</button>
        </div>
        <div id="r-body"><div class="spinner"></div></div>
      </div>`;
    el.querySelectorAll('.tab').forEach(t => t.onclick = () => {
      this.tab = t.dataset.t;
      el.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
      this.load();
    });
    document.getElementById('r-apply').onclick = () => {
      this.from = document.getElementById('r-from').value;
      this.to = document.getElementById('r-to').value;
      this.load();
    };
    document.getElementById('r-print').onclick = () => {
      const body = document.getElementById('r-body').innerHTML;
      printHTML(`<div style="color:#000; padding:10mm; font-family:sans-serif;">
        <h2>${Fmt.esc(APP.store.name)} — ${this.tab === 'pl' ? 'Profit & Loss' : this.tab} report</h2>
        <p>${this.from} → ${this.to}</p>${body}</div>`);
    };
    this.load();
  },

  q() { return `from=${this.from}&to=${this.to}`; },

  async load() {
    const box = document.getElementById('r-body');
    box.innerHTML = '<div class="spinner"></div>';
    this.chart?.destroy?.(); this.chart = null;
    try {
      if (this.tab === 'pl') await this.pl(box);
      else if (this.tab === 'sales') await this.sales(box);
      else if (this.tab === 'workers') await this.workers(box);
      else await this.valuation(box);
    } catch (e) { box.innerHTML = `<div class="empty">${Fmt.esc(e.message)}</div>`; }
  },

  async pl(box) {
    const d = await API.get(`/reports/profit-loss?${this.q()}`);
    const snaps = await API.get('/reports/profit-loss/snapshots');
    const row = (label, val, { bold = false, indent = false, signed = true } = {}) => `
      <tr style="${bold ? 'font-weight:800;' : ''}">
        <td style="${indent ? 'padding-left:28px;' : ''}">${label}</td>
        <td class="num">${signed ? Fmt.profit(val) : Fmt.currency(val)}</td>
      </tr>`;
    box.innerHTML = `
      <div class="stats">
        <div class="stat" style="--accent:var(--green)"><div class="stat-label">Net Revenue</div>
          <div class="stat-value">${Fmt.currency(d.net_revenue)}</div><div class="stat-sub">${d.sales_count} sales − ${Fmt.currency(d.refunds)} refunds</div></div>
        <div class="stat" style="--accent:var(--blue)"><div class="stat-label">Gross Profit</div>
          <div class="stat-value">${Fmt.profit(d.gross_profit)}</div><div class="stat-sub">${Fmt.num(d.gross_margin_pct, 1)}% margin</div></div>
        <div class="stat" style="--accent:var(--red)"><div class="stat-label">Expenses + Write-offs</div>
          <div class="stat-value">${Fmt.currency(d.expenses_total + d.writeoffs_total)}</div></div>
        <div class="stat" style="--accent:${d.net_profit >= 0 ? 'var(--green)' : 'var(--red)'}"><div class="stat-label">Net ${d.net_profit >= 0 ? 'Profit' : 'Loss'}</div>
          <div class="stat-value">${Fmt.profit(d.net_profit)}</div></div>
      </div>
      <div class="table-wrap"><table>
        ${row('Sales revenue', d.revenue, { signed: false })}
        ${row('Less: refunds on returns', -d.refunds)}
        ${row('Net revenue', d.net_revenue, { bold: true })}
        ${row('Less: cost of goods sold', -d.cogs)}
        ${row('Gross profit', d.gross_profit, { bold: true })}
        ${d.expenses.map(e => row(`Less: ${e.category}`, -e.total, { indent: true })).join('')}
        ${row('Total operating expenses', -d.expenses_total)}
        ${row('Less: stock write-offs (spoilage/damage/theft)', -d.writeoffs_total)}
        ${row(`NET ${d.net_profit >= 0 ? 'PROFIT' : 'LOSS'}`, d.net_profit, { bold: true })}
      </table></div>
      <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
        <button class="btn btn-gold btn-sm" id="pl-snap">💾 Save Snapshot</button>
        <button class="btn btn-secondary btn-sm" id="pl-csv">⬇ CSV</button>
      </div>
      <div class="card" style="margin-top:16px; background:var(--bg-2);">
        <div class="card-head"><div class="card-title">Saved P&L Snapshots</div></div>
        ${Tbl.render([
          { h: 'Period', v: r => `${Fmt.date(r.period_start)} → ${Fmt.date(r.period_end)}` },
          { h: 'Net revenue', cls: 'num', v: r => Fmt.currency(r.net_revenue) },
          { h: 'Gross', cls: 'num', v: r => Fmt.profit(r.gross_profit) },
          { h: 'Expenses', cls: 'num', v: r => Fmt.currency(r.expenses_total) },
          { h: 'Net', cls: 'num', v: r => `<b>${Fmt.profit(r.net_profit)}</b>` },
          { h: 'Saved', v: r => `<span class="small muted">${Fmt.datetime(r.created_at)} · ${Fmt.esc(r.generated_by_name || '')}</span>` },
        ], snaps.data, { empty: 'No snapshots saved yet' })}
      </div>`;
    document.getElementById('pl-snap').onclick = async () => {
      try { await API.post(`/reports/profit-loss/snapshot?${this.q()}`); Toast.success('Snapshot saved'); this.load(); }
      catch (e) { Toast.error('Snapshot failed', e.message); }
    };
    document.getElementById('pl-csv').onclick = () => exportCSV(`jesaka-pl-${this.from}-to-${this.to}.csv`,
      ['Line', 'Amount'],
      [['Sales revenue', d.revenue], ['Refunds', -d.refunds], ['Net revenue', d.net_revenue], ['COGS', -d.cogs],
       ['Gross profit', d.gross_profit], ...d.expenses.map(e => [`Expense: ${e.category}`, -e.total]),
       ['Write-offs', -d.writeoffs_total], ['Net profit', d.net_profit]]);
  },

  async sales(box) {
    const d = await API.get(`/reports/sales-summary?${this.q()}`);
    box.innerHTML = `
      <div class="chart-wrap" style="margin-bottom:18px;"><canvas id="r-chart"></canvas></div>
      <div class="card-head"><div class="card-title">Best-Selling Rice Types</div>
        <button class="btn btn-secondary btn-sm" id="s-csv">⬇ CSV</button></div>
      ${Tbl.render([
        { h: '#', v: (r, i) => i + 1 },
        { h: 'Product', v: r => `<b>${Fmt.esc(r.name)}</b> <span class="muted">${r.bag_weight_kg}kg</span>` },
        { h: 'Bags sold', cls: 'num', v: r => `<b>${Fmt.num(r.bags)}</b>` },
        { h: 'Revenue', cls: 'num', v: r => Fmt.currency(r.revenue) },
        { h: 'Gross profit', cls: 'num', v: r => Fmt.profit(r.gross_profit) },
      ], d.best_sellers, { empty: 'No sales in this period' })}`;
    this.chart = new Chart(document.getElementById('r-chart'), {
      type: 'bar',
      data: { labels: d.daily.map(r => r.day.slice(5)),
        datasets: [
          { label: 'Revenue', data: d.daily.map(r => r.total), backgroundColor: 'rgba(47,191,113,.6)', borderRadius: 4 },
          { label: 'Gross profit', data: d.daily.map(r => r.gross_profit), backgroundColor: 'rgba(232,181,58,.75)', borderRadius: 4 }
        ] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#a8b3a2' } } },
        scales: { x: { ticks: { color: '#8a9484', maxTicksLimit: 12 }, grid: { display: false } },
                  y: { ticks: { color: '#8a9484' }, grid: { color: 'rgba(255,255,255,.05)' } } } }
    });
    document.getElementById('s-csv').onclick = () => exportCSV(`jesaka-sales-summary-${this.from}-to-${this.to}.csv`,
      ['Day', 'Transactions', 'Revenue', 'Gross profit'],
      d.daily.map(r => [r.day, r.count, r.total, r.gross_profit]));
  },

  async workers(box) {
    const d = await API.get(`/reports/worker-performance?${this.q()}`);
    box.innerHTML = `
      <div class="card-head"><div class="card-title">Worker Performance</div>
        <button class="btn btn-secondary btn-sm" id="w-csv">⬇ CSV</button></div>
      ${Tbl.render([
        { h: 'Worker', v: r => `<b>${Fmt.esc(r.full_name)}</b> <span class="small muted">@${r.username}</span> ${r.is_active ? '' : '<span class="badge badge-gray">inactive</span>'}` },
        { h: 'Transactions', cls: 'num', v: r => Fmt.num(r.transactions) },
        { h: 'Revenue', cls: 'num', v: r => `<b>${Fmt.currency(r.revenue)}</b>` },
        { h: 'Gross profit', cls: 'num', v: r => Fmt.profit(r.gross_profit) },
        { h: 'Avg sale', cls: 'num', v: r => Fmt.currency(r.avg_sale) },
        { h: 'Cash', cls: 'num', v: r => Fmt.currency(r.cash_total) },
        { h: 'MoMo', cls: 'num', v: r => Fmt.currency(r.momo_total) },
      ], d.data)}`;
    document.getElementById('w-csv').onclick = () => exportCSV(`jesaka-workers-${this.from}-to-${this.to}.csv`,
      ['Worker', 'Transactions', 'Revenue', 'Gross profit', 'Avg sale', 'Cash', 'Mobile money'],
      d.data.map(r => [r.full_name, r.transactions, r.revenue, r.gross_profit, r.avg_sale, r.cash_total, r.momo_total]));
  },

  async valuation(box) {
    const d = await API.get('/reports/stock-valuation');
    box.innerHTML = `
      <div class="card-head"><div class="card-title">Current Stock Valuation</div>
        <button class="btn btn-secondary btn-sm" id="v-csv">⬇ CSV</button></div>
      ${Tbl.render([
        { h: 'Product', v: r => `<b>${Fmt.esc(r.name)}</b> <span class="muted">${r.bag_weight_kg}kg</span>` },
        { h: 'SKU', v: r => `<span class="mono">${r.sku}</span>` },
        { h: 'Bags', cls: 'num', v: r => r.total_qty <= r.reorder_level ? `<b class="neg">${Fmt.num(r.total_qty)}</b>` : Fmt.num(r.total_qty) },
        { h: 'Cost value', cls: 'num', v: r => Fmt.currency(r.cost_value) },
        { h: 'Retail value', cls: 'num', v: r => Fmt.currency(r.retail_value) },
        { h: 'Potential margin', cls: 'num', v: r => Fmt.profit(r.retail_value - r.cost_value) },
      ], d.data)}
      <div class="cart-total-row" style="margin-top:12px;"><b>Totals</b>
        <span>${Fmt.num(d.totals.qty)} bags · cost ${Fmt.currency(d.totals.cost)} · retail <b class="cart-grand">${Fmt.currency(d.totals.retail)}</b></span></div>`;
    document.getElementById('v-csv').onclick = () => exportCSV(`jesaka-stock-valuation-${Fmt.today()}.csv`,
      ['Product', 'SKU', 'Bags', 'Cost value', 'Retail value'],
      d.data.map(r => [`${r.name} ${r.bag_weight_kg}kg`, r.sku, r.total_qty, r.cost_value, r.retail_value]));
  }
};
