/** Worker account management (admin): create, roles, activate, reset passwords. */
const WorkersPage = {
  rows: [], roles: [],

  async render(el) {
    this.roles = (await API.get('/users/roles')).data;
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">Workers & Accounts</div>
        <div class="page-sub">Create accounts, assign roles, activate/deactivate and reset passwords</div></div>
        <button class="btn btn-primary" id="add-btn">＋ Add Worker</button>
      </div>
      <div class="card"><div id="w-table"><div class="spinner"></div></div></div>`;
    document.getElementById('add-btn').onclick = () => this.form();
    this.load();
  },

  async load() {
    const res = await API.get('/users');
    this.rows = res.data;
    document.getElementById('w-table').innerHTML = Tbl.render([
      { h: 'Name', v: r => `<b>${Fmt.esc(r.full_name)}</b><div class="small muted">@${r.username} · ${Fmt.esc(r.phone || '')}</div>` },
      { h: 'Role', v: r => `<span class="badge ${r.role_name === 'admin' ? 'badge-gold' : 'badge-blue'}">${r.role_name}</span>` },
      { h: 'Today', cls: 'num', v: r => Fmt.currency(r.today_sales) },
      { h: 'All-time sales', cls: 'num', v: r => Fmt.num(r.sales_count) },
      { h: 'Status', v: r => r.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Deactivated</span>' },
      { h: 'Joined', v: r => `<span class="small muted">${Fmt.date(r.created_at)}</span>` },
      { h: '', cls: 'nowrap', v: (r, i) => `
        <button class="btn btn-ghost btn-sm" title="Edit" onclick="WorkersPage.form(${i})">✏️</button>
        <button class="btn btn-ghost btn-sm" title="Reset password" onclick="WorkersPage.resetPw(${i})">🔑</button>
        ${r.id !== APP.user.id ? `<button class="btn btn-ghost btn-sm" title="${r.is_active ? 'Deactivate' : 'Activate'}" onclick="WorkersPage.toggle(${i})">${r.is_active ? '🚫' : '✅'}</button>
        <button class="btn btn-ghost btn-sm" title="Delete worker" onclick="WorkersPage.remove(${i})">🗑️</button>` : ''}` },
    ], res.data);
  },

  form(idx) {
    const u = idx != null ? this.rows[idx] : null;
    Modal.open(u ? `Edit — ${u.full_name}` : 'Add Worker', `
      <form id="wk-form">
        ${u ? '' : `
        <div class="form-row">
          <div class="form-group"><label class="form-label">Username <span class="req">*</span></label>
            <input class="form-control" name="username" required minlength="3" pattern="[a-zA-Z0-9_.\\-]+"></div>
          <div class="form-group"><label class="form-label">Password <span class="req">*</span></label>
            <input class="form-control" name="password" type="password" required minlength="6"></div>
        </div>`}
        <div class="form-row">
          <div class="form-group"><label class="form-label">Full name <span class="req">*</span></label>
            <input class="form-control" name="full_name" value="${Fmt.esc(u?.full_name || '')}" required></div>
          <div class="form-group"><label class="form-label">Phone</label>
            <input class="form-control" name="phone" value="${Fmt.esc(u?.phone || '')}"></div>
        </div>
        <div class="form-group"><label class="form-label">Role <span class="req">*</span></label>
          <select class="form-control" name="role_id">
            ${this.roles.map(r => `<option value="${r.id}" ${u?.role_id === r.id ? 'selected' : ''}>${r.name} — ${Fmt.esc(r.description || '')}</option>`).join('')}
          </select></div>
      </form>`, {
      footHTML: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
                 <button class="btn btn-primary" id="wk-save">${u ? 'Save' : 'Create Account'}</button>`
    });
    document.getElementById('wk-save').onclick = async () => {
      const f = document.getElementById('wk-form');
      if (!f.reportValidity()) return;
      const fd = Object.fromEntries(new FormData(f).entries());
      try {
        if (u) await API.put(`/users/${u.id}`, { full_name: fd.full_name, phone: fd.phone || null, role_id: +fd.role_id });
        else await API.post('/users', { username: fd.username, password: fd.password, full_name: fd.full_name, phone: fd.phone || null, role_id: +fd.role_id });
        Toast.success(u ? 'Account updated' : 'Worker account created');
        Modal.close(); this.load();
      } catch (e) { Toast.error('Save failed', e.message); }
    };
  },

  toggle(idx) {
    const u = this.rows[idx];
    Modal.confirm(u.is_active ? 'Deactivate Account' : 'Activate Account',
      u.is_active ? `${u.full_name} will no longer be able to sign in.` : `${u.full_name} will be able to sign in again.`,
      async () => {
        try { await API.put(`/users/${u.id}`, { is_active: u.is_active ? 0 : 1 }); Toast.success('Updated'); this.load(); }
        catch (e) { Toast.error('Failed', e.message); }
      }, u.is_active);
  },

  remove(idx) {
    const u = this.rows[idx];
    Modal.confirm('Delete Worker',
      `Permanently delete <b>${Fmt.esc(u.full_name)}</b> (@${u.username})? This cannot be undone.<br>
       <span class="muted small">A worker who already has sales or stock history can't be deleted — deactivate them instead.</span>`,
      async () => {
        try { await API.del(`/users/${u.id}`); Toast.success('Worker deleted', `${u.full_name} was removed`); this.load(); }
        catch (e) { Toast.error('Delete failed', e.message); }
      }, true);
  },

  resetPw(idx) {
    const u = this.rows[idx];
    Modal.open(`Reset Password — ${u.full_name}`, `
      <form id="pw-form"><div class="form-group">
        <label class="form-label">New password <span class="req">*</span></label>
        <input class="form-control" name="new_password" type="text" required minlength="6" placeholder="At least 6 characters">
        <div class="form-hint">Share this with the worker; they can change it later from Settings.</div>
      </div></form>`, {
      footHTML: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
                 <button class="btn btn-gold" id="pw-save">Reset Password</button>`
    });
    document.getElementById('pw-save').onclick = async () => {
      const f = document.getElementById('pw-form');
      if (!f.reportValidity()) return;
      try {
        await API.post(`/users/${u.id}/reset-password`, { new_password: new FormData(f).get('new_password') });
        Toast.success('Password reset', `New password set for ${u.username}`);
        Modal.close();
      } catch (e) { Toast.error('Reset failed', e.message); }
    };
  }
};
