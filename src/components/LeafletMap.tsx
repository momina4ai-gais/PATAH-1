import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LeafletMapProps {
  center: [number, number];
  zoom?: number;
  interactive?: boolean;
  markerPosition?: [number, number] | null;
  onLocationSelect?: (lat: number, lng: number) => void;
  className?: string;
  markerLabel?: string;
  showCenterCrosshair?: boolean;
  showLayerToggle?: boolean;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  center,
  zoom = 16,
  interactive = true,
  markerPosition,
  onLocationSelect,
  className = 'h-64 w-full',
  markerLabel = 'Doorstep Location',
  showCenterCrosshair = false,
  showLayerToggle = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const streetLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  const [currentLayer, setCurrentLayer] = useState<'streets' | 'satellite'>('streets');

  // Keep latest callback ref without re-binding map listeners
  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  const createCustomPinIcon = () => {
    return L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-100%);">
          <div style="width:32px;height:32px;background:#01411C;color:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,0.25);border:2px solid #fff;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -34],
    });
  };

  // Initialize Leaflet Map
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center,
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive ? 'center' : false,
      attributionControl: false,
    });

    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    });

    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: '&copy; Esri',
      }
    );

    street.addTo(map);
    streetLayerRef.current = street;
    satelliteLayerRef.current = satellite;
    mapInstanceRef.current = map;

    if (interactive) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onLocationSelectRef.current?.(e.latlng.lat, e.latlng.lng);
      });
    }

    // Force tile recalculation after DOM paint
    const t1 = setTimeout(() => map.invalidateSize(), 50);
    const t2 = setTimeout(() => map.invalidateSize(), 300);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(container);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      resizeObserver?.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  const handleToggleLayer = (mode: 'streets' | 'satellite') => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setCurrentLayer(mode);

    if (mode === 'satellite') {
      if (streetLayerRef.current) map.removeLayer(streetLayerRef.current);
      if (satelliteLayerRef.current) satelliteLayerRef.current.addTo(map);
    } else {
      if (satelliteLayerRef.current) map.removeLayer(satelliteLayerRef.current);
      if (streetLayerRef.current) streetLayerRef.current.addTo(map);
    }
  };

  // Update map center while preserving user's current zoom level
  useEffect(() => {
    if (mapInstanceRef.current && center) {
      const currentZoom = mapInstanceRef.current.getZoom();
      mapInstanceRef.current.setView(center, currentZoom || zoom, { animate: true });
    }
  }, [center[0], center[1], zoom]);

  // Update or create marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const targetPos = markerPosition || center;

    if (markerRef.current) {
      markerRef.current.setLatLng(targetPos);
    } else {
      const marker = L.marker(targetPos, {
        icon: createCustomPinIcon(),
        draggable: interactive && Boolean(onLocationSelectRef.current),
      }).addTo(map);

      if (interactive) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onLocationSelectRef.current?.(pos.lat, pos.lng);
        });
      }

      marker.bindPopup(`<b>${markerLabel}</b>`);
      markerRef.current = marker;
    }

    if (markerLabel && markerRef.current) {
      markerRef.current.setPopupContent(`<b>${markerLabel}</b>`);
    }
  }, [markerPosition?.[0], markerPosition?.[1], center[0], center[1], markerLabel, interactive]);

  return (
    <div className="relative w-full" style={{ minHeight: '256px' }}>
      <div
        ref={mapContainerRef}
        className={className}
        style={{ width: '100%', height: '100%', minHeight: '256px' }}
      />

      {showLayerToggle && (
        <div className="absolute top-2.5 right-2.5 z-[1000] flex bg-white rounded-md border border-slate-200 shadow-xs overflow-hidden text-xs font-medium">
          <button
            type="button"
            onClick={() => handleToggleLayer('streets')}
            className={`px-2.5 py-1 transition-colors cursor-pointer ${
              currentLayer === 'streets'
                ? 'bg-[#01411C] text-white'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Streets
          </button>
          <button
            type="button"
            onClick={() => handleToggleLayer('satellite')}
            className={`px-2.5 py-1 transition-colors cursor-pointer ${
              currentLayer === 'satellite'
                ? 'bg-[#01411C] text-white'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            Satellite
          </button>
        </div>
      )}

      {showCenterCrosshair && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[1000]">
          <div className="w-5 h-5 border-2 border-[#01411C] rounded-full flex items-center justify-center bg-white/40">
            <div className="w-1.5 h-1.5 bg-[#01411C] rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
};