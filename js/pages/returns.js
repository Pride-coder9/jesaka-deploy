/** Returns: find a sale, choose lines/quantities, mark resellable vs damaged. */
const ReturnsPage = {
  sale: null,

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">Sales Returns</div>
        <div class="page-sub">Resellable bags go back into stock; damaged bags are written off. Refunds reduce revenue.</div></div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:10px;">Find the original sale</div>
        <form id="ret-find" style="display:flex; gap:8px; flex-wrap:wrap;">
          <input class="form-control" id="ret-sale-no" placeholder="Sale number, e.g. JRS-20260719-0001" style="flex:1; min-width:220px;">
          <button class="btn btn-primary" type="submit">Find Sale</button>
        </form>
        <div id="ret-sale-box" style="margin-top:14px;"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Recent Returns</div></div>
        <div id="ret-history"><div class="spinner"></div></div>
      </div>`;
    document.getElementById('ret-find').onsubmit = e => { e.preventDefault(); this.find(); };
    this.loadHistory();

    // Deep link: #returns/<saleId> from the receipt modal
    const saleId = location.hash.split('/')[1];
    if (saleId) this.loadSale(saleId);
  },

  async find() {
    const no = document.getElementById('ret-sale-no').value.trim();
    if (!no) return;
    try {
      const res = await API.get(`/sales?search=${encodeURIComponent(no)}&limit=1`);
      if (!res.data.length) return Toast.error('Not found', `No sale matches "${no}"`);
      this.loadSale(res.data[0].id);
    } catch (e) { Toast.error('Error', e.message); }
  },

  async loadSale(id) {
    try {
      this.sale = await API.get(`/sales/${id}`);
    } catch (e) { return Toast.error('Error', e.message); }
    const s = this.sale;
    const returned = {};
    // qty already returned per sale_item comes from prior return records
    for (const r of s.returns || []) { /* summary only; server re-validates */ }
    document.getElementById('ret-sale-box').innerHTML = `
      <div class="product-hit" style="border-color:var(--border); margin-top:0;">
        <div style="font-size:1.4rem;">🧾</div>
        <div style="flex:1;">
          <b>${s.sale_number}</b> — ${Fmt.esc(s.worker_name)} · ${Fmt.datetime(s.created_at)}
          <div class="small muted">${Fmt.esc(s.customer_name || 'Walk-in')} · ${Fmt.currency(s.total)} ${s.returns?.length ? `· ⚠ ${s.returns.length} prior return(s)` : ''}</div>
        </div>
      </div>
      <form id="ret-form" style="margin-top:12px;">
        <div class="table-wrap"><table>
          <thead><tr><th>Item</th><th class="num">Sold</th><th class="num">Return Qty</th><th>Condition</th><th class="num">Refund</th></tr></thead>
          <tbody>
            ${s.items.map(i => `
              <tr data-item="${i.id}" data-price="${i.unit_price}">
                <td>${Fmt.esc(i.name)} ${i.bag_weight_kg}kg</td>
                <td class="num">${i.qty}</td>
                <td class="num"><input type="number" class="form-control ret-qty" style="width:80px; display:inline-block;" min="0" max="${i.qty}" value="0"></td>
                <td><select class="form-control ret-cond" style="width:auto;">
                  <option value="1">Resellable — restock</option>
                  <option value="0">Damaged — write off</option>
                </select></td>
                <td class="num ret-refund">—</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
        <div class="form-group" style="margin-top:12px;">
          <label class="form-label">Reason <span class="req">*</span></label>
          <input class="form-control" id="ret-reason" placeholder="Why is this being returned?" required>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div>Total refund: <b class="cart-grand" id="ret-total">${Fmt.currency(0)}</b></div>
          <button class="btn btn-danger" type="submit">↩ Process Return</button>
        </div>
      </form>`;
    const recalc = () => {
      let total = 0;
      document.querySelectorAll('#ret-form tr[data-item]').forEach(tr => {
        const qty = +tr.querySelector('.ret-qty').value || 0;
        const refund = qty * +tr.dataset.price;
        total += refund;
        tr.querySelector('.ret-refund').textContent = refund ? Fmt.currency(refund) : '—';
      });
      document.getElementById('ret-total').textContent = Fmt.currency(total);
    };
    document.querySelectorAll('.ret-qty').forEach(i => i.addEventListener('input', recalc));
    document.getElementById('ret-form').onsubmit = e => { e.preventDefault(); this.submit(); };
  },

  async submit() {
    const items = [...document.querySelectorAll('#ret-form tr[data-item]')]
      .map(tr => ({
        sale_item_id: +tr.dataset.item,
        qty: +tr.querySelector('.ret-qty').value || 0,
        resellable: tr.querySelector('.ret-cond').value === '1'
      }))
      .filter(i => i.qty > 0);
    if (!items.length) return Toast.error('Nothing selected', 'Enter a return quantity for at least one line');
    const reason = document.getElementById('ret-reason').value.trim();
    if (!reason) return Toast.error('Reason required', 'Every return must record a reason');
    try {
      const r = await API.post('/returns', { sale_id: this.sale.id, reason, items });
      Toast.success('Return processed', `${r.return_number} — refund ${Fmt.currency(r.refund_total)}`);
      document.getElementById('ret-sale-box').innerHTML = '';
      document.getElementById('ret-sale-no').value = '';
      this.loadHistory();
    } catch (e) { Toast.error('Return failed', e.message); }
  },

  async loadHistory() {
    const res = await API.get('/returns');
    document.getElementById('ret-history').innerHTML = Tbl.render([
      { h: 'Return #', v: r => `<span class="mono">${r.return_number}</span>` },
      { h: 'Sale #', v: r => `<span class="mono">${r.sale_number}</span>` },
      { h: 'Date', v: r => `<span class="small">${Fmt.datetime(r.created_at)}</span>` },
      { h: 'Reason', v: r => `<span class="small">${Fmt.esc(r.reason)}</span>` },
      { h: 'Refund', cls: 'num', v: r => `<b>${Fmt.currency(r.refund_total)}</b>` },
      { h: 'Restocked', cls: 'num', v: r => Fmt.currency(r.cost_restocked) },
      { h: 'Written off', cls: 'num', v: r => r.cost_written_off ? `<span class="neg">${Fmt.currency(r.cost_written_off)}</span>` : '—' },
      { h: 'By', v: r => `<span class="small">${Fmt.esc(r.processed_by_name)}</span>` },
    ], res.data, { empty: 'No returns processed yet' });
  }
};
