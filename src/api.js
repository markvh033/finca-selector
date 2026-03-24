const BASE = import.meta.env.VITE_API_URL || ''

function getToken() { return localStorage.getItem('finca_token') }

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

export const api = {
  login: (username, password) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  getFincas: () => apiFetch('/api/fincas'),
  saveFinca: (f) => apiFetch('/api/fincas', { method: 'POST', body: JSON.stringify(f) }),
  updateFinca: (id, f) => apiFetch(`/api/fincas/${id}`, { method: 'PUT', body: JSON.stringify(f) }),
  deleteFinca: (id) => apiFetch(`/api/fincas/${id}`, { method: 'DELETE' }),
}
