const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'fees.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.dbPath = DB_PATH; // exposed for the restore endpoint

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token        TEXT PRIMARY KEY,
    username     TEXT NOT NULL,
    user_id      INTEGER,
    role         TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin','collector')),
    display_name  TEXT NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS learners (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    class      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (name, department, class)
  );

  CREATE TABLE IF NOT EXISTS entries (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    department         TEXT NOT NULL,
    class              TEXT NOT NULL,
    learner_name       TEXT NOT NULL,
    learner_id         INTEGER REFERENCES learners(id) ON DELETE SET NULL,
    date_of_payment    TEXT NOT NULL,
    payment_type       TEXT NOT NULL DEFAULT 'FULL',
    registration       REAL NOT NULL DEFAULT 0,
    form_fee           REAL NOT NULL DEFAULT 0,
    arrears            REAL NOT NULL DEFAULT 0,
    pta                REAL NOT NULL DEFAULT 0,
    gnaps              REAL NOT NULL DEFAULT 0,
    maintenance        REAL NOT NULL DEFAULT 0,
    building_furniture REAL NOT NULL DEFAULT 0,
    first_aid          REAL NOT NULL DEFAULT 0,
    sports_culture     REAL NOT NULL DEFAULT 0,
    utility            REAL NOT NULL DEFAULT 0,
    teachers_incentive REAL NOT NULL DEFAULT 0,
    cola               REAL NOT NULL DEFAULT 0,
    special_levy       REAL NOT NULL DEFAULT 0,
    childrens_sp_levy  REAL NOT NULL DEFAULT 0,
    additional_fee     REAL NOT NULL DEFAULT 0,
    total              REAL NOT NULL DEFAULT 0,
    batch_photo        TEXT,
    batch_file_name    TEXT,
    batch_file_data    TEXT,
    notes              TEXT,
    batch_id           INTEGER,
    created_by         TEXT NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON entries(updated_at);
  CREATE INDEX IF NOT EXISTS idx_entries_created_by ON entries(created_by);
  CREATE INDEX IF NOT EXISTS idx_learners_class     ON learners(department, class);
`);

// migration for databases created before user_id existed
const hasUserId = db.prepare('PRAGMA table_info(sessions)').all().some((c) => c.name === 'user_id');
if (!hasUserId) db.exec('ALTER TABLE sessions ADD COLUMN user_id INTEGER');

module.exports = db;
