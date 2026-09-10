# The Lord's Great Academy — Fees Collection System

An online web app for collecting school fees, built from the school's paper
**FEES COLLECTION** template. Two roles, one shared data store, real-time
cross-device synchronization, and PDF/DOCX exports.

## Accounts

Built-in accounts (created automatically on first start):

| Role        | Username | Password                |
|-------------|----------|-------------------------|
| Administrator | `BAMT`  | `bamt@2026`             |
| Collector (Bursar) | `Bursar` | `bursary lords academy` |

Sign in once per device; the session is remembered on that device until
sign-out.

### Login Manager (admin dashboard, 👥 Login Manager tab)

Passwords are stored salted and hashed (scrypt) — never in plain text.

- **Create logins** — add extra Collector (bursar) accounts, or additional
  Administrators, with username, full name, password and role.
- **Edit any account** — change username, full name, role, reset the
  password, or **disable** the account (disabled accounts cannot sign in).
  Each collector still sees only their own submitted entries.
- **Change your own login** — the admin can change their own username and
  password from the "Change my own login" card.
- **Safety rules** — an admin cannot delete their own account, and the last
  active administrator cannot be demoted, disabled or deleted.

## Collector (Bursar) Dashboard

Tabs:

1. **New Entry** — the single-learner fees form, mirroring the paper template:
   - Department (NURSERY, KINDERGARTEN, PRIMARY, JHS) — choosing a department
     auto-suggests its classes.
   - Class (N1, N2, KG1, KG2, Basic 1 … Basic 9).
   - **Name of Learner** — typing a name registers the learner automatically;
     registered names appear as suggestions.
   - Date of Payment, Full/Part Payment.
   - All 15 fee lines (Registration, Form, Arrears, PTA, GNAPS, Maintenance,
     Building and Furniture, First Aid, Sports and Culture, Utility,
     Teacher's Incentive, COLA, Special Levy, Children's S.P. Levy,
     Additional Fee) with a live **TOTAL AMOUNT**.
   - **Batch Learner Upload** — 📷 take a camera photo *and/or* 📁 upload a
     file (class list, IDs, etc.).
   - **Submit to Administrator** button at the end of the form. After
     submitting you can download the entry as a **PDF receipt** formatted like
     the paper form.
2. **Class List Entry** — whole-class fee entry:
   - Pick department + class, press **Load Class List** to pull every
     registered learner in that class into an easy-entry table.
   - Add learners inline; enter fees per learner or fill **Class Fee Rates**
     once and **Apply Rates to All Rows**.
   - One camera photo / file upload per batch, one date and payment type for
     the whole class, then **Submit Whole Class (N learners)**.
   - After submitting, export the whole batch as PDF.
3. **Learners** — register learners individually or in bulk from a CSV file
   (`Name, Department, Class`), search, and delete.
4. **Submitted Entries** — everything you have submitted (filter by learner,
   department, class, date range). View, edit, delete, download a PDF receipt
   per entry, or **Export PDF** for the current filter.

## Administrator Dashboard

Tabs:

1. **Overview** — total collected, entry counts, full vs part payments,
   this-month total, plus collected-by-department and fee-category breakdowns.
2. **Submitted Entries** — every submission from the collector, live
   (cross-device), with search/filters, detail view, per-entry PDF receipt,
   and delete.
3. **Export** — scope by department/class/date, then download the report as
   **PDF** or **DOCX (Word)**. Reports include the entry table, the fee
   breakdown totals, the grand total, and signature lines.

## Cross-device synchronization

The server's database is the single source of truth. Every signed-in device
(collector's phone, admin's desktop, …) polls it every 4 seconds, so a
submission made on one device appears on the other dashboard within a few
seconds. The header shows a **Synced HH:MM:SS** pill (or Offline while the
connection is down).

## Running the app locally

```bash
npm install        # installs express, better-sqlite3, docx, pdfkit
npm start          # serves on http://0.0.0.0:3000
```

- Data is stored in `data/fees.db` (SQLite, WAL mode). Delete the file for a
  clean slate (the schema is recreated automatically on start).
- Set `PORT` to change the port; set `DB_PATH` to relocate the database.

## Deploying it permanently (own URL)

The app is a single Node.js service with one folder to persist (`data/`).
Three ready-made paths — pick whichever fits:

### Option A — a VPS (recommended for a school; ~$5–10/month)

Works on any Ubuntu/Debian server (local Ghanaian hosts included).

```bash
# from your computer, copy the project to the server:
scp -r lga-fees user@your-server:/tmp/lga-fees

# on the server:
ssh user@your-server
sudo bash /tmp/lga-fees/deploy/setup-vps.sh
```

The script installs Node 20 if needed, places the app in `/opt/lga-fees`,
installs dependencies, creates a dedicated `fees` user, and registers a
systemd service — so the app **starts on boot and restarts if it crashes**.
Then open `http://your-server-ip:3000`. For a proper name + free HTTPS,
point a domain at the server with Caddy (2 lines of config; the script
prints the snippet at the end).

### Option B — Render (no server to manage)

1. Put this folder in a GitHub/GitLab repo.
2. render.com → **New → Blueprint** → pick the repo (it finds `render.yaml`).
3. Use at least the **starter** plan: the free plan has no persistent disk
   (data would be lost) and cold-starts after inactivity.

### Option C — Fly.io

```bash
fly launch --no-deploy
fly volumes create fees_data --size 1 --region lhr
fly deploy
```

`fly.toml` is included (London region is closest to Ghana).

### Backups (any option)

- **Easiest:** Admin dashboard → **Export** → **🗄 Download Database Backup**
  (consistent snapshot of the whole database as one file).
- **On the server:** `sqlite3 data/fees.db '.backup /backups/fees-YYYY-MM-DD.db'`
- **Restore:** stop the app, replace `data/fees.db` with the backup, start.

## Tests

```bash
node test/smoke.js     # 24 end-to-end API tests (own temp DB + port)
node test/frontend.js  # 32 UI integration tests (jsdom driving the real page against a live server)
```

## Project layout

```
server/
  index.js       Express app: auth, learners, entries, exports, static files
  db.js          SQLite schema + connection
  auth.js        Login (BAMT / Bursar), bearer-token sessions
  fees.js        Shared fee/class/department constants
  exportPdf.js   PDF receipt (template layout) + multi-entry report
  exportDocx.js  Word (DOCX) report
public/
  index.html     Shell: login, collector dashboard, admin dashboard
  css/styles.css
  js/            constants, API client, UI helpers, collector, admin, app
test/
  smoke.js       API end-to-end tests
  frontend.js    UI integration tests
data/fees.db     SQLite database (created at runtime)
```
