/* Tiny API client + session store */
const API = {
  token: localStorage.getItem('fga_token') || null,
  session: JSON.parse(localStorage.getItem('fga_session') || 'null'),

  save(session) {
    this.token = session.token;
    this.session = { role: session.role, username: session.username, displayName: session.displayName };
    localStorage.setItem('fga_token', session.token);
    localStorage.setItem('fga_session', JSON.stringify(this.session));
  },
  clear() {
    this.token = null;
    this.session = null;
    localStorage.removeItem('fga_token');
    localStorage.removeItem('fga_session');
  },
  get sessionType() { return this.session ? this.session.role : null; },

  async req(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const r = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (r.status === 401) {
      let msg = 'Session expired — please sign in again';
      try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (e) { /* ignore */ }
      this.clear();
      const err = new Error(msg);
      err.unauthorized = true;
      throw err;
    }
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = (await r.json()).error || msg; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    return r.json();
  },

  get(p) { return this.req(p); },
  post(p, b) { return this.req(p, { method: 'POST', body: b }); },
  put(p, b) { return this.req(p, { method: 'PUT', body: b }); },
  del(p) { return this.req(p, { method: 'DELETE' }); },

  /* POST JSON, receive binary file, trigger download */
  async file(p, body, filename) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const r = await fetch(p, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) {
      let msg = 'Export failed';
      try { msg = (await r.json()).error || msg; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  },
};
