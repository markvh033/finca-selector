import { useState, useRef, useCallback } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
import { VINCAS } from '../data/vincas';

export default function VincaMap({ selected, onSelect, activeFilter }) {
  const mapRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const filtered = activeFilter === 'all'
    ? VINCAS
    : VINCAS.filter(v => v.category === activeFilter);

  const onMarkerClick = useCallback((vinca) => {
    onSelect(vinca);
    mapRef.current?.getMap().flyTo({ center: vinca.coords, zoom: 16.5, duration: 600 });
  }, [onSelect]);

  const onMarkerEnter = useCallback((vinca, e) => {
    const rect = e.target.getBoundingClientRect();
    setTooltip({
      name: vinca.name,
      id: vinca.number,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  }, []);

  const onMarkerLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: -79.5355,
          latitude: 8.9528,
          zoom: 15.5,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
        attributionControl={false}
        maxZoom={19}
        minZoom={13}
      >
        <NavigationControl position="top-right" style={{ margin: '12px' }} />

        {filtered.map((vinca) => (
          <Marker
            key={vinca.id}
            longitude={vinca.coords[0]}
            latitude={vinca.coords[1]}
            anchor="center"
          >
            <div
              className={`vinca-marker cat-${vinca.category.toLowerCase()} ${selected?.id === vinca.id ? 'active' : ''}`}
              onClick={() => onMarkerClick(vinca)}
              onMouseEnter={(e) => onMarkerEnter(vinca, e)}
              onMouseLeave={onMarkerLeave}
            >
              {vinca.id.split('-')[1]}
            </div>
          </Marker>
        ))}
      </Map>

      {tooltip && (
        <div
          className="fixed pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
        >
          <div
            className="rounded-lg px-3 py-2 shadow-lg border"
            style={{
              background: 'var(--color-cream)',
              borderColor: 'var(--color-gold-pale)',
              boxShadow: '0 8px 24px rgba(44,36,22,0.15)',
            }}
          >
            <div className="font-semibold text-sm" style={{ color: 'var(--color-charcoal)' }}>
              {tooltip.name}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-stone)' }}>
              {tooltip.id}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
