/** Supplier management (admin). */
const SuppliersPage = {
  rows: [],

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">Suppliers</div><div class="page-sub">Rice mills, schemes and traders you buy from</div></div>
        <button class="btn btn-primary" id="add-btn">＋ Add Supplier</button>
      </div>
      <div class="card">
        <div class="filters">
          <div class="form-group" style="flex:1; min-width:200px;"><label class="form-label">Search</label>
            <input class="form-control" id="s-search" placeholder="Name, contact or phone…"></div>
        </div>
        <div id="s-table"><div class="spinner"></div></div>
      </div>`;
    document.getElementById('add-btn').onclick = () => this.form();
    document.getElementById('s-search').addEventListener('input', debounce(() => this.load(document.getElementById('s-search').value.trim())));
    this.load();
  },

  async load(search = '') {
    const res = await API.get(`/suppliers?search=${encodeURIComponent(search)}`);
    this.rows = res.data;
    document.getElementById('s-table').innerHTML = Tbl.render([
      { h: 'Supplier', v: r => `<b>${Fmt.esc(r.name)}</b><div class="small muted">${Fmt.esc(r.address || '')}</div>` },
      { h: 'Contact', v: r => `${Fmt.esc(r.contact_person || '—')}<div class="small muted">${Fmt.esc(r.phone || '')}</div>` },
      { h: 'Receipts', cls: 'num', v: r => Fmt.num(r.receipt_count) },
      { h: 'Total Supplied', cls: 'num', v: r => Fmt.currency(r.total_supplied) },
      { h: 'Status', v: r => r.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-gray">Inactive</span>' },
      { h: '', v: (r, i) => `<button class="btn btn-ghost btn-sm" onclick="SuppliersPage.form(${i})">✏️</button>` },
    ], res.data, { empty: 'No suppliers yet — add your first supplier' });
  },

  form(idx) {
    const s = idx != null ? this.rows[idx] : null;
    Modal.open(s ? `Edit — ${s.name}` : 'Add Supplier', `
      <form id="sup-form">
        <div class="form-group"><label class="form-label">Name <span class="req">*</span></label>
          <input class="form-control" name="name" value="${Fmt.esc(s?.name || '')}" required></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Contact person</label>
            <input class="form-control" name="contact_person" value="${Fmt.esc(s?.contact_person || '')}"></div>
          <div class="form-group"><label class="form-label">Phone</label>
            <input class="form-control" name="phone" value="${Fmt.esc(s?.phone || '')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Email</label>
            <input class="form-control" name="email" type="email" value="${Fmt.esc(s?.email || '')}"></div>
          <div class="form-group"><label class="form-label">Address</label>
            <input class="form-control" name="address" value="${Fmt.esc(s?.address || '')}"></div>
        </div>
        <div class="form-group"><label class="form-label">Notes</label>
          <textarea class="form-control" name="notes" rows="2">${Fmt.esc(s?.notes || '')}</textarea></div>
        ${s ? `<label class="checkbox-row"><input type="checkbox" name="is_active" ${s.is_active ? 'checked' : ''}> Active</label>` : ''}
      </form>`, {
      footHTML: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
                 <button class="btn btn-primary" id="sup-save">${s ? 'Save' : 'Create'}</button>`
    });
    document.getElementById('sup-save').onclick = async () => {
      const f = document.getElementById('sup-form');
      if (!f.reportValidity()) return;
      const fd = Object.fromEntries(new FormData(f).entries());
      const body = { name: fd.name, contact_person: fd.contact_person || null, phone: fd.phone || null,
                     email: fd.email || null, address: fd.address || null, notes: fd.notes || null,
                     ...(s ? { is_active: f.querySelector('[name=is_active]').checked ? 1 : 0 } : {}) };
      try {
        if (s) await API.put(`/suppliers/${s.id}`, body);
        else await API.post('/suppliers', body);
        Toast.success(s ? 'Supplier updated' : 'Supplier added');
        Modal.close(); this.load();
      } catch (e) { Toast.error('Save failed', e.message); }
    };
  }
};
