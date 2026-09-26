# Viheng SO Tracker

A web app that replaces the Excel sales-order tracker. It supports Normal and Project SOs, pasting rows straight from Excel, and importing a whole `.xlsx`, `.xls` or `.csv` file. A live dashboard shows totals, status breakdown, collection progress and flagged issues.

- **Frontend:** React + Vite + TypeScript + Tailwind CSS (`src/`)
- **API:** Cloudflare Pages Functions (`functions/api/`)
- **Database:** Neon Postgres via `@neondatabase/serverless` over HTTP (`db/schema.sql`)
- **Shared code:** field definitions, date/number parsing and validation used by both the frontend and the API (`shared/schema.ts`)

## Features

| Area | What it does |
|---|---|
| Dashboard | Stat tiles for Total SO, Contract Value, Invoiced, Remaining and Collection Rate. Also a status breakdown, an Issues panel (newest flagged first; click an issue to jump to its SO), per-SO collection progress, and an All / Normal / Project filter |
| Sales Orders | Spreadsheet-style grid. Click a cell to edit it: Enter or leaving the cell saves, Esc cancels. Sort on any column, search, and filter by type, status or issue. Overdue deadlines show in red and near deadlines in amber. Editing a cell also sets **Last Update** to today |
| Paste from Excel | Click the paste zone (or press Ctrl+V anywhere on the page), check the preview, then confirm. Rows without headers are mapped by position in the standard column order (listed below). If the paste includes a header row, columns are matched by name instead |
| Import file | **Import file** accepts `.xlsx`, `.xls` or `.csv`. The app finds the header row automatically, even below title rows. It matches each column to a field by fuzzy name (e.g. "Contract Value (USD)" → Contract Value), and you can fix any match from the dropdown above each column. Rows are sent in batches of 200 |
| Import preview | Shows the parsed values, errors per cell and warnings, with pagination. Rows with errors are skipped. When a SO# already exists you can **skip** that row, or **update** the existing SO (only the mapped columns are overwritten) |
| Issues | Click ⚑ on any row to flag it and add a note. Flagged rows are tinted red and appear on the dashboard |
| Project milestones | Click ▸ on a Project row to see its milestones. You can add, rename, set a due date, mark done or delete them, and quick-add Site Survey / Install / UAT / Handover |
| Export | **Export CSV** downloads the rows currently shown, with the current filters and sort |
| Auth | A single passphrase (`APP_PASSPHRASE`). Signing in sets an HMAC-signed session cookie (HttpOnly, Secure, SameSite=Strict) that lasts 30 days. Changing the passphrase signs out every session |

**Standard paste column order:**
Customer, SO#, Lead Time, SO Date, Start Date, Deadline, Product/Service, Contract Value, Invoiced Amt, Invoice Plan, Status, Last Update, Customer Feedback, Internal Notes, Budget Code, Type, Service Type, PIC, Site Location

**Dates:** `05-Mar-2025`, `3/15/2025` (read as `DD/MM` when the first number is greater than 12), `2025-03-15`, `Mar 15, 2025`, and Excel serial numbers.
**Amounts:** `$12,500.00`, `USD 12,500`, `(1,200)` (read as negative). A blank amount counts as 0.
**Statuses:** the six standard statuses, plus loose spellings such as `in-progress`, `on hold`, `canceled`, and `done` (which becomes Delivered).

## API

All routes are under `/api` and use JSON. Every route except login, logout and session needs the session cookie.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/login` · `/api/logout` | `{ "passphrase": "…" }` |
| GET | `/api/session` | `{ authenticated }` |
| GET | `/api/orders` | `?type=normal\|project`, `?status=Pending,On Hold`, `?issue=true`, `?q=search` |
| POST | `/api/orders` | Create one SO. Bad input returns `422` with `details` per field; a duplicate SO# returns `409` |
| POST | `/api/orders/bulk` | An array of rows, or `{ rows, on_conflict: "skip" \| "update" }`, up to 1000 rows per request. Returns `{ results: [{ index, ok, id?, action?, errors? }], created, updated, failed }` |
| GET / PATCH / DELETE | `/api/orders/:id` | PATCH accepts any subset of fields |
| GET / POST | `/api/orders/:id/milestones` | |
| PATCH / DELETE | `/api/milestones/:id` | |
| GET | `/api/dashboard` | `?type=all\|normal\|project` |

`remaining_balance` is computed as `contract_value - invoiced_amt` and is not stored.

## Deploy (GitHub + Cloudflare Pages + Neon)

1. **Neon:** create a project at [neon.tech](https://neon.tech) and copy the **pooled** connection string. Run `db/schema.sql` in the Neon SQL editor. It is safe to re-run.
2. **GitHub:** push this repo.
3. **Cloudflare Pages:** go to Workers & Pages → Create → Pages → Connect to Git and select the repo.
   - Framework preset: *None* (or Vite)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables:** under Settings → Variables and Secrets, set both of these for Production and Preview:
   - `DATABASE_URL`: the Neon pooled connection string
   - `APP_PASSPHRASE`: your login passphrase
5. After that, every push to `main` deploys automatically. The `functions/` directory becomes the API, and only `/api/*` requests run through it.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars          # fill in DATABASE_URL (a Neon branch works well) and APP_PASSPHRASE
npm run build && npm run dev:functions  # API (and built SPA) on http://localhost:8788
npm run dev                             # in another terminal: Vite on http://localhost:5173, proxying /api → :8788
```

### Tests

```bash
npm run typecheck
npm test                                                          # parsing / column-mapping unit tests
TEST_DATABASE_URL=postgres://user:pass@localhost/so_test npm test # also runs the API integration tests
```

The API tests call the Pages Function handlers directly against a real Postgres. They swap the Neon HTTP driver for `pg`, so apply `db/schema.sql` to that test database first.

## Notes

- The schema adds one column to the original brief: `issue_flagged_at`. It is set when an SO is flagged, and the Issues panel sorts by it (newest first).
- `xlsx` is SheetJS's npm build (0.18.5). The browser only loads it when you import a spreadsheet, and it only parses files you select yourself. To use SheetJS's current release, swap the dependency for `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
- Not built yet (nice-to-haves from the brief): email/webhook deadline reminders and a per-SO audit log. CSV export is done.
