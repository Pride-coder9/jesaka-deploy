/** Operating expenses (admin). */
const ExpensesPage = {
  state: { page: 1, from: Fmt.monthStart(), to: Fmt.today(), category: '' },
  rows: [],
  CATS: ['rent', 'transport', 'salaries', 'utilities', 'packaging', 'misc'],

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">Operating Expenses</div>
        <div class="page-sub">Rent, transport, salaries, utilities, packaging and miscellaneous costs</div></div>
        <button class="btn btn-primary" id="add-btn">＋ Record Expense</button>
      </div>
      <div class="card">
        <div class="filters">
          <div class="form-group"><label class="form-label">From</label><input type="date" class="form-control" id="e-from" value="${this.state.from}"></div>
          <div class="form-group"><label class="form-label">To</label><input type="date" class="form-control" id="e-to" value="${this.state.to}"></div>
          <div class="form-group"><label class="form-label">Category</label>
            <select class="form-control" id="e-cat"><option value="">All categories</option>
              ${this.CATS.map(c => `<option value="${c}" ${this.state.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select></div>
          <button class="btn btn-secondary" id="e-apply">Filter</button>
          <button class="btn btn-secondary" id="e-export">⬇ CSV</button>
        </div>
        <div id="e-table"><div class="spinner"></div></div>
        <div class="pager" id="e-pager"></div>
      </div>`;
    document.getElementById('add-btn').onclick = () => this.form();
    document.getElementById('e-apply').onclick = () => {
      Object.assign(this.state, { page: 1, from: document.getElementById('e-from').value,
        to: document.getElementById('e-to').value, category: document.getElementById('e-cat').value });
      this.load();
    };
    document.getElementById('e-export').onclick = () => exportCSV(`jesaka-expenses-${Fmt.today()}.csv`,
      ['Date', 'Category', 'Description', 'Amount', 'Recorded by'],
      this.rows.map(r => [r.expense_date, r.category, r.description, r.amount, r.recorded_by_name]));
    this.load();
  },

  async load() {
    const s = this.state;
    const res = await API.get(`/expenses?page=${s.page}&limit=25&from=${s.from}&to=${s.to}&category=${s.category}`);
    this.rows = res.data;
    document.getElementById('e-table').innerHTML = `
      <div class="small muted" style="margin-bottom:8px;">${res.total} expenses · total <b class="neg">${Fmt.currency(res.total_amount)}</b></div>
      ${Tbl.render([
        { h: 'Date', v: r => Fmt.date(r.expense_date) },
        { h: 'Category', v: r => `<span class="badge badge-gold">${r.category}</span>` },
        { h: 'Description', v: r => Fmt.esc(r.description) },
        { h: 'Amount', cls: 'num', v: r => `<b>${Fmt.currency(r.amount)}</b>` },
        { h: 'Recorded by', v: r => `<span class="small">${Fmt.esc(r.recorded_by_name)}</span>` },
        { h: '', cls: 'nowrap', v: (r, i) => `
          <button class="btn btn-ghost btn-sm" onclick="ExpensesPage.form(${i})">✏️</button>
          <button class="btn btn-ghost btn-sm" onclick="ExpensesPage.remove(${r.id})">🗑</button>` },
      ], res.data, { empty: 'No expenses recorded in this period' })}`;
    Tbl.pager(document.getElementById('e-pager'), res, p => { s.page = p; this.load(); });
  },

  form(idx) {
    const x = idx != null ? this.rows[idx] : null;
    Modal.open(x ? 'Edit Expense' : 'Record Expense', `
      <form id="exp-form">
        <div class="form-row">
          <div class="form-group"><label class="form-label">Category <span class="req">*</span></label>
            <select class="form-control" name="category">
              ${this.CATS.map(c => `<option value="${c}" ${x?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Date <span class="req">*</span></label>
            <input class="form-control" name="expense_date" type="date" value="${x?.expense_date || Fmt.today()}" required></div>
        </div>
        <div class="form-group"><label class="form-label">Description <span class="req">*</span></label>
          <input class="form-control" name="description" value="${Fmt.esc(x?.description || '')}" required></div>
        <div class="form-group"><label class="form-label">Amount <span class="req">*</span></label>
          <input class="form-control" name="amount" type="number" min="1" value="${x?.amount || ''}" required></div>
      </form>`, {
      footHTML: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
                 <button class="btn btn-primary" id="exp-save">${x ? 'Save' : 'Record'}</button>`
    });
    document.getElementById('exp-save').onclick = async () => {
      const f = document.getElementById('exp-form');
      if (!f.reportValidity()) return;
      const fd = Object.fromEntries(new FormData(f).entries());
      const body = { category: fd.category, description: fd.description, amount: +fd.amount, expense_date: fd.expense_date };
      try {
        if (x) await API.put(`/expenses/${x.id}`, body);
        else await API.post('/expenses', body);
        Toast.success(x ? 'Expense updated' : 'Expense recorded');
        Modal.close(); this.load();
      } catch (e) { Toast.error('Save failed', e.message); }
    };
  },

  remove(id) {
    Modal.confirm('Delete Expense', 'Remove this expense record? The deletion is written to the audit log.', async () => {
      try { await API.del(`/expenses/${id}`); Toast.success('Expense deleted'); this.load(); }
      catch (e) { Toast.error('Delete failed', e.message); }
    }, true);
  }
};
