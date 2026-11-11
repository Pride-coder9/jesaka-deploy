/** Admin dashboard: KPIs, P&L snapshot, stock, charts, activity. */
const AdminDashPage = {
  charts: {},

  async render(el) {
    const d = await API.get('/dashboard/admin');
    const pl = d.month_pl;
    el.innerHTML = `
      <div class="stats">
        <div class="stat" style="--accent:var(--green)">
          <div class="stat-label">Today's Sales</div>
          <div class="stat-value">${Fmt.currency(d.today.total)}</div>
          <div class="stat-sub">${d.today.count} transactions</div>
        </div>
        <div class="stat" style="--accent:var(--blue)">
          <div class="stat-label">Last 7 Days</div>
          <div class="stat-value">${Fmt.currency(d.week.total)}</div>
          <div class="stat-sub">${d.week.count} transactions</div>
        </div>
        <div class="stat" style="--accent:var(--gold)">
          <div class="stat-label">This Month</div>
          <div class="stat-value">${Fmt.currency(d.month.total)}</div>
          <div class="stat-sub">Gross profit ${Fmt.currency(d.month.gross)}</div>
        </div>
        <div class="stat" style="--accent:${pl.net_profit >= 0 ? 'var(--green)' : 'var(--red)'}">
          <div class="stat-label">Month Net Profit</div>
          <div class="stat-value">${Fmt.profit(pl.net_profit)}</div>
          <div class="stat-sub">After ${Fmt.currency(pl.expenses)} expenses · ${Fmt.currency(pl.writeoffs)} write-offs</div>
        </div>
        <div class="stat" style="--accent:var(--purple)">
          <div class="stat-label">Stock On Hand</div>
          <div class="stat-value">${Fmt.num(d.stock_total.qty)} bags</div>
          <div class="stat-sub">Valued at ${Fmt.currency(d.stock_total.value)} · ${d.stock_by_location.map(l => `${Fmt.esc(l.name)}: ${Fmt.num(l.qty)}`).join(' · ')}</div>
        </div>
      </div>

      ${d.low_stock.length ? `
      <div class="card" style="border-color: rgba(232,181,58,.45);">
        <div class="card-head"><div class="card-title">⚠️ Low Stock Alerts</div>
          <button class="btn btn-gold btn-sm" onclick="location.hash='#receive'">Receive Stock</button></div>
        ${Tbl.render([
          { h: 'Product', v: r => `${Fmt.esc(r.name)} <span class="muted">${r.bag_weight_kg}kg</span>` },
          { h: 'SKU', v: r => `<span class="mono">${r.sku}</span>` },
          { h: 'In Stock', cls: 'num', v: r => `<b class="neg">${Fmt.num(r.qty)}</b>` },
          { h: 'Reorder Level', cls: 'num', v: r => Fmt.num(r.reorder_level) },
        ], d.low_stock)}
      </div>` : ''}

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Sales — Last 30 Days</div><div class="card-sub">Daily revenue</div></div></div>
          <div class="chart-wrap"><canvas id="ch-trend"></canvas></div>
        </div>
        <div class="card">
          <div class="card-head"><div class="card-title">Payments This Month</div></div>
          <div class="chart-wrap"><canvas id="ch-methods"></canvas></div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div class="card-title">Best Sellers (30 days)</div></div>
          <div class="chart-wrap chart-sm"><canvas id="ch-best"></canvas></div>
        </div>
        <div class="card">
          <div class="card-head"><div class="card-title">Sales by Worker (30 days)</div>
            <button class="btn btn-ghost btn-sm" onclick="location.hash='#reports'">Full report →</button></div>
          ${Tbl.render([
            { h: 'Worker', v: r => Fmt.esc(r.full_name) },
            { h: 'Transactions', cls: 'num', v: r => Fmt.num(r.transactions) },
            { h: 'Revenue', cls: 'num', v: r => `<b>${Fmt.currency(r.revenue)}</b>` },
          ], d.sales_by_worker, { empty: 'No sales yet' })}
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div class="card-title">Recent Sales</div>
            <button class="btn btn-ghost btn-sm" onclick="location.hash='#sales'">View all →</button></div>
          ${Tbl.render([
            { h: 'Sale #', v: r => `<span class="mono">${r.sale_number}</span>` },
            { h: 'Worker', v: r => Fmt.esc(r.worker_name) },
            { h: 'When', v: r => `<span class="small muted">${Fmt.datetime(r.created_at)}</span>` },
            { h: 'Pay', v: r => Fmt.method(r.payment_method) },
            { h: 'Total', cls: 'num', v: r => `<b>${Fmt.currency(r.total)}</b>` },
          ], d.recent_sales, { empty: 'No sales yet' })}
        </div>
        <div class="card">
          <div class="card-head"><div class="card-title">Recent Stock Movements</div>
            <button class="btn btn-ghost btn-sm" onclick="location.hash='#inventory'">View all →</button></div>
          ${Tbl.render([
            { h: 'Type', v: r => Fmt.move(r.movement_type) },
            { h: 'Product', v: r => `${Fmt.esc(r.product_name)} <span class="muted small">${r.bag_weight_kg}kg</span>` },
            { h: 'Qty', cls: 'num', v: r => Fmt.qtyDelta(r.qty_change) },
            { h: 'By', v: r => `<span class="small">${Fmt.esc(r.user_name || '—')}</span>` },
            { h: 'When', v: r => `<span class="small muted">${Fmt.datetime(r.created_at)}</span>` },
          ], d.recent_movements, { empty: 'No movements yet' })}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-title">Stock by Rice Type</div>
          <button class="btn btn-ghost btn-sm" onclick="location.hash='#inventory'">Manage →</button></div>
        ${Tbl.render([
          { h: 'Product', v: r => `${Fmt.esc(r.name)} <span class="muted">${r.bag_weight_kg}kg bag</span>` },
          { h: 'SKU', v: r => `<span class="mono">${r.sku}</span>` },
          { h: 'Bags', cls: 'num', v: r => r.qty <= r.reorder_level ? `<b class="neg">${Fmt.num(r.qty)}</b>` : `<b>${Fmt.num(r.qty)}</b>` },
          { h: 'Stock Value', cls: 'num', v: r => Fmt.currency(r.value) },
        ], d.stock_by_product)}
      </div>
    `;
    this.drawCharts(d);
  },

  drawCharts(d) {
    for (const c of Object.values(this.charts)) c?.destroy?.();
    const gridCfg = { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#8a9484', font: { size: 10 } } };
    this.charts.trend = new Chart(document.getElementById('ch-trend'), {
      type: 'line',
      data: {
        labels: d.sales_trend.map(r => r.day.slice(5)),
        datasets: [{ data: d.sales_trend.map(r => r.total), borderColor: '#2fbf71', backgroundColor: 'rgba(47,191,113,.12)', fill: true, tension: .35, pointRadius: 2, borderWidth: 2 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ...gridCfg, ticks: { ...gridCfg.ticks, maxTicksLimit: 10 } }, y: gridCfg } }
    });
    this.charts.methods = new Chart(document.getElementById('ch-methods'), {
      type: 'doughnut',
      data: {
        labels: d.by_method_month.map(r => r.payment_method.replace('_', ' ')),
        datasets: [{ data: d.by_method_month.map(r => r.total), backgroundColor: ['#2fbf71', '#e8b53a', '#4d9de0', '#9d6be8'], borderColor: '#151a14', borderWidth: 2 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#a8b3a2', boxWidth: 11 } } } }
    });
    this.charts.best = new Chart(document.getElementById('ch-best'), {
      type: 'bar',
      data: {
        labels: d.best_sellers.map(r => `${r.name} ${r.bag_weight_kg}kg`),
        datasets: [{ data: d.best_sellers.map(r => r.bags), backgroundColor: 'rgba(232,181,58,.7)', borderRadius: 6 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: gridCfg, y: { ...gridCfg, grid: { display: false } } } }
    });
  }
};
