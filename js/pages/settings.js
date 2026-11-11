/** Settings: store profile, currency, costing method, locations, own password. */
const SettingsPage = {
  async render(el) {
    const isAdmin = APP.user.role === 'admin';
    let data = { settings: {}, locations: [] };
    if (isAdmin) data = await API.get('/settings');
    const s = data.settings;

    el.innerHTML = `
      ${isAdmin ? `
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div class="card-title">Store Settings</div></div>
          <form id="store-form">
            <div class="form-group"><label class="form-label">Store name</label>
              <input class="form-control" name="store_name" value="${Fmt.esc(s.store_name || '')}"></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Phone</label>
                <input class="form-control" name="store_phone" value="${Fmt.esc(s.store_phone || '')}"></div>
              <div class="form-group"><label class="form-label">Currency</label>
                <input class="form-control" name="currency" value="${Fmt.esc(s.currency || 'UGX')}" maxlength="6">
                <div class="form-hint">Applied to every price and report (default UGX)</div></div>
            </div>
            <div class="form-group"><label class="form-label">Address</label>
              <input class="form-control" name="store_address" value="${Fmt.esc(s.store_address || '')}"></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Costing method</label>
                <select class="form-control" name="costing_method">
                  <option value="weighted_average" ${s.costing_method === 'weighted_average' ? 'selected' : ''}>Weighted average</option>
                  <option value="fifo" ${s.costing_method === 'fifo' ? 'selected' : ''}>FIFO (first-in, first-out)</option>
                </select>
                <div class="form-hint">Controls how COGS is computed on each sale</div></div>
              <div class="form-group"><label class="form-label">POS sells from</label>
                <select class="form-control" name="default_sales_location_id">
                  ${data.locations.map(l => `<option value="${l.id}" ${String(s.default_sales_location_id) === String(l.id) ? 'selected' : ''}>${Fmt.esc(l.name)}</option>`).join('')}
                </select></div>
            </div>
            <div class="form-group"><label class="form-label">Receipt footer</label>
              <input class="form-control" name="receipt_footer" value="${Fmt.esc(s.receipt_footer || '')}"></div>
            <button class="btn btn-primary" type="submit">Save Settings</button>
          </form>
        </div>
        <div>
          <div class="card">
            <div class="card-head"><div class="card-title">Locations</div></div>
            ${Tbl.render([
              { h: 'Name', v: l => Fmt.esc(l.name) },
              { h: 'Sales point', v: l => l.is_sales_point ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-gray">No</span>' },
            ], data.locations)}
            <form id="loc-form" style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
              <input class="form-control" id="loc-name" placeholder="New location name…" style="flex:1; min-width:160px;" required>
              <label class="checkbox-row"><input type="checkbox" id="loc-sales"> Sales point</label>
              <button class="btn btn-secondary" type="submit">Add</button>
            </form>
          </div>
          <div class="card" id="pw-card"></div>
        </div>
      </div>
      <div class="card" id="danger-card" style="border-color: rgba(229,83,61,.4);">
        <div class="card-head" style="align-items:center; gap:12px;">
          <div>
            <div class="card-title" style="color:var(--red);">⚠️ Danger Zone</div>
            <div class="card-sub">Delete all products, suppliers, stock, sales, expenses and history — reset the store to zero. Your accounts, locations and settings are kept.</div>
          </div>
          <button class="btn btn-danger" id="reset-data-btn" style="white-space:nowrap;">Delete All Data</button>
        </div>
      </div>` : '<div class="card" id="pw-card" style="max-width:520px;"></div>'}
    `;

    document.getElementById('pw-card').innerHTML = `
      <div class="card-head"><div class="card-title">Change My Password</div></div>
      <form id="pw-form">
        <div class="form-group"><label class="form-label">Current password <span class="req">*</span></label>
          <input class="form-control" name="current_password" type="password" required autocomplete="current-password"></div>
        <div class="form-group"><label class="form-label">New password <span class="req">*</span></label>
          <input class="form-control" name="new_password" type="password" required minlength="6" autocomplete="new-password"></div>
        <button class="btn btn-gold" type="submit">Update Password</button>
      </form>`;

    document.getElementById('pw-form').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      try {
        await API.put('/auth/password', fd);
        Toast.success('Password updated');
        e.target.reset();
      } catch (err) { Toast.error('Update failed', err.message); }
    };

    if (isAdmin) {
      document.getElementById('store-form').onsubmit = async e => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target).entries());
        try {
          const res = await API.put('/settings', fd);
          APP.setStore({ name: res.settings.store_name, currency: res.settings.currency,
                         phone: res.settings.store_phone, address: res.settings.store_address,
                         receipt_footer: res.settings.receipt_footer });
          document.getElementById('side-store-name').textContent = res.settings.store_name;
          Toast.success('Settings saved');
        } catch (err) { Toast.error('Save failed', err.message); }
      };
      document.getElementById('loc-form').onsubmit = async e => {
        e.preventDefault();
        try {
          await API.post('/settings/locations', {
            name: document.getElementById('loc-name').value.trim(),
            is_sales_point: document.getElementById('loc-sales').checked ? 1 : 0
          });
          Toast.success('Location added');
          this.render(document.getElementById('content'));
        } catch (err) { Toast.error('Add failed', err.message); }
      };
      document.getElementById('reset-data-btn').onclick = () => this.confirmReset();
    }
  },

  confirmReset() {
    Modal.open('Reset Store to Zero', `
      <p style="color:var(--text-2); font-size:.9rem;">This permanently deletes <b>all</b> products, suppliers, stock, sales, returns, expenses, stock movements and history. <b>This cannot be undone.</b></p>
      <p style="color:var(--text-2); font-size:.9rem;">Your login accounts, stock locations and store settings are kept, so you stay signed in.</p>
      <div class="form-group" style="margin-top:12px;">
        <label class="form-label">Type <b>DELETE</b> to confirm</label>
        <input class="form-control" id="reset-confirm" placeholder="DELETE" autocomplete="off">
      </div>`, {
      footHTML: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
                 <button class="btn btn-danger" id="reset-go">Delete Everything</button>`
    });
    document.getElementById('reset-confirm').focus();
    document.getElementById('reset-go').onclick = async () => {
      if (document.getElementById('reset-confirm').value.trim() !== 'DELETE') {
        return Toast.error('Confirmation needed', 'Type DELETE to proceed');
      }
      try {
        const res = await API.post('/settings/reset-data', { confirm: 'DELETE' });
        Modal.close();
        Toast.success('Store reset to zero', res.message);
      } catch (e) { Toast.error('Reset failed', e.message); }
    };
  }
};
