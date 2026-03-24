import { useState, useCallback, useRef, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import PDFViewer from './PDFViewer'
import GeoRefMap from './GeoRefMap'
import { fitTPS, tpsResiduals, fitInverseTPS } from '../utils/tps'
import { fitAffineTransform, computeResiduals, rmsResidual } from '../utils/transform'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

export default function GeoreferenceApp({ onBack }) {
  const [controlPoints, setControlPoints] = useState(() => {
    try { return JSON.parse(localStorage.getItem('georeference_points') || '[]') }
    catch { return [] }
  })
  const [pickingState, setPickingState] = useState('idle') // idle | pdf | map
  const [pendingPdfPoint, setPendingPdfPoint] = useState(null)
  const [showOverlay, setShowOverlay] = useState(false)
  const [overlayOpacity, setOverlayOpacity] = useState(0.6)
  const [overlayData, setOverlayData] = useState(null) // { imageUrl, corners }
  const [warpProgress, setWarpProgress] = useState(null) // null | 0..1

  // Persist control points
  useEffect(() => {
    localStorage.setItem('georeference_points', JSON.stringify(controlPoints))
  }, [controlPoints])

  // Use TPS when ≥4 points (enough for meaningful warp), affine for 3
  const useTPS = controlPoints.length >= 4
  const tps = useTPS ? fitTPS(controlPoints) : null
  const affine = fitAffineTransform(controlPoints)

  // Residuals: TPS is exact at control pts (near-zero), affine shows fit error
  const residuals = tps
    ? tpsResiduals(tps, controlPoints)
    : affine ? computeResiduals(affine, controlPoints) : []
  const rms = residuals.length >= 3
    ? Math.sqrt(residuals.reduce((s, r) => s + r.residualM ** 2, 0) / residuals.length)
    : null

  // — Picking handlers —

  const startAddPoint = useCallback(() => {
    setPickingState('pdf')
    setPendingPdfPoint(null)
  }, [])

  const cancelPicking = useCallback(() => {
    setPickingState('idle')
    setPendingPdfPoint(null)
  }, [])

  const handlePdfClick = useCallback(({ px, py }) => {
    if (pickingState !== 'pdf') return
    setPendingPdfPoint({ px, py })
    setPickingState('map')
  }, [pickingState])

  const handleGeoClick = useCallback(({ lng, lat }) => {
    if (pickingState !== 'map' || !pendingPdfPoint) return
    const newPoint = { ...pendingPdfPoint, lng, lat, id: Date.now() }
    setControlPoints(pts => [...pts, newPoint])
    setPendingPdfPoint(null)
    setPickingState('idle')
  }, [pickingState, pendingPdfPoint])

  const deletePoint = useCallback((id) => {
    setControlPoints(pts => pts.filter(p => p.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    if (confirm('Delete all control points?')) setControlPoints([])
  }, [])

  // — Overlay —

  const buildOverlay = useCallback(async () => {
    if (!tps && !affine) return
    setWarpProgress(0)
    try {
      const pdf = await pdfjsLib.getDocument('/maps/1964 catastral AVE CENTRAL.pdf').promise
      const page = await pdf.getPage(1)
      const baseVp = page.getViewport({ scale: 1 })
      const maxDim = Math.max(baseVp.width, baseVp.height)

      // Render at 2× for quality source; output at 4096px (4× more detail than before)
      const SCALE = Math.min(2, 10000 / maxDim)
      const viewport = page.getViewport({ scale: SCALE })
      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = Math.round(viewport.width)
      srcCanvas.height = Math.round(viewport.height)
      await page.render({ canvasContext: srcCanvas.getContext('2d'), viewport }).promise

      const displayW = baseVp.width
      const displayH = baseVp.height

      let imageUrl, corners

      if (tps) {
        const invTps = fitInverseTPS(controlPoints)
        // Serialize TPS models for the worker (plain objects, no functions)
        const toSrcArrays = (sp) => sp.map(p => [p.px, p.py])
        const serializeTPS = (m) => ({
          lngModel: { a: m.lngModel.a, w: m.lngModel.w, src: toSrcArrays(m.lngModel.srcPoints) },
          latModel: { a: m.latModel.a, w: m.latModel.w, src: toSrcArrays(m.latModel.srcPoints) },
        })
        const serializeInv = (m) => ({
          pxModel: { a: m.pxModel.a, w: m.pxModel.w, src: toSrcArrays(m.pxModel.srcPoints) },
          pyModel: { a: m.pyModel.a, w: m.pyModel.w, src: toSrcArrays(m.pyModel.srcPoints) },
        })

        // Read source pixels
        const srcCtx = srcCanvas.getContext('2d')
        const srcImageData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)

        const { imageData, width, height, corners: warpedCorners } = await new Promise((resolve, reject) => {
          const worker = new Worker(new URL('../workers/tpsWarp.worker.js', import.meta.url), { type: 'module' })
          worker.onmessage = ({ data }) => {
            if (data.progress !== undefined) {
              setWarpProgress(data.progress)
            } else if (data.error) {
              worker.terminate(); reject(new Error(data.error))
            } else {
              worker.terminate(); resolve(data)
            }
          }
          worker.onerror = (e) => { worker.terminate(); reject(e) }
          worker.postMessage({
            srcImageData: srcImageData.data.buffer,
            srcW: srcCanvas.width,
            srcH: srcCanvas.height,
            srcDisplayW: displayW,
            srcDisplayH: displayH,
            tps: serializeTPS(tps),
            invTps: serializeInv(invTps),
            outputWidth: 8192,
          }, [srcImageData.data.buffer])
        })

        // Convert raw pixel buffer → canvas → data URL
        const offscreen = document.createElement('canvas')
        offscreen.width = width
        offscreen.height = height
        const ctx = offscreen.getContext('2d')
        const imgData = new ImageData(new Uint8ClampedArray(imageData), width, height)
        ctx.putImageData(imgData, 0, 0)
        imageUrl = offscreen.toDataURL('image/png')
        corners = warpedCorners
      } else {
        const { getCornerCoordinates } = await import('../utils/transform')
        imageUrl = srcCanvas.toDataURL('image/png')
        corners = getCornerCoordinates(affine, displayW, displayH)
      }

      setOverlayData({ imageUrl, corners })
      setShowOverlay(true)
    } catch (err) {
      console.error('Overlay build failed:', err)
    }
    setWarpProgress(null)
  }, [tps, affine, controlPoints])

  // — Export —

  const exportPoints = useCallback(() => {
    const data = {
      type: 'georeferencing',
      map: '1964 catastral AVE CENTRAL.pdf',
      exported: new Date().toISOString(),
      transformMode: useTPS ? 'tps' : 'affine',
      affineTransform: affine,
      controlPoints: controlPoints.map((p, i) => ({
        id: i + 1,
        pixel: { x: Math.round(p.px), y: Math.round(p.py) },
        geo: { lng: p.lng, lat: p.lat },
        residualMeters: residuals[i]?.residualM?.toFixed(3),
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'control_points.json'
    a.click()
  }, [controlPoints, affine, useTPS, residuals])

  // Points displayed in PDF viewer: include pending point marker
  const pdfPoints = [
    ...controlPoints,
    ...(pendingPdfPoint ? [{ ...pendingPdfPoint, lng: 0, lat: 0, _pending: true }] : []),
  ]

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-stone-200 bg-white shadow-sm">
        <button
          onClick={onBack}
          className="text-sm text-stone-500 hover:text-stone-800 flex items-center gap-1"
        >
          ← Back
        </button>
        <div className="w-px h-5 bg-stone-200 mx-1" />
        <span className="text-sm font-semibold text-stone-700">Georeference Tool</span>
        <span className="text-xs text-stone-400 hidden sm:block">— align 1964 cadastral map to real coordinates</span>

        <div className="flex-1" />

        {/* Transform mode badge */}
        {(tps || affine) && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${useTPS ? 'bg-purple-100 text-purple-700' : 'bg-stone-100 text-stone-600'}`}>
            {useTPS ? 'TPS warp' : 'Affine'}
          </span>
        )}
        {/* RMS badge */}
        {pickingState === 'idle' && rms !== null && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${useTPS ? 'bg-green-100 text-green-700' : rms < 20 ? 'bg-green-100 text-green-700' : rms < 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
            {useTPS ? `TPS fit ✓` : `RMS: ${rms.toFixed(1)} m`}
          </span>
        )}
        {/* Warp progress */}
        {warpProgress !== null && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            Warping… {Math.round(warpProgress * 100)}%
          </span>
        )}
        {pickingState !== 'idle' && (
          <button
            onClick={cancelPicking}
            className="text-xs px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 text-stone-600"
          >
            Cancel
          </button>
        )}

        {/* Add Point */}
        {pickingState === 'idle' && (
          <button
            onClick={startAddPoint}
            className="text-sm px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-medium flex items-center gap-1.5"
          >
            <span className="text-base leading-none">＋</span> Add Point
          </button>
        )}

        {/* Overlay toggle */}
        <button
          onClick={showOverlay ? () => setShowOverlay(false) : buildOverlay}
          disabled={!tps && !affine || warpProgress !== null}
          className={`text-sm px-3 py-1.5 rounded font-medium ${
            (tps || affine) && warpProgress === null
              ? showOverlay
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              : 'bg-stone-100 text-stone-400 cursor-not-allowed'
          }`}
          title={!tps && !affine ? 'Need 3+ control points' : useTPS ? 'TPS-warped overlay (exact at control points)' : 'Simple affine overlay'}
        >
          {warpProgress !== null ? 'Building…' : showOverlay ? 'Hide Overlay' : 'Preview Overlay'}
        </button>

        {/* Opacity slider (visible when overlay shown) */}
        {showOverlay && (
          <label className="flex items-center gap-1.5 text-xs text-stone-600">
            Opacity
            <input
              type="range" min={0} max={1} step={0.05}
              value={overlayOpacity}
              onChange={e => setOverlayOpacity(Number(e.target.value))}
              className="w-20"
            />
          </label>
        )}

        {/* Export */}
        <button
          onClick={exportPoints}
          disabled={controlPoints.length === 0}
          className="text-sm px-3 py-1.5 rounded bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-40"
        >
          Export JSON
        </button>
      </div>

      {/* ── Picking status banner ── */}
      {pickingState !== 'idle' && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 text-sm font-medium bg-amber-50 border-b border-amber-200 text-amber-800">
          {pickingState === 'pdf'
            ? '① Click a recognizable landmark on the OLD MAP (left)'
            : '② Now click the SAME landmark on the LIVE MAP (right)'}
          <button onClick={cancelPicking} className="text-xs underline ml-2 text-amber-600">cancel</button>
        </div>
      )}

      {/* ── Split view ── */}
      <div className="flex flex-1 min-h-0">
        {/* Left: PDF */}
        <div className="flex-1 min-w-0 border-r border-stone-200">
          <PDFViewer
            onPixelClick={handlePdfClick}
            controlPoints={pdfPoints}
            pickingState={pickingState}
          />
        </div>

        {/* Right: Map */}
        <div className="flex-1 min-w-0">
          <GeoRefMap
            onGeoClick={handleGeoClick}
            controlPoints={controlPoints}
            pickingState={pickingState}
            overlayCorners={showOverlay && overlayData ? overlayData.corners : null}
            overlayImageUrl={showOverlay && overlayData ? overlayData.imageUrl : null}
            overlayOpacity={overlayOpacity}
          />
        </div>
      </div>

      {/* ── Control points table ── */}
      {controlPoints.length > 0 && (
        <div className="shrink-0 border-t border-stone-200 bg-stone-50 max-h-44 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-stone-100">
              <tr>
                <th className="px-3 py-1.5 text-left font-semibold text-stone-500">#</th>
                <th className="px-3 py-1.5 text-left font-semibold text-stone-500">PDF px, py</th>
                <th className="px-3 py-1.5 text-left font-semibold text-stone-500">Lng, Lat</th>
                <th className="px-3 py-1.5 text-left font-semibold text-stone-500">Residual</th>
                <th className="px-3 py-1.5 text-right font-semibold text-stone-500">
                  <button onClick={clearAll} className="text-red-400 hover:text-red-600">Clear all</button>
                </th>
              </tr>
            </thead>
            <tbody>
              {controlPoints.map((pt, i) => {
                const r = residuals[i]
                const colorDot = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'][i % 10]
                return (
                  <tr key={pt.id} className="border-t border-stone-200 hover:bg-white">
                    <td className="px-3 py-1.5">
                      <span style={{ display:'inline-block', width:16, height:16, borderRadius:'50%', background:colorDot, color:'white', fontSize:8, fontWeight:700, textAlign:'center', lineHeight:'16px' }}>{i+1}</span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-stone-600">
                      {Math.round(pt.px)}, {Math.round(pt.py)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-stone-600">
                      {pt.lng.toFixed(6)}, {pt.lat.toFixed(6)}
                    </td>
                    <td className="px-3 py-1.5">
                      {r && (tps || affine) ? (
                        useTPS ? (
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                            exact ✓
                          </span>
                        ) : (
                          <span className={`px-1.5 py-0.5 rounded ${r.residualM < 20 ? 'bg-green-100 text-green-700' : r.residualM < 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                            {r.residualM.toFixed(1)} m
                          </span>
                        )
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() => deletePoint(pt.id)}
                        className="text-stone-400 hover:text-red-500 text-xs"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {controlPoints.length < 3 && (
            <p className="px-3 py-2 text-xs text-stone-400">
              Add {3 - controlPoints.length} more point{3 - controlPoints.length > 1 ? 's' : ''} to compute the transform.
            </p>
          )}
          {controlPoints.length >= 3 && controlPoints.length < 4 && (
            <p className="px-3 py-2 text-xs text-purple-500">
              Add 1 more point to activate TPS warp (exact at all control points, handles local distortions).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
