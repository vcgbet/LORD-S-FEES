const crypto = require('crypto');
const db = require('./db');

/* ---------------- password hashing (scrypt, per-user salt) ---------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const test = crypto.scryptSync(String(password), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return test.length === expected.length && crypto.timingSafeEqual(test, expected);
}

/* ---------------- built-in accounts ----------------
   Seeded on first start so the original credentials keep working:
     Administrator : BAMT / bamt@2026
     Collector     : Bursar / bursary lords academy
   The Administrator can then create more collectors and change any
   username/password from the Login Manager in the admin dashboard. */
function ensureDefaultUsers() {
  const ins = db.prepare('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)');
  const exists = (u) => !!db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(u);
  if (!exists('BAMT')) ins.run('BAMT', hashPassword('bamt@2026'), 'admin', 'Administrator');
  if (!exists('Bursar')) ins.run('Bursar', hashPassword('bursary lords academy'), 'collector', 'Bursar (Collector)');
}
ensureDefaultUsers();

/* ---------------- sessions ---------------- */

function login(username, password) {
  const u = String(username || '').trim();
  if (!u) return null;
  const row = db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(u);
  if (!row || !row.active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, username, user_id, role, display_name) VALUES (?, ?, ?, ?, ?)')
    .run(token, row.username, row.id, row.role, row.display_name);
  db.prepare("DELETE FROM sessions WHERE created_at < datetime('now', '-30 days')").run();
  return { token, role: row.role, username: row.username, displayName: row.display_name, userId: row.id };
}

function logout(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function requireAuth(req, res, next) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const s = db.prepare('SELECT token, username, user_id, role, display_name FROM sessions WHERE token = ?').get(token);
  if (!s) return res.status(401).json({ error: 'Session expired — please sign in again' });
  req.session = s;
  next();
}

module.exports = { login, logout, requireAuth, hashPassword, verifyPassword };
