-- Viheng SO Tracker schema. Run once in the Neon SQL editor (safe to re-run).

DO $$ BEGIN
  CREATE TYPE so_type AS ENUM ('normal', 'project');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE so_status AS ENUM ('Pending', 'In Progress', 'Delivered', 'On Hold', 'Closed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS sales_orders (
  id                SERIAL PRIMARY KEY,
  so_number         TEXT NOT NULL UNIQUE,
  type              so_type NOT NULL DEFAULT 'normal',
  customer          TEXT NOT NULL,
  product_service   TEXT,
  lead_time         TEXT,
  so_date           DATE,
  start_date        DATE,
  deadline          DATE,
  contract_value    NUMERIC(14,2) DEFAULT 0,
  invoiced_amt      NUMERIC(14,2) DEFAULT 0,
  -- remaining_balance is derived (contract_value - invoiced_amt), not stored
  invoice_plan      TEXT,
  status            so_status NOT NULL DEFAULT 'Pending',
  last_update       DATE,
  customer_feedback TEXT,
  internal_notes    TEXT,
  budget_code       TEXT,

  -- Project-type-only fields (NULL for Normal)
  service_type      TEXT,          -- e.g. Install / Maintenance / Training
  pic               TEXT,          -- person in charge / site contact
  site_location     TEXT,

  -- Issue flag (manual, either type)
  is_issue          BOOLEAN NOT NULL DEFAULT FALSE,
  issue_note        TEXT,
  issue_flagged_at  TIMESTAMPTZ,   -- set when is_issue flips to true; orders the Issues panel

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS milestones (
  id          SERIAL PRIMARY KEY,
  so_id       INTEGER NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,       -- e.g. "Site Survey", "Install", "UAT", "Handover"
  due_date    DATE,
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_milestones_so_id ON milestones(so_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_so_type ON sales_orders(type);
