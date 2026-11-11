/** API client — JWT auth, JSON, central error handling. */
const API = (() => {
  // Relative base so the app works at the web root or in a subfolder (e.g. /jesaka/).
  const BASE = 'api';
  const getToken = () => localStorage.getItem('jesaka_token');
  const setToken = t => localStorage.setItem('jesaka_token', t);
  const clearToken = () => localStorage.removeItem('jesaka_token');

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) {
      clearToken();
      window.APP?.showLogin?.();
      throw new Error('Session expired — please sign in again');
    }
    const data = await res.json().catch(() => ({ error: 'Unexpected server response' }));
    if (!res.ok) {
      const msg = data.details?.length
        ? data.details.map(d => `${d.field}: ${d.message}`).join('; ')
        : (data.error || `HTTP ${res.status}`);
      throw new Error(msg);
    }
    return data;
  }

  return {
    get: p => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    del: p => request('DELETE', p),
    getToken, setToken, clearToken,
    async login(username, password, portal) {
      const data = await request('POST', '/auth/login', { username, password, portal });
      setToken(data.token);
      return data;
    },
    me: () => request('GET', '/auth/me'),
    isAuthed: () => !!getToken()
  };
})();
