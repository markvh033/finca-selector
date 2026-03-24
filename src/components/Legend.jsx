import { useState } from 'react';
import { CATEGORIES } from '../data/vincas';

export default function Legend() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="absolute bottom-6 left-6 z-30 rounded-xl shadow-lg transition-all duration-300"
      style={{
        background: 'rgba(245,239,224,0.95)',
        border: '1px solid var(--color-gold-pale)',
        boxShadow: '0 8px 32px rgba(44,36,22,0.12)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 px-5 py-3.5 w-full cursor-pointer border-none bg-transparent text-left"
        style={{ color: 'var(--color-charcoal)' }}
      >
        <span className="text-xs font-medium uppercase tracking-wider" style={{ letterSpacing: '0.1em', color: 'var(--color-stone)' }}>
          Legend
        </span>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-stone)' }}>
          {collapsed ? '▼' : '▲'}
        </span>
      </button>

      {!collapsed && (
        <div className="px-5 pb-4">
          {Object.values(CATEGORIES).map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 py-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-sm"
                style={{ background: cat.color, border: '2px solid rgba(255,255,255,0.8)' }}
              >
                {cat.id}
              </div>
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--color-charcoal)' }}>
                  {cat.name}
                </div>
                <div className="text-xs" style={{ color: 'var(--color-stone)', lineHeight: 1.3, marginTop: 2 }}>
                  {cat.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
