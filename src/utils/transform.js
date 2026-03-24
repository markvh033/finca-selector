/**
 * Georeferencing transform utilities.
 * Fits an affine transform from pixel coords → geographic coords (lng, lat).
 * Uses least squares so it works with any number of control points >= 3.
 */

/** Solve Ax = b via Gaussian elimination (in-place). */
function gaussianElimination(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
    }
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]

    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col]
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j]
    }
  }

  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i]
    for (let j = i - 1; j >= 0; j--) (M[j][n] -= M[j][i] * x[i])
  }
  return x
}

/** Solve normal equations A^T A x = A^T b (least squares). */
function leastSquares(A, b) {
  const m = A.length, n = A[0].length
  const AtA = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => A.reduce((s, row) => s + row[i] * row[j], 0))
  )
  const Atb = Array.from({ length: n }, (_, i) =>
    A.reduce((s, row, k) => s + row[i] * b[k], 0)
  )
  return gaussianElimination(AtA, Atb)
}

/**
 * Fit affine transform from control points.
 * Each point: { px, py, lng, lat }
 * Returns { a, b, c, d, e, f } where:
 *   lng = a*px + b*py + c
 *   lat = d*px + e*py + f
 * Returns null if fewer than 3 points.
 */
export function fitAffineTransform(controlPoints) {
  if (controlPoints.length < 3) return null

  const A = controlPoints.map(({ px, py }) => [px, py, 1])
  const lngs = controlPoints.map(p => p.lng)
  const lats = controlPoints.map(p => p.lat)

  const [a, b, c] = leastSquares(A, lngs)
  const [d, e, f] = leastSquares(A, lats)

  return { a, b, c, d, e, f }
}

/** Transform a pixel coordinate to { lng, lat }. */
export function pixelToGeo(transform, px, py) {
  const { a, b, c, d, e, f } = transform
  return {
    lng: a * px + b * py + c,
    lat: d * px + e * py + f,
  }
}

/**
 * Given a transform and PDF page dimensions, return the 4 corner coordinates
 * in the order MapLibre expects: [topLeft, topRight, bottomRight, bottomLeft]
 * Each as [lng, lat].
 */
export function getCornerCoordinates(transform, pageWidth, pageHeight) {
  const tl = pixelToGeo(transform, 0, 0)
  const tr = pixelToGeo(transform, pageWidth, 0)
  const br = pixelToGeo(transform, pageWidth, pageHeight)
  const bl = pixelToGeo(transform, 0, pageHeight)
  return [
    [tl.lng, tl.lat],
    [tr.lng, tr.lat],
    [br.lng, br.lat],
    [bl.lng, bl.lat],
  ]
}

/**
 * Compute per-point residuals (distance in meters between predicted and actual geo coords).
 */
export function computeResiduals(transform, controlPoints) {
  return controlPoints.map(pt => {
    const predicted = pixelToGeo(transform, pt.px, pt.py)
    const dlng = predicted.lng - pt.lng
    const dlat = predicted.lat - pt.lat
    // 1 degree lat ≈ 111,000 m; 1 degree lng ≈ 111,000 * cos(lat) m
    const mPerLng = 111000 * Math.cos((pt.lat * Math.PI) / 180)
    const mPerLat = 111000
    const residualM = Math.sqrt((dlng * mPerLng) ** 2 + (dlat * mPerLat) ** 2)
    return { ...pt, residualM }
  })
}

/** RMS residual in meters across all points. */
export function rmsResidual(controlPoints, transform) {
  if (!transform || controlPoints.length < 3) return null
  const residuals = computeResiduals(transform, controlPoints)
  const sumSq = residuals.reduce((s, r) => s + r.residualM ** 2, 0)
  return Math.sqrt(sumSq / residuals.length)
}
