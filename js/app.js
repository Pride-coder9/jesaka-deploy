/** App shell: auth flow, role-aware navigation, hash router. */
const APP = (() => {
  let user = null;
  let store = { name: 'Jesaka Rice Company', currency: 'UGX' };
  let loginPortal = 'admin'; // which sign-in tab is selected (admin | worker)

  const NAV = [
    { label: 'Overview' },
    { id: 'dashboard', title: 'Dashboard', icon: '📊', roles: ['admin', 'worker'],
      page: () => (user.role === 'admin' ? AdminDashPage : WorkerDashPage) },
    { label: 'Selling' },
    { id: 'pos', title: 'Point of Sale', icon: '🛒', roles: ['admin', 'worker'], page: () => PosPage },
    { id: 'sales', title: 'Sales History', icon: '🧾', roles: ['admin', 'worker'], page: () => SalesPage },
    { id: 'returns', title: 'Returns', icon: '↩️', roles: ['admin'], page: () => ReturnsPage },
    { label: 'Inventory' },
    { id: 'products', title: 'Products & QR Codes', icon: '🍚', roles: ['admin'], page: () => ProductsPage },
    { id: 'receive', title: 'Receive Stock', icon: '📥', roles: ['admin'], page: () => ReceivePage },
    { id: 'inventory', title: 'Stock & Movements', icon: '🏬', roles: ['admin'], page: () => InventoryPage },
    { id: 'suppliers', title: 'Suppliers', icon: '🚛', roles: ['admin'], page: () => SuppliersPage },
    { label: 'Finance' },
    { id: 'expenses', title: 'Expenses', icon: '💸', roles: ['admin'], page: () => ExpensesPage },
    { id: 'reports', title: 'Reports & P&L', icon: '📈', roles: ['admin'], page: () => ReportsPage },
    { label: 'Administration' },
    { id: 'workers', title: 'Workers', icon: '👥', roles: ['admin'], page: () => WorkersPage },
    { id: 'audit', title: 'Audit Log', icon: '🔍', roles: ['admin'], page: () => AuditPage },
    { id: 'settings', title: 'Settings', icon: '⚙️', roles: ['admin', 'worker'], page: () => SettingsPage },
  ];

  function allowed(item) { return !item.roles || item.roles.includes(user.role); }

  function buildNav() {
    const nav = document.getElementById('nav');
    let html = '';
    let pendingLabel = null;
    for (const item of NAV) {
      if (item.label) { pendingLabel = item.label; continue; }
      if (!allowed(item)) continue;
      if (pendingLabel) { html += `<div class="nav-label">${pendingLabel}</div>`; pendingLabel = null; }
      html += `<button class="nav-item" data-page="${item.id}"><span class="nav-icon">${item.icon}</span>${item.title}</button>`;
    }
    nav.innerHTML = html;
    nav.querySelectorAll('.nav-item').forEach(b => b.onclick = () => {
      location.hash = '#' + b.dataset.page;
      closeSidebar();
    });
  }

  async function route() {
    if (!user) return;
    const id = (location.hash || '#dashboard').slice(1).split('/')[0];
    const item = NAV.find(n => n.id === id && allowed(n)) || NAV.find(n => n.id === 'dashboard');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === item.id));
    document.getElementById('topbar-title').textContent = item.title;
    const el = document.getElementById('content');
    el.innerHTML = '<div class="spinner"></div>';
    PosPage.stopCamera?.();
    try {
      await item.page().render(el);
    } catch (err) {
      el.innerHTML = `<div class="empty"><div class="icon">⚠️</div><p>${Fmt.esc(err.message)}</p>
        <button class="btn btn-secondary" style="margin-top:10px;" onclick="APP.route()">Retry</button></div>`;
    }
  }

  function showLogin() {
    user = null;
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-page').style.display = 'flex';
  }

  function showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('u-name').textContent = user.full_name;
    document.getElementById('u-role').textContent = user.role;
    document.getElementById('u-avatar').textContent = Fmt.initials(user.full_name);
    document.getElementById('side-store-name').textContent = store.name || 'Jesaka Rice Co.';
    buildNav();
    route();
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
  }

  async function init() {
    // Separate Administrator / Worker sign-in tabs
    document.querySelectorAll('.login-tab').forEach(tab => tab.addEventListener('click', () => {
      loginPortal = tab.dataset.portal;
      document.querySelectorAll('.login-tab').forEach(t => t.classList.toggle('on', t === tab));
      const hint = document.getElementById('login-portal-hint');
      if (hint) hint.innerHTML = `Signing in as <b>${loginPortal === 'admin' ? 'Administrator' : 'Worker'}</b>`;
      document.getElementById('login-username').focus();
    }));

    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error');
      btn.disabled = true; btn.textContent = 'Signing in…'; errEl.style.display = 'none';
      try {
        const data = await API.login(
          document.getElementById('login-username').value.trim(),
          document.getElementById('login-password').value,
          loginPortal
        );
        user = data.user; store = data.store || store;
        if (!location.hash) location.hash = '#dashboard';
        showApp();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false; btn.textContent = 'Sign In';
      }
    });

    document.getElementById('logout-btn').addEventListener('click', () =>
      Modal.confirm('Sign Out', 'End your session and return to the login screen?', () => {
        API.clearToken(); PosPage.stopCamera?.(); showLogin();
      }, true));

    document.getElementById('hamburger').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('active');
    });
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
    window.addEventListener('hashchange', route);

    if (API.isAuthed()) {
      try {
        const me = await API.me();
        user = me.user; store = me.store || store;
        showApp();
        return;
      } catch { API.clearToken(); }
    }
    showLogin();
  }

  document.addEventListener('DOMContentLoaded', init);
  return {
    route, showLogin,
    get user() { return user; },
    get store() { return store; },
    setStore(s) { store = { ...store, ...s }; }
  };
})();
window.APP = APP;
