/**
 * Web Worker: TPS image warp
 * Receives: { srcImageData, srcW, srcH, srcDisplayW, srcDisplayH, tps, invTps, outputWidth }
 * Posts back: { imageData, corners, width, height } or { error }
 */

function tpsKernel(r2) {
  return r2 < 1e-10 ? 0 : r2 * Math.log(r2)
}

function evalTPS1D(model, x, y) {
  const { a, w, src } = model
  let v = a[0] + a[1] * x + a[2] * y
  for (let i = 0; i < src.length; i++) {
    const dx = x - src[i][0]
    const dy = y - src[i][1]
    v += w[i] * tpsKernel(dx * dx + dy * dy)
  }
  return v
}

function tpsPixelToGeo(tps, px, py) {
  return {
    lng: evalTPS1D(tps.lngModel, px, py),
    lat: evalTPS1D(tps.latModel, px, py),
  }
}

function tpsGeoToPixel(invTps, lng, lat) {
  return {
    px: evalTPS1D(invTps.pxModel, lng, lat),
    py: evalTPS1D(invTps.pyModel, lng, lat),
  }
}

self.onmessage = function ({ data }) {
  const { srcImageData, srcW, srcH, srcDisplayW, srcDisplayH, tps, invTps, outputWidth: outputWidthIn } = data
  const src = new Uint8ClampedArray(srcImageData)  // wrap transferred ArrayBuffer so indexing works

  // ── 1. Determine geo bounding box by probing a grid ──
  const PROBE = 30
  let minLng = Infinity, maxLng = -Infinity
  let minLat = Infinity, maxLat = -Infinity
  for (let ix = 0; ix <= PROBE; ix++) {
    for (let iy = 0; iy <= PROBE; iy++) {
      const { lng, lat } = tpsPixelToGeo(tps, (ix / PROBE) * srcDisplayW, (iy / PROBE) * srcDisplayH)
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  const lngSpan = maxLng - minLng
  const latSpan = maxLat - minLat
  minLng -= lngSpan * 0.01; maxLng += lngSpan * 0.01
  minLat -= latSpan * 0.01; maxLat += latSpan * 0.01

  // ── 2. Output canvas size — clamp both dims to 4096 (WebGL texture limit) ──
  const geoAspect = (maxLat - minLat) / (maxLng - minLng)
  const MAX_TEX = 4096
  let outputWidth = outputWidthIn
  let outputHeight = Math.round(outputWidth * geoAspect)
  if (outputHeight > MAX_TEX) { outputWidth = Math.round(MAX_TEX / geoAspect); outputHeight = MAX_TEX }
  if (outputWidth > MAX_TEX) { outputHeight = Math.round(MAX_TEX * geoAspect); outputWidth = MAX_TEX }

  // ── 3. Pixel warp ──
  const scaleX = srcW / srcDisplayW
  const scaleY = srcH / srcDisplayH
  const out = new Uint8ClampedArray(outputWidth * outputHeight * 4)

  const REPORT_EVERY = 30
  for (let oy = 0; oy < outputHeight; oy++) {
    const lat = maxLat - (oy / outputHeight) * (maxLat - minLat)
    for (let ox = 0; ox < outputWidth; ox++) {
      const lng = minLng + (ox / outputWidth) * (maxLng - minLng)
      const { px, py } = tpsGeoToPixel(invTps, lng, lat)
      if (px < 0 || py < 0 || px >= srcDisplayW || py >= srcDisplayH) continue
      // Bilinear interpolation
      const sx0 = Math.floor(px * scaleX)
      const sy0 = Math.floor(py * scaleY)
      const sx1 = Math.min(sx0 + 1, srcW - 1)
      const sy1 = Math.min(sy0 + 1, srcH - 1)
      const fx = (px * scaleX) - sx0
      const fy = (py * scaleY) - sy0
      const oi = (oy * outputWidth + ox) * 4
      for (let ch = 0; ch < 4; ch++) {
        const tl = src[(sy0 * srcW + sx0) * 4 + ch]
        const tr = src[(sy0 * srcW + sx1) * 4 + ch]
        const bl = src[(sy1 * srcW + sx0) * 4 + ch]
        const br = src[(sy1 * srcW + sx1) * 4 + ch]
        out[oi + ch] = tl * (1 - fx) * (1 - fy) + tr * fx * (1 - fy) + bl * (1 - fx) * fy + br * fx * fy
      }
    }
    if (oy % REPORT_EVERY === 0) {
      self.postMessage({ progress: oy / outputHeight })
    }
  }

  const corners = [
    [minLng, maxLat],
    [maxLng, maxLat],
    [maxLng, minLat],
    [minLng, minLat],
  ]

  self.postMessage({ imageData: out.buffer, width: outputWidth, height: outputHeight, corners }, [out.buffer])
}
