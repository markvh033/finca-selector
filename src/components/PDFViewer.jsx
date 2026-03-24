import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

const PDF_URL = '/maps/1964 catastral AVE CENTRAL.pdf'
const MAX_CANVAS_DIM = 6000 // cap to avoid browser canvas size limits

const POINT_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

export default function PDFViewer({ onPixelClick, controlPoints = [], pickingState }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const canvasRef = useRef(null)
  const [pageSize, setPageSize] = useState({ w: 0, h: 0 }) // CSS display size
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const dragging = useRef(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const handleCanvasClickRef = useRef(null)

  // Load and render PDF
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const pdf = await pdfjsLib.getDocument(PDF_URL).promise
        const page = await pdf.getPage(1)

        if (cancelled) return

        // Calculate render scale to stay within canvas size limits
        const baseViewport = page.getViewport({ scale: 1 })
        const maxDim = Math.max(baseViewport.width, baseViewport.height)
        const RENDER_SCALE = Math.min(2, MAX_CANVAS_DIM / maxDim)

        const viewport = page.getViewport({ scale: RENDER_SCALE })
        const canvas = canvasRef.current
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)

        // CSS display size equals natural PDF units (1 PDF pt = 1 display px)
        const displayW = baseViewport.width
        const displayH = baseViewport.height
        // Scale canvas element to display at PDF-unit size
        canvas.style.width = Math.round(displayW) + 'px'
        canvas.style.height = Math.round(displayH) + 'px'

        const ctx = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport }).promise

        if (cancelled) return
        setPageSize({ w: displayW, h: displayH })

        // Fit to container
        const outer = outerRef.current
        if (outer) {
          const { width, height } = outer.getBoundingClientRect()
          const fitZoom = Math.min(width / displayW, height / displayH) * 0.95
          const initX = (width - displayW * fitZoom) / 2
          const initY = (height - displayH * fitZoom) / 2
          setView({ x: initX, y: initY, zoom: fitZoom })
        }
        setLoading(false)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Zoom toward cursor
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const outer = outerRef.current
    if (!outer) return
    const rect = outer.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    setView(v => {
      const newZoom = Math.max(0.1, Math.min(20, v.zoom * factor))
      const scale = newZoom / v.zoom
      return {
        zoom: newZoom,
        x: mouseX - scale * (mouseX - v.x),
        y: mouseY - scale * (mouseY - v.y),
      }
    })
  }, [])

  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // Pan via drag
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    dragging.current = { startX: e.clientX, startY: e.clientY, startView: viewRef.current }
    e.preventDefault()
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return
      const dx = e.clientX - dragging.current.startX
      const dy = e.clientY - dragging.current.startY
      const { x, y } = dragging.current.startView
      setView(v => ({ ...v, x: x + dx, y: y + dy }))
    }
    const onUp = (e) => {
      if (!dragging.current) return
      const dx = Math.abs(e.clientX - dragging.current.startX)
      const dy = Math.abs(e.clientY - dragging.current.startY)
      dragging.current = null
      // If barely moved, treat as click
      if (dx < 5 && dy < 5) handleCanvasClickRef.current?.(e)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCanvasClick = useCallback((e) => { // eslint-disable-line react-hooks/exhaustive-deps
    if (!onPixelClick) return
    const outer = outerRef.current
    if (!outer) return
    const rect = outer.getBoundingClientRect()
    const v = viewRef.current
    // Invert CSS transform: translate(v.x, v.y) scale(v.zoom) with origin (0,0)
    const px = (e.clientX - rect.left - v.x) / v.zoom
    const py = (e.clientY - rect.top - v.y) / v.zoom
    if (px < 0 || py < 0 || px > pageSize.w || py > pageSize.h) return
    onPixelClick({ px, py })
  }, [onPixelClick, pageSize])
  handleCanvasClickRef.current = handleCanvasClick

  const isPicking = pickingState === 'pdf'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-stone-200 bg-stone-50 flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">1964 Cadastral Map</span>
        {isPicking && (
          <span className="ml-auto text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full animate-pulse">
            ← Click a landmark
          </span>
        )}
      </div>

      {/* Viewer */}
      <div
        ref={outerRef}
        className={`flex-1 relative overflow-hidden bg-stone-100 select-none ${isPicking ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onMouseDown={onMouseDown}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-stone-400 text-sm">
            Loading PDF…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm px-4 text-center">
            {error}
          </div>
        )}

        {/* Transformed inner layer */}
        <div
          ref={innerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          }}
        >
          <canvas ref={canvasRef} style={{ display: 'block' }} />

          {/* Control point markers */}
          {controlPoints.map((pt, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: pt.px,
                top: pt.py,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: POINT_COLORS[i % POINT_COLORS.length],
                  border: '2px solid white',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'white',
                }}
              >
                {i + 1}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Zoom hint */}
      <div className="px-3 py-1 border-t border-stone-200 bg-stone-50 flex items-center gap-3 shrink-0">
        <span className="text-xs text-stone-400">Scroll to zoom · Drag to pan</span>
        <span className="ml-auto text-xs text-stone-400">{Math.round(view.zoom * 100)}%</span>
        <button
          className="text-xs text-stone-500 hover:text-stone-700 underline"
          onClick={() => {
            const outer = outerRef.current
            if (!outer || !pageSize.w) return
            const { width, height } = outer.getBoundingClientRect()
            const fitZoom = Math.min(width / pageSize.w, height / pageSize.h) * 0.95
            const initX = (width - pageSize.w * fitZoom) / 2
            const initY = (height - pageSize.h * fitZoom) / 2
            setView({ x: initX, y: initY, zoom: fitZoom })
          }}
        >
          Fit
        </button>
      </div>
    </div>
  )
}
