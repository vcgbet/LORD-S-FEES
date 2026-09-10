/* Administrator dashboard: overview stats, submitted entries, DOCX/PDF export */

const Admin = {
  init() {
    populateSelect('#a-dept', DEPARTMENTS, 'All Departments');
    populateSelect('#a-class', CLASSES, 'All Classes');
    populateSelect('#e-dept', DEPARTMENTS, 'All');
    populateSelect('#e-class', CLASSES, 'All');

    ['a-q', 'a-dept', 'a-class', 'a-from', 'a-to'].forEach((id) => $('#' + id).addEventListener('input', () => this.renderEntries()));
    $('#e-pdf').onclick = () => this.export('pdf');
    $('#e-docx').onclick = () => this.export('docx');
    $('#e-backup').onclick = () => {
      $('#e-backup').disabled = true;
      $('#e-status').textContent = 'Preparing database backup…';
      API.file('/api/backup', {}, `lga-fees-backup-${todayStr()}.db`)
        .then(() => {
          $('#e-status').textContent = '✅ Database backup downloaded. Keep it somewhere safe — restoring it replaces the current data.';
          toast('Database backup downloaded', 'success');
        })
        .catch((e) => { $('#e-status').textContent = ''; toast(e.message, 'error'); })
        .finally(() => { $('#e-backup').disabled = false; });
    };
    $('#e-restore').onclick = () => $('#e-restore-input').click();
    $('#e-restore-input').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!confirm('Restore this backup? It REPLACES all current data (entries, learners, accounts stay as in the backup).')) return;
      if (file.size > 20 * 1024 * 1024) return toast('Backup file too large (max 20 MB)', 'error');
      $('#e-restore').disabled = true;
      $('#e-status').textContent = 'Restoring backup…';
      try {
        const b64 = (await fileToDataUrl(file)).split(',')[1];
        const r = await API.post('/api/restore', { data: b64 });
        $('#e-status').textContent = '✅ ' + (r.message || 'Backup restored.');
        toast('Backup restored ✓', 'success');
        Sync.sig = null;
        Sync.poll();
      } catch (err) {
        $('#e-status').textContent = '';
        toast(err.message, 'error');
      } finally {
        $('#e-restore').disabled = false;
      }
    };

    // always re-render on sync so hidden tabs are never stale
    Sync.on(() => {
      this.renderOverview();
      this.renderEntries();
    });
    window.addEventListener('pane-shown', (e) => {
      if (e.detail.navSel !== '#admin-tabs') return;
      if (e.detail.paneId === 'a-overview') this.renderOverview();
      if (e.detail.paneId === 'a-entries') this.renderEntries();
      if (e.detail.paneId === 'a-users') this.renderUsers();
    });

    // login manager
    $('#u-add').onclick = () => this.createUser();
    $('#me-save').onclick = () => this.saveMyLogin();
    $('#me-who').textContent = API.session ? `${API.session.displayName} (${API.session.username})` : '';

    this.renderOverview();
    this.renderEntries();
    this.renderUsers();
  },

  /* ---------------- login manager ---------------- */
  async renderUsers() {
    let users;
    try { users = await API.get('/api/users'); } catch (e) { return; }
    $('#u-table tbody').innerHTML = users.map((u) => `
      <tr>
        <td><b>${esc(u.username)}</b>${String(API.session && API.session.username).toLowerCase() === u.username.toLowerCase() ? ' <span class="hint">(you)</span>' : ''}</td>
        <td>${esc(u.display_name)}</td>
        <td>${u.role === 'admin' ? 'Administrator' : 'Collector (Bursar)'}</td>
        <td>${u.active ? '<span class="type-pill full">Active</span>' : '<span class="type-pill part">Disabled</span>'}</td>
        <td class="muted small">${fmtDate(u.created_at)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" data-edit="${u.id}" type="button">Edit</button>
          ${String(API.session && API.session.username).toLowerCase() === u.username.toLowerCase()
            ? ''
            : `<button class="btn btn-sm btn-danger" data-del="${u.id}" type="button">Delete</button>`}
        </td>
      </tr>`).join('');
    $$('#u-table [data-edit]').forEach((b) => b.onclick = () => {
      const u = users.find((x) => x.id === Number(b.dataset.edit));
      if (u) this.editUserModal(u);
    });
    $$('#u-table [data-del]').forEach((b) => b.onclick = async () => {
      const u = users.find((x) => x.id === Number(b.dataset.del));
      if (!u) return;
      if (!confirm(`Delete login "${u.username}"? They will no longer be able to sign in.`)) return;
      try {
        await API.del('/api/users/' + u.id);
        toast('Login deleted', 'success');
        this.renderUsers();
      } catch (e) { toast(e.message, 'error'); }
    });
    return users;
  },

  async createUser() {
    const username = $('#u-new-username').value.trim();
    const password = $('#u-new-password').value;
    const displayName = $('#u-new-name').value.trim();
    const role = $('#u-new-role').value;
    if (!username) return toast('Enter a username', 'error');
    try {
      await API.post('/api/users', { username, password, displayName, role });
      toast(`Login "${username}" created ✓`, 'success');
      $('#u-new-username').value = '';
      $('#u-new-name').value = '';
      $('#u-new-password').value = '';
      $('#u-new-role').value = 'collector';
      this.renderUsers();
    } catch (e) { toast(e.message, 'error'); }
  },

  editUserModal(u) {
    openModal({
      title: `Edit login — ${esc(u.username)}`,
      body: `
        <label>Username
          <input id="mu-username" value="${esc(u.username)}" autocomplete="off">
        </label>
        <label>Full name
          <input id="mu-name" value="${esc(u.display_name)}">
        </label>
        <label>Role
          <select id="mu-role">
            <option value="collector" ${u.role === 'collector' ? 'selected' : ''}>Collector (Bursar)</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option>
          </select>
        </label>
        <label>Status
          <select id="mu-active">
            <option value="1" ${u.active ? 'selected' : ''}>Active — can sign in</option>
            <option value="0" ${!u.active ? 'selected' : ''}>Disabled — cannot sign in</option>
          </select>
        </label>
        <label>New password
          <input id="mu-password" type="password" placeholder="leave blank to keep current password">
        </label>
        <p id="mu-error" class="form-error hidden"></p>`,
      footer: `<button class="btn" data-act="cancel" type="button">Cancel</button>
               <button class="btn btn-primary" data-act="save" type="button">Save changes</button>`,
      onMount: (m, close) => {
        m.footerEl.querySelector('[data-act="cancel"]').onclick = close;
        m.footerEl.querySelector('[data-act="save"]').onclick = async () => {
          const body = {
            username: $('#mu-username', m.body).value.trim(),
            displayName: $('#mu-name', m.body).value.trim(),
            role: $('#mu-role', m.body).value,
            active: $('#mu-active', m.body).value === '1',
          };
          const pw = $('#mu-password', m.body).value;
          if (pw) body.password = pw;
          try {
            await API.put('/api/users/' + u.id, body);
            toast('Login updated ✓', 'success');
            close();
            this.renderUsers();
          } catch (e) {
            const errEl = $('#mu-error', m.body);
            errEl.textContent = e.message;
            errEl.classList.remove('hidden');
          }
        };
      },
    });
  },

  async saveMyLogin() {
    const users = await this.renderUsers();
    const me = users && users.find((u) => String(API.session.username).toLowerCase() === u.username.toLowerCase());
    if (!me) return toast('Could not find your account', 'error');
    const username = $('#me-username').value.trim();
    const password = $('#me-password').value;
    if (!username && !password) return toast('Enter a new username and/or password', 'error');
    const body = {};
    if (username) body.username = username;
    if (password) body.password = password;
    try {
      await API.put('/api/users/' + me.id, body);
      if (username) { API.session.username = username; localStorage.setItem('fga_session', JSON.stringify(API.session)); }
      $('#me-username').value = '';
      $('#me-password').value = '';
      $('#me-status').textContent = '✅ Saved. Use the new details next time you sign in on any device.';
      toast('Your login details were updated ✓', 'success');
      this.renderUsers();
    } catch (e) {
      $('#me-status').textContent = '';
      toast(e.message, 'error');
    }
  },

  /* ---------------- overview ---------------- */
  renderOverview() {
    const entries = Sync.entries;
    const total = entries.reduce((s, e) => s + (Number(e.total) || 0), 0);
    const full = entries.filter((e) => String(e.payment_type) === 'FULL').length;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthTotal = entries.filter((e) => String(e.date_of_payment).startsWith(ym))
      .reduce((s, e) => s + (Number(e.total) || 0), 0);

    $('#a-stats').innerHTML = `
      <div class="stat-card gold"><div class="k">Total Collected</div><div class="v">${gh(total)}</div></div>
      <div class="stat-card"><div class="k">Entries</div><div class="v">${entries.length}</div></div>
      <div class="stat-card"><div class="k">Full Payments</div><div class="v">${full}</div></div>
      <div class="stat-card"><div class="k">Part Payments</div><div class="v">${entries.length - full}</div></div>
      <div class="stat-card"><div class="k">This Month</div><div class="v">${gh(monthTotal)}</div></div>`;

    // by department
    const byDept = {};
    for (const d of DEPARTMENTS) byDept[d] = 0;
    for (const e of entries) byDept[e.department] = (byDept[e.department] || 0) + (Number(e.total) || 0);
    const maxDept = Math.max(1, ...Object.values(byDept));
    $('#a-dept-bars').innerHTML = DEPARTMENTS.map((d) => barRow(d, byDept[d] || 0, maxDept, false)).join('') || emptyBar('No entries yet');

    // by fee category
    const byFee = {};
    for (const f of FEE_ITEMS) byFee[f.key] = 0;
    for (const e of entries) for (const k of FEE_KEYS) byFee[k] += (Number(e[k]) || 0);
    const feeEntries = FEE_ITEMS.map((f) => ({ label: f.label, v: byFee[f.key] })).filter((f) => f.v > 0);
    const maxFee = Math.max(1, ...feeEntries.map((f) => f.v));
    $('#a-fee-bars').innerHTML = feeEntries.length
      ? feeEntries.sort((a, b) => b.v - a.v).map((f) => barRow(f.label, f.v, maxFee, true)).join('')
      : emptyBar('No fees recorded yet');
  },

  /* ---------------- submitted entries ---------------- */
  filtered() {
    const q = $('#a-q').value.trim().toUpperCase();
    const dept = $('#a-dept').value, cls = $('#a-class').value;
    const from = $('#a-from').value, to = $('#a-to').value;
    return Sync.entries.filter((e) =>
      (!q || e.learner_name.toUpperCase().includes(q)) &&
      (!dept || e.department === dept) &&
      (!cls || e.class === cls) &&
      (!from || e.date_of_payment >= from) &&
      (!to || e.date_of_payment <= to));
  },

  renderEntries() {
    const rows = this.filtered();
    $('#a-entries-count').textContent = Sync.entries.length;
    $('#a-entries-count').classList.toggle('hidden', !Sync.entries.length);
    $('#a-empty').classList.toggle('hidden', rows.length > 0);
    const sum = rows.reduce((s, e) => s + (Number(e.total) || 0), 0);
    $('#a-table tbody').innerHTML = rows.map((e) => `
      <tr>
        <td>${e.id}</td>
        <td>${fmtDate(e.date_of_payment)}</td>
        <td>${esc(e.department)}</td>
        <td>${esc(e.class)}</td>
        <td><b>${esc(e.learner_name)}</b></td>
        <td>${typePill(e.payment_type)}</td>
        <td class="num">${gh(e.total)}</td>
        <td class="muted small">${esc(e.created_by)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" data-view="${e.id}" type="button">View</button>
          <button class="btn btn-sm" data-pdf="${e.id}" type="button">PDF</button>
        </td>
      </tr>`).join('') +
      (rows.length ? `<tr><td colspan="6" class="muted" style="font-weight:700;text-align:right">Filtered total (${rows.length} entries)</td><td class="num" style="font-weight:800">${gh(sum)}</td><td></td><td></td></tr>` : '');
    $$('#a-table [data-view]').forEach((b) => b.onclick = () => openEntryDetail(Number(b.dataset.view), { canEdit: false, canPdf: true, canDelete: true, onDelete: () => this.renderEntries() }));
    $$('#a-table [data-pdf]').forEach((b) => b.onclick = () =>
      API.file('/api/export/pdf', { type: 'receipt', entryId: Number(b.dataset.pdf) }, `Fees-Receipt-${b.dataset.pdf}.pdf`)
        .then(() => toast('PDF downloaded', 'success'))
        .catch((e) => toast(e.message, 'error')));
  },

  /* ---------------- exports ---------------- */
  async export(kind) {
    const filters = {
      from: $('#e-from').value, to: $('#e-to').value,
      department: $('#e-dept').value, class: $('#e-class').value,
    };
    const btn = $(kind === 'pdf' ? '#e-pdf' : '#e-docx');
    const status = $('#e-status');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Preparing…';
    status.textContent = 'Building the document…';
    try {
      const inScope = this.filtered();
      if (!inScope.length) throw new Error('No entries match the selected scope');
      const stamp = new Date().toISOString().replace(/[-:TZ]/g, '').slice(0, 12);
      const label = filters.department ? filters.department + (filters.class ? '/' + filters.class : '') : 'All';
      if (kind === 'pdf') {
        await API.file('/api/export/pdf', { type: 'report', filters }, `Fees-Report-${label}-${stamp}.pdf`);
      } else {
        await API.file('/api/export/docx', { filters }, `Fees-Report-${label}-${stamp}.docx`);
      }
      status.textContent = `✅ ${kind.toUpperCase()} downloaded — ${inScope.length} entries included.`;
      toast(kind === 'pdf' ? 'PDF report downloaded' : 'DOCX report downloaded', 'success');
    } catch (e) {
      status.textContent = '';
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  },
};

function barRow(label, value, max, gold) {
  const pct = Math.round((value / max) * 100) || 0;
  return `<div class="bar-row">
    <span title="${esc(label)}">${esc(label.length > 16 ? label.slice(0, 15) + '…' : label)}</span>
    <div class="bar-track"><div class="bar-fill ${gold ? 'gold' : ''}" style="width:${pct}%"></div></div>
    <span class="amt">${gh(value)}</span>
  </div>`;
}
function emptyBar(msg) {
  return `<p class="muted" style="margin:8px 0">${msg}</p>`;
}
