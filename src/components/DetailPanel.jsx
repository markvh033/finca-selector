import { useState } from 'react';
import { CATEGORIES } from '../data/vincas';

export default function DetailPanel({ vinca, onClose }) {
  if (!vinca) return null;

  const cat = CATEGORIES[vinca.category];

  return (
    <div
      className="absolute top-0 right-0 h-full w-[420px] max-w-[90vw] shadow-2xl z-50 overflow-y-auto"
      style={{
        background: 'var(--color-cream)',
        borderLeft: '1px solid var(--color-gold-pale)',
        animation: 'slideIn 0.35s cubic-bezier(0.25,0.46,0.45,0.94)',
      }}
    >
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .img-shimmer {
          background: linear-gradient(90deg, var(--color-cream-deep) 25%, var(--color-cream) 50%, var(--color-cream-deep) 75%);
          background-size: 800px 100%;
          animation: shimmer 1.4s infinite linear;
        }
      `}</style>

      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors"
        style={{ background: 'rgba(44,36,22,0.08)', color: 'var(--color-charcoal)' }}
        onMouseEnter={e => e.target.style.background = 'rgba(44,36,22,0.15)'}
        onMouseLeave={e => e.target.style.background = 'rgba(44,36,22,0.08)'}
      >
        ✕
      </button>

      <PlaceImage key={vinca.id} src={vinca.img} alt={vinca.name} />

      <div className="px-10 pb-10 -mt-4 relative z-10">
        <div
          className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider px-3 py-1.5 rounded-full mb-5"
          style={{
            background: cat.color,
            color: '#fff',
            letterSpacing: '0.1em',
          }}
        >
          <span>{cat.icon}</span>
          <span>Category {cat.id}</span>
        </div>

        <div
          className="text-xs font-medium uppercase tracking-wider mb-2"
          style={{ color: 'var(--color-stone)', letterSpacing: '0.12em' }}
        >
          Place #{vinca.number}
        </div>

        <h2
          className="text-3xl font-light leading-tight mb-5"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
        >
          {vinca.name}
        </h2>

        <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--color-stone)' }}>
          {vinca.desc}
        </p>

        <div
          className="w-full h-px mb-8"
          style={{ background: 'var(--color-gold-pale)' }}
        />

        <div className="grid grid-cols-2 gap-4 mb-8">
          <Stat label="Type" value={vinca.type} />
          <Stat label="Address" value={vinca.address} compact />
        </div>

        <div className="mb-8">
          <div
            className="text-xs font-medium uppercase tracking-wider mb-3"
            style={{ color: 'var(--color-stone)', letterSpacing: '0.1em' }}
          >
            Why Visit
          </div>
          <div className="flex items-start gap-3">
            <div
              className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
              style={{ background: cat.color }}
            />
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-charcoal)' }}>
              {vinca.status}
            </p>
          </div>
        </div>

        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--color-cream-deep)', border: '1px solid var(--color-gold-pale)' }}
        >
          <div
            className="text-xs font-medium uppercase tracking-wider mb-3"
            style={{ color: 'var(--color-gold)', letterSpacing: '0.1em' }}
          >
            About This Category
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-charcoal)' }}>
            {cat.desc}
          </p>
        </div>
      </div>
    </div>
  );
}

function PlaceImage({ src, alt }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div className="w-full aspect-[3/2] overflow-hidden relative">
      {/* Shimmer skeleton shown until image loads */}
      {!loaded && !errored && (
        <div className="img-shimmer absolute inset-0" />
      )}

      {/* Fallback when image fails */}
      {errored && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'var(--color-cream-deep)' }}
        >
          <span className="text-4xl opacity-30">📷</span>
        </div>
      )}

      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover transition-opacity duration-500"
        style={{ opacity: loaded ? 1 : 0 }}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
      />

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to top, var(--color-cream) 0%, transparent 40%)' }}
      />
    </div>
  );
}

function Stat({ label, value, compact = false }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: 'var(--color-cream-deep)', border: '1px solid var(--color-gold-pale)' }}
    >
      <div
        className="text-xs font-medium uppercase mb-1.5"
        style={{ color: 'var(--color-stone)', letterSpacing: '0.08em' }}
      >
        {label}
      </div>
      <div
        className={compact ? 'text-sm font-semibold leading-snug' : 'text-lg font-semibold'}
        style={{ color: 'var(--color-charcoal)' }}
      >
        {value}
      </div>
    </div>
  );
}
