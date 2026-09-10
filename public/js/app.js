/* App bootstrap: login, dashboard routing, tabs, sync loop */

const App = {
  ready: false,

  init() {
    $('#login-form').addEventListener('submit', (e) => this.doLogin(e));
    $('#logout-btn').addEventListener('click', () => this.doLogout());
    wireTabs('#collector-tabs');
    wireTabs('#admin-tabs');

    // quick role cards on the login screen prefill the username
    $$('.role-card').forEach((b) => {
      b.addEventListener('click', () => {
        $('#login-username').value = b.dataset.fill;
        $('#login-password').focus();
      });
    });

    const start = async () => {
      if (API.session) {
        try {
          const me = await API.get('/api/me');
          this.showDashboard(me);
          return;
        } catch (e) {
          API.clear();
        }
      }
      this.showLogin();
    };
    start();

    // cross-device sync: poll the shared server every 4 seconds
    setInterval(() => Sync.poll(), 4000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) Sync.poll(); });
    window.addEventListener('online', () => Sync.poll());
    this.ready = true;
    Sync.poll();
  },

  async doLogin(e) {
    e.preventDefault();
    const errEl = $('#login-error');
    errEl.classList.add('hidden');
    const btn = $('#login-form .btn-primary');
    btn.disabled = true;
    try {
      const s = await API.post('/api/login', {
        username: $('#login-username').value,
        password: $('#login-password').value,
      });
      API.save(s);
      $('#login-password').value = '';
      this.showDashboard(s);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  },

  async doLogout() {
    try { await API.post('/api/logout'); } catch (e) { /* ignore */ }
    API.clear();
    Sync.sig = null;
    this.showLogin();
  },

  showLogin(msg) {
    $('#view-login').classList.remove('hidden');
    $('#view-collector').classList.add('hidden');
    $('#view-admin').classList.add('hidden');
    $('#topbar').classList.add('hidden');
    if (msg) {
      const errEl = $('#login-error');
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    }
    setSyncPill(true);
    $('#sync-label').textContent = 'Sync ready';
  },

  showDashboard(session) {
    $('#view-login').classList.add('hidden');
    $('#topbar').classList.remove('hidden');
    const roleLabel = session.role === 'admin' ? 'Administrator' : 'Collector (Bursar)';
    $('#user-chip').innerHTML = `<b>${esc(session.displayName)}</b> · ${roleLabel}`;

    if (session.role === 'admin') {
      $('#view-collector').classList.add('hidden');
      $('#view-admin').classList.remove('hidden');
      if (!Admin.ready) { Admin.ready = true; Admin.init(); }
    } else {
      $('#view-admin').classList.add('hidden');
      $('#view-collector').classList.remove('hidden');
      const cTitle = $('#c-title');
      if (cTitle) cTitle.textContent = (session.username || 'Bursar') + ' Fees Collection Hub';
      if (!Collector.ready) { Collector.ready = true; Collector.init(); }
    }
    Sync.poll();
  },
};

/* generic tab switching for a <nav class="tabs"> */
function wireTabs(navSel) {
  const nav = $(navSel);
  const section = nav.parentElement;
  $$('.tab', nav).forEach((btn) => {
    btn.addEventListener('click', () => switchTab(navSel, btn.dataset.pane));
  });
}

function switchTab(navSel, paneId) {
  const nav = $(navSel);
  const section = nav.parentElement;
  $$('.tab', nav).forEach((b) => b.classList.toggle('active', b.dataset.pane === paneId));
  $$('.pane', section).forEach((p) => p.classList.add('hidden'));
  const pane = $('#pane-' + paneId);
  if (pane) pane.classList.remove('hidden');
  // let dashboards refresh their newly-visible pane with the latest synced data
  try { window.dispatchEvent(new CustomEvent('pane-shown', { detail: { navSel, paneId } })); } catch (e) { /* older engines */ }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => App.init());
