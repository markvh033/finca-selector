import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Backups() {
  const navigate = useNavigate()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  useEffect(() => { loadFiles() }, [])

  async function loadFiles() {
    setLoading(true)
    try {
      setFiles(await api.listBackups())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function runBackup() {
    setRunning(true)
    setError(null)
    try {
      await api.runBackup()
      setSuccessMsg('Backup completed successfully')
      setTimeout(() => setSuccessMsg(null), 3000)
      await loadFiles()
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  async function download(filename) {
    try {
      const { url } = await api.downloadBackup(filename)
      window.open(url, '_blank')
    } catch (e) {
      setError(e.message)
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }

  return (
    <div className="bg-slate-50 min-h-screen" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* 3px blue top stripe */}
      <div className="h-[3px] bg-[#005baa] w-full" />

      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate('/finca')}
            className="text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors"
          >
            ← Map
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <h1 className="text-sm font-semibold text-slate-800">Database Backups</h1>
          <div className="ml-auto flex items-center gap-3">
            {successMsg && <span className="text-xs text-[#005baa] font-medium">{successMsg}</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button
              onClick={runBackup}
              disabled={running}
              className="text-xs font-medium px-3 py-1.5 rounded bg-[#005baa] hover:bg-[#004a8f] text-white disabled:opacity-50 transition-colors"
            >
              {running ? 'Running…' : 'Run Backup Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="bg-white border border-slate-200 shadow-sm">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_160px_100px] gap-4 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">File</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Size</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Created</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400"></span>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
          ) : files.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-slate-500 font-medium">No backups yet</p>
              <p className="text-xs text-slate-400 mt-1">Backups run automatically every day at 02:00 UTC, or click "Run Backup Now"</p>
            </div>
          ) : (
            files.map((f, i) => (
              <div
                key={f.key}
                className={`grid grid-cols-[1fr_100px_160px_100px] gap-4 px-4 py-3 items-center ${i < files.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <span className="text-sm text-slate-700 font-mono truncate">{f.filename}</span>
                <span className="text-xs text-slate-500">{formatSize(f.size)}</span>
                <span className="text-xs text-slate-500">{formatDate(f.lastModified)}</span>
                <button
                  onClick={() => download(f.filename)}
                  className="text-xs font-medium px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors text-right"
                >
                  Download
                </button>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-slate-400 mt-4">
          Backups are stored in the Railway object storage bucket <span className="font-mono">compact-wrap</span> and run automatically every day at 02:00 UTC.
          Each CSV includes all property data and media file paths.
        </p>
      </div>
    </div>
  )
}
