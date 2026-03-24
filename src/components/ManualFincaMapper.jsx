import { useState, useCallback, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api } from '../api'

// ── Constants ──────────────────────────────────────────────────────────────
const CENTER = [-79.5371, 8.9565]
const ZOOM = 16
const LS_KEY = 'manual_fincas'

const CONF_COLORS = {
  0.9: { border: '#22c55e', bg: '#dcfce7', label: 'High' },
  0.7: { border: '#f59e0b', bg: '#fef3c7', label: 'Medium' },
  0.5: { border: '#ef4444', bg: '#fee2e2', label: 'Low' },
}

function confColor(c) {
  if (c >= 0.85) return CONF_COLORS[0.9]
  if (c >= 0.6) return CONF_COLORS[0.7]
  return CONF_COLORS[0.5]
}

// ── DB row → local format ──────────────────────────────────────────────────
function dbToLocal(row) {
  return {
    id: Number(row.id),
    finca: row.finca || '',
    tomo: row.tomo || '',
    folio: row.folio || '',
    notes: row.notes || '',
    confidence: Number(row.confidence),
    lng: Number(row.lng),
    lat: Number(row.lat),
    addedAt: row.added_at,
  }
}

// ── Format date for display ────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return null
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
// localStorage is write-through backup only — DB is source of truth
function saveFincas(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}

function makePin(finca, isSelected, isHovered) {
  const cc = confColor(finca.confidence ?? 0.9)
  const el = document.createElement('div')
  const scale = isSelected ? 1.25 : 1
  el.style.cssText = `
    width:${Math.round(26 * scale)}px;
    height:${Math.round(26 * scale)}px;
    border-radius:50%;
    background:${cc.bg};
    border:2.5px solid ${cc.border};
    box-shadow:0 2px 6px rgba(0,0,0,${isSelected ? 0.45 : 0.3});
    display:flex;align-items:center;justify-content:center;
    font-size:${Math.round(9 * scale)}px;
    font-weight:700;
    color:${cc.border};
    cursor:pointer;
     ${isSelected ? 'outline:3px solid ' + cc.border + '55;' : ''}
  `
  el.textContent = finca.finca || '?'
  return el
}

// ── Empty form state ───────────────────────────────────────────────────────
const EMPTY_FORM = { finca: '', tomo: '', folio: '', notes: '', confidence: '0.9' }

// ══════════════════════════════════════════════════════════════════════════
export default function ManualFincaMapper({ onBack }) {
  // Finca data — start empty, DB load on mount is the source of truth
  const [fincas, setFincas] = useState([])

  // UI state
  const [adding, setAdding] = useState(false)          // crosshair mode
  const [pendingLngLat, setPendingLngLat] = useState(null) // where user clicked
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)     // null = new, id = edit
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Overlay
  const [overlayOpacity, setOverlayOpacity] = useState(0.7)
  const [overlayVisible, setOverlayVisible] = useState(true)

  // Map refs
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})   // id → marker
  const mapReadyRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)

  // Keep latest state in refs so event handlers don't go stale
  const addingRef = useRef(adding)
  useEffect(() => { addingRef.current = adding }, [adding])

  const fincaInputRef = useRef(null)

  // ── Load fincas from DB on mount — DB is source of truth ─────────────────
  useEffect(() => {
    api.getFincas()
      .then(rows => {
        const loaded = rows.map(dbToLocal)
        setFincas(loaded)
        saveFincas(loaded)   // keep localStorage in sync as backup
      })
      .catch(err => {
        console.error('Failed to load from DB:', err)
        // Only fall back to localStorage if DB is unreachable
        try {
          const cached = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
          if (cached.length) setFincas(cached)
        } catch {}
      })
  }, [])

  // ── Map init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: CENTER,
      zoom: ZOOM,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.on('load', () => {
      mapReadyRef.current = true
      setMapReady(true)
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      mapReadyRef.current = false
    }
  }, [])

  // ── Map click handler (ref-based to avoid stale closure) ─────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const handler = (e) => {
      if (!addingRef.current) return
      setPendingLngLat({ lng: e.lngLat.lng, lat: e.lngLat.lat })
      setAdding(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      // focus finca input after render
      setTimeout(() => fincaInputRef.current?.focus(), 50)
    }
    map.on('click', handler)
    return () => map.off('click', handler)
  }, [mapReady])

  // ── Cursor style ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = adding ? 'crosshair' : ''
  }, [adding])

  // ── Markers ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const currentIds = new Set(fincas.map(f => f.id))

    // Remove stale markers
    Object.keys(markersRef.current).forEach(id => {
      if (!currentIds.has(Number(id))) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    })

    fincas.forEach(f => {
      const isSelected = selectedId === f.id
      const isHovered = hoveredId === f.id
      const existing = markersRef.current[f.id]

      if (existing) {
        // Update only visual properties — never touch cssText (would wipe MapLibre's transform)
        const newEl = makePin(f, isSelected, isHovered)
        const oldEl = existing.getElement()
        oldEl.style.background = newEl.style.background
        oldEl.style.border = newEl.style.border
        oldEl.style.color = newEl.style.color
        oldEl.style.boxShadow = newEl.style.boxShadow
        oldEl.textContent = newEl.textContent
      } else {
        const el = makePin(f, isSelected, isHovered)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          handleSelectFinca(f)
        })
        el.addEventListener('mouseenter', () => setHoveredId(f.id))
        el.addEventListener('mouseleave', () => setHoveredId(null))
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([f.lng, f.lat])
          .addTo(map)
        markersRef.current[f.id] = marker
      }
    })
  }, [fincas, selectedId, hoveredId, mapReady])

  // ── Tile overlay (XYZ raster tiles) ──────────────────────────────────────
  const SOURCE_ID = 'historical-tiles'
  const LAYER_ID = 'historical-tiles-layer'

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const cleanup = () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }

    if (!overlayVisible) { cleanup(); return }

    cleanup()
    map.addSource(SOURCE_ID, {
      type: 'raster',
      tiles: ['/tiles/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 15,
      maxzoom: 20,
      attribution: '1964 Catastral Panama',
    })
    map.addLayer({
      id: LAYER_ID,
      type: 'raster',
      source: SOURCE_ID,
      paint: { 'raster-opacity': overlayOpacity },
    })
    return cleanup
  }, [mapReady, overlayVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (map.getLayer(LAYER_ID)) {
      map.setPaintProperty(LAYER_ID, 'raster-opacity', overlayOpacity)
    }
  }, [overlayOpacity, mapReady])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectFinca = useCallback((f) => {
    setSelectedId(f.id)
    setPendingLngLat(null)
    setEditingId(f.id)
    setForm({
      finca: f.finca || '',
      tomo: f.tomo || '',
      folio: f.folio || '',
      notes: f.notes || '',
      confidence: String(f.confidence ?? 0.9),
    })
    setAdding(false)
    mapRef.current?.flyTo({ center: [f.lng, f.lat], zoom: Math.max(mapRef.current.getZoom(), 17) })
  }, [])

  const handleSave = useCallback(() => {
    if (!form.finca.trim()) { fincaInputRef.current?.focus(); return }
    const confidence = parseFloat(form.confidence) || 0.9
    if (editingId !== null && pendingLngLat === null) {
      // Editing existing
      const updated = fincas.find(f => f.id === editingId)
      if (!updated) return
      const point = { ...updated, finca: form.finca, tomo: form.tomo, folio: form.folio, notes: form.notes, confidence }
      setFincas(prev => prev.map(f => f.id === editingId ? point : f))
      // Fire-and-forget API update
      if (localStorage.getItem('finca_token')) {
        api.updateFinca(editingId, point).catch(() => {})
      }
    } else if (pendingLngLat) {
      // New point
      const entry = {
        id: Date.now(),
        finca: form.finca,
        tomo: form.tomo,
        folio: form.folio,
        notes: form.notes,
        confidence,
        lng: pendingLngLat.lng,
        lat: pendingLngLat.lat,
        addedAt: new Date().toISOString(),
      }
      setFincas(prev => [...prev, entry])
      setSelectedId(entry.id)
      // Fire-and-forget API save
      if (localStorage.getItem('finca_token')) {
        api.saveFinca(entry).catch(() => {})
      }
    }
    setPendingLngLat(null)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }, [form, editingId, pendingLngLat, fincas])

  const handleCancel = useCallback(() => {
    setPendingLngLat(null)
    setEditingId(null)
    setSelectedId(null)
    setForm(EMPTY_FORM)
    setAdding(false)
    setDeleteConfirm(false)
  }, [])

  const handleDelete = useCallback(() => {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    const idToDelete = editingId
    setFincas(prev => prev.filter(f => f.id !== idToDelete))
    setPendingLngLat(null)
    setEditingId(null)
    setSelectedId(null)
    setForm(EMPTY_FORM)
    setDeleteConfirm(false)
    // Fire-and-forget API delete
    if (localStorage.getItem('finca_token')) {
      api.deleteFinca(idToDelete).catch(() => {})
    }
  }, [deleteConfirm, editingId])

  const handleExport = useCallback(() => {
    const geojson = {
      type: 'FeatureCollection',
      features: fincas.map(f => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
        properties: {
          finca: f.finca,
          tomo: f.tomo,
          folio: f.folio,
          notes: f.notes,
          confidence: f.confidence,
          addedAt: f.addedAt,
          id: f.id,
        },
      })),
    }
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'manual_fincas.geojson'
    a.click()
  }, [fincas])

  const handleToggleAdding = useCallback(() => {
    setAdding(v => {
      if (!v) {
        // Enter adding mode — clear any open form
        setPendingLngLat(null)
        setEditingId(null)
        setSelectedId(null)
        setForm(EMPTY_FORM)
        setDeleteConfirm(false)
      }
      return !v
    })
  }, [])

  const formVisible = pendingLngLat !== null || editingId !== null

  // ── Back navigation ────────────────────────────────────────────────────
  // If onBack prop is provided (inline mode switcher), use it.
  // If not (standalone /finca route), render a Link to /.
  const backButton = onBack ? (
    <button
      onClick={onBack}
      className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1 transition-colors"
    >
      ← Back
    </button>
  ) : (
    <Link
      to="/"
      className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1 transition-colors"
    >
      ← Home
    </Link>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f5f4f1', fontFamily: 'system-ui, sans-serif' }}>

      {/* ══ MAP (left, fills remaining space) ══════════════════════════════ */}
      <div className="flex-1 relative min-w-0 min-h-0">
        <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

        {/* Pending point crosshair indicator */}
        {pendingLngLat && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/90 shadow border border-stone-200 text-stone-700 pointer-events-none">
            📍 {pendingLngLat.lat.toFixed(6)}, {pendingLngLat.lng.toFixed(6)}
          </div>
        )}


      </div>

      {/* ══ SIDEBAR (right, 320px) ══════════════════════════════════════════ */}
      <div
        className="flex flex-col shrink-0 border-l border-stone-200 bg-white overflow-hidden"
        style={{ width: 320 }}
      >
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2 mb-3">
            {backButton}
            <div className="w-px h-3 bg-stone-200 mx-0.5" />
            <span className="text-xs font-bold uppercase tracking-widest text-stone-400">
              Finca Mapper
            </span>
          </div>
          <h2 className="text-base font-semibold text-stone-800 leading-tight">Manual Finca Mapper</h2>
          <p className="text-xs text-stone-400 mt-0.5">Click map → fill form → save</p>
        </div>

        {/* Toolbar */}
        <div className="shrink-0 px-4 py-2.5 border-b border-stone-100 flex items-center gap-2">
          <button
            onClick={handleToggleAdding}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
              adding
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <span className="text-sm leading-none">＋</span> Add Finca
          </button>

          <button
            onClick={handleExport}
            disabled={fincas.length === 0}
            className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            ↓ Export
          </button>

          <div className="ml-auto flex items-center gap-1">
            <span className="text-xs font-bold text-stone-800">{fincas.length}</span>
            <span className="text-xs text-stone-400">{fincas.length === 1 ? 'finca' : 'fincas'}</span>
          </div>
        </div>

        {/* Overlay controls */}
        <div className="shrink-0 px-4 py-2 border-b border-stone-100 flex items-center gap-2">
          <button
            onClick={() => setOverlayVisible(v => !v)}
            className={`text-xs font-medium px-2.5 py-1 rounded-md transition-all ${
              overlayVisible
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            {overlayVisible ? '🗺 Hide Overlay' : '🗺 Show Overlay'}
          </button>
          {overlayVisible && (
            <label className="flex items-center gap-1.5 text-xs text-stone-500 ml-auto">
              <span>Opacity</span>
              <input
                type="range" min={0} max={1} step={0.05}
                value={overlayOpacity}
                onChange={e => setOverlayOpacity(Number(e.target.value))}
                className="w-16 accent-amber-500"
              />
            </label>
          )}
        </div>

        {/* Adding mode banner */}
        {adding && (
          <div className="shrink-0 mx-3 my-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center gap-2 animate-pulse">
            <span className="text-blue-500 text-sm">✦</span>
            <span className="text-xs font-medium text-blue-700">Click on the map to place a finca</span>
          </div>
        )}

        {/* Add / Edit form */}
        {formVisible && (
          <div className="shrink-0 px-4 py-3 border-b border-stone-100 bg-stone-50">
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2.5">
              {editingId && !pendingLngLat ? 'Edit Finca' : 'New Finca'}
            </div>

            <div className="flex flex-col gap-2">
              {/* Finca No. */}
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-stone-500 font-medium">Finca No. <span className="text-red-400">*</span></label>
                <input
                  ref={fincaInputRef}
                  type="text"
                  value={form.finca}
                  onChange={e => setForm(f => ({ ...f, finca: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="e.g. 2208"
                  className="px-2.5 py-1.5 text-sm rounded-md border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                />
              </div>

              {/* Tomo + Folio on one row */}
              <div className="flex gap-2">
                <div className="flex flex-col gap-0.5 flex-1">
                  <label className="text-xs text-stone-500 font-medium">Tomo No.</label>
                  <input
                    type="text"
                    value={form.tomo}
                    onChange={e => setForm(f => ({ ...f, tomo: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder="e.g. 42"
                    className="px-2.5 py-1.5 text-sm rounded-md border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-0.5 flex-1">
                  <label className="text-xs text-stone-500 font-medium">Folio No.</label>
                  <input
                    type="text"
                    value={form.folio}
                    onChange={e => setForm(f => ({ ...f, folio: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    placeholder="e.g. 154"
                    className="px-2.5 py-1.5 text-sm rounded-md border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                  />
                </div>
              </div>

              {/* Confidence */}
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-stone-500 font-medium">Confidence</label>
                <select
                  value={form.confidence}
                  onChange={e => setForm(f => ({ ...f, confidence: e.target.value }))}
                  className="px-2.5 py-1.5 text-sm rounded-md border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                >
                  <option value="0.9">High</option>
                  <option value="0.7">Medium</option>
                  <option value="0.5">Low</option>
                </select>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-stone-500 font-medium">Notes <span className="text-stone-300">(optional)</span></label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any observations…"
                  rows={2}
                  className="px-2.5 py-1.5 text-sm rounded-md border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all resize-none"
                />
              </div>

              {/* Coords (read-only hint) */}
              {pendingLngLat && (
                <div className="text-xs text-stone-400 font-mono">
                  📍 {pendingLngLat.lat.toFixed(6)}, {pendingLngLat.lng.toFixed(6)}
                </div>
              )}

              {/* Buttons */}
              <div className="flex items-center gap-2 mt-0.5">
                <button
                  onClick={handleSave}
                  disabled={!form.finca.trim()}
                  className="flex-1 py-1.5 text-sm font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 py-1.5 text-sm font-medium rounded-md bg-stone-100 hover:bg-stone-200 text-stone-600 transition-all"
                >
                  Cancel
                </button>
                {editingId && !pendingLngLat && (
                  <button
                    onClick={handleDelete}
                    className={`py-1.5 px-3 text-sm font-medium rounded-md transition-all ${
                      deleteConfirm
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                    }`}
                  >
                    {deleteConfirm ? 'Confirm?' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Points list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {fincas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3 text-stone-300">
              <div className="text-4xl">📋</div>
              <p className="text-sm font-medium text-stone-400">No fincas yet</p>
              <p className="text-xs text-stone-300">Click "+ Add Finca" then click on the map to start placing records</p>
            </div>
          ) : (
            <div className="py-1">
              {fincas.map(f => {
                const cc = confColor(f.confidence ?? 0.9)
                const isSelected = selectedId === f.id
                const isHovered = hoveredId === f.id
                const dateStr = formatDate(f.addedAt)
                return (
                  <button
                    key={f.id}
                    onClick={() => handleSelectFinca(f)}
                    onMouseEnter={() => setHoveredId(f.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`w-full text-left px-4 py-2.5 border-b border-stone-50 transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border-l-2 border-l-blue-500'
                        : isHovered
                        ? 'bg-stone-50'
                        : 'hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                        style={{ background: cc.bg, border: `2px solid ${cc.border}`, color: cc.border }}
                      >
                        {f.finca?.slice(0, 3) || '?'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-semibold text-stone-800 truncate">
                            Finca {f.finca || '—'}
                          </span>
                          {f.tomo && (
                            <span className="text-xs text-stone-400 shrink-0">T{f.tomo}</span>
                          )}
                          {f.folio && (
                            <span className="text-xs text-stone-400 shrink-0">F{f.folio}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-stone-400 font-mono truncate">
                            {f.lat.toFixed(5)}, {f.lng.toFixed(5)}
                          </div>
                          {dateStr && (
                            <span className="text-[10px] text-stone-300 shrink-0">{dateStr}</span>
                          )}
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: cc.bg, color: cc.border }}
                      >
                        {cc.label}
                      </span>
                    </div>
                    {f.notes && (
                      <p className="text-xs text-stone-400 mt-1 ml-7 truncate">{f.notes}</p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-2 border-t border-stone-100 bg-stone-50 flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-stone-400">
            {Object.entries(CONF_COLORS).map(([val, cc]) => (
              <span key={val} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: cc.border }} />
                {cc.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
