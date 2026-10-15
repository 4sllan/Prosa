const TOKEN_KEY = 'prosa_token';

// Base da API: desktop (preload PROSA_API_URL) > build (VITE_API_URL) > mesma origem (dev/web)
export const API_BASE =
  (typeof window !== 'undefined' && window.prosaDesktop?.apiBase) ||
  import.meta.env.VITE_API_URL ||
  '';

export function fullUrl(u) {
  if (!u) return u;
  return u.startsWith('/') && API_BASE ? API_BASE + u : u;
}

export function wsBase() {
  if (API_BASE) return API_BASE.replace(/^http/, 'ws');
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (getToken()) headers.authorization = `Bearer ${getToken()}`;
  let payload;
  if (form) { payload = form; }
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: payload, credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data.error;
    throw err;
  }
  return data;
}

export async function uploadFiles(files) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  return api('/uploads', { method: 'POST', form: fd });
}
