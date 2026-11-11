/** Worker dashboard: today's own performance + quick access to POS. */
const WorkerDashPage = {
  async render(el) {
    const d = await API.get('/dashboard/worker');
    const money = m => d.by_method.find(x => x.payment_method === m)?.total || 0;
    el.innerHTML = `
      <div class="page-head">
        <div>
          <div class="page-title">Hello, ${Fmt.esc(APP.user.full_name.split(' ')[0])} 👋</div>
          <div class="page-sub">Your performance today, ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
        <button class="btn btn-primary btn-lg" onclick="location.hash='#pos'">🛒 Open Point of Sale</button>
      </div>

      <div class="stats">
        <div class="stat" style="--accent:var(--green)">
          <div class="stat-label">My Sales Today</div>
          <div class="stat-value">${Fmt.currency(d.today.total)}</div>
        </div>
        <div class="stat" style="--accent:var(--blue)">
          <div class="stat-label">Transactions</div>
          <div class="stat-value">${Fmt.num(d.today.count)}</div>
        </div>
        <div class="stat" style="--accent:var(--gold)">
          <div class="stat-label">Cash Collected</div>
          <div class="stat-value">${Fmt.currency(money('cash'))}</div>
        </div>
        <div class="stat" style="--accent:var(--purple)">
          <div class="stat-label">Mobile Money</div>
          <div class="stat-value">${Fmt.currency(money('mobile_money'))}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div class="card-title">My Recent Transactions</div>
          <button class="btn btn-ghost btn-sm" onclick="location.hash='#sales'">All my sales →</button></div>
        ${Tbl.render([
          { h: 'Sale #', v: r => `<span class="mono">${r.sale_number}</span>` },
          { h: 'When', v: r => `<span class="small muted">${Fmt.datetime(r.created_at)}</span>` },
          { h: 'Bags', cls: 'num', v: r => Fmt.num(r.total_bags) },
          { h: 'Payment', v: r => Fmt.method(r.payment_method) },
          { h: 'Total', cls: 'num', v: r => `<b>${Fmt.currency(r.total)}</b>` },
          { h: '', v: r => `<button class="btn btn-ghost btn-sm" onclick="SalesPage.receipt(${r.id})">🧾</button>` },
        ], d.recent, { empty: 'No sales recorded yet today — open the POS to make your first sale!' })}
      </div>
    `;
  }
};
