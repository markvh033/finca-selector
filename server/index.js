require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { Pool } = require('pg')

const app = express()
app.use(cors())
app.use(express.json())

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const PORT = process.env.PORT || 3001

const USERS = {
  finca: bcrypt.hashSync('MF@55221!', 10),
}

// ── Auto-migrate on startup ───────────────────────────────────────────────────
async function migrate() {
  await pool.query(`
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
    )
  `)
  console.log('✓ DB migrated')
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// ── Error wrapper ─────────────────────────────────────────────────────────────
const wrap = fn => async (req, res, next) => {
  try { await fn(req, res, next) } catch (e) {
    console.error(e.message)
    res.status(500).json({ error: e.message })
  }
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {}
  const hash = USERS[username]
  if (!hash || !bcrypt.compareSync(password, hash))
    return res.status(401).json({ error: 'Invalid credentials' })
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token })
}))

// ── GET /api/fincas ───────────────────────────────────────────────────────────
app.get('/api/fincas', auth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM finca_points ORDER BY added_at DESC')
  res.json(rows)
}))

// ── POST /api/fincas ──────────────────────────────────────────────────────────
app.post('/api/fincas', auth, wrap(async (req, res) => {
  const { id, finca, tomo, folio, notes, confidence, lng, lat, added_at } = req.body
  await pool.query(
    `INSERT INTO finca_points (id, finca, tomo, folio, notes, confidence, lng, lat, added_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (id) DO UPDATE SET
       finca=EXCLUDED.finca, tomo=EXCLUDED.tomo, folio=EXCLUDED.folio,
       notes=EXCLUDED.notes, confidence=EXCLUDED.confidence,
       lng=EXCLUDED.lng, lat=EXCLUDED.lat, updated_at=NOW()`,
    [id, finca, tomo, folio, notes || '', confidence, lng, lat, added_at || new Date()]
  )
  const { rows } = await pool.query('SELECT * FROM finca_points WHERE id=$1', [id])
  res.json(rows[0])
}))

// ── PUT /api/fincas/:id ───────────────────────────────────────────────────────
app.put('/api/fincas/:id', auth, wrap(async (req, res) => {
  const { finca, tomo, folio, notes, confidence, lng, lat } = req.body
  const { rows } = await pool.query(
    `UPDATE finca_points SET finca=$1,tomo=$2,folio=$3,notes=$4,confidence=$5,lng=$6,lat=$7,updated_at=NOW()
     WHERE id=$8 RETURNING *`,
    [finca, tomo, folio, notes || '', confidence, lng, lat, req.params.id]
  )
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  res.json(rows[0])
}))

// ── DELETE /api/fincas/:id ────────────────────────────────────────────────────
app.delete('/api/fincas/:id', auth, wrap(async (req, res) => {
  await pool.query('DELETE FROM finca_points WHERE id=$1', [req.params.id])
  res.json({ ok: true })
}))

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }))

// ── Boot ──────────────────────────────────────────────────────────────────────
migrate()
  .then(() => app.listen(PORT, () => console.log(`API listening on :${PORT}`)))
  .catch(e => { console.error('Migration failed:', e.message); process.exit(1) })
