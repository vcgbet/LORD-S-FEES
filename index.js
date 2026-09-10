const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');
const db = require('./db');
const { login, logout, requireAuth, hashPassword } = require('./auth');
const { FEE_KEYS, computeTotal, DEPARTMENTS, CLASSES } = require('./fees');
const { receiptPdf, reportPdf } = require('./exportPdf');
const { reportDocx } = require('./exportDocx');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

/* basic hardening */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'lga-fees', time: new Date().toISOString() });
});

/* ---------------------------- helpers ---------------------------- */

function upsertLearner(name, department, cls) {
  name = String(name || '').trim().toUpperCase();
  department = String(department || '').trim().toUpperCase();
  cls = String(cls || '').trim();
  if (!name) return null;
  const ex = db.prepare('SELECT id FROM learners WHERE name = ? AND department = ? AND "class" = ?').get(name, department, cls);
  if (ex) return ex.id;
  const r = db.prepare('INSERT INTO learners (name, department, "class") VALUES (?, ?, ?)').run(name, department, cls);
  return r.lastInsertRowid;
}

function normalizeEntry(o, extra = {}) {
  const e = { ...(o || {}) };
  const out = {
    department: String(e.department || '').trim().toUpperCase(),
    class: String(e.class || '').trim(),
    learner_name: String(e.learner_name || '').trim().toUpperCase(),
    date_of_payment: e.date_of_payment || new Date().toISOString().slice(0, 10),
    payment_type: String(e.payment_type || 'FULL').toUpperCase().startsWith('P') ? 'PART' : 'FULL',
    batch_photo: e.batch_photo && String(e.batch_photo).startsWith('data:image/') ? String(e.batch_photo) : null,
    batch_file_name: e.batch_file_name ? String(e.batch_file_name).slice(0, 200) : null,
    batch_file_data: e.batch_file_data && String(e.batch_file_data).startsWith('data:') ? String(e.batch_file_data) : null,
    notes: e.notes ? String(e.notes).slice(0, 1000) : null,
    learner_id: e.learner_id ? Number(e.learner_id) || null : null,
  };
  for (const k of FEE_KEYS) out[k] = Math.max(0, Number(e[k]) || 0);
  out.total = computeTotal(out);
  Object.assign(out, extra);
  return out;
}

function insertEntry(o, username) {
  const e = normalizeEntry(o);
  if (!e.department || !e.class || !e.learner_name) throw new Error('Department, Class and Learner Name are required');
  if (e.learner_name) {
    const ex = db.prepare('SELECT id FROM learners WHERE name = ? AND department = ? AND "class" = ?').get(e.learner_name, e.department, e.class);
    e.learner_id = ex ? ex.id : upsertLearner(e.learner_name, e.department, e.class);
  }
  const info = db.prepare(`
    INSERT INTO entries
      (department, "class", learner_name, learner_id, date_of_payment, payment_type,
       ${FEE_KEYS.join(', ')}, total, batch_photo, batch_file_name, batch_file_data, notes, created_by)
    VALUES
      (@department, @class, @learner_name, @learner_id, @date_of_payment, @payment_type,
       ${FEE_KEYS.map((k) => '@' + k).join(', ')}, @total, @batch_photo, @batch_file_name, @batch_file_data, @notes, @created_by)
  `).run({ ...e, created_by: username });
  return info.lastInsertRowid;
}

function updateEntry(id, o) {
  const e = normalizeEntry(o);
  if (e.learner_name) {
    const ex = db.prepare('SELECT id FROM learners WHERE name = ? AND department = ? AND "class" = ?').get(e.learner_name, e.department, e.class);
    e.learner_id = ex ? ex.id : upsertLearner(e.learner_name, e.department, e.class);
  }
  db.prepare(`
    UPDATE entries SET
      department = @department, "class" = @class, learner_name = @learner_name, learner_id = @learner_id,
      date_of_payment = @date_of_payment, payment_type = @payment_type,
      ${FEE_KEYS.map((k) => k + ' = @' + k).join(', ')},
      total = @total, batch_photo = @batch_photo, batch_file_name = @batch_file_name,
      batch_file_data = @batch_file_data, notes = @notes, updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...e, id });
}

function listEntries({ session, query }) {
  const { media, from, to, department, batchId, q } = query || {};
  const cls = query && query.class;
  let sql = 'SELECT * FROM entries WHERE 1=1';
  const args = [];
  if (session.role === 'collector') { sql += ' AND created_by = ?'; args.push(session.username); }
  if (from) { sql += ' AND date_of_payment >= ?'; args.push(from); }
  if (to) { sql += ' AND date_of_payment <= ?'; args.push(to); }
  if (department) { sql += ' AND department = ?'; args.push(department); }
  if (cls) { sql += ' AND "class" = ?'; args.push(cls); }
  if (batchId) { sql += ' AND batch_id = ?'; args.push(String(batchId)); }
  if (q) { sql += ' AND learner_name LIKE ?'; args.push('%' + q + '%'); }
  sql += ' ORDER BY id DESC';
  let rows = db.prepare(sql).all(...args);
  if (String(media) === '0') rows = rows.map(({ batch_photo, batch_file_data, ...rest }) => rest);
  return rows;
}

function canSeeEntry(session, row) {
  return session.role === 'admin' || row.created_by === session.username;
}

/* ---------------------------- auth ---------------------------- */

app.post('/api/login', (req, res) => {
  const s = login(req.body && req.body.username, req.body && req.body.password);
  if (!s) return res.status(401).json({ error: 'Invalid username or password' });
  res.json(s);
});

app.post('/api/logout', (req, res) => {
  const h = req.headers['authorization'] || '';
  logout(h.startsWith('Bearer ') ? h.slice(7) : null);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ role: req.session.role, username: req.session.username, displayName: req.session.display_name });
});

/* ---------------------------- meta ---------------------------- */

app.get('/api/meta', requireAuth, (req, res) => {
  res.json({ departments: DEPARTMENTS, classes: CLASSES });
});

/* ---------------------------- user management (admin) ---------------------------- */

const VALID_USERNAMES = /^[A-Za-z0-9._-]{3,30}$/;

function adminOnly(req, res, next) {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

function publicUser(row) {
  const { password_hash, ...rest } = row;
  return rest;
}

app.get('/api/users', requireAuth, adminOnly, (req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, username").all();
  res.json(rows.map(publicUser));
});

app.post('/api/users', requireAuth, adminOnly, (req, res) => {
  const { username, password, role, displayName } = req.body || {};
  const uname = String(username || '').trim();
  const name = String(displayName || '').trim() || (role === 'admin' ? 'Administrator' : 'Collector');
  if (!VALID_USERNAMES.test(uname)) return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, dot, dash, underscore)' });
  if (String(password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!['admin', 'collector'].includes(role)) return res.status(400).json({ error: 'Role must be admin or collector' });
  if (db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(uname)) {
    return res.status(409).json({ error: 'That username is already taken' });
  }
  const info = db.prepare('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)')
    .run(uname, hashPassword(password), role, name);
  res.json({ ok: true, user: db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) });
});

app.put('/api/users/:id', requireAuth, adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'User not found' });
  const { username, password, role, displayName, active } = req.body || {};
  const updates = {};

  if (username !== undefined) {
    const uname = String(username).trim();
    if (!VALID_USERNAMES.test(uname)) return res.status(400).json({ error: 'Invalid username (3-30 characters: letters, numbers, dot, dash, underscore)' });
    if (uname.toLowerCase() !== row.username.toLowerCase() &&
        db.prepare('SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ?').get(uname, row.id)) {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    updates.username = uname;
  }
  if (displayName !== undefined) updates.display_name = String(displayName).trim() || row.display_name;
  if (role !== undefined) {
    if (!['admin', 'collector'].includes(role)) return res.status(400).json({ error: 'Role must be admin or collector' });
    updates.role = role;
  }
  if (active !== undefined) updates.active = active ? 1 : 0;
  if (password !== undefined && String(password).length > 0) {
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    updates.password_hash = hashPassword(password);
  }

  // last active admin cannot be demoted, disabled or deleted
  if (row.role === 'admin' && row.active &&
      ((updates.role && updates.role !== 'admin') || updates.active === 0)) {
    const others = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1 AND id <> ?").get(row.id).c;
    if (others === 0) return res.status(400).json({ error: 'Cannot demote or disable the last active administrator' });
  }

  if (Object.keys(updates).length) {
    db.prepare(`UPDATE users SET ${Object.keys(updates).map((k) => k + ' = @' + k).join(', ')} WHERE id = @id`)
      .run({ ...updates, id: row.id });
  }
  // keep live sessions consistent when the username or role changes
  if (updates.username || updates.role || updates.display_name) {
    const fresh = db.prepare('SELECT username, role, display_name FROM users WHERE id = ?').get(row.id);
    db.prepare('UPDATE sessions SET username = ?, role = ?, display_name = ? WHERE user_id = ?')
      .run(fresh.username, fresh.role, fresh.display_name, row.id);
  }
  res.json({ ok: true, user: db.prepare('SELECT * FROM users WHERE id = ?').get(row.id) });
});

app.delete('/api/users/:id', requireAuth, adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'User not found' });
  const isSelf = (req.session.user_id && Number(req.session.user_id) === row.id) ||
    (!req.session.user_id && String(req.session.username).toLowerCase() === row.username.toLowerCase());
  if (isSelf) return res.status(400).json({ error: 'You cannot delete your own account' });
  if (row.role === 'admin' && row.active) {
    const others = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1 AND id <> ?").get(row.id).c;
    if (others === 0) return res.status(400).json({ error: 'Cannot delete the last active administrator' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
  res.json({ ok: true });
});

/* ---------------------------- learners ---------------------------- */

app.get('/api/learners', requireAuth, (req, res) => {
  const { department, q } = req.query;
  const cls = req.query.class;
  let sql = 'SELECT * FROM learners WHERE 1=1';
  const args = [];
  if (department) { sql += ' AND department = ?'; args.push(department); }
  if (cls) { sql += ' AND "class" = ?'; args.push(cls); }
  if (q) { sql += ' AND name LIKE ?'; args.push('%' + q.toUpperCase() + '%'); }
  sql += ' ORDER BY name';
  res.json(db.prepare(sql).all(...args));
});

app.post('/api/learners', requireAuth, (req, res) => {
  const id = upsertLearner(req.body && req.body.name, req.body && req.body.department, req.body && req.body.class);
  if (!id) return res.status(400).json({ error: 'Learner name is required' });
  res.json({ ok: true, id });
});

app.post('/api/learners/bulk', requireAuth, (req, res) => {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  const tx = db.transaction((list) => {
    let added = 0, updated = 0, skipped = 0;
    for (const it of list) {
      const name = String((it && it.name) || '').trim().toUpperCase();
      if (!name) { skipped++; continue; }
      const department = String((it && it.department) || '').trim().toUpperCase();
      const cls = String((it && it.class) || '').trim();
      const ex = db.prepare('SELECT id FROM learners WHERE name = ? AND department = ? AND "class" = ?').get(name, department, cls);
      if (ex) updated++;
      else { db.prepare('INSERT INTO learners (name, department, "class") VALUES (?, ?, ?)').run(name, department, cls); added++; }
    }
    return { added, updated, skipped };
  });
  res.json({ ok: true, ...tx(items.slice(0, 2000)) });
});

app.delete('/api/learners/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM learners WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------------------- entries ---------------------------- */

app.get('/api/entries', requireAuth, (req, res) => {
  res.json(listEntries({ session: req.session, query: req.query }));
});

app.get('/api/entries/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  if (!canSeeEntry(req.session, row)) return res.status(403).json({ error: 'Forbidden' });
  res.json(row);
});

app.post('/api/entries', requireAuth, (req, res) => {
  try {
    const id = insertEntry(req.body, req.session.username);
    res.json({ ok: true, id, entry: db.prepare('SELECT * FROM entries WHERE id = ?').get(id) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/entries/batch', requireAuth, (req, res) => {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  const common = (req.body && req.body.common) || {};
  if (!items.length) return res.status(400).json({ error: 'No entries to submit' });
  try {
    const tx = db.transaction((list) => {
      const ids = [];
      for (const it of list) ids.push(insertEntry({ ...common, ...it }, req.session.username));
      if (ids.length) {
        db.prepare('UPDATE entries SET batch_id = ? WHERE id IN (' + ids.map(() => '?').join(',') + ')').run(ids[0], ...ids);
      }
      return ids;
    });
    const ids = tx(items.slice(0, 500));
    res.json({ ok: true, batchId: ids[0], count: ids.length, ids });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/entries/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  if (!canSeeEntry(req.session, row)) return res.status(403).json({ error: 'Forbidden' });
  try {
    updateEntry(row.id, req.body);
    res.json({ ok: true, entry: db.prepare('SELECT * FROM entries WHERE id = ?').get(row.id) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/entries/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Entry not found' });
  if (!canSeeEntry(req.session, row)) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM entries WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

/* ---------------------------- exports ---------------------------- */

app.post('/api/export/pdf', requireAuth, (req, res) => {
  const { type, entryId, filters } = req.body || {};
  if (type === 'receipt') {
    const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId);
    if (!row) return res.status(404).json({ error: 'Entry not found' });
    if (!canSeeEntry(req.session, row)) return res.status(403).json({ error: 'Forbidden' });
    return receiptPdf(row, res);
  }
  // default: report (scoped by role inside listEntries)
  const entries = listEntries({ session: req.session, query: filters || {} });
  reportPdf(entries, { ...(filters || {}), by: req.session.display_name }, res);
});

app.post('/api/export/docx', requireAuth, async (req, res) => {
  const filters = (req.body && req.body.filters) || {};
  const entries = listEntries({ session: req.session, query: filters });
  try {
    await reportDocx(entries, { ...filters, by: req.session.display_name }, res);
  } catch (e) {
    console.error('DOCX export failed', e);
    if (!res.headersSent) res.status(500).json({ error: 'DOCX export failed' });
  }
});

/* ---------------------------- admin backup ---------------------------- */

// Consistent SQLite backup download (admin only)
app.post('/api/backup', requireAuth, (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const stamp = new Date().toISOString().slice(0, 10);
  const tmp = path.join(os.tmpdir(), `lga-fees-backup-${Date.now()}.db`);
  db.backup(tmp)
    .then(() => {
      res.download(tmp, `lga-fees-backup-${stamp}.db`, (err) => {
        fs.unlink(tmp, () => {});
        if (err && !res.headersSent) res.status(500).json({ error: 'Backup failed' });
      });
    })
    .catch((e) => {
      console.error('backup failed', e);
      fs.unlink(tmp, () => {});
      if (!res.headersSent) res.status(500).json({ error: 'Backup failed' });
    });
});

// Restore a previously downloaded backup (admin only). Sends:
//   { data: <base64 of the .db backup file> }
app.post('/api/restore', requireAuth, adminOnly, (req, res) => {
  const b64 = String((req.body && req.body.data) || '');
  if (!b64) return res.status(400).json({ error: 'No backup data received' });
  const data = Buffer.from(b64, 'base64');
  if (data.length < 4096 || !data.slice(0, 15).toString('utf8').startsWith('SQLite format 3')) {
    return res.status(400).json({ error: 'That file is not a valid database backup' });
  }
  const tmp = path.join(os.tmpdir(), `lga-restore-${Date.now()}.db`);
  const cleanup = () => fs.unlink(tmp, () => {});
  fs.writeFileSync(tmp, data);
  let src;
  try {
    src = new (require('better-sqlite3'))(tmp, { readonly: true });
    const health = src.prepare('PRAGMA integrity_check').get();
    if (health.integrity_check !== 'ok') {
      src.close(); cleanup();
      return res.status(400).json({ error: 'Backup file failed its integrity check' });
    }
    const tables = src.prepare('SELECT name FROM sqlite_master WHERE type = ?').all('table');
    if (!tables.some((t) => t.name === 'entries')) {
      src.close(); cleanup();
      return res.status(400).json({ error: 'That backup does not look like a fees database' });
    }
    // live hot-restore into the running database (online backup protocol —
    // safe while the app is serving; the open connection picks up the
    // restored pages via WAL immediately)
    src.backup(db.dbPath).then(() => {
      src.close(); cleanup();
      res.json({ ok: true, message: 'Backup restored — current data has been replaced.' });
    }).catch((e) => {
      console.error('restore failed', e);
      try { src.close(); } catch (e2) { /* ignore */ }
      cleanup();
      res.status(500).json({ error: 'Restore failed' });
    });
  } catch (e) {
    console.error('restore failed', e);
    cleanup();
    res.status(400).json({ error: 'Could not read the backup file' });
  }
});

/* ---------------------------- fallback ---------------------------- */

app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lord's Great Academy fees system running on http://0.0.0.0:${PORT}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
