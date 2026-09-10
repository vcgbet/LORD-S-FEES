/* Shared UI helpers: formatting, toasts, modals, camera, sync polling */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function gh(n) {
  return 'GH\u00A2 ' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function money(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (d || '\u2014');
}
function fmtDateTime(s) {
  if (!s) return '\u2014';
  const d = new Date(String(s).includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return s;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ---------------- toasts ---------------- */
function toast(msg, type = 'info', ms = 3800) {
  const root = $('#toast-root');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, ms - 350);
  setTimeout(() => t.remove(), ms);
}

/* ---------------- modal ---------------- */
function openModal({ title, body, footer = '', wide = false, onMount }) {
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}">
      <div class="modal-head"><h3>${title}</h3><button class="modal-x" type="button" aria-label="Close">\u2715</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  const root = $('#modal-root');
  root.appendChild(m);
  const close = () => {
    m.remove();
    document.removeEventListener('keydown', onKey);
    if (onCleanup) onCleanup();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  m.querySelector('.modal-x').onclick = close;
  m.addEventListener('click', (e) => { if (e.target === m) close(); });
  const api = { el: m, body: m.querySelector('.modal-body'), footerEl: m.querySelector('.modal-foot'), close };
  if (onMount) onMount(api, close);
  return api;
}

/* ---------------- camera ---------------- */
let camStream = null;
async function openCamera(onCapture) {
  const overlay = $('#camera-overlay');
  const video = $('#cam-video');
  const errEl = $('#cam-error');
  const shutter = $('#cam-shutter');
  overlay.classList.remove('hidden');
  errEl.classList.add('hidden');
  errEl.textContent = '';
  shutter.disabled = false;

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1600 }, height: { ideal: 1200 } },
      audio: false,
    });
    camStream = stream;
    video.srcObject = stream;
  } catch (e) {
    errEl.textContent = 'Camera unavailable (' + (e && e.message ? e.message : e) + '). Use “Upload File” instead to attach learner details.';
    errEl.classList.remove('hidden');
    shutter.disabled = true;
  }

  const stop = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    camStream = null;
    video.srcObject = null;
    overlay.classList.add('hidden');
  };
  const close = () => stop();
  $('#cam-x').onclick = close;
  $('#cam-cancel').onclick = close;
  overlay.onmousedown = (e) => { if (e.target === overlay) close(); };

  shutter.onclick = () => {
    if (!video.videoWidth) { toast('Camera not ready yet', 'error'); return; }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1280 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stop();
    onCapture(dataUrl);
  };
}

/* ---------------- entry detail modal ---------------- */
async function openEntryDetail(id, { canEdit = false, canPdf = true, canDelete = false, onDelete = null } = {}) {
  const e = await API.get('/api/entries/' + id);
  const feeRows = FEE_ITEMS.map((f) =>
    `<tr><td>${f.label}</td><td class="num">${gh(e[f.key])}</td></tr>`).join('');
  const isFull = String(e.payment_type || '').toUpperCase() === 'FULL';
  const body = `
    <div class="receipt">
      <div class="receipt-head">
        <h3>${SCHOOL_NAME}</h3>
        <p>FEES COLLECTION \u2014 ENTRY #${e.id}</p>
      </div>
      <dl class="kv">
        <div><dt>Department</dt><dd>${esc(e.department)}</dd></div>
        <div><dt>Class</dt><dd>${esc(e.class)}</dd></div>
        <div><dt>Name of Learner</dt><dd>${esc(e.learner_name)}</dd></div>
        <div><dt>Date of Payment</dt><dd>${fmtDate(e.date_of_payment)}</dd></div>
        <div><dt>Payment Type</dt><dd>${isFull ? 'Full Payment' : 'Part Payment'}</dd></div>
        <div><dt>Batch</dt><dd>${e.batch_id ? 'Batch #' + e.batch_id : '\u2014'}</dd></div>
      </dl>
      <table class="fee-table"><tbody>
        ${feeRows}
        <tr class="total"><td>TOTAL AMOUNT</td><td class="num">${gh(e.total)}</td></tr>
      </tbody></table>
      ${e.batch_photo ? `<h4>Photo (Batch Learner Upload)</h4><img class="shot" src="${e.batch_photo}" alt="batch learner upload photo">` : ''}
      ${e.batch_file_name ? `<h4>Uploaded File (Batch Learner Upload)</h4><p style="margin:4px 0 0"><a class="btn btn-sm" href="${e.batch_file_data}" download="${esc(e.batch_file_name)}">\u2B07 ${esc(e.batch_file_name)}</a></p>` : ''}
      ${e.notes ? `<h4>Notes</h4><p style="margin:4px 0 0">${esc(e.notes)}</p>` : ''}
      <p class="muted small" style="margin-top:14px">Submitted by <b>${esc(e.created_by)}</b> \u2022 ${fmtDateTime(e.created_at)} \u2022 Updated ${fmtDateTime(e.updated_at)}</p>
    </div>`;
  const footer = `
    ${canPdf ? '<button class="btn" data-act="pdf" type="button">\u2B07 PDF Receipt</button>' : ''}
    ${canEdit ? '<button class="btn" data-act="edit" type="button">\u270F Edit</button>' : ''}
    ${canDelete ? '<button class="btn btn-danger" data-act="del" type="button">\uD83D\uDDD1 Delete</button>' : ''}
    <button class="btn" data-act="close" type="button">Close</button>`;
  openModal({
    title: `Entry #${e.id} \u2014 ${esc(e.learner_name)}`,
    body, footer, wide: true,
    onMount(m, close) {
      m.footerEl.querySelector('[data-act="close"]').onclick = close;
      if (canPdf) m.footerEl.querySelector('[data-act="pdf"]').onclick = () =>
        API.file('/api/export/pdf', { type: 'receipt', entryId: e.id }, `Fees-Receipt-${e.id}-${e.date_of_payment || todayStr()}.pdf`)
          .then(() => toast('PDF receipt downloaded', 'success'))
          .catch((err) => toast(err.message, 'error'));
      if (canEdit) m.footerEl.querySelector('[data-act="edit"]').onclick = () => {
        close();
        if (window.Collector) Collector.editEntry(e);
      };
      if (canDelete) m.footerEl.querySelector('[data-act="del"]').onclick = async () => {
        if (!confirm('Delete this entry permanently?')) return;
        try {
          await API.del('/api/entries/' + e.id);
          toast('Entry deleted', 'success');
          close();
          if (onDelete) onDelete();
          Sync.poll();
        } catch (err) { toast(err.message, 'error'); }
      };
    },
  });
}

/* ---------------- cross-device sync ----------------
   The server database is the single source of truth. Every signed-in
   device (phone, tablet, desktop) polls it, so an entry submitted by
   the collector on one device appears on the admin's dashboard within
   a few seconds, and vice-versa. */
const Sync = {
  entries: [],
  learners: [],
  sig: null,
  lastSync: null,
  listeners: new Set(),

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },

  async poll() {
    if (!API.session || document.hidden) return;
    try {
      const [entries, learners] = await Promise.all([
        API.get('/api/entries?media=0'),
        API.get('/api/learners'),
      ]);
      this.lastSync = new Date();
      const sig = entries.map((e) => e.id + ':' + e.updated_at).join(',') + '|L' + learners.map((l) => l.id + l.created_at).join(',');
      if (sig !== this.sig) {
        this.sig = sig;
        this.entries = entries;
        this.learners = learners;
        this.listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
      }
      setSyncPill(true);
    } catch (e) {
      if (e && e.unauthorized) { App.showLogin('Session expired — please sign in again'); return; }
      setSyncPill(false);
    }
  },
};

function setSyncPill(ok) {
  const pill = $('#sync-pill');
  if (!pill) return;
  pill.classList.toggle('off', !ok);
  const label = $('#sync-label');
  label.textContent = ok
    ? 'Synced ' + (Sync.lastSync ? Sync.lastSync.toLocaleTimeString() : '')
    : 'Offline \u2014 retrying';
  pill.title = ok
    ? 'Cross-device sync is on. Data shared across all signed-in devices.'
    : 'Cannot reach the server. Changes will sync when connection is restored.';
}
