CREATE TABLE IF NOT EXISTS finca_points (
  id           BIGINT PRIMARY KEY,
  finca        VARCHAR(20),
  tomo         VARCHAR(20),
  folio        VARCHAR(20),
  notes        TEXT    NOT NULL DEFAULT '',
  confidence   NUMERIC(3,2) NOT NULL DEFAULT 0.9,
  lng          DOUBLE PRECISION NOT NULL,
  lat          DOUBLE PRECISION NOT NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
