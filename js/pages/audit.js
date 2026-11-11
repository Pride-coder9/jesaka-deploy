/** Audit log (admin): who did what, when, with before/after values. */
const AuditPage = {
  state: { page: 1, entity_type: '', action: '', username: '', from: '', to: '' },
  filters: { entity_types: [], actions: [] },
  rows: [],

  async render(el) {
    el.innerHTML = `
      <div class="page-head">
        <div><div class="page-title">Audit Trail</div>
        <div class="page-sub">Every create, update, delete, adjustment and login — with before/after values</div></div>
      </div>
      <div class="card">
        <div class="filters" id="a-filters"></div>
        <div id="a-table"><div class="spinner"></div></div>
        <div class="pager" id="a-pager"></div>
      </div>`;
    this.load();
  },

  renderFilters() {
    const s = this.state;
    document.getElementById('a-filters').innerHTML = `
      <div class="form-group"><label class="form-label">Entity</label>
        <select class="form-control" id="a-entity"><option value="">All entities</option>
          ${this.filters.entity_types.map(t => `<option value="${t}" ${s.entity_type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Action</label>
        <select class="form-control" id="a-action"><option value="">All actions</option>
          ${this.filters.actions.map(a => `<option value="${a}" ${s.action === a ? 'selected' : ''}>${a}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">User</label>
        <input class="form-control" id="a-user" placeholder="Username…" value="${Fmt.esc(s.username)}"></div>
      <div class="form-group"><label class="form-label">From</label><input type="date" class="form-control" id="a-from" value="${s.from}"></div>
      <div class="form-group"><label class="form-label">To</label><input type="date" class="form-control" id="a-to" value="${s.to}"></div>
      <button class="btn btn-secondary" id="a-apply">Filter</button>`;
    document.getElementById('a-apply').onclick = () => {
      Object.assign(s, { page: 1, entity_type: document.getElementById('a-entity').value,
        action: document.getElementById('a-action').value, username: document.getElementById('a-user').value.trim(),
        from: document.getElementById('a-from').value, to: document.getElementById('a-to').value });
      this.load();
    };
  },

  async load() {
    const s = this.state;
    const res = await API.get(`/audit?page=${s.page}&limit=30&entity_type=${s.entity_type}&action=${s.action}&username=${encodeURIComponent(s.username)}&from=${s.from}&to=${s.to}`);
    this.rows = res.data;
    this.filters = res.filters;
    this.renderFilters();
    const actionBadge = a => {
      const map = { create: 'badge-green', update: 'badge-gold', delete: 'badge-red', login: 'badge-blue',
                    adjust: 'badge-purple', reset_password: 'badge-red', change_password: 'badge-gray', seed: 'badge-gray' };
      return `<span class="badge ${map[a] || 'badge-gray'}">${a.replace(/_/g, ' ')}</span>`;
    };
    document.getElementById('a-table').innerHTML = Tbl.render([
      { h: 'When', v: r => `<span class="small">${Fmt.datetime(r.created_at)}</span>` },
      { h: 'User', v: r => `<b class="small">${Fmt.esc(r.username || 'system')}</b>` },
      { h: 'Action', v: r => actionBadge(r.action) },
      { h: 'Entity', v: r => `<span class="small">${r.entity_type}${r.entity_id ? ' #' + r.entity_id : ''}</span>` },
      { h: 'IP', v: r => `<span class="small muted mono">${Fmt.esc(r.ip_address || '—')}</span>` },
      { h: 'Details', v: (r, i) => (r.old_values || r.new_values) ? `<button class="btn btn-ghost btn-sm" onclick="AuditPage.detail(${i})">👁 View</button>` : '<span class="muted small">—</span>' },
    ], res.data, { empty: 'No audit entries match these filters' });
    Tbl.pager(document.getElementById('a-pager'), res, p => { s.page = p; this.load(); });
  },

  detail(idx) {
    const r = this.rows[idx];
    const fmt = j => {
      if (!j) return '<span class="muted">—</span>';
      try { return `<pre class="mono small" style="white-space:pre-wrap; background:var(--bg-2); padding:10px; border-radius:8px; max-height:260px; overflow:auto;">${Fmt.esc(JSON.stringify(JSON.parse(j), null, 2))}</pre>`; }
      catch { return Fmt.esc(j); }
    };
    Modal.open(`${r.action} ${r.entity_type} ${r.entity_id ? '#' + r.entity_id : ''}`, `
      <div class="small muted" style="margin-bottom:10px;">${Fmt.esc(r.username || 'system')} · ${Fmt.datetime(r.created_at)}</div>
      <div class="grid grid-2">
        <div><div class="form-label">Before</div>${fmt(r.old_values)}</div>
        <div><div class="form-label">After</div>${fmt(r.new_values)}</div>
      </div>`, { wide: true, footHTML: '<button class="btn btn-secondary" onclick="Modal.close()">Close</button>' });
  }
};
