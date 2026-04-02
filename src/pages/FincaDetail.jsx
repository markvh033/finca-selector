import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import { api } from '../api'

// ── Mini-map showing the finca pin in context ──────────────────────────────
function FincaMiniMap({ lat, lng, finca }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current || lat == null || lng == null) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [lng, lat],
      zoom: 19,
      interactive: false,   // static — no pan/zoom
      attributionControl: false,
    })

    map.on('load', () => {
      // Historical catastral overlay
      map.addSource('hist', {
        type: 'raster',
        tiles: ['/tiles/{z}/{x}/{y}.png'],
        tileSize: 256, minzoom: 15, maxzoom: 20,
      })
      map.addLayer({ id: 'hist-layer', type: 'raster', source: 'hist',
        paint: { 'raster-opacity': 0.75 } })

      // Finca dot
      const el = document.createElement('div')
      el.style.cssText = `
        width: 14px; height: 14px; border-radius: 50%;
        background: #22c55e; border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      `
      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map)
    })

    mapRef.current = map
    return () => {
      try { map.remove() } catch {}
      mapRef.current = null
    }
  }, [lat, lng])

  if (lat == null || lng == null) return null

  return (
    <div className="relative rounded-xl overflow-hidden border border-stone-200 shadow-sm" style={{ height: 320 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {/* Crosshair overlay to show center */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div style={{
          width: 32, height: 32, position: 'relative', opacity: 0.4,
        }}>
          <div style={{ position:'absolute', top:'50%', left:0, right:0, height:1, background:'#1e293b', transform:'translateY(-50%)' }} />
          <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:1, background:'#1e293b', transform:'translateX(-50%)' }} />
        </div>
      </div>
      {/* Coordinate badge */}
      <div className="absolute bottom-2 left-2 right-2 flex justify-between pointer-events-none">
        <span className="text-[10px] font-mono bg-black/50 text-white px-1.5 py-0.5 rounded">
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </span>
        <span className="text-[10px] font-semibold bg-black/50 text-white px-1.5 py-0.5 rounded">
          Finca {finca}
        </span>
      </div>
    </div>
  )
}

// ── Top carousel: map + uploaded photos ────────────────────────────────────
function TopCarousel({ lat, lng, finca, photo1, photo2, photo3 }) {
  const BASE = import.meta.env.VITE_API_URL || ''
  const photos = [photo1, photo2, photo3].filter(Boolean).map(p => `${BASE}${p}`)
  const slides = ['map', ...photos]   // first slide is always the map
  const [idx, setIdx] = useState(0)

  const prev = () => setIdx(i => (i - 1 + slides.length) % slides.length)
  const next = () => setIdx(i => (i + 1) % slides.length)

  return (
    <div className="relative rounded-xl overflow-hidden border border-stone-200 shadow-sm bg-stone-900" style={{ height: 320 }}>

      {/* Slides */}
      {slides.map((slide, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-300"
          style={{ opacity: i === idx ? 1 : 0, pointerEvents: i === idx ? 'auto' : 'none' }}
        >
          {slide === 'map'
            ? <FincaMiniMap lat={lat} lng={lng} finca={finca} />
            : <img src={slide} alt={`Photo ${i}`} className="w-full h-full object-cover" />
          }
        </div>
      ))}

      {/* Arrows — only show when there's more than one slide */}
      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center transition-all shadow-lg backdrop-blur-sm"
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center transition-all shadow-lg backdrop-blur-sm"
            aria-label="Next"
          >
            ›
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className="transition-all rounded-full"
                style={{
                  width:  i === idx ? 20 : 6,
                  height: 6,
                  background: i === idx ? 'white' : 'rgba(255,255,255,0.5)',
                }}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Slide label */}
          <div className="absolute top-3 left-3 z-30">
            <span className="text-[10px] font-semibold bg-black/50 text-white px-2 py-1 rounded backdrop-blur-sm">
              {idx === 0 ? '🗺 Map' : `📷 Photo ${idx}`}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Field helpers ──────────────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', readOnly = false, placeholder = '' }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{label}</label>
      {readOnly ? (
        <div className="text-sm text-stone-700 py-1">{value || <span className="text-stone-300 italic">—</span>}</div>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="px-3 py-2 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
        />
      )}
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder = '', rows = 3 }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{label}</label>
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="px-3 py-2 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all resize-y"
      />
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-bold text-stone-700 uppercase tracking-widest">{title}</h3>
      {subtitle && <p className="text-xs text-stone-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function Section({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-stone-100 shadow-sm p-5 ${className}`}>
      {children}
    </div>
  )
}

// ── Predefined neighborhoods ───────────────────────────────────────────────
const BARRIOS = [
  'Casco Viejo (San Felipe)',
  'Santa Ana',
  'Barrio Chino',
  'El Chorrillo',
  'La Exposición',
  'Calidonia',
  'Bella Vista',
  'Miraflores',
  'San Francisco',
  'El Cangrejo',
  'Paitilla',
  'Punta Pacífica',
  'Otro',
]

// ── Confidence badge ───────────────────────────────────────────────────────
const CONF_COLORS = {
  high:   { border: '#22c55e', bg: '#dcfce7', label: 'High confidence' },
  medium: { border: '#f59e0b', bg: '#fef3c7', label: 'Medium confidence' },
  low:    { border: '#ef4444', bg: '#fee2e2', label: 'Low confidence' },
}
function confKey(c) {
  const n = Number(c)
  if (n >= 0.85) return 'high'
  if (n >= 0.6)  return 'medium'
  return 'low'
}

// ── Photo slot ─────────────────────────────────────────────────────────────
function PhotoSlot({ slot, url, onUpload, onDelete, uploading }) {
  const BASE = import.meta.env.VITE_API_URL || ''
  const inputRef = useRef(null)
  const fullUrl = url ? `${BASE}${url}` : null

  return (
    <div className="relative group">
      <div
        className={`
          w-full aspect-square rounded-xl border-2 overflow-hidden cursor-pointer transition-all
          ${fullUrl ? 'border-stone-200' : 'border-dashed border-stone-200 hover:border-blue-300 bg-stone-50 hover:bg-blue-50'}
        `}
        onClick={() => !fullUrl && inputRef.current?.click()}
      >
        {uploading ? (
          <div className="flex items-center justify-center h-full text-xs text-stone-400">Uploading…</div>
        ) : fullUrl ? (
          <img src={fullUrl} alt={`Photo ${slot}`} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-1 text-stone-300">
            <span className="text-2xl">📷</span>
            <span className="text-xs">Photo {slot}</span>
          </div>
        )}
      </div>

      {/* Upload / Delete buttons */}
      {!fullUrl && !uploading && (
        <button
          onClick={() => inputRef.current?.click()}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow">Upload</span>
        </button>
      )}
      {fullUrl && !uploading && (
        <button
          onClick={() => onDelete(slot)}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
          title="Remove photo"
        >
          ✕
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) onUpload(slot, [e.target.files[0]]) }}
      />
    </div>
  )
}

// ── PDF Field Map ──────────────────────────────────────────────────────────
const FIELD_MAP = [
  { key: 'finca',               label: 'Finca No.' },
  { key: 'fecha_inscripcion',   label: 'Fecha de Inscripción' },
  { key: 'tomo',                label: 'Tomo' },
  { key: 'folio',               label: 'Folio' },
  { key: 'asiento',             label: 'Asiento' },
  { key: 'rollo',               label: 'Rollo' },
  { key: 'imagen',              label: 'Imagen' },
  { key: 'ficha',               label: 'Ficha' },
  { key: 'documento_redi',      label: 'Documento REDI' },
  { key: 'propietario',         label: 'Propietario' },
  { key: 'domicilio',           label: 'Domicilio' },
  { key: 'uso_del_suelo',       label: 'Uso del Suelo' },
  { key: 'otro_tipo',           label: 'Otro Tipo' },
  { key: 'descripcion_rp',      label: 'Descripción' },
  { key: 'por_edificio',        label: 'Por Edificio' },
  { key: 'proindiviso_pct',     label: '% Proindiviso' },
  { key: 'cedula_catastral',    label: 'Cédula Catastral' },
  { key: 'valor',               label: 'Valor' },
  { key: 'valor_terreno',       label: 'Valor Terreno' },
  { key: 'valor_mejoras',       label: 'Valor Mejoras' },
  { key: 'valor_traspaso',      label: 'Valor Traspaso' },
  { key: 'numero_plano',        label: 'Número de Plano' },
  { key: 'fecha_construccion',  label: 'Fecha Construcción' },
  { key: 'fecha_ocupacion',     label: 'Fecha Ocupación' },
  { key: 'lote',                label: 'Lote' },
  { key: 'superficie_inicial_rp', label: 'Superficie Inicial (RP)' },
  { key: 'superficie_resto_rp',   label: 'Superficie Resto Libre' },
  { key: 'colindancias',        label: 'Colindancias' },
]

// ══════════════════════════════════════════════════════════════════════════
export default function FincaDetail() {
  const { finca: fincaSlug } = useParams()
  // Use slug as the lookup key — backend accepts both finca number and DB id
  const id = fincaSlug
  const navigate = useNavigate()

  const [finca, setFinca] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Photo upload state per slot
  const [photoUploading, setPhotoUploading] = useState({ 1: false, 2: false, 3: false })

  // PDF state
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfExtracted, setPdfExtracted] = useState(null)  // extracted fields pending confirm
  const [editedExtracted, setEditedExtracted] = useState({})
  const pdfInputRef = useRef(null)

  // No overflow patching needed — the root div is its own h-100vh scroll container

  // ── Load finca ───────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    api.getFinca(id)
      .then(data => { setFinca(normalise(data)); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [id])

  function normalise(data) {
    return {
      // identity
      id:                   data.id,
      finca:                data.finca || '',
      // RP legacy
      tomo:                 data.tomo || '',
      folio:                data.folio || '',
      rollo:                data.rollo || '',
      asiento:              data.asiento || '',
      imagen:               data.imagen || '',
      ficha:                data.ficha || '',
      documento_redi:       data.documento_redi || '',
      fecha_inscripcion:    data.fecha_inscripcion || '',
      // property info
      propietario:          data.propietario || '',
      domicilio:            data.domicilio || '',
      uso_del_suelo:        data.uso_del_suelo || '',
      otro_tipo:            data.otro_tipo || '',
      descripcion_rp:       data.descripcion_rp || '',
      por_edificio:         data.por_edificio || '',
      proindiviso_pct:      data.proindiviso_pct || '',
      cedula_catastral:     data.cedula_catastral || '',
      // valuations
      valor:                data.valor || '',
      valor_terreno:        data.valor_terreno || '',
      valor_mejoras:        data.valor_mejoras || '',
      valor_traspaso:       data.valor_traspaso || '',
      // construction
      numero_plano:         data.numero_plano || '',
      fecha_construccion:   data.fecha_construccion || '',
      fecha_ocupacion:      data.fecha_ocupacion || '',
      lote:                 data.lote || '',
      // areas
      superficie_inicial_rp: data.superficie_inicial_rp || '',
      superficie_resto_rp:   data.superficie_resto_rp || '',
      area_m2_map:          data.area_m2_map != null ? String(data.area_m2_map) : '',
      colindancias:         data.colindancias || '',
      // app fields
      descripcion_libre:    data.descripcion_libre || '',
      categoria_patrimonio: data.categoria_patrimonio || '',
      barrio:               data.barrio || '',
      // contact
      contact_nombre:       data.contact_nombre || '',
      contact_email:        data.contact_email || '',
      contact_tel:          data.contact_tel || '',
      // map position
      confidence:           data.confidence || 0.9,
      lng:                  data.lng,
      lat:                  data.lat,
      notes:                data.notes || '',
      // files
      photo_1:              data.photo_1 || null,
      photo_2:              data.photo_2 || null,
      photo_3:              data.photo_3 || null,
      pdf_path:             data.pdf_path || null,
      // audit
      added_at:             data.added_at,
      updated_at:           data.updated_at,
      updated_by:           data.updated_by || '',
    }
  }

  // ── Field updater ────────────────────────────────────────────────────
  const set = useCallback((key) => (val) => setFinca(prev => ({ ...prev, [key]: val })), [])

  // ── Save ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.updateFinca(id, finca)
      setFinca(normalise(updated))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [id, finca])

  // ── Delete ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    try {
      await api.deleteFinca(id)
      navigate('/finca')
    } catch (e) {
      setError(e.message)
    }
  }, [deleteConfirm, id, navigate])

  // ── Photo upload ─────────────────────────────────────────────────────
  const handlePhotoUpload = useCallback(async (_slot, files) => {
    setPhotoUploading(prev => ({ ...prev, [_slot]: true }))
    try {
      const updated = await api.uploadPhotos(id, files)
      setFinca(normalise(updated))
    } catch (e) {
      setError(e.message)
    } finally {
      setPhotoUploading(prev => ({ ...prev, [_slot]: false }))
    }
  }, [id])

  const handlePhotoDelete = useCallback(async (slot) => {
    try {
      const updated = await api.deletePhoto(id, slot)
      setFinca(normalise(updated))
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  // ── PDF upload ───────────────────────────────────────────────────────
  const handlePdfUpload = useCallback(async (file) => {
    setPdfUploading(true)
    setError(null)
    setPdfExtracted(null)
    setEditedExtracted({})
    try {
      const result = await api.uploadPdf(id, file)
      setFinca(prev => ({ ...prev, pdf_path: result.pdf_path }))
      if (result.extracted && Object.values(result.extracted).some(v => v)) {
        setPdfExtracted(result.extracted)
      } else {
        setError('PDF uploaded but no fields could be extracted. The format may not be a standard Registro Público document.')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setPdfUploading(false)
    }
  }, [id])

  // Apply one extracted field
  const applyOneField = useCallback((key) => {
    const val = editedExtracted[key] ?? pdfExtracted?.[key]
    if (val) setFinca(prev => ({ ...prev, [key]: val }))
  }, [editedExtracted, pdfExtracted])

  // Apply all found extracted PDF fields (merge into form)
  const applyExtracted = useCallback(() => {
    if (!pdfExtracted) return
    setFinca(prev => {
      const next = { ...prev }
      FIELD_MAP.forEach(fd => {
        const val = editedExtracted[fd.key] ?? pdfExtracted[fd.key]
        if (val) next[fd.key] = val
      })
      return next
    })
    setPdfExtracted(null)
    setEditedExtracted({})
  }, [pdfExtracted, editedExtracted])

  // ── Format timestamps ────────────────────────────────────────────────
  function fmtDt(iso) {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="text-stone-400 text-sm animate-pulse">Loading finca…</div>
      </div>
    )
  }

  if (!finca) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="text-red-500 text-sm">{error || 'Finca not found'}</div>
      </div>
    )
  }

  const ck = confKey(finca.confidence)
  const cc = CONF_COLORS[ck]
  const BASE = import.meta.env.VITE_API_URL || ''
  const foundCount = pdfExtracted ? FIELD_MAP.filter(fd => pdfExtracted[fd.key]).length : 0

  return (
    <div className="bg-stone-50" style={{ fontFamily: 'system-ui, sans-serif', height: '100vh', overflowY: 'auto', overflowX: 'hidden' }}>

      {/* ── Sticky header bar ─────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate('/finca')}
            className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors font-medium"
          >
            ← Map
          </button>
          <div className="w-px h-5 bg-stone-200" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-bold text-stone-800 truncate">
              Finca {finca.finca || fincaSlug}
            </span>
            {finca.barrio && (
              <span className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full truncate hidden sm:block">
                {finca.barrio}
              </span>
            )}
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
              style={{ background: cc.bg, color: cc.border }}
            >
              {cc.label}
            </span>
          </div>

          {/* Save / Delete actions */}
          <div className="flex items-center gap-2 shrink-0">
            {saved && (
              <span className="text-xs text-green-600 font-semibold hidden sm:block">✓ Saved</span>
            )}
            {error && (
              <span className="text-xs text-red-500 hidden sm:block truncate max-w-48">{error}</span>
            )}
            <button
              onClick={() => { setDeleteConfirm(false) }}
              style={{ display: deleteConfirm ? '' : 'none' }}
              className="text-xs text-stone-400 hover:text-stone-600 px-2 py-1.5"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                deleteConfirm
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-100'
              }`}
            >
              {deleteConfirm ? 'Confirm Delete?' : 'Delete'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-all shadow-sm"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* ── Top carousel: map + photos ── */}
        <TopCarousel
          lat={finca.lat} lng={finca.lng} finca={finca.finca || fincaSlug}
          photo1={finca.photo_1} photo2={finca.photo_2} photo3={finca.photo_3}
        />

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* PDF extracted fields — new UI */}
        {pdfExtracted && (
          <Section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-stone-700 uppercase tracking-widest">📄 Extracted from PDF</h3>
                <p className="text-xs text-stone-400 mt-0.5">Review each field before applying to the form</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  foundCount > FIELD_MAP.length / 2 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {foundCount} / {FIELD_MAP.length} fields found
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 mb-4">
              {/* Found fields */}
              <div>
                <div className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs">✓</span>
                  Found ({foundCount})
                </div>
                <div className="space-y-2">
                  {FIELD_MAP.filter(fd => pdfExtracted[fd.key]).map(fd => (
                    <div key={fd.key} className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                      <span className="text-green-500 text-xs shrink-0">✓</span>
                      <span className="text-xs font-medium text-stone-600 w-32 shrink-0">{fd.label}</span>
                      <input
                        type="text"
                        value={editedExtracted[fd.key] ?? pdfExtracted[fd.key]}
                        onChange={e => setEditedExtracted(prev => ({ ...prev, [fd.key]: e.target.value }))}
                        className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-green-200 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                      <button
                        onClick={() => applyOneField(fd.key)}
                        className="shrink-0 text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 transition-all"
                      >Apply</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Not found fields */}
              <div>
                <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 text-xs">✗</span>
                  Not Found ({FIELD_MAP.length - foundCount})
                </div>
                <div className="space-y-2">
                  {FIELD_MAP.filter(fd => !pdfExtracted[fd.key]).map(fd => (
                    <div key={fd.key} className="flex items-center gap-2 bg-stone-50 border border-stone-100 rounded-lg px-3 py-2">
                      <span className="text-stone-300 text-xs shrink-0">✗</span>
                      <span className="text-xs font-medium text-stone-400 w-32 shrink-0">{fd.label}</span>
                      <span className="text-xs text-stone-300 italic">Not found in PDF</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-stone-100">
              <button
                onClick={applyExtracted}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm"
              >
                Apply All Found Fields
              </button>
              <button
                onClick={() => { setPdfExtracted(null); setEditedExtracted({}) }}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all"
              >
                Dismiss
              </button>
              <span className="text-xs text-stone-400 ml-auto">Values are editable above before applying</span>
            </div>
          </Section>
        )}

        {/* ── Row 1: Key info + Contact ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Key info */}
          <Section>
            <SectionHeader title="Key Info" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Finca No." value={finca.finca} onChange={set('finca')} placeholder="e.g. 25321" />
              <Field label="Folio" value={finca.folio} onChange={set('folio')} placeholder="e.g. 343" />
              <div className="col-span-2">
                <Field label="Propietario / Owner" value={finca.propietario} onChange={set('propietario')} placeholder="Owner name or company" />
              </div>
              <div className="col-span-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Barrio / Neighborhood</label>
                  <select
                    value={finca.barrio || ''}
                    onChange={e => set('barrio')(e.target.value)}
                    className="px-3 py-2 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                  >
                    <option value="">— Select neighborhood —</option>
                    {BARRIOS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Categoria Patrimonio</label>
                  <select
                    value={finca.categoria_patrimonio || ''}
                    onChange={e => set('categoria_patrimonio')(e.target.value)}
                    className="px-3 py-2 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  >
                    <option value="">— Select category —</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Map Confidence</label>
                  <select
                    value={String(finca.confidence)}
                    onChange={e => set('confidence')(parseFloat(e.target.value))}
                    className="px-3 py-2 text-sm rounded-lg border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                  >
                    <option value="0.9">High</option>
                    <option value="0.7">Medium</option>
                    <option value="0.5">Low</option>
                  </select>
                </div>
              </div>
            </div>
          </Section>

          {/* Contact */}
          <Section>
            <SectionHeader title="Contact Info" subtitle="Owner contact details" />
            <div className="flex flex-col gap-4">
              <Field label="Contact Name" value={finca.contact_nombre} onChange={set('contact_nombre')} placeholder="Full name" />
              <Field label="Email" value={finca.contact_email} onChange={set('contact_email')} type="email" placeholder="email@example.com" />
              <Field label="Phone / Tel" value={finca.contact_tel} onChange={set('contact_tel')} type="tel" placeholder="+507 …" />
              <div className="border-t border-stone-100 pt-4">
                <Field label="Domicilio" value={finca.domicilio} onChange={set('domicilio')} placeholder="Address on file" />
              </div>
              <Field label="Uso del Suelo" value={finca.uso_del_suelo} onChange={set('uso_del_suelo')} />
              <Field label="Otro Tipo" value={finca.otro_tipo} onChange={set('otro_tipo')} />
            </div>
          </Section>
        </div>

        {/* ── Areas (2 separate fields) ── */}
        <Section>
          <SectionHeader
            title="Surface Area"
            subtitle="These two values are recorded separately — map measurement vs. Registro Público"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">Area m² — Physical Map</span>
              </div>
              <input
                type="number"
                value={finca.area_m2_map || ''}
                onChange={e => set('area_m2_map')(e.target.value)}
                placeholder="e.g. 721.5"
                className="px-3 py-2 text-sm rounded-lg border border-amber-200 bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
              />
              <p className="text-xs text-stone-400">Measured from the physical catastral map</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full bg-blue-400 shrink-0" />
                <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">Area m² — Registro Público</span>
              </div>
              <input
                type="text"
                value={finca.superficie_inicial_rp || ''}
                onChange={e => set('superficie_inicial_rp')(e.target.value)}
                placeholder="e.g. 721M2.5CM2"
                className="px-3 py-2 text-sm rounded-lg border border-blue-200 bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
              />
              <p className="text-xs text-stone-400">As stated in the Registro Público document</p>
            </div>
          </div>
          <div className="mt-4">
            <Field label="Superficie / Resto Libre (RP)" value={finca.superficie_resto_rp} onChange={set('superficie_resto_rp')} />
          </div>
          <div className="mt-4">
            <TextArea label="Colindancias (Boundaries)" value={finca.colindancias} onChange={set('colindancias')} rows={3}
              placeholder="Norte… Sur… Este… Oeste…" />
          </div>
        </Section>

        {/* ── Registro Público data ── */}
        <Section>
          <SectionHeader title="Registro Público" subtitle="Official registry data — from the RP document" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Tomo" value={finca.tomo} onChange={set('tomo')} placeholder="—" />
            <Field label="Rollo" value={finca.rollo} onChange={set('rollo')} placeholder="—" />
            <Field label="Asiento" value={finca.asiento} onChange={set('asiento')} placeholder="—" />
            <Field label="Imagen" value={finca.imagen} onChange={set('imagen')} placeholder="—" />
            <Field label="Ficha" value={finca.ficha} onChange={set('ficha')} placeholder="—" />
            <Field label="Documento REDI" value={finca.documento_redi} onChange={set('documento_redi')} placeholder="—" />
            <Field label="Fecha Inscripción" value={finca.fecha_inscripcion} onChange={set('fecha_inscripcion')} placeholder="DD/MM/YYYY" />
            <Field label="Cédula Catastral" value={finca.cedula_catastral} onChange={set('cedula_catastral')} placeholder="—" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-stone-100">
            <Field label="Valor" value={finca.valor} onChange={set('valor')} placeholder="0.00" />
            <Field label="Valor del Terreno" value={finca.valor_terreno} onChange={set('valor_terreno')} placeholder="0.00" />
            <Field label="Valor de Mejoras" value={finca.valor_mejoras} onChange={set('valor_mejoras')} placeholder="0.00" />
            <Field label="Valor del Traspaso" value={finca.valor_traspaso} onChange={set('valor_traspaso')} placeholder="0.00" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-stone-100">
            <Field label="Número de Plano" value={finca.numero_plano} onChange={set('numero_plano')} placeholder="—" />
            <Field label="Fecha Construcción" value={finca.fecha_construccion} onChange={set('fecha_construccion')} placeholder="—" />
            <Field label="Fecha Ocupación" value={finca.fecha_ocupacion} onChange={set('fecha_ocupacion')} placeholder="—" />
            <Field label="Lote" value={finca.lote} onChange={set('lote')} placeholder="—" />
            <Field label="Por Edificio" value={finca.por_edificio} onChange={set('por_edificio')} placeholder="—" />
            <Field label="% Proindiviso" value={finca.proindiviso_pct} onChange={set('proindiviso_pct')} placeholder="—" />
          </div>
          <div className="mt-4 pt-4 border-t border-stone-100">
            <TextArea label="Descripción RP" value={finca.descripcion_rp} onChange={set('descripcion_rp')} rows={3} />
          </div>
        </Section>

        {/* ── Free description ── */}
        <Section>
          <SectionHeader title="Description" subtitle="Internal notes and observations about this property" />
          <TextArea
            label="Description / Notes"
            value={finca.descripcion_libre}
            onChange={set('descripcion_libre')}
            rows={5}
            placeholder="Add any specific information about this property…"
          />
          <div className="mt-4">
            <TextArea
              label="Quick Notes (legacy)"
              value={finca.notes}
              onChange={set('notes')}
              rows={2}
            />
          </div>
        </Section>

        {/* ── Photos ── */}
        <Section>
          <SectionHeader title="Photos" subtitle="Upload up to 3 photos for this property" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(slot => (
              <PhotoSlot
                key={slot}
                slot={slot}
                url={finca[`photo_${slot}`]}
                onUpload={handlePhotoUpload}
                onDelete={handlePhotoDelete}
                uploading={photoUploading[slot]}
              />
            ))}
          </div>
        </Section>

        {/* ── PDF Document ── */}
        <Section>
          <SectionHeader title="Registro Público PDF" subtitle="Upload the official RP document — fields can be auto-populated from it" />
          <div className="flex flex-col gap-4">
            {finca.pdf_path ? (
              <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                <span className="text-2xl">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-800">PDF on file</p>
                  <p className="text-xs text-green-600 truncate">{finca.pdf_path}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a
                    href={`${BASE}/api/fincas/${id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-all"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => pdfInputRef.current?.click()}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-green-300 text-green-700 hover:bg-green-100 transition-all"
                  >
                    Replace
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-stone-200 rounded-xl cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-all"
                onClick={() => pdfInputRef.current?.click()}
              >
                <span className="text-3xl mb-2">📤</span>
                <p className="text-sm font-semibold text-stone-600">Upload Registro Público PDF</p>
                <p className="text-xs text-stone-400 mt-1">Click to select a PDF file · Fields will be auto-extracted</p>
              </div>
            )}
            {pdfUploading && (
              <div className="text-xs text-blue-600 animate-pulse text-center">Uploading and parsing PDF…</div>
            )}
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handlePdfUpload(e.target.files[0]) }}
            />
          </div>
        </Section>

        {/* ── Map Location ── */}
        <Section>
          <SectionHeader title="Map Location" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude"  value={finca.lat  != null ? String(finca.lat)  : ''} readOnly />
            <Field label="Longitude" value={finca.lng  != null ? String(finca.lng)  : ''} readOnly />
          </div>
        </Section>

        {/* ── Audit footer ── */}
        <div className="text-xs text-stone-400 flex flex-wrap gap-4 px-1 pb-6">
          <span>Added: {fmtDt(finca.added_at)}</span>
          <span>Last updated: {fmtDt(finca.updated_at)}{finca.updated_by ? ` by ${finca.updated_by}` : ''}</span>
        </div>

      </div>
    </div>
  )
}
