import { CATEGORIES } from '../data/vincas';

export default function FilterBar({ activeFilter, onFilterChange }) {
  const filters = [
    { id: 'all', label: 'All' },
    ...Object.values(CATEGORIES).map((cat) => ({
      id: cat.id,
      label: `${cat.id} — ${cat.name}`,
      icon: cat.icon,
    })),
  ];

  return (
    <div
      className="pointer-events-auto flex w-full flex-wrap gap-2 rounded-xl px-4 py-3 shadow-lg backdrop-blur-sm"
      style={{
        background: 'rgba(245,239,224,0.92)',
        border: '1px solid var(--color-gold-pale)',
        boxShadow: '0 8px 32px rgba(44,36,22,0.12)',
      }}
    >
      {filters.map((f) => {
        const isActive = activeFilter === f.id;
        const cat = f.id === 'all' ? null : CATEGORIES[f.id];
        return (
          <button
            key={f.id}
            onClick={() => onFilterChange(f.id)}
            className="px-4 py-2.5 rounded-lg text-xs font-medium uppercase tracking-wider cursor-pointer transition-all duration-200 border border-transparent hover:border-[var(--color-gold-pale)]"
            style={{
              background: isActive
                ? (cat ? cat.color : 'var(--color-teal-dark)')
                : 'transparent',
              color: isActive ? '#fff' : 'var(--color-stone)',
              letterSpacing: '0.08em',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'rgba(44,36,22,0.06)';
                e.currentTarget.style.color = 'var(--color-charcoal)';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--color-stone)';
              }
            }}
          >
            {f.id !== 'all' && <span className="mr-1.5">{f.icon}</span>}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
