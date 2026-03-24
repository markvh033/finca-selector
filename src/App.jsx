import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import VincaMap from './components/VincaMap';
import DetailPanel from './components/DetailPanel';
import FilterBar from './components/FilterBar';
import Legend from './components/Legend';
import GeoreferenceApp from './components/GeoreferenceApp';
import FincaReviewMap from './components/FincaReviewMap';
import ManualFincaMapper from './components/ManualFincaMapper';
import LoginPage from './components/LoginPage';

// ── Protected route wrapper ───────────────────────────────────────────────
function RequireAuth({ children }) {
  const token = localStorage.getItem('finca_token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

// ── Main places app (existing functionality, untouched) ───────────────────
function MainApp() {
  const [mode, setMode] = useState('vincas'); // vincas | georeference | review | mapper
  const [selected, setSelected] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  if (mode === 'georeference') {
    return <GeoreferenceApp onBack={() => setMode('vincas')} />;
  }

  if (mode === 'review') {
    return <FincaReviewMap onBack={() => setMode('vincas')} />;
  }

  if (mode === 'mapper') {
    return <ManualFincaMapper onBack={() => setMode('vincas')} />;
  }

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: 'var(--color-cream)' }}>
      <div className="absolute inset-x-0 top-0 z-40 px-4 pt-4 pointer-events-none">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="px-4 md:px-6 pt-2 flex items-center gap-3">
            <h1
              className="text-2xl font-light tracking-wide pointer-events-none"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
            >
              Casco Viejo
            </h1>
            <span
              className="text-xs font-medium uppercase tracking-wider self-center mt-0.5 pointer-events-none"
              style={{ color: 'var(--color-stone)', letterSpacing: '0.12em' }}
            >
              Places
            </span>
            <div className="ml-auto flex gap-2 pointer-events-auto">
              <button
                className="text-xs px-3 py-1.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium"
                onClick={() => setMode('georeference')}
              >
                🗺 Georeference Tool
              </button>
              <button
                className="text-xs px-3 py-1.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-medium"
                onClick={() => setMode('review')}
              >
                📍 Review Fincas
              </button>
              <button
                className="text-xs px-3 py-1.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-medium"
                onClick={() => setMode('mapper')}
              >
                ✏️ Manual Mapper
              </button>
              <Link
                to="/finca"
                className="text-xs px-3 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-100 font-medium"
              >
                🔐 Finca DB
              </Link>
            </div>
          </div>

          <FilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />
        </div>
      </div>

      <VincaMap
        selected={selected}
        onSelect={setSelected}
        activeFilter={activeFilter}
      />

      <Legend />

      <DetailPanel vinca={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ── Root app with router ───────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/finca"
          element={
            <RequireAuth>
              <ManualFincaMapper />
            </RequireAuth>
          }
        />
        {/* Catch-all → home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
