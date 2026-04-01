const BASE = import.meta.env.VITE_API_URL || ''

export function getToken() { return localStorage.getItem('finca_token') }

async function apiFetch(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('finca_token')
      window.location.href = '/login'
    }
    throw new Error(await res.text())
  }
  return res.json()
}

// For multipart/form-data (file uploads) — no Content-Type header (browser sets boundary)
async function apiUpload(path, formData) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('finca_token')
      window.location.href = '/login'
    }
    throw new Error(await res.text())
  }
  return res.json()
}

export const api = {
  // Auth
  login: (username, password) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  // Finca CRUD
  getFincas: () => apiFetch('/api/fincas'),
  getFinca: (id) => apiFetch(`/api/fincas/${id}`),
  saveFinca: (f) => apiFetch('/api/fincas', { method: 'POST', body: JSON.stringify(f) }),
  updateFinca: (id, f) => apiFetch(`/api/fincas/${id}`, { method: 'PUT', body: JSON.stringify(f) }),
  deleteFinca: (id) => apiFetch(`/api/fincas/${id}`, { method: 'DELETE' }),

  // Search
  searchFincas: (params) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString()
    return apiFetch(`/api/fincas/search${qs ? '?' + qs : ''}`)
  },

  // Photos
  uploadPhotos: (id, files) => {
    const fd = new FormData()
    for (const f of files) fd.append('photos', f)
    return apiUpload(`/api/fincas/${id}/photos`, fd)
  },
  deletePhoto: (id, slot) =>
    apiFetch(`/api/fincas/${id}/photos/${slot}`, { method: 'DELETE' }),

  // PDF
  uploadPdf: (id, file) => {
    const fd = new FormData()
    fd.append('pdf', file)
    return apiUpload(`/api/fincas/${id}/pdf`, fd)
  },
  downloadPdfUrl: (id) => `${BASE}/api/fincas/${id}/pdf`,

  // Barrios list
  getBarrios: () => apiFetch('/api/barrios'),
}
