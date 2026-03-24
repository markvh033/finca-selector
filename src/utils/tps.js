/**
 * Thin Plate Spline (TPS) interpolation.
 *
 * Given n control point pairs: src (px, py) → dst (lng, lat)
 * Fits a smooth warp that is EXACT at every control point.
 *
 * The TPS kernel: U(r) = r² · ln(r²), U(0) = 0
 *
 * For each output dimension, solve:
 *   L · [w; a] = [values; 0; 0; 0]
 * where L is (n+3)×(n+3), w are n kernel weights, a are 3 affine coefficients.
 *
 * Prediction at (x, y):
 *   f(x, y) = a[0] + a[1]·x + a[2]·y + Σ w[i] · U(‖(x,y)−(xi,yi)‖²)
 */

/** TPS kernel */
function U(r2) {
  if (r2 < 1e-10) return 0
  return r2 * Math.log(r2)
}

/** Simple Gaussian elimination on an augmented matrix [A | b] */
function gaussElim(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
    }
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]
    const pivot = M[col][col]
    if (Math.abs(pivot) < 1e-14) continue
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = M[row][col] / pivot
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j]
    }
  }

  return M.map((row, i) => row[n] / row[i])
}

/**
 * Fit a TPS for one output dimension.
 * srcPoints: [{px, py}, ...]
 * values: [v0, v1, ...]  (the target values for each src point)
 * lambda: regularization (0 = exact interpolation, small value adds smoothness)
 */
function fitTPS1D(srcPoints, values, lambda = 0) {
  const n = srcPoints.length
  const N = n + 3

  // Build kernel matrix K (n×n)
  const K = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const dx = srcPoints[i].px - srcPoints[j].px
      const dy = srcPoints[i].py - srcPoints[j].py
      return U(dx * dx + dy * dy)
    })
  )

  // P matrix (n×3): [1, xi, yi]
  const P = srcPoints.map(({ px, py }) => [1, px, py])

  // Build full (n+3)×(n+3) system
  const L = Array.from({ length: N }, () => new Array(N).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      L[i][j] = K[i][j] + (i === j ? lambda : 0)
    }
    L[i][n] = P[i][0]; L[i][n + 1] = P[i][1]; L[i][n + 2] = P[i][2]
    L[n][i] = P[i][0]; L[n + 1][i] = P[i][1]; L[n + 2][i] = P[i][2]
  }
  // Bottom-right 3×3 stays zero

  const rhs = [...values, 0, 0, 0]
  const sol = gaussElim(L, rhs)

  return {
    w: sol.slice(0, n),      // kernel weights
    a: sol.slice(n, n + 3),  // affine: [a0, a1, a2]
    srcPoints,
  }
}

/**
 * Evaluate a fitted TPS model at point (px, py).
 */
function evalTPS1D(model, px, py) {
  const { w, a, srcPoints } = model
  let val = a[0] + a[1] * px + a[2] * py
  for (let i = 0; i < srcPoints.length; i++) {
    const dx = px - srcPoints[i].px
    const dy = py - srcPoints[i].py
    val += w[i] * U(dx * dx + dy * dy)
  }
  return val
}

/**
 * Fit a full TPS transform from pixel coords → geographic coords.
 * Requires ≥ 3 control points (preferably 4+ for meaningful TPS).
 *
 * controlPoints: [{px, py, lng, lat}, ...]
 * Returns a tpsTransform object, or null if too few points.
 */
export function fitTPS(controlPoints, lambda = 1e-4) {
  if (controlPoints.length < 3) return null

  const srcPoints = controlPoints.map(({ px, py }) => ({ px, py }))
  const lngs = controlPoints.map(p => p.lng)
  const lats = controlPoints.map(p => p.lat)

  return {
    lngModel: fitTPS1D(srcPoints, lngs, lambda),
    latModel: fitTPS1D(srcPoints, lats, lambda),
    controlPoints,
  }
}

/**
 * Apply forward TPS: pixel (px, py) → { lng, lat }
 */
export function tpsPixelToGeo(tps, px, py) {
  return {
    lng: evalTPS1D(tps.lngModel, px, py),
    lat: evalTPS1D(tps.latModel, px, py),
  }
}

/**
 * Fit an INVERSE TPS: geographic coords → pixel coords.
 * Used for image warping (we need to look up which PDF pixel maps to each output pixel).
 *
 * controlPoints: [{px, py, lng, lat}, ...]
 */
export function fitInverseTPS(controlPoints, lambda = 1e-4) {
  if (controlPoints.length < 3) return null

  // Swap: src = (lng, lat), dst = (px, py)
  const srcPoints = controlPoints.map(({ lng, lat }) => ({ px: lng, py: lat }))
  const pxVals = controlPoints.map(p => p.px)
  const pyVals = controlPoints.map(p => p.py)

  return {
    pxModel: fitTPS1D(srcPoints, pxVals, lambda),
    pyModel: fitTPS1D(srcPoints, pyVals, lambda),
    controlPoints,
  }
}

/**
 * Apply inverse TPS: geographic (lng, lat) → { px, py } in PDF coords
 */
export function tpsGeoToPixel(invTps, lng, lat) {
  return {
    px: evalTPS1D(invTps.pxModel, lng, lat),
    py: evalTPS1D(invTps.pyModel, lng, lat),
  }
}

/**
 * Compute per-point residuals using TPS (should be near-zero at control points).
 */
export function tpsResiduals(tps, controlPoints) {
  return controlPoints.map(pt => {
    const predicted = tpsPixelToGeo(tps, pt.px, pt.py)
    const dlng = predicted.lng - pt.lng
    const dlat = predicted.lat - pt.lat
    const mPerLng = 111000 * Math.cos((pt.lat * Math.PI) / 180)
    const mPerLat = 111000
    const residualM = Math.sqrt((dlng * mPerLng) ** 2 + (dlat * mPerLat) ** 2)
    return { ...pt, residualM }
  })
}

/**
 * Warp a source canvas using TPS into a geographically-registered output canvas.
 *
 * Computes the geographic bounding box, creates an output canvas,
 * and for each output pixel uses inverse TPS to find the source PDF pixel.
 *
 * Returns: { canvas, corners } where corners = [[lng,lat] x4] for MapLibre (TL,TR,BR,BL)
 *
 * @param {HTMLCanvasElement} srcCanvas - rendered PDF canvas
 * @param {number} srcDisplayW - CSS display width (PDF units)
 * @param {number} srcDisplayH - CSS display height (PDF units)
 * @param {object} tps - forward TPS (pixel → geo)
 * @param {object} invTps - inverse TPS (geo → pixel)
 * @param {number} outputWidth - output canvas width in pixels
 * @param {function} [onProgress] - optional callback(fraction 0..1)
 */
export function warpImageWithTPS(srcCanvas, srcDisplayW, srcDisplayH, tps, invTps, outputWidth = 1024, onProgress) {
  // Determine geo bounding box by probing a grid of PDF pixel coordinates
  const PROBE = 20
  let minLng = Infinity, maxLng = -Infinity
  let minLat = Infinity, maxLat = -Infinity

  for (let ix = 0; ix <= PROBE; ix++) {
    for (let iy = 0; iy <= PROBE; iy++) {
      const px = (ix / PROBE) * srcDisplayW
      const py = (iy / PROBE) * srcDisplayH
      const { lng, lat } = tpsPixelToGeo(tps, px, py)
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }

  // Add small margin
  const lngSpan = maxLng - minLng
  const latSpan = maxLat - minLat
  minLng -= lngSpan * 0.02; maxLng += lngSpan * 0.02
  minLat -= latSpan * 0.02; maxLat += latSpan * 0.02

  // Output canvas dimensions (preserve geographic aspect ratio)
  const geoAspect = latSpan / lngSpan
  const outputHeight = Math.round(outputWidth * geoAspect)
  const outCanvas = document.createElement('canvas')
  outCanvas.width = outputWidth
  outCanvas.height = outputHeight
  const outCtx = outCanvas.getContext('2d')

  // Source canvas pixel access
  const srcCtx = srcCanvas.getContext('2d')
  const srcW = srcCanvas.width
  const srcH = srcCanvas.height
  const scaleX = srcW / srcDisplayW
  const scaleY = srcH / srcDisplayH

  // Read source pixels
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH)
  const outData = outCtx.createImageData(outputWidth, outputHeight)
  const src = srcData.data
  const out = outData.data

  const totalPx = outputWidth * outputHeight

  // For each output pixel, compute its (lng, lat), invert TPS to (px, py), sample source
  for (let oy = 0; oy < outputHeight; oy++) {
    const lat = maxLat - (oy / outputHeight) * (maxLat - minLat) // top = maxLat
    for (let ox = 0; ox < outputWidth; ox++) {
      const lng = minLng + (ox / outputWidth) * (maxLng - minLng)

      // Inverse TPS: geo → pdf pixel
      const { px, py } = tpsGeoToPixel(invTps, lng, lat)

      // Check bounds
      if (px < 0 || py < 0 || px >= srcDisplayW || py >= srcDisplayH) continue

      // Map to source canvas pixel (with render scale)
      const sx = Math.round(px * scaleX)
      const sy = Math.round(py * scaleY)
      if (sx < 0 || sy < 0 || sx >= srcW || sy >= srcH) continue

      const si = (sy * srcW + sx) * 4
      const oi = (oy * outputWidth + ox) * 4
      out[oi] = src[si]
      out[oi + 1] = src[si + 1]
      out[oi + 2] = src[si + 2]
      out[oi + 3] = src[si + 3]
    }

    if (onProgress && oy % 50 === 0) {
      onProgress((oy * outputWidth) / totalPx)
    }
  }

  outCtx.putImageData(outData, 0, 0)

  // MapLibre corners: [TL, TR, BR, BL] as [lng, lat]
  const corners = [
    [minLng, maxLat], // TL
    [maxLng, maxLat], // TR
    [maxLng, minLat], // BR
    [minLng, minLat], // BL
  ]

  return { canvas: outCanvas, corners }
}
