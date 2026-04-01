require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { Pool } = require('pg')

// pdf-parse@1.1.1 — simple async function: pdfParse(buffer) => { text, ... }
let pdfParse
try { pdfParse = require('pdf-parse') } catch {}

const app = express()
app.use(cors())
app.use(express.json())

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const PORT = process.env.PORT || 3001

// ── Data volume root ───────────────────────────────────────────────────────
const DATA_ROOT = process.env.DATA_ROOT || path.join(__dirname, '..', 'data')
const UPLOADS_ROOT = path.join(DATA_ROOT, 'uploads', 'fincas')
fs.mkdirSync(UPLOADS_ROOT, { recursive: true })

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(DATA_ROOT, 'uploads')))

// ── Multer: photos ─────────────────────────────────────────────────────────
const photoStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOADS_ROOT, String(req.params.id), 'photos')
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `photo_${Date.now()}${ext}`)
  },
})
const uploadPhotos = multer({
  storage: photoStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype))
  },
})

// ── Multer: PDF ────────────────────────────────────────────────────────────
const pdfStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOADS_ROOT, String(req.params.id), 'documents')
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (_req, _file, cb) => {
    cb(null, `registro_publico_${Date.now()}.pdf`)
  },
})
const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf'))
  },
})

// ── DB migration ───────────────────────────────────────────────────────────
async function migrate() {
  // Users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      username     VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name VARCHAR(100),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Core finca table (original)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS finca_points (
      id           BIGINT PRIMARY KEY,
      finca        VARCHAR(20),
      tomo         VARCHAR(20),
      folio        VARCHAR(20),
      notes        TEXT NOT NULL DEFAULT '',
      confidence   NUMERIC(3,2) NOT NULL DEFAULT 0.9,
      lng          DOUBLE PRECISION NOT NULL,
      lat          DOUBLE PRECISION NOT NULL,
      added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Add all new columns idempotently
  const newCols = [
    // RP registry fields
    ['rollo',                'TEXT'],
    ['asiento',              'TEXT'],
    ['imagen',               'TEXT'],
    ['ficha',                'TEXT'],
    ['documento_redi',       'TEXT'],
    ['propietario',          'TEXT'],
    ['domicilio',            'TEXT'],
    ['uso_del_suelo',        'TEXT'],
    ['otro_tipo',            'TEXT'],
    ['descripcion_rp',       'TEXT'],
    ['por_edificio',         'TEXT'],
    ['proindiviso_pct',      'TEXT'],
    ['cedula_catastral',     'TEXT'],
    ['valor',                'TEXT'],
    ['valor_terreno',        'TEXT'],
    ['valor_mejoras',        'TEXT'],
    ['valor_traspaso',       'TEXT'],
    ['numero_plano',         'TEXT'],
    ['fecha_construccion',   'TEXT'],
    ['fecha_ocupacion',      'TEXT'],
    ['lote',                 'TEXT'],
    ['superficie_inicial_rp','TEXT'],
    ['superficie_resto_rp',  'TEXT'],
    ['colindancias',         'TEXT'],
    ['fecha_inscripcion',    'TEXT'],
    // Map / app fields
    ['area_m2_map',          'NUMERIC'],
    ['descripcion_libre',    'TEXT'],
    ['categoria_patrimonio', 'TEXT'],
    ['barrio',               'TEXT'],
    ['contact_nombre',       'TEXT'],
    ['contact_email',        'TEXT'],
    ['contact_tel',          'TEXT'],
    // Files
    ['photo_1',              'TEXT'],
    ['photo_2',              'TEXT'],
    ['photo_3',              'TEXT'],
    ['pdf_path',             'TEXT'],
    // Audit
    ['updated_by',           'TEXT'],
  ]

  for (const [col, type] of newCols) {
    await pool.query(`
      ALTER TABLE finca_points ADD COLUMN IF NOT EXISTS ${col} ${type}
    `)
  }

  // Seed default users if table is empty
  const { rows: existingUsers } = await pool.query('SELECT id FROM users LIMIT 1')
  if (existingUsers.length === 0) {
    const seeds = [
      { username: 'frans',   display: 'Frans',   pwd: process.env.SEED_PWD_FRANS   || generatePwd() },
      { username: 'carlos',  display: 'Carlos',  pwd: process.env.SEED_PWD_CARLOS  || generatePwd() },
      { username: 'elise',   display: 'Elise',   pwd: process.env.SEED_PWD_ELISE   || generatePwd() },
    ]
    for (const u of seeds) {
      const hash = bcrypt.hashSync(u.pwd, 12)
      await pool.query(
        `INSERT INTO users (username, password_hash, display_name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [u.username, hash, u.display]
      )
      console.log(`  👤 User "${u.username}" password: ${u.pwd}`)
    }
  }

  console.log('✓ DB migrated')
}

function generatePwd() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  let pwd = ''
  for (let i = 0; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)]
  }
  return pwd
}

// ── Auth middleware ────────────────────────────────────────────────────────
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

// ── Error wrapper ──────────────────────────────────────────────────────────
const wrap = fn => async (req, res, next) => {
  try { await fn(req, res, next) } catch (e) {
    console.error(e.message)
    res.status(500).json({ error: e.message })
  }
}

// ── Resolve finca URL param → numeric DB id ────────────────────────────────
// Accepts either a finca number string ("136") or a numeric DB id ("1774375764559")
async function resolveDbId(param) {
  // Try finca field first (human-readable number)
  let { rows } = await pool.query(
    'SELECT id FROM finca_points WHERE finca=$1 LIMIT 1', [param]
  )
  if (rows.length) return rows[0].id
  // Fall back to numeric DB id
  ;({ rows } = await pool.query(
    'SELECT id FROM finca_points WHERE id=$1 LIMIT 1', [param]
  ))
  return rows.length ? rows[0].id : null
}

// ── POST /api/auth/login ───────────────────────────────────────────────────
app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {}
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username])
  const user = rows[0]
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' })
  const token = jwt.sign(
    { username: user.username, display_name: user.display_name, user_id: user.id },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
  res.json({ token, display_name: user.display_name })
}))

// ── GET /api/fincas/search ─────────────────────────────────────────────────
// Must be before /api/fincas/:id so 'search' isn't treated as an id
app.get('/api/fincas/search', auth, wrap(async (req, res) => {
  const { q, barrio, min_area, max_area } = req.query
  const conditions = []
  const params = []

  if (q && q.trim()) {
    const like = `%${q.trim().toLowerCase()}%`
    params.push(like)
    conditions.push(`(
      LOWER(finca) LIKE $${params.length} OR
      LOWER(propietario) LIKE $${params.length} OR
      LOWER(barrio) LIKE $${params.length} OR
      LOWER(categoria_patrimonio) LIKE $${params.length} OR
      LOWER(descripcion_libre) LIKE $${params.length} OR
      LOWER(notes) LIKE $${params.length} OR
      LOWER(contact_nombre) LIKE $${params.length} OR
      LOWER(colindancias) LIKE $${params.length} OR
      LOWER(notes) LIKE $${params.length}
    )`)
  }

  if (barrio && barrio !== 'all') {
    params.push(barrio)
    conditions.push(`barrio = $${params.length}`)
  }

  if (min_area) {
    params.push(Number(min_area))
    conditions.push(`area_m2_map >= $${params.length}`)
  }

  if (max_area) {
    params.push(Number(max_area))
    conditions.push(`area_m2_map <= $${params.length}`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await pool.query(
    `SELECT * FROM finca_points ${where} ORDER BY added_at DESC`,
    params
  )
  res.json(rows)
}))

// ── GET /api/fincas ────────────────────────────────────────────────────────
app.get('/api/fincas', auth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM finca_points ORDER BY added_at DESC')
  res.json(rows)
}))

// ── POST /api/fincas ───────────────────────────────────────────────────────
app.post('/api/fincas', auth, wrap(async (req, res) => {
  const { id, finca, tomo, folio, notes, confidence, lng, lat, added_at } = req.body
  await pool.query(
    `INSERT INTO finca_points (id, finca, tomo, folio, notes, confidence, lng, lat, added_at, updated_at, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10)
     ON CONFLICT (id) DO UPDATE SET
       finca=EXCLUDED.finca, tomo=EXCLUDED.tomo, folio=EXCLUDED.folio,
       notes=EXCLUDED.notes, confidence=EXCLUDED.confidence,
       lng=EXCLUDED.lng, lat=EXCLUDED.lat, updated_at=NOW(),
       updated_by=EXCLUDED.updated_by`,
    [id, finca, tomo, folio, notes || '', confidence, lng, lat,
     added_at || new Date(), req.user?.username || null]
  )
  const { rows } = await pool.query('SELECT * FROM finca_points WHERE id=$1', [id])
  res.json(rows[0])
}))

// ── GET /api/fincas/:id — accepts either numeric DB id or finca number string ──
app.get('/api/fincas/:id', auth, wrap(async (req, res) => {
  const param = req.params.id
  // Try by finca field first (the human-readable number), then fall back to DB id
  let rows
  ;({ rows } = await pool.query('SELECT * FROM finca_points WHERE finca=$1 LIMIT 1', [param]))
  if (!rows.length) {
    ;({ rows } = await pool.query('SELECT * FROM finca_points WHERE id=$1', [param]))
  }
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  res.json(rows[0])
}))

// ── PUT /api/fincas/:id ────────────────────────────────────────────────────
app.put('/api/fincas/:id', auth, wrap(async (req, res) => {
  const dbId = await resolveDbId(req.params.id)
  if (!dbId) return res.status(404).json({ error: 'Not found' })
  const f = req.body
  const { rows } = await pool.query(`
    UPDATE finca_points SET
      finca=$1, tomo=$2, folio=$3, notes=$4, confidence=$5, lng=$6, lat=$7,
      rollo=$8, asiento=$9, imagen=$10, ficha=$11, documento_redi=$12,
      propietario=$13, domicilio=$14, uso_del_suelo=$15, otro_tipo=$16,
      descripcion_rp=$17, por_edificio=$18, proindiviso_pct=$19,
      cedula_catastral=$20, valor=$21, valor_terreno=$22, valor_mejoras=$23,
      valor_traspaso=$24, numero_plano=$25, fecha_construccion=$26,
      fecha_ocupacion=$27, lote=$28, superficie_inicial_rp=$29,
      superficie_resto_rp=$30, colindancias=$31, fecha_inscripcion=$32,
      area_m2_map=$33, descripcion_libre=$34, categoria_patrimonio=$35,
      barrio=$36, contact_nombre=$37, contact_email=$38, contact_tel=$39,
      updated_at=NOW(), updated_by=$40
    WHERE id=$41 RETURNING *`,
    [
      f.finca, f.tomo, f.folio, f.notes || '', f.confidence, f.lng, f.lat,
      f.rollo, f.asiento, f.imagen, f.ficha, f.documento_redi,
      f.propietario, f.domicilio, f.uso_del_suelo, f.otro_tipo,
      f.descripcion_rp, f.por_edificio, f.proindiviso_pct,
      f.cedula_catastral, f.valor, f.valor_terreno, f.valor_mejoras,
      f.valor_traspaso, f.numero_plano, f.fecha_construccion,
      f.fecha_ocupacion, f.lote, f.superficie_inicial_rp,
      f.superficie_resto_rp, f.colindancias, f.fecha_inscripcion,
      f.area_m2_map || null, f.descripcion_libre, f.categoria_patrimonio,
      f.barrio, f.contact_nombre, f.contact_email, f.contact_tel,
      req.user?.username || null,
      dbId,
    ]
  )
  if (!rows.length) return res.status(404).json({ error: 'Not found' })
  res.json(rows[0])
}))

// ── DELETE /api/fincas/:id ─────────────────────────────────────────────────
app.delete('/api/fincas/:id', auth, wrap(async (req, res) => {
  const dbId = await resolveDbId(req.params.id)
  if (!dbId) return res.status(404).json({ error: 'Not found' })
  await pool.query('DELETE FROM finca_points WHERE id=$1', [dbId])
  res.json({ ok: true })
}))

// ── POST /api/fincas/:id/photos ────────────────────────────────────────────
app.post('/api/fincas/:id/photos', auth, uploadPhotos.array('photos', 3), wrap(async (req, res) => {
  if (!req.files || req.files.length === 0)
    return res.status(400).json({ error: 'No files uploaded' })

  const dbId = await resolveDbId(req.params.id)
  if (!dbId) return res.status(404).json({ error: 'Not found' })

  const { rows } = await pool.query('SELECT photo_1,photo_2,photo_3 FROM finca_points WHERE id=$1', [dbId])
  const current = [rows[0].photo_1, rows[0].photo_2, rows[0].photo_3]
  // Path must match what multer used as directory (req.params.id), not the resolved dbId
  const newPaths = req.files.map(f => `/uploads/fincas/${req.params.id}/photos/${f.filename}`)

  for (const p of newPaths) {
    const slot = current.findIndex(s => !s)
    if (slot !== -1) current[slot] = p
  }

  await pool.query(
    `UPDATE finca_points SET photo_1=$1, photo_2=$2, photo_3=$3, updated_at=NOW(), updated_by=$4 WHERE id=$5`,
    [current[0], current[1], current[2], req.user?.username || null, dbId]
  )

  const { rows: updated } = await pool.query('SELECT * FROM finca_points WHERE id=$1', [dbId])
  res.json(updated[0])
}))

// ── DELETE /api/fincas/:id/photos/:slot ────────────────────────────────────
app.delete('/api/fincas/:id/photos/:slot', auth, wrap(async (req, res) => {
  const slot = parseInt(req.params.slot)
  if (![1,2,3].includes(slot)) return res.status(400).json({ error: 'Invalid slot' })

  const dbId = await resolveDbId(req.params.id)
  if (!dbId) return res.status(404).json({ error: 'Not found' })

  const col = `photo_${slot}`
  const { rows } = await pool.query(`SELECT ${col} FROM finca_points WHERE id=$1`, [dbId])
  const filePath = rows[0]?.[col]
  if (filePath) {
    const abs = path.join(DATA_ROOT, 'uploads', filePath.replace('/uploads/', ''))
    try { fs.unlinkSync(abs) } catch {}
  }

  await pool.query(
    `UPDATE finca_points SET ${col}=NULL, updated_at=NOW(), updated_by=$1 WHERE id=$2`,
    [req.user?.username || null, dbId]
  )

  const { rows: updated } = await pool.query('SELECT * FROM finca_points WHERE id=$1', [dbId])
  res.json(updated[0])
}))

// ── POST /api/fincas/:id/pdf ───────────────────────────────────────────────
app.post('/api/fincas/:id/pdf', auth, uploadPdf.single('pdf'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' })

  const dbId = await resolveDbId(req.params.id)
  if (!dbId) return res.status(404).json({ error: 'Not found' })

  // Path must match multer destination (req.params.id), not the resolved dbId
  const relativePath = `/uploads/fincas/${req.params.id}/documents/${req.file.filename}`

  await pool.query(
    `UPDATE finca_points SET pdf_path=$1, updated_at=NOW(), updated_by=$2 WHERE id=$3`,
    [relativePath, req.user?.username || null, dbId]
  )

  let extracted = {}
  if (pdfParse) {
    try {
      const buffer = fs.readFileSync(req.file.path)
      const data = await pdfParse(buffer)
      const text = data.text || ''
      console.log(`PDF text extracted: ${text.length} chars`)
      if (text.length > 10) extracted = parseRegistroPublico(text)
    } catch (e) {
      console.error('PDF parse error:', e.message)
    }
  }

  res.json({ pdf_path: relativePath, extracted })
}))

// ── GET /api/fincas/:id/pdf ────────────────────────────────────────────────
app.get('/api/fincas/:id/pdf', auth, wrap(async (req, res) => {
  const dbId = await resolveDbId(req.params.id)
  if (!dbId) return res.status(404).json({ error: 'Not found' })

  const { rows } = await pool.query('SELECT pdf_path, finca FROM finca_points WHERE id=$1', [dbId])
  if (!rows.length || !rows[0].pdf_path)
    return res.status(404).json({ error: 'No PDF found' })

  const abs = path.join(DATA_ROOT, 'uploads', rows[0].pdf_path.replace('/uploads/', ''))
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File not found on disk' })

  res.download(abs, `finca_${rows[0].finca || dbId}.pdf`)
}))

// ── PDF field extraction ───────────────────────────────────────────────────
// The Registro Público PDF renders as a two-column table. pdf-parse reads it
// left-to-right so the left column (labels) all appear BEFORE the right column
// (values) in the extracted text. We parse them separately and zip them.
function parseRegistroPublico(rawText) {
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // ── 1. Always-reliable pattern extractions ──────────────────────────────
  const fincaMatch  = text.match(/Folio Real N[oº°]\s*(\d+)/i)
  const fechaMatch  = text.match(/(\d{2}\/\d{2}\/\d{4})/)  // first date in doc
  const surfMatch   = text.match(/Superficie\s*inicial\s*[:\-]?\s*([0-9][^.\n]*(?:\.[0-9][^.\n]*)?)/i)
  const restoMatch  = text.match(/Resto\s*libre\s*[:\-]?\s*([0-9][^.\n]*(?:\.[0-9][^.\n]*)?)/i)

  // Owner: line ending with "(Propiedad)" or "(Co-propiedad)"
  const ownerMatch  = text.match(/^([A-ZÁÉÍÓÚÑ][^\n]+)\s*\((?:Co-)?[Pp]ropiedad\)/m)
  // Also try: line after "Propiedad a favor de" in the Registro Electrónico section
  const ownerMatch2 = text.match(/Propiedad a favor de ([A-ZÁÉÍÓÚÑ][^\n(]+)\s*Asiento/i)

  const propietario = ownerMatch
    ? ownerMatch[1].trim()
    : ownerMatch2
    ? ownerMatch2[1].trim()
    : null

  // Values that appear as standalone numbers or short codes
  function findAfterLabel(labelRe, valueRe) {
    const idx = lines.findIndex(l => labelRe.test(l))
    if (idx === -1) return null
    for (let i = idx + 1; i < Math.min(idx + 5, lines.length); i++) {
      if (valueRe.test(lines[i])) return lines[i].trim()
    }
    return null
  }

  // ── 2. Two-column table: labels block + values block ────────────────────
  // The DATOS DEL FOLIO / DATOS DEL INMUEBLE sections have labels on the left.
  // After the label block comes a separator ("Datos Generales" or "DATOS DEL FOLIO"),
  // then the actual values follow in the same order.

  // Known label names in order (as they appear in the left column)
  const LABEL_NAMES = [
    'FOLIO / FINCA / FICHA:',
    'FECHA DE INSCRIPCIÓN:',
    // Sistema registral anterior
    'TOMO:', 'FOLIO:', 'ASIENTO:', 'ROLLO:', 'IMAGEN:', 'FICHA:', 'DOCUMENTO REDI:',
    // Inmueble
    'PROPIETARIO:', 'DOMICILIO:', 'USO DEL SUELO:', 'OTRO TIPO:', 'DESCRIPCIÓN:',
    'POR EDIFICIO:', '% DE PROINDIVISO:', 'CÉDULA CATASTRAL:',
    'VALOR:', 'VALOR DEL TERRENO:', 'VALOR DE MEJORAS:', 'VALOR DEL TRASPASO:',
    'NÚMERO DE PLANO:', 'FECHA DE CONSTRUCCIÓN:', 'FECHA DE OCUPACIÓN:', 'LOTE:',
    'SUPERFICIE INICIAL:', 'SUPERFICIE / RESTO LIBRE:', 'COLINDANCIAS:',
  ]

  // Find where the value block starts — look for the first real value line
  // (the section title "Datos Generales" / "DATOS DEL FOLIO" appears at the split point)
  const splitIdx = lines.findIndex(l =>
    /^Datos Generales$/i.test(l) || /^DATOS DEL FOLIO$/i.test(l)
  )

  // Collect label positions
  const labelPositions = []
  lines.forEach((l, i) => {
    const isLabel = LABEL_NAMES.some(name =>
      l.toUpperCase().startsWith(name.toUpperCase().replace(/:$/, ''))
    )
    if (isLabel) labelPositions.push(i)
  })

  // Value lines come AFTER the split point, excluding section headers
  const SECTION_HEADERS = /^(Datos Generales|DATOS DEL FOLIO|DATOS DEL SISTEMA|DATOS DEL INMUEBLE|Folios|Registro|Prelación|Derechos|Asiento|Propiedad a|Hipoteca|Secuestro|MIGRACIÓN)/i
  const valueLines = lines
    .slice(splitIdx > 0 ? splitIdx : Math.ceil(lines.length / 2))
    .filter(l => !SECTION_HEADERS.test(l) && !LABEL_NAMES.some(n => l.toUpperCase().startsWith(n.toUpperCase().replace(/:$/, ''))))

  // Zip: first value → FOLIO/FINCA/FICHA, second → FECHA INSCRIPCION, etc.
  // But many fields may be empty. We use pattern matching to assign values to correct slots.
  const fieldOrder = [
    'header', 'fecha_inscripcion', 'tomo', 'folio', 'asiento', 'rollo',
    'imagen', 'ficha', 'documento_redi', 'propietario', 'domicilio',
    'uso_del_suelo', 'otro_tipo', 'descripcion_rp', 'por_edificio',
    'proindiviso_pct', 'cedula_catastral', 'valor', 'valor_terreno',
    'valor_mejoras', 'valor_traspaso', 'numero_plano', 'fecha_construccion',
    'fecha_ocupacion', 'lote', 'superficie_inicial_rp', 'superficie_resto_rp',
    'colindancias'
  ]

  // Build a result map using the reliable extractions first, then fill gaps from valueLines
  const result = {}

  // Reliable direct extractions
  if (fincaMatch)   result.finca              = fincaMatch[1]
  if (fechaMatch)   result.fecha_inscripcion  = fechaMatch[1]
  if (propietario)  result.propietario        = propietario
  if (surfMatch)    result.superficie_inicial_rp = surfMatch[1].trim()
  if (restoMatch)   result.superficie_resto_rp   = restoMatch[1].trim()

  // Asiento / Rollo — typically small integers (1–9999)
  const asientoVal = findAfterLabel(/^ASIENTO:/i, /^\d{1,6}$/)
  const rolloVal   = findAfterLabel(/^ROLLO:/i,   /^\d{1,6}$/)
  if (asientoVal) result.asiento = asientoVal
  if (rolloVal)   result.rollo   = rolloVal

  // Domicilio — long address line, appears after propietario in the value block
  if (propietario) {
    const ownerIdx = valueLines.findIndex(l => l.includes(propietario.split(' ')[0]))
    if (ownerIdx !== -1 && valueLines[ownerIdx + 1]) {
      result.domicilio = valueLines[ownerIdx + 1]
    }
  }

  // Numeric values: valor, valor_terreno, valor_mejoras, valor_traspaso
  const numericVals = valueLines.filter(l => /^\d{4,}(\.\d+)?$/.test(l))
  if (numericVals[0]) result.valor          = numericVals[0]
  if (numericVals[1]) result.valor_terreno  = numericVals[1]
  if (numericVals[2]) result.valor_mejoras  = numericVals[2]
  if (numericVals[3]) result.valor_traspaso = numericVals[3]

  // Colindancias — multi-line boundary description, usually starts with NORTE/SUR/ESTE
  const colIdx = valueLines.findIndex(l => /^NORTE|^SUR\s|^ESTE\s|^OESTE\s/i.test(l))
  if (colIdx !== -1) {
    result.colindancias = valueLines.slice(colIdx, colIdx + 4).join(' ')
  }

  // Surface in m² format: "721.5m²" style
  const m2Lines = valueLines.filter(l => /\d+[.,]\d+\s*m[²2]/i.test(l) || /^\d+[.,]\d+m2/i.test(l))
  if (!result.superficie_inicial_rp && m2Lines[0]) result.superficie_inicial_rp = m2Lines[0]
  if (!result.superficie_resto_rp   && m2Lines[1]) result.superficie_resto_rp   = m2Lines[1]

  return result
}

// ── GET /api/fincas/barrios ────────────────────────────────────────────────
app.get('/api/barrios', auth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT barrio FROM finca_points WHERE barrio IS NOT NULL AND barrio != '' ORDER BY barrio`
  )
  res.json(rows.map(r => r.barrio))
}))

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }))

// ── Boot ───────────────────────────────────────────────────────────────────
migrate()
  .then(() => app.listen(PORT, () => console.log(`API listening on :${PORT}`)))
  .catch(e => { console.error('Migration failed:', e.message); process.exit(1) })
