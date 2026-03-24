import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('finca')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token } = await api.login(username, password)
      localStorage.setItem('finca_token', token)
      navigate('/finca')
    } catch (err) {
      setError('Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #f5f4f1 0%, #ede8df 100%)' }}
    >
      {/* Subtle background grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: 'radial-gradient(circle, #c7bfb0 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative w-full max-w-sm mx-4">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-stone-200/80 border border-stone-100 overflow-hidden">
          {/* Top accent bar */}
          <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

          <div className="px-8 pt-8 pb-9">
            {/* Logo / title */}
            <div className="mb-7 text-center">
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 mb-4 text-2xl"
              >
                🗺
              </div>
              <h1
                className="text-2xl font-semibold text-stone-800 tracking-tight"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                Finca Mapper
              </h1>
              <p className="text-xs font-medium uppercase tracking-widest text-stone-400 mt-1">
                1964 Cadastral Panama
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className="px-3.5 py-2.5 text-sm rounded-lg border border-stone-200 bg-stone-50 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 focus:bg-white transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="px-3.5 py-2.5 text-sm rounded-lg border border-stone-200 bg-stone-50 text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 focus:bg-white transition-all"
                />
              </div>

              {error && (
                <div className="px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full py-2.5 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-sm shadow-amber-200 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Signing in…
                  </span>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-stone-400 mt-5">
          Casco Viejo · Panama City
        </p>
      </div>
    </div>
  )
}
