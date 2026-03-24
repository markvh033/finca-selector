import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const CASCO_CENTER = [-79.535, 8.952]
const CASCO_ZOOM   = 15

/**
 * Review map for OCR extraction output.
 * Loads fincas.geojson and (optionally) all_text.geojson from the server
 * and renders them as interactive pins.
 */
export default function FincaReviewMap({ onBack }) {
  const containerRef  = useRef(null)
  const mapRef        = useRef(null)
  const [status, setStatus]     = useState('Loading map…')
  const [stats, setStats]       = useState(null)          // { fincas, words }
  const [showWords, setShowWords] = useState(false)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter]     = useState('')
  const [mapReady, setMapReady] = useState(false)

  // Init map
  useEffect(() => {
    if (mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: CASCO_CENTER,
      zoom: CASCO_ZOOM,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.on('load', () => setMapReady(true))
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Load GeoJSONs once map ready
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current

    const load = async () => {
      setStatus('Fetching extraction data…')
      try {
        // ── Finca pins ───────────────────────────────────────────────────
        const fRes = await fetch('/maps/fincas.geojson', { cache: 'no-store' })
        if (!fRes.ok) throw new Error('fincas.geojson not found — run the OCR script first')
        const fincaGJ = await fRes.json()

        map.addSource('fincas', { type: 'geojson', data: fincaGJ })

        // Circle layer
        map.addLayer({
          id: 'fincas-circle',
          type: 'circle',
          source: 'fincas',
          paint: {
            'circle-radius': ['interpolate',['linear'],['zoom'], 13,4, 17,10],
            'circle-color': [
              'interpolate', ['linear'],
              ['coalesce', ['get', 'conf'], ['get', 'confidence'], 0.5],
              0.4, '#ef4444',
              0.7, '#f59e0b',
              0.9, '#22c55e',
            ],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#fff',
          },
        })

        // Label layer
        map.addLayer({
          id: 'fincas-label',
          type: 'symbol',
          source: 'fincas',
          minzoom: 15,
          layout: {
            'text-field': ['concat', 'F-', ['get', 'finca']],
            'text-size': 11,
            'text-offset': [0, -1.4],
            'text-anchor': 'bottom',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': '#1e293b',
            'text-halo-color': '#fff',
            'text-halo-width': 1.5,
          },
        })

        // Click handler
        map.on('click', 'fincas-circle', (e) => {
          const p = e.features[0].properties
          setSelected(p)
        })
        map.on('mouseenter', 'fincas-circle', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'fincas-circle', () => {
          map.getCanvas().style.cursor = ''
        })

        setStats(s => ({ ...s, fincas: fincaGJ.features.length }))
        setStatus(null)

        // ── All-text words (optional) ────────────────────────────────────
        const wRes = await fetch('/maps/all_text.geojson', { cache: 'no-store' })
        if (wRes.ok) {
          const wordGJ = await wRes.json()
          map.addSource('words', { type: 'geojson', data: wordGJ })
          map.addLayer({
            id: 'words-circle',
            type: 'circle',
            source: 'words',
            layout: { visibility: 'none' },
            paint: {
              'circle-radius': 3,
              'circle-color': '#6366f1',
              'circle-opacity': 0.6,
            },
          })
          map.addLayer({
            id: 'words-label',
            type: 'symbol',
            source: 'words',
            minzoom: 16,
            layout: {
              visibility: 'none',
              'text-field': ['get', 'text'],
              'text-size': 9,
              'text-offset': [0, -1.2],
              'text-anchor': 'bottom',
              'text-allow-overlap': false,
            },
            paint: {
              'text-color': '#4338ca',
              'text-halo-color': '#fff',
              'text-halo-width': 1,
            },
          })
          setStats(s => ({ ...s, words: wordGJ.features.length }))
        }
      } catch (err) {
        setStatus(`⚠ ${err.message}`)
      }
    }

    load()
  }, [mapReady])

  // Toggle all-text layer
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (!map.getLayer('words-circle')) return
    const vis = showWords ? 'visible' : 'none'
    map.setLayoutProperty('words-circle', 'visibility', vis)
    map.setLayoutProperty('words-label',  'visibility', vis)
  }, [showWords, mapReady])

  // Filter fincas by ID
  const applyFilter = useCallback(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer('fincas-circle')) return
    if (!filter.trim()) {
      map.setFilter('fincas-circle', null)
      map.setFilter('fincas-label',  null)
    } else {
      const expr = ['in', filter.trim(), ['get', 'finca']]
      map.setFilter('fincas-circle', expr)
      map.setFilter('fincas-label',  expr)
    }
  }, [filter, mapReady])

  useEffect(() => { applyFilter() }, [applyFilter])

  return (
    <div className="flex flex-col h-screen bg-white">

      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-stone-200 bg-white shadow-sm flex-wrap">
        <button onClick={onBack} className="text-sm text-stone-500 hover:text-stone-800">← Back</button>
        <div className="w-px h-5 bg-stone-200" />
        <span className="text-sm font-semibold text-stone-700">Finca Review</span>

        {stats && (
          <div className="flex gap-3 text-xs text-stone-500">
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              {stats.fincas ?? '…'} fincas
            </span>
            {stats.words != null && (
              <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {stats.words} OCR words
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Search */}
        <input
          type="text"
          placeholder="Filter finca #…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="text-sm border border-stone-200 rounded px-2 py-1 w-32 focus:outline-none focus:border-amber-400"
        />

        {/* Show all OCR words toggle */}
        {stats?.words != null && (
          <button
            onClick={() => setShowWords(v => !v)}
            className={`text-sm px-3 py-1.5 rounded font-medium ${
              showWords
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            }`}
          >
            {showWords ? 'Hide all words' : 'Show all OCR words'}
          </button>
        )}

        {/* Reload */}
        <button
          onClick={() => window.location.reload()}
          className="text-sm px-3 py-1.5 rounded bg-stone-100 hover:bg-stone-200 text-stone-600"
        >
          ↺ Reload
        </button>
      </div>

      {/* ── Status banner ── */}
      {status && (
        <div className="shrink-0 px-4 py-2 text-sm bg-amber-50 border-b border-amber-200 text-amber-800">
          {status}
        </div>
      )}

      {/* ── Map + detail panel ── */}
      <div className="flex flex-1 min-h-0">
        <div ref={containerRef} className="flex-1" />

        {/* Detail panel */}
        {selected && (
          <div className="w-64 shrink-0 border-l border-stone-200 bg-white p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-stone-800">Finca details</span>
              <button onClick={() => setSelected(null)} className="text-stone-400 hover:text-stone-600 text-lg leading-none">×</button>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {[
                  ['Finca No.',   selected.finca],
                  ['Tomo No.',    selected.tomo  || '—'],
                  ['Folio No.',   selected.folio || '—'],
                  ['Area (m²)',   selected.area  || '—'],
                  ['Confidence',  selected.conf != null
                    ? `${(selected.conf * 100).toFixed(0)}%`
                    : selected.confidence != null
                    ? `${(selected.confidence * 100).toFixed(0)}%`
                    : '—'],
                  ['PDF px',      `${selected.pdf_px}, ${selected.pdf_py}`],
                ].map(([label, value]) => (
                  <tr key={label} className="border-b border-stone-100">
                    <td className="py-1.5 text-stone-500 pr-2 whitespace-nowrap">{label}</td>
                    <td className="py-1.5 font-mono text-stone-800">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-t border-stone-200 bg-stone-50 text-xs text-stone-500">
        <span className="font-medium">Confidence:</span>
        {[['#ef4444','< 40%'],['#f59e0b','40–70%'],['#22c55e','> 70%']].map(([c,l]) => (
          <span key={l} className="flex items-center gap-1">
            <span style={{background:c,width:10,height:10,borderRadius:'50%',display:'inline-block'}} />
            {l}
          </span>
        ))}
        <span className="ml-4">Click a pin to see details · Zoom in for labels</span>
      </div>
    </div>
  )
}
