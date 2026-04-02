import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { api } from '../api'

// ── Constants ──────────────────────────────────────────────────────────────
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

const CENTER    = [-79.5371, 8.9565]
const ZOOM      = 16
const LS_KEY    = 'manual_fincas'
const MAP_STATE = 'finca_map_state'   // sessionStorage key for zoom/center

const CONF_COLORS = {
  0.9: { border: '#22c55e', bg: '#dcfce7', label: 'High' },
  0.7: { border: '#f59e0b', bg: '#fef3c7', label: 'Medium' },
  0.5: { border: '#ef4444', bg: '#fee2e2', label: 'Low' },
}
function confColor(c) {
  if (c >= 0.85) return CONF_COLORS[0.9]
  if (c >= 0.6)  return CONF_COLORS[0.7]
  return CONF_COLORS[0.5]
}

function dbToLocal(row) {
  return {
    id:          Number(row.id),
    finca:       row.finca       || '',
    tomo:        row.tomo        || '',
    folio:       row.folio       || '',
    notes:       row.notes       || '',
    confidence:  Number(row.confidence),
    lng:         Number(row.lng),
    lat:         Number(row.lat),
    addedAt:     row.added_at,
    propietario: row.propietario || '',
    barrio:      row.barrio      || '',
    area_m2_map:          row.area_m2_map || null,
    superficie_inicial_rp: row.superficie_inicial_rp || null,
    photo_1:     row.photo_1 || null,
    photo_2:     row.photo_2 || null,
    photo_3:     row.photo_3 || null,
    pdf_path:    row.pdf_path || null,
    categoria_patrimonio: row.categoria_patrimonio || '',
  }
}

// 3-way toggle: null=all, true=has, false=hasn't
function FilterGroup({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs text-slate-500 font-medium w-max">{label}:</span>
      <div className="flex rounded border border-slate-300 overflow-hidden">
        <button
          onClick={() => onChange(null)}
          className={`px-2.5 py-1 text-xs font-medium border-r border-slate-300 transition-colors ${value === null ? 'bg-[#005baa] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
        >All</button>
        <button
          onClick={() => onChange(true)}
          className={`px-2.5 py-1 text-xs font-medium border-r border-slate-300 transition-colors ${value === true ? 'bg-[#005baa] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
        >Yes</button>
        <button
          onClick={() => onChange(false)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${value === false ? 'bg-[#005baa] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
        >No</button>
      </div>
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return null
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return null }
}

function saveFincas(list) { localStorage.setItem(LS_KEY, JSON.stringify(list)) }

// ── Pin factory ────────────────────────────────────────────────────────────
function makePin(finca) {
  const cc = confColor(finca.confidence ?? 0.9)

  const outer = document.createElement('div')
  outer.style.cssText = `
    width:32px; height:32px;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer;
  `

  const dot = document.createElement('div')
  dot.className = 'finca-dot'
  dot.dataset.fincaNo = finca.finca || String(finca.id)
  dot.style.cssText = `
    width:10px; height:10px;
    border-radius:50%;
    background:${cc.border};
    border:2px solid white;
    box-shadow:0 1px 4px rgba(0,0,0,0.35);
    display:flex; align-items:center; justify-content:center;
    overflow:hidden;
    font-size:0px;
    font-weight:700;
    color:white;
    white-space:nowrap;
    transition:width 0.15s ease, height 0.15s ease, font-size 0.15s ease, box-shadow 0.15s ease;
  `

  outer.appendChild(dot)
  return outer
}

function pinHoverOn(outer, finca) {
  const dot = outer.querySelector('.finca-dot')
  if (!dot) return
  const label = finca.finca || String(finca.id)
  const w = Math.max(24, 8 + label.length * 8)
  dot.textContent = label
  dot.style.width    = `${w}px`
  dot.style.height   = '24px'
  dot.style.borderRadius = '12px'
  dot.style.fontSize = '10px'
  dot.style.boxShadow = '0 2px 8px rgba(0,0,0,0.45)'
}
function pinHoverOff(outer, isSelected) {
  const dot = outer.querySelector('.finca-dot')
  if (!dot) return
  dot.textContent    = ''
  dot.style.width    = isSelected ? '14px' : '10px'
  dot.style.height   = isSelected ? '14px' : '10px'
  dot.style.borderRadius = '50%'
  dot.style.fontSize = '0px'
  dot.style.boxShadow = `0 1px 4px rgba(0,0,0,${isSelected ? 0.5 : 0.35})`
}
function pinSetSelected(outer, isSelected, cc) {
  const dot = outer.querySelector('.finca-dot')
  if (!dot) return
  dot.style.width     = isSelected ? '14px' : '10px'
  dot.style.height    = isSelected ? '14px' : '10px'
  dot.style.outline   = isSelected ? `3px solid ${cc.border}66` : ''
  dot.style.outlineOffset = isSelected ? '1px' : ''
  dot.style.boxShadow = `0 1px 4px rgba(0,0,0,${isSelected ? 0.5 : 0.35})`
  dot.style.background = cc.border
}

const EMPTY_FORM = { finca: '', tomo: '', folio: '', notes: '', confidence: '0.9' }

// ══════════════════════════════════════════════════════════════════════════
export default function ManualFincaMapper() {
  const navigate = useNavigate()

  const [fincas,   setFincas]   = useState([])
  const [filtered, setFiltered] = useState(null)

  // Quick-add
  const [adding,        setAdding]        = useState(false)
  const [pendingLngLat, setPendingLngLat] = useState(null)
  const [form,          setForm]          = useState(EMPTY_FORM)
  const [saving,        setSaving]        = useState(false)

  // Selected finca
  const [panelFinca, setPanelFinca] = useState(null)
  const panelFincaRef = useRef(null)

  // Overlay
  const [overlayOpacity, setOverlayOpacity] = useState(0.7)
  const [overlayVisible, setOverlayVisible] = useState(true)

  // Attribute filters
  const [filterPhotos,  setFilterPhotos]  = useState(null)
  const [filterPdf,     setFilterPdf]     = useState(null)
  const [filterAreaMap, setFilterAreaMap] = useState(null)
  const [filterAreaRp,  setFilterAreaRp]  = useState(null)
  const [filtersApplied, setFiltersApplied] = useState(false)

  // Search
  const [searchQ,       setSearchQ]       = useState('')
  const [searchBarrio,  setSearchBarrio]  = useState('all')
  const [searchMinArea, setSearchMinArea] = useState('')
  const [searchMaxArea, setSearchMaxArea] = useState('')
  const [searchPatrimonio, setSearchPatrimonio] = useState('')
  const [searchPropietario, setSearchPropietario] = useState('')
  const [barrios,       setBarrios]       = useState([])
  const [searching,     setSearching]     = useState(false)

  // Map refs
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markersRef   = useRef({})
  const mapReadyRef  = useRef(false)
  const [mapReady, setMapReady] = useState(false)

  const addingRef = useRef(adding)
  useEffect(() => { addingRef.current = adding }, [adding])

  useEffect(() => { panelFincaRef.current = panelFinca }, [panelFinca])

  const fincaInputRef = useRef(null)

  // Auto-search when barrio changes
  const barrioInitRef = useRef(false)
  useEffect(() => {
    if (!barrioInitRef.current) { barrioInitRef.current = true; return }
    handleSearch()
  }, [searchBarrio])

  // ── Load fincas + barrios ─────────────────────────────────────────────
  useEffect(() => {
    api.getFincas()
      .then(rows => { const l = rows.map(dbToLocal); setFincas(l); saveFincas(l) })
      .catch(() => {
        try { const c = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); if (c.length) setFincas(c) } catch {}
      })
    api.getBarrios().then(setBarrios).catch(() => {})
  }, [])

  // ── Map init ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    let savedCenter = CENTER
    let savedZoom   = ZOOM
    try {
      const s = JSON.parse(sessionStorage.getItem(MAP_STATE) || 'null')
      if (s?.center && s?.zoom) { savedCenter = s.center; savedZoom = s.zoom }
    } catch {}

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: savedCenter,
      zoom:   savedZoom,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.on('load', () => { mapReadyRef.current = true; setMapReady(true) })
    mapRef.current = map

    return () => {
      try {
        sessionStorage.setItem(MAP_STATE, JSON.stringify({
          center: [map.getCenter().lng, map.getCenter().lat],
          zoom:   map.getZoom(),
        }))
      } catch {}
      mapReadyRef.current = false
      mapRef.current = null
      Object.values(markersRef.current).forEach(m => { try { m.remove() } catch {} })
      markersRef.current = {}
      try { map.remove() } catch {}
    }
  }, [])

  // ── Map click (add mode) ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const handler = (e) => {
      if (!addingRef.current) return
      setPendingLngLat({ lng: e.lngLat.lng, lat: e.lngLat.lat })
      setAdding(false)
      setForm(EMPTY_FORM)
      setTimeout(() => fincaInputRef.current?.focus(), 50)
    }
    map.on('click', handler)
    return () => map.off('click', handler)
  }, [mapReady])

  // ── Cursor style ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = adding ? 'crosshair' : ''
  }, [adding])

  // ── Markers ───────────────────────────────────────────────────────────
  const baseList = filtered !== null ? filtered : fincas
  const displayFincas = filtersApplied ? baseList.filter(f => {
    if (filterPhotos === true  && !(f.photo_1 || f.photo_2 || f.photo_3)) return false
    if (filterPhotos === false && (f.photo_1 || f.photo_2 || f.photo_3))  return false
    if (filterPdf === true     && !f.pdf_path)  return false
    if (filterPdf === false    && f.pdf_path)   return false
    if (filterAreaMap === true  && !f.area_m2_map) return false
    if (filterAreaMap === false && f.area_m2_map)  return false
    if (filterAreaRp === true  && !f.superficie_inicial_rp) return false
    if (filterAreaRp === false && f.superficie_inicial_rp)  return false
    return true
  }) : baseList

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const currentIds = new Set(displayFincas.map(f => f.id))

    Object.keys(markersRef.current).forEach(id => {
      if (!currentIds.has(Number(id))) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    })

    displayFincas.forEach(f => {
      const existing = markersRef.current[f.id]

      if (existing) {
        const isSelected = panelFincaRef.current?.id === f.id
        const cc = confColor(f.confidence ?? 0.9)
        pinSetSelected(existing.getElement(), isSelected, cc)
      } else {
        const outer = makePin(f)
        const cc = confColor(f.confidence ?? 0.9)
        pinSetSelected(outer, false, cc)

        outer.addEventListener('mouseenter', () => pinHoverOn(outer, f))
        outer.addEventListener('mouseleave', () => {
          pinHoverOff(outer, panelFincaRef.current?.id === f.id)
        })

        outer.addEventListener('click', (e) => {
          e.stopPropagation()
          const map = mapRef.current
          if (map) {
            try {
              sessionStorage.setItem(MAP_STATE, JSON.stringify({
                center: [map.getCenter().lng, map.getCenter().lat],
                zoom:   map.getZoom(),
              }))
            } catch {}
          }
          navigate(`/finca/${encodeURIComponent(f.finca?.trim() || f.id)}`)
        })

        const marker = new maplibregl.Marker({ element: outer, anchor: 'center' })
          .setLngLat([f.lng, f.lat])
          .addTo(map)
        markersRef.current[f.id] = marker
      }
    })
  }, [displayFincas, mapReady, navigate])

  // ── Selection ring ────────────────────────────────────────────────────
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const el = marker.getElement()
      const f = displayFincas.find(f => f.id === Number(id))
      if (!f) return
      const cc = confColor(f.confidence ?? 0.9)
      pinSetSelected(el, panelFinca?.id === Number(id), cc)
    })
  }, [panelFinca])

  // ── Tile overlay ──────────────────────────────────────────────────────
  const SOURCE_ID = 'historical-tiles'
  const LAYER_ID  = 'historical-tiles-layer'

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const safeCleanup = () => {
      if (!map.style) return
      try {
        if (map.getLayer(LAYER_ID))   map.removeLayer(LAYER_ID)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      } catch {}
    }
    if (!overlayVisible) { safeCleanup(); return }
    safeCleanup()
    map.addSource(SOURCE_ID, {
      type: 'raster', tiles: ['/tiles/{z}/{x}/{y}.png'],
      tileSize: 256, minzoom: 15, maxzoom: 20,
      attribution: '1964 Catastral Panama',
    })
    map.addLayer({ id: LAYER_ID, type: 'raster', source: SOURCE_ID, paint: { 'raster-opacity': overlayOpacity } })
    return safeCleanup
  }, [mapReady, overlayVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.style) return
    try { if (map.getLayer(LAYER_ID)) map.setPaintProperty(LAYER_ID, 'raster-opacity', overlayOpacity) } catch {}
  }, [overlayOpacity, mapReady])

  // ── Attribute filters ─────────────────────────────────────────────────
  const handleApplyFilters = useCallback(() => {
    setFiltersApplied(true)
  }, [])

  const handleClearFilters = useCallback(() => {
    setFilterPhotos(null)
    setFilterPdf(null)
    setFilterAreaMap(null)
    setFilterAreaRp(null)
    setFiltersApplied(false)
  }, [])

  // ── Search ────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const params = {
      q: searchQ,
      barrio: searchBarrio === 'all' ? '' : searchBarrio,
      min_area: searchMinArea,
      max_area: searchMaxArea,
      patrimonio: searchPatrimonio,
      propietario: searchPropietario,
    }
    const hasFilter = searchQ.trim() || (searchBarrio && searchBarrio !== 'all') || searchMinArea || searchMaxArea || searchPatrimonio || searchPropietario
    if (!hasFilter) { setFiltered(null); return }
    setSearching(true)
    try { setFiltered((await api.searchFincas(params)).map(dbToLocal)) }
    catch (e) { console.error(e) }
    finally { setSearching(false) }
  }, [searchQ, searchBarrio, searchMinArea, searchMaxArea, searchPatrimonio, searchPropietario])

  const handleClearSearch = useCallback(() => {
    setSearchQ(''); setSearchBarrio('all'); setSearchMinArea(''); setSearchMaxArea('');
    setSearchPatrimonio(''); setSearchPropietario('');
    setFiltered(null)
  }, [])

  // ── Quick-add ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!form.finca.trim()) { fincaInputRef.current?.focus(); return }
    if (!pendingLngLat) return
    setSaving(true)
    const entry = {
      id: Date.now(), finca: form.finca, tomo: form.tomo, folio: form.folio,
      notes: form.notes, confidence: parseFloat(form.confidence) || 0.9,
      lng: pendingLngLat.lng, lat: pendingLngLat.lat, addedAt: new Date().toISOString(),
    }
    try { const saved = await api.saveFinca(entry); setFincas(p => [...p, dbToLocal(saved)]) }
    catch { setFincas(p => [...p, entry]) }
    finally { setSaving(false); setPendingLngLat(null); setForm(EMPTY_FORM) }
  }, [form, pendingLngLat])

  // ── Export ────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify({
      type: 'FeatureCollection',
      features: fincas.map(f => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
        properties: { finca: f.finca, tomo: f.tomo, folio: f.folio, id: f.id },
      })),
    }, null, 2)], { type: 'application/geo+json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fincas.geojson'; a.click()
  }, [fincas])

  // ── Navigate to detail ────────────────────────────────────────────────
  const goToDetail = useCallback((f) => {
    const map = mapRef.current
    if (map) {
      try {
        sessionStorage.setItem(MAP_STATE, JSON.stringify({
          center: [map.getCenter().lng, map.getCenter().lat],
          zoom:   map.getZoom(),
        }))
      } catch {}
    }
    const slug = f.finca?.trim() || f.id
    navigate(`/finca/${encodeURIComponent(slug)}`)
  }, [navigate])

  const listFincas = displayFincas

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#f8f9fa', fontFamily: 'system-ui, sans-serif' }}>

      {/* Panama blue top stripe */}
      <div style={{ height: 3, background: '#005baa', flexShrink: 0 }} />

      {/* ── TOP BAR ── */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 py-2 flex flex-col gap-2">
        {/* Row 1 — search inputs */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search finca, owner, neighborhood…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="min-w-[180px] flex-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#005baa] focus:border-[#005baa]"
          />
          <select
            value={searchBarrio}
            onChange={e => setSearchBarrio(e.target.value)}
            className="min-w-[140px] bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#005baa] focus:border-[#005baa]"
          >
            <option value="all">All neighborhoods</option>
            {BARRIOS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input
            type="text"
            placeholder="Owner / propietario…"
            value={searchPropietario}
            onChange={e => setSearchPropietario(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="min-w-[140px] bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#005baa] focus:border-[#005baa]"
          />
          <select
            value={searchPatrimonio}
            onChange={e => setSearchPatrimonio(e.target.value)}
            className="min-w-[160px] bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#005baa] focus:border-[#005baa]"
          >
            <option value="">All patrimonio categories</option>
            <option value="1">Category 1</option>
            <option value="2">Category 2</option>
            <option value="3">Category 3</option>
            <option value="4">Category 4</option>
            <option value="5">Category 5</option>
          </select>
          <span className="text-xs text-slate-500 shrink-0">m²:</span>
          <input
            type="number"
            placeholder="Min"
            value={searchMinArea}
            onChange={e => setSearchMinArea(e.target.value)}
            className="w-16 bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#005baa] focus:border-[#005baa]"
          />
          <span className="text-xs text-slate-300">–</span>
          <input
            type="number"
            placeholder="Max"
            value={searchMaxArea}
            onChange={e => setSearchMaxArea(e.target.value)}
            className="w-16 bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#005baa] focus:border-[#005baa]"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="bg-[#005baa] hover:bg-[#004a8f] text-white text-xs font-medium px-3 py-1.5 rounded disabled:opacity-50 transition-colors"
          >
            {searching ? '…' : 'Search'}
          </button>
          {(filtered !== null || filtersApplied) && (
            <button
              onClick={() => { handleClearSearch(); handleClearFilters(); }}
              className="border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 text-xs font-medium px-3 py-1.5 rounded transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Row 2 — attribute toggle filters */}
        <div className="flex flex-wrap items-center gap-3 pt-1.5 border-t border-slate-100">
          <FilterGroup label="Photos" value={filterPhotos} onChange={setFilterPhotos} />
          <FilterGroup label="PDF" value={filterPdf} onChange={setFilterPdf} />

          <button
            onClick={handleApplyFilters}
            className="bg-[#005baa] hover:bg-[#004a8f] text-white text-xs font-medium px-3 py-1.5 rounded ml-auto transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* ── MAP + SIDEBAR ROW ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── MAP ── */}
        <div className="flex-1 relative min-w-0 min-h-0">
          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

          {pendingLngLat && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded text-xs font-medium bg-white/95 shadow-sm border border-slate-200 text-slate-700 pointer-events-none">
              {pendingLngLat.lat.toFixed(6)}, {pendingLngLat.lng.toFixed(6)}
            </div>
          )}
        </div>

        {/* ── SIDEBAR ── */}
        <div className="flex flex-col shrink-0 border-l border-slate-200 bg-white overflow-hidden" style={{ width: 340 }}>

        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-slate-200 border-l-4 border-l-[#005baa]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Finca Mapper</span>
            <button
              onClick={() => navigate('/backups')}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >Backups</button>
            <button
              onClick={() => { localStorage.removeItem('finca_token'); window.location.href = '/login' }}
              className="text-xs text-slate-400 hover:text-[#b5121b] transition-colors"
            >Sign out</button>
          </div>
          <h2 className="text-sm font-semibold text-slate-800">Panama Fincas</h2>
          <p className="text-xs text-slate-400 mt-0.5">Hover a dot to see the number · Click to go to details</p>
        </div>

        {/* Toolbar */}
        <div className="shrink-0 border-b border-slate-200 px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => { setAdding(v => !v); if (!adding) { setPendingLngLat(null); setForm(EMPTY_FORM) } }}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded transition-colors ${
              adding
                ? 'bg-[#005baa] text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="text-sm leading-none">＋</span> Add Finca
          </button>
          <button
            onClick={handleExport} disabled={fincas.length === 0}
            className="flex items-center gap-1 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >Export</button>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-xs font-semibold text-slate-800">{listFincas.length}</span>
            <span className="text-xs text-slate-500">{filtered !== null ? `/ ${fincas.length}` : (fincas.length === 1 ? 'finca' : 'fincas')}</span>
          </div>
        </div>

        {/* Overlay controls */}
        <div className="shrink-0 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
          <button
            onClick={() => setOverlayVisible(v => !v)}
            className={`text-xs font-medium px-2.5 py-1 rounded transition-colors ${
              overlayVisible
                ? 'bg-slate-700 text-white'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >{overlayVisible ? 'Hide Overlay' : 'Show Overlay'}</button>
          {overlayVisible && (
            <label className="flex items-center gap-1.5 text-xs text-slate-500 ml-auto">
              Opacity
              <input type="range" min={0} max={1} step={0.05} value={overlayOpacity}
                onChange={e => setOverlayOpacity(Number(e.target.value))} className="w-16 accent-[#005baa]" />
            </label>
          )}
        </div>

        {/* Add mode banner */}
        {adding && (
          <div className="shrink-0 bg-blue-50 border border-[#005baa]/30 text-[#005baa] text-xs px-3 py-2 mx-3 my-2 rounded">
            Click on the map to place a new finca pin
          </div>
        )}

        {/* Quick-add form */}
        {pendingLngLat && (
          <div className="shrink-0 px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">New Finca — Quick Add</div>
            <p className="text-xs text-slate-400 mb-2">Basic info now · fill all details on the finca page after saving.</p>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-slate-500 font-medium">Finca No. <span className="text-[#b5121b]">*</span></label>
                <input ref={fincaInputRef} type="text" value={form.finca}
                  onChange={e => setForm(f => ({ ...f, finca: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="e.g. 25321"
                  className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#005baa]" />
              </div>
              <div className="flex gap-2">
                <div className="flex flex-col gap-0.5 flex-1">
                  <label className="text-xs text-slate-500 font-medium">Tomo</label>
                  <input type="text" value={form.tomo} onChange={e => setForm(f => ({ ...f, tomo: e.target.value }))}
                    placeholder="e.g. 42" className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#005baa]" />
                </div>
                <div className="flex flex-col gap-0.5 flex-1">
                  <label className="text-xs text-slate-500 font-medium">Folio</label>
                  <input type="text" value={form.folio} onChange={e => setForm(f => ({ ...f, folio: e.target.value }))}
                    placeholder="e.g. 154" className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#005baa]" />
                </div>
              </div>
              <select value={form.confidence} onChange={e => setForm(f => ({ ...f, confidence: e.target.value }))}
                className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#005baa]">
                <option value="0.9">High confidence</option>
                <option value="0.7">Medium confidence</option>
                <option value="0.5">Low confidence</option>
              </select>
              <div className="text-[10px] text-slate-400 font-mono">{pendingLngLat.lat.toFixed(6)}, {pendingLngLat.lng.toFixed(6)}</div>
              <div className="flex gap-2 mt-0.5">
                <button onClick={handleSave} disabled={!form.finca.trim() || saving}
                  className="flex-1 bg-[#005baa] hover:bg-[#004a8f] text-white rounded py-1.5 text-sm font-medium disabled:opacity-40 transition-colors">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => { setPendingLngLat(null); setForm(EMPTY_FORM); setAdding(false) }}
                  className="flex-1 border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 rounded py-1.5 text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Finca list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {listFincas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
              <p className="text-sm font-medium text-slate-400">{filtered !== null ? 'No results found' : 'No fincas yet'}</p>
              <p className="text-xs text-slate-300">{filtered !== null ? 'Try a different search' : 'Click "+ Add Finca" then click on the map'}</p>
            </div>
          ) : (
            <div>
              {listFincas.map(f => {
                const fc = confColor(f.confidence ?? 0.9)
                const isSelected = panelFinca?.id === f.id
                return (
                  <div key={f.id} className={`border-b border-slate-100 transition-colors ${
                    isSelected ? 'bg-blue-50 border-l-2 border-l-[#005baa]' : 'hover:bg-slate-50'
                  }`}>
                    <button
                      onClick={() => setPanelFinca(f)}
                      className="w-full text-left px-4 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 w-2 h-2 rounded-full" style={{ background: fc.border }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-semibold text-slate-800 truncate">Finca {f.finca || '—'}</span>
                            {f.barrio && <span className="text-xs text-slate-400 shrink-0 truncate">{f.barrio}</span>}
                          </div>
                          {f.propietario && <div className="text-xs text-slate-500 truncate">{f.propietario}</div>}
                          <div className="text-[10px] text-slate-300 font-mono">{f.lat.toFixed(5)}, {f.lng.toFixed(5)}</div>
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0">{fc.label}</span>
                      </div>
                    </button>
                    {isSelected && (
                      <div className="px-4 pb-2.5">
                        <button
                          onClick={() => goToDetail(f)}
                          className="w-full py-1.5 text-xs font-medium rounded bg-[#005baa] hover:bg-[#004a8f] text-white transition-colors"
                        >
                          Details →
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2">
          <div className="flex items-center gap-3">
            {Object.entries(CONF_COLORS).map(([val, c]) => (
              <span key={val} className="flex items-center gap-1 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full" style={{ background: c.border }} />
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      </div>{/* end map+sidebar row */}
    </div>
  )
}
