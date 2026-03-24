import { useRef, useEffect, useCallback, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Casco Viejo, Panama City
const CASCO_VIEJO_CENTER = [-79.5336, 8.9522]
const CASCO_VIEJO_ZOOM = 15

const POINT_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

export default function GeoRefMap({
  onGeoClick,
  controlPoints = [],
  pickingState,
  overlayCorners,   // [[lng,lat] x4] for image overlay
  overlayImageUrl,  // base64 or URL of rendered PDF page
  overlayOpacity,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [mapReady, setMapReady] = useState(false)

  // Init map
  useEffect(() => {
    if (mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: CASCO_VIEJO_CENTER,
      zoom: CASCO_VIEJO_ZOOM,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.on('load', () => setMapReady(true))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Click handler
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const handler = (e) => {
      if (pickingState !== 'map') return
      onGeoClick?.({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    }
    map.on('click', handler)
    return () => map.off('click', handler)
  }, [mapReady, pickingState, onGeoClick])

  // Update cursor
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = pickingState === 'map' ? 'crosshair' : ''
  }, [pickingState])

  // Update markers
  useEffect(() => {
    // Remove old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    const map = mapRef.current
    if (!map || !mapReady) return

    controlPoints.forEach((pt, i) => {
      const color = POINT_COLORS[i % POINT_COLORS.length]
      const el = document.createElement('div')
      el.style.cssText = `
        width:20px;height:20px;border-radius:50%;
        background:${color};border:2px solid white;
        box-shadow:0 1px 4px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
        font-size:9px;font-weight:700;color:white;
        pointer-events:none;
      `
      el.textContent = i + 1
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pt.lng, pt.lat])
        .addTo(map)
      markersRef.current.push(marker)
    })
  }, [controlPoints, mapReady])

  // Update overlay
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const SOURCE_ID = 'historical-overlay'
    const LAYER_ID = 'historical-overlay-layer'

    const cleanup = () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
    }

    if (!overlayImageUrl || !overlayCorners) {
      cleanup()
      return
    }

    cleanup()
    map.addSource(SOURCE_ID, {
      type: 'image',
      url: overlayImageUrl,
      coordinates: overlayCorners, // [TL, TR, BR, BL] as [lng, lat]
    })
    map.addLayer({
      id: LAYER_ID,
      type: 'raster',
      source: SOURCE_ID,
      paint: { 'raster-opacity': overlayOpacity ?? 0.6 },
    })
  }, [mapReady, overlayImageUrl, overlayCorners, overlayOpacity])

  const isPicking = pickingState === 'map'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-stone-200 bg-stone-50 flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Casco Viejo — Live Map</span>
        {isPicking && (
          <span className="ml-auto text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full animate-pulse">
            → Click matching landmark
          </span>
        )}
      </div>

      {/* Map */}
      <div ref={containerRef} className="flex-1" />

      {/* Hint */}
      <div className="px-3 py-1 border-t border-stone-200 bg-stone-50 shrink-0">
        <span className="text-xs text-stone-400">OpenStreetMap · Scroll/drag to navigate</span>
      </div>
    </div>
  )
}
