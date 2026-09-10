/* Collector (Bursar) dashboard: new entry, class-list batch entry, learners, submitted entries */

const Collector = {
  editingId: null,
  entryMedia: { photo: null, fileName: null, fileData: null },
  batchMedia: { photo: null, fileName: null, fileData: null },
  batchRows: [],   // [{ id, name, values: {feeKey: number} }]
  lastBatch: null, // { batchId, count, department, class }

  /* ============================ init ============================ */
  init() {
    // selects
    populateSelect('#f-department', DEPARTMENTS, '\u2014 Select \u2014');
    populateSelect('#f-class', CLASSES, '\u2014 Select \u2014');
    populateSelect('#b-department', DEPARTMENTS, '\u2014 Select \u2014');
    populateSelect('#b-class', CLASSES, '\u2014 Select \u2014');
    populateSelect('#l-department', DEPARTMENTS, '\u2014 Select \u2014');
    populateSelect('#l-class', CLASSES, '\u2014 Select \u2014');
    populateSelect('#s-dept', DEPARTMENTS, 'All Departments');
    populateSelect('#s-class', CLASSES, 'All Classes');
    wireDeptClassHint('#f-department', '#f-class');
    wireDeptClassHint('#b-department', '#b-class');
    wireDeptClassHint('#l-department', '#l-class');

    // fee inputs
    buildFeeGrid($('#fee-grid'), 'f', () => this.updateFormTotal());
    buildFeeGrid($('#b-rate-grid'), 'r', null);

    // defaults
    $('#f-date').value = todayStr();
    $('#b-date').value = todayStr();

    // single-entry form
    ['f-department', 'f-class', 'f-learner'].forEach((id) => $( '#' + id).addEventListener('input', () => this.refreshLearnerMatch()));
    $('#f-submit').onclick = () => this.submitEntry();
    $('#success-another').onclick = () => this.resetEntryForm();
    $('#success-view').onclick = () => switchTab('#collector-tabs', 'c-submitted');
    $('#success-receipt').onclick = () => {
      if (!this.lastEntry) return;
      API.file('/api/export/pdf', { type: 'receipt', entryId: this.lastEntry.id }, `Fees-Receipt-${this.lastEntry.id}-${this.lastEntry.date_of_payment || todayStr()}.pdf`)
        .then(() => toast('PDF receipt downloaded', 'success'))
        .catch((e) => toast(e.message, 'error'));
    };

    // single-entry media
    wireMedia('f', { get: () => this.entryMedia, set: (m) => { this.entryMedia = m; },
      preview: '#f-photo-preview', note: '#f-media-note', clear: '#f-media-clear' });

    // batch tab
    $('#b-load').onclick = () => this.loadClassList();
    $('#b-add-learner').onclick = () => this.addBatchLearner();
    $('#b-new-learner').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addBatchLearner(); });
    $('#b-apply-rates').onclick = () => this.applyRates();
    $('#b-submit').onclick = () => this.submitBatch();
    $('#batch-new').onclick = () => this.resetBatch();
    $('#batch-view').onclick = () => switchTab('#collector-tabs', 'c-submitted');
    $('#batch-export').onclick = () => {
      const b = this.lastBatch;
      if (!b) return;
      API.file('/api/export/pdf',
        { type: 'report', filters: { batchId: b.batchId } },
        `Fees-Batch-${b.batchId}-${b.department}-${b.class}.pdf`)
        .then(() => toast('Batch PDF downloaded', 'success'))
        .catch((e) => toast(e.message, 'error'));
    };
    wireMedia('b', { get: () => this.batchMedia, set: (m) => { this.batchMedia = m; },
      preview: '#b-photo-preview', note: '#b-media-note', clear: '#b-media-clear' });

    // learners tab
    $('#l-add').onclick = () => this.registerLearner();
    $('#l-csv-btn').onclick = () => $('#l-csv-input').click();
    $('#l-csv-input').onchange = (e) => this.bulkUploadLearners(e);
    $('#l-search').addEventListener('input', () => this.renderLearners());

    // submitted tab
    ['s-q', 's-dept', 's-class', 's-from', 's-to'].forEach((id) => $('#' + id).addEventListener('input', () => this.renderSubmitted()));
    $('#c-export-pdf').onclick = () => this.exportSubmittedPdf();

    // re-render live on sync so hidden tabs are never stale
    Sync.on(() => {
      this.refreshLearnerMatch();
      this.renderLearners();
      this.renderSubmitted();
      this.renderBatchTable();
    });
    window.addEventListener('pane-shown', (e) => {
      if (e.detail.navSel !== '#collector-tabs') return;
      if (e.detail.paneId === 'c-batch') this.renderBatchTable();
      if (e.detail.paneId === 'c-submitted') this.renderSubmitted();
    });

    this.updateFormTotal();
    this.renderLearners();
    this.renderSubmitted();
  },

  /* ================= helpers ================= */
  currentDept() { return $('#f-department').value; },
  currentClass() { return $('#f-class').value; },

  refreshLearnerMatch() {
    const dept = this.currentDept(), cls = this.currentClass();
    const pool = Sync.learners.filter((l) => (!dept || l.department === dept) && (!cls || l.class === cls));
    const names = Array.from(new Set(pool.map((l) => l.name))).sort();
    $('#learner-datalist').innerHTML = names.map((n) => `<option value="${esc(n)}"></option>`).join('');
    const q = $('#f-learner').value.trim().toUpperCase();
    const match = q ? Sync.learners.find((l) => l.name.toUpperCase() === q && (!dept || l.department === dept) && (!cls || l.class === cls)) : null;
    $('#learner-reg-note').classList.toggle('hidden', !match);
    $('#f-learner').dataset.learnerId = match ? match.id : '';
  },

  collectForm() {
    const data = {
      department: this.currentDept(),
      class: this.currentClass(),
      learner_name: $('#f-learner').value,
      learner_id: Number($('#f-learner').dataset.learnerId) || null,
      date_of_payment: $('#f-date').value || todayStr(),
      payment_type: $('input[name="paytype"]:checked').value,
      batch_photo: this.entryMedia.photo,
      batch_file_name: this.entryMedia.fileName,
      batch_file_data: this.entryMedia.fileData,
      notes: $('#f-notes').value,
    };
    for (const k of FEE_KEYS) data[k] = Number($('#f-' + k).value) || 0;
    return data;
  },

  updateFormTotal() {
    const t = FEE_KEYS.reduce((s, k) => s + (Number($('#f-' + k).value) || 0), 0);
    $('#f-total').textContent = gh(t);
    return t;
  },

  resetEntryForm() {
    this.editingId = null;
    this.lastEntry = null;
    $('#f-department').value = '';
    $('#f-class').value = '';
    $('#f-learner').value = '';
    $('#f-learner').dataset.learnerId = '';
    $('#f-date').value = todayStr();
    $('#pt-full').checked = true;
    $('#f-notes').value = '';
    $$('#fee-grid input').forEach((i) => { i.value = ''; });
    this.entryMedia = { photo: null, fileName: null, fileData: null };
    renderMediaState('f', this.entryMedia);
    this.updateFormTotal();
    $('#editing-banner').classList.add('hidden');
    $('#f-submit').textContent = 'Submit to Administrator';
    $('#entry-success').classList.add('hidden');
    $('#entry-form-card').classList.remove('hidden');
    this.refreshLearnerMatch();
  },

  /* ================= single entry ================= */
  async submitEntry() {
    const data = this.collectForm();
    if (!data.department) return toast('Please select a Department', 'error');
    if (!data.class) return toast('Please select a Class', 'error');
    if (!data.learner_name.trim()) return toast('Please enter the learner name', 'error');

    const btn = $('#f-submit');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Submitting…';
    try {
      const res = this.editingId
        ? await API.put('/api/entries/' + this.editingId, data)
        : await API.post('/api/entries', data);
      const entry = res.entry;
      this.lastEntry = entry;
      toast(this.editingId ? 'Entry updated ✓' : 'Entry submitted to the Administrator ✓', 'success');
      this.resetEntryForm();
      $('#success-msg').textContent = `${entry.learner_name} \u2022 ${entry.department} / ${entry.class} \u2022 ${fmtDate(entry.date_of_payment)} \u2022 Total ${gh(entry.total)} \u2014 Entry #${entry.id} saved and synced to the Administrator dashboard.`;
      $('#entry-form-card').classList.add('hidden');
      $('#entry-success').classList.remove('hidden');
      Sync.poll();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  },

  editEntry(e) {
    this.editingId = e.id;
    this.lastEntry = null;
    $('#f-department').value = e.department;
    $('#f-class').value = e.class;
    $('#f-learner').value = e.learner_name;
    $('#f-learner').dataset.learnerId = e.learner_id || '';
    $('#f-date').value = e.date_of_payment;
    (String(e.payment_type) === 'PART' ? $('#pt-part') : $('#pt-full')).checked = true;
    $('#f-notes').value = e.notes || '';
    for (const k of FEE_KEYS) $('#f-' + k).value = e[k] ? String(e[k]) : '';
    this.entryMedia = { photo: e.batch_photo, fileName: e.batch_file_name, fileData: e.batch_file_data };
    renderMediaState('f', this.entryMedia);
    this.updateFormTotal();
    $('#editing-banner').innerHTML = `<span>\u270F Editing entry #${e.id} — saving will replace the original submission.</span><button type="button" class="btn btn-sm" id="cancel-edit">Cancel</button>`;
    $('#editing-banner').classList.remove('hidden');
    $('#cancel-edit').onclick = () => this.resetEntryForm();
    $('#f-submit').textContent = 'Save Changes';
    $('#entry-success').classList.add('hidden');
    $('#entry-form-card').classList.remove('hidden');
    switchTab('#collector-tabs', 'c-entry');
    this.refreshLearnerMatch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /* ================= class list (batch) entry ================= */
  loadClassList() {
    const dept = $('#b-department').value, cls = $('#b-class').value;
    if (!dept || !cls) return toast('Select Department and Class first', 'error');
    const learners = Sync.learners.filter((l) => l.department === dept && l.class === cls);
    this.batchRows = learners.map((l) => ({ id: l.id, name: l.name, values: zeroFees() }));
    $('#b-load-note').textContent = learners.length
      ? `${learners.length} registered learner${learners.length > 1 ? 's' : ''} loaded — add more below or start typing fees.`
      : 'No registered learners in this class yet — add names below.';
    $('#b-table-card').classList.remove('hidden');
    $('#batch-success').classList.add('hidden');
    this.renderBatchTable();
  },

  async addBatchLearner() {
    const name = $('#b-new-learner').value.trim();
    const dept = $('#b-department').value, cls = $('#b-class').value;
    if (!name) return toast('Type the learner name first', 'error');
    if (!dept || !cls) return toast('Select Department and Class first', 'error');
    if (this.batchRows.some((r) => r.name.toUpperCase() === name.toUpperCase())) {
      return toast('That learner is already in this class list', 'error');
    }
    let id = null;
    try {
      const r = await API.post('/api/learners', { name, department: dept, class: cls });
      id = r.id;
      Sync.poll();
    } catch (e) { toast(e.message, 'error'); return; }
    this.batchRows.push({ id, name: name.toUpperCase(), values: zeroFees() });
    $('#b-new-learner').value = '';
    this.renderBatchTable();
  },

  applyRates() {
    if (!this.batchRows.length) return;
    const rates = {};
    let any = false;
    for (const k of FEE_KEYS) {
      const v = Number($('#r-' + k).value) || 0;
      if (v > 0) { rates[k] = v; any = true; }
    }
    if (!any) return toast('Fill in at least one class fee rate first', 'error');
    const hasExisting = this.batchRows.some((r) => FEE_KEYS.some((k) => (Number(r.values[k]) || 0) > 0));
    if (hasExisting && !confirm('Apply these rates to ALL rows? Rows that already have values will be overwritten.')) return;
    for (const r of this.batchRows) {
      for (const k of FEE_KEYS) if (rates[k] != null) r.values[k] = rates[k];
    }
    this.renderBatchTable();
    toast('Class rates applied to all rows', 'success');
  },

  renderBatchTable() {
    // never wipe rows while the bursar is mid-keystroke in the table
    const focused = document.activeElement;
    if (focused && focused.closest && focused.closest('#b-table')) return;
    const thead = $('#b-table thead');
    const tbody = $('#b-table tbody');
    thead.innerHTML = `<tr>
      <th class="sticky-col">#</th>
      <th class="col-name">Learner</th>
      ${FEE_ITEMS.map((f) => `<th class="fee-col" title="${f.label}">${FEE_SHORT[f.key]}</th>`).join('')}
      <th class="num" style="position:sticky;right:0;background:var(--green-800);z-index:3">Total</th>
      <th></th>
    </tr>`;
    tbody.innerHTML = this.batchRows.map((r, i) => `
      <tr data-row="${i}">
        <td class="sticky-col">${i + 1}</td>
        <td class="col-name"><b>${esc(r.name)}</b></td>
        ${FEE_KEYS.map((k) => `<td class="fee-col"><input type="number" min="0" step="0.01" inputmode="decimal" data-key="${k}" value="${r.values[k] ? r.values[k] : ''}" placeholder="0"></td>`).join('')}
        <td class="num row-total" style="position:sticky;right:0;background:#fff;z-index:1;font-weight:700">${gh(rowTotal(r))}</td>
        <td><button class="btn btn-sm" type="button" data-del="${i}" title="Remove">\u2715</button></td>
      </tr>`).join('');

    $$('#b-table input[data-key]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const rowEl = inp.closest('tr');
        const i = Number(rowEl.dataset.row);
        const r = this.batchRows[i];
        r.values[inp.dataset.key] = Number(inp.value) || 0;
        rowEl.querySelector('.row-total').textContent = gh(rowTotal(r));
        this.updateBatchTotal();
      });
    });
    $$('#b-table [data-del]').forEach((btn) => {
      btn.onclick = () => {
        this.batchRows.splice(Number(btn.dataset.del), 1);
        this.renderBatchTable();
      };
    });
    $('#b-submit').disabled = this.batchRows.length === 0;
    $('#b-submit').textContent = this.batchRows.length
      ? `Submit Whole Class (${this.batchRows.length} learner${this.batchRows.length > 1 ? 's' : ''})`
      : 'Submit Whole Class';
    this.updateBatchTotal();
  },

  updateBatchTotal() {
    const t = this.batchRows.reduce((s, r) => s + rowTotal(r), 0);
    $('#b-total').textContent = gh(t);
    return t;
  },

  async submitBatch() {
    const dept = $('#b-department').value, cls = $('#b-class').value;
    const items = this.batchRows
      .filter((r) => r.name.trim())
      .map((r) => ({ learner_name: r.name, learner_id: r.id || null, ...r.values }));
    if (!items.length) return toast('No learners in the class list', 'error');
    const common = {
      department: dept,
      class: cls,
      date_of_payment: $('#b-date').value || todayStr(),
      payment_type: $('input[name="bpaytype"]:checked').value,
      batch_photo: this.batchMedia.photo,
      batch_file_name: this.batchMedia.fileName,
      batch_file_data: this.batchMedia.fileData,
    };
    const btn = $('#b-submit');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Submitting…';
    try {
      const res = await API.post('/api/entries/batch', { common, items });
      this.lastBatch = { batchId: res.batchId, count: res.count, department: dept, class: cls };
      toast(`${res.count} entries submitted for ${dept} / ${cls} ✓`, 'success');
      this.resetBatch();
      $('#batch-success-msg').textContent = `${res.count} learner entries (${dept} / ${cls}) have been sent to the Administrator as batch #${res.batchId} and are now synced across devices.`;
      $('#batch-success').classList.remove('hidden');
      Sync.poll();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  },

  resetBatch() {
    $('#b-department').value = '';
    $('#b-class').value = '';
    $('#b-date').value = todayStr();
    $('#bpt-full').checked = true;
    this.batchRows = [];
    this.batchMedia = { photo: null, fileName: null, fileData: null };
    renderMediaState('b', this.batchMedia);
    $$('#b-rate-grid input').forEach((i) => { i.value = ''; });
    $('#b-new-learner').value = '';
    $('#b-load-note').textContent = '';
    $('#b-table-card').classList.add('hidden');
    $('#batch-success').classList.add('hidden');
    this.renderBatchTable();
  },

  /* ================= learners ================= */
  async registerLearner() {
    const name = $('#l-name').value.trim();
    if (!name) return toast('Enter the learner name', 'error');
    try {
      await API.post('/api/learners', { name, department: $('#l-department').value, class: $('#l-class').value });
      toast('Learner registered ✓', 'success');
      $('#l-name').value = '';
      Sync.poll();
    } catch (e) { toast(e.message, 'error'); }
  },

  async bulkUploadLearners(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('File too large (max 2 MB)', 'error');
    const text = await file.text();
    const items = parseCsvLearners(text);
    if (!items.length) return toast('No learner rows found in that file (expected columns: Name, Department, Class)', 'error');
    try {
      const res = await API.post('/api/learners/bulk', { items });
      toast(`Bulk upload: ${res.added} added, ${res.updated} already registered`, 'success');
      Sync.poll();
    } catch (err) { toast(err.message, 'error'); }
  },

  renderLearners() {
    const q = $('#l-search').value.trim().toUpperCase();
    const rows = Sync.learners.filter((l) => !q || l.name.toUpperCase().includes(q));
    $('#l-count').textContent = rows.length ? `${rows.length} learner${rows.length > 1 ? 's' : ''}` : '';
    $('#l-empty').classList.toggle('hidden', rows.length > 0);
    $('#l-table tbody').innerHTML = rows.map((l) => `
      <tr>
        <td><b>${esc(l.name)}</b></td>
        <td>${esc(l.department) || '\u2014'}</td>
        <td>${esc(l.class) || '\u2014'}</td>
        <td class="muted small">${fmtDate(l.created_at)}</td>
        <td style="text-align:right"><button class="btn btn-sm btn-danger" data-lid="${l.id}" type="button">Delete</button></td>
      </tr>`).join('');
    $$('#l-table [data-lid]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Delete this learner from the register?')) return;
        try { await API.del('/api/learners/' + btn.dataset.lid); toast('Learner deleted', 'success'); Sync.poll(); }
        catch (err) { toast(err.message, 'error'); }
      };
    });
  },

  /* ================= submitted entries ================= */
  submittedFiltered() {
    const q = $('#s-q').value.trim().toUpperCase();
    const dept = $('#s-dept').value, cls = $('#s-class').value;
    const from = $('#s-from').value, to = $('#s-to').value;
    return Sync.entries.filter((e) =>
      (!q || e.learner_name.toUpperCase().includes(q)) &&
      (!dept || e.department === dept) &&
      (!cls || e.class === cls) &&
      (!from || e.date_of_payment >= from) &&
      (!to || e.date_of_payment <= to));
  },

  renderSubmitted() {
    const rows = this.submittedFiltered();
    $('#c-submitted-count').textContent = Sync.entries.length;
    $('#c-submitted-count').classList.toggle('hidden', !Sync.entries.length);
    $('#s-empty').classList.toggle('hidden', rows.length > 0);
    $('#s-table tbody').innerHTML = rows.map((e) => `
      <tr>
        <td>${e.id}</td>
        <td>${fmtDate(e.date_of_payment)}</td>
        <td>${esc(e.department)}</td>
        <td>${esc(e.class)}</td>
        <td><b>${esc(e.learner_name)}</b></td>
        <td>${typePill(e.payment_type)}</td>
        <td class="num">${gh(e.total)}</td>
        <td>${e.batch_id ? '#' + e.batch_id : '\u2014'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm" data-view="${e.id}" type="button">View</button>
          <button class="btn btn-sm" data-pdf="${e.id}" type="button">PDF</button>
          <button class="btn btn-sm" data-edit="${e.id}" type="button">Edit</button>
        </td>
      </tr>`).join('');
    $$('#s-table [data-view]').forEach((b) => b.onclick = () => openEntryDetail(Number(b.dataset.view), { canEdit: true, canPdf: true, canDelete: true, onDelete: () => this.renderSubmitted() }));
    $$('#s-table [data-pdf]').forEach((b) => b.onclick = () =>
      API.file('/api/export/pdf', { type: 'receipt', entryId: Number(b.dataset.pdf) }, `Fees-Receipt-${b.dataset.pdf}.pdf`)
        .then(() => toast('PDF downloaded', 'success'))
        .catch((e) => toast(e.message, 'error')));
    $$('#s-table [data-edit]').forEach((b) => b.onclick = async () => {
      const e = await API.get('/api/entries/' + b.dataset.edit);
      this.editEntry(e);
    });
  },

  exportSubmittedPdf() {
    const rows = this.submittedFiltered();
    if (!rows.length) return toast('No entries to export for the current filters', 'error');
    API.file('/api/export/pdf', {
      type: 'report',
      filters: {
        from: $('#s-from').value, to: $('#s-to').value,
        department: $('#s-dept').value, class: $('#s-class').value,
      },
    }, `Fees-Report-${todayStr()}.pdf`)
      .then(() => toast('PDF report downloaded', 'success'))
      .catch((e) => toast(e.message, 'error'));
  },
};

/* ---------------- small shared builders ---------------- */
function populateSelect(sel, values, firstLabel) {
  const el = $(sel);
  el.innerHTML = `<option value="">${esc(firstLabel)}</option>` + values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

function wireDeptClassHint(deptSel, classSel) {
  $(deptSel).addEventListener('change', () => {
    const hint = DEPT_CLASSES[$(deptSel).value] || [];
    if (!hint.length) return;
    const cur = $(classSel).value;
    if (!hint.includes(cur)) $(classSel).value = hint[0];
    // move the department's classes to the top of the list (all classes stay available)
    const others = CLASSES.filter((c) => !hint.includes(c));
    const current = $(classSel).value;
    populateSelect(classSel, [...hint, ...others], '\u2014 Select \u2014');
    $(classSel).value = current;
  });
}

function buildFeeGrid(container, prefix, onInput) {
  container.innerHTML = FEE_ITEMS.map((f) => `
    <label class="fee-cell" for="${prefix}-${f.key}" title="${esc(f.label)}">
      <span class="fee-label">${esc(f.label)}</span>
      <span class="fee-input-wrap">
        <span class="gh">GH\u00A2</span>
        <input id="${prefix}-${f.key}" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00">
      </span>
    </label>`).join('');
  if (onInput) $$('input', container).forEach((i) => i.addEventListener('input', onInput));
}

function zeroFees() {
  const o = {};
  for (const k of FEE_KEYS) o[k] = 0;
  return o;
}
function rowTotal(r) {
  return FEE_KEYS.reduce((s, k) => s + (Number(r.values[k]) || 0), 0);
}

function typePill(t) {
  const full = String(t || '').toUpperCase() === 'FULL';
  return `<span class="type-pill ${full ? 'full' : 'part'}">${full ? 'FULL' : 'PART'}</span>`;
}

function visible(sel) {
  const el = $(sel);
  return el && !el.classList.contains('hidden');
}

function parseCsvLearners(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    const parts = splitCsvLine(line);
    const name = (parts[0] || '').trim();
    if (!name || name.toLowerCase() === 'name') continue;
    items.push({ name, department: (parts[1] || '').trim(), class: (parts[2] || '').trim() });
  }
  return items;
}
function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/* media wiring: camera + file upload with preview */
function wireMedia(prefix, { get, set, preview, note, clear }) {
  $('#' + prefix + '-photo-btn').onclick = () => openCamera((dataUrl) => {
    const m = { ...get(), photo: dataUrl };
    set(m);
    renderMediaState(prefix, m);
    toast('Photo attached to this entry', 'success');
  });
  $('#' + prefix + '-file-btn').onclick = () => $('#' + prefix + '-file-input').click();
  $('#' + prefix + '-file-input').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast('File too large (max 8 MB)', 'error');
    const dataUrl = await fileToDataUrl(file);
    set({ ...get(), fileName: file.name, fileData: dataUrl });
    renderMediaState(prefix, get());
    toast('File attached to this entry', 'success');
  };
  if (clear) $('#' + prefix + '-media-clear').onclick = () => {
    const empty = { photo: null, fileName: null, fileData: null };
    set(empty);
    renderMediaState(prefix, empty);
  };
}

function renderMediaState(prefix, m) {
  const previewEl = $('#' + prefix + '-photo-preview');
  const noteEl = $('#' + prefix + '-media-note');
  const clearEl = $('#' + prefix + '-media-clear');
  const parts = [];
  if (m.photo) parts.push('📷 Photo attached');
  if (m.fileName) parts.push('📁 ' + m.fileName);
  noteEl.textContent = parts.join('  •  ');
  clearEl.classList.toggle('hidden', !m.photo && !m.fileName);
  if (m.photo) {
    previewEl.innerHTML = `<img src="${m.photo}" alt="batch upload preview">`;
    previewEl.classList.remove('hidden');
  } else {
    previewEl.innerHTML = '';
    previewEl.classList.add('hidden');
  }
}
