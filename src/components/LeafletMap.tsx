import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

interface LeafletMapProps {
  center: [number, number];
  zoom?: number;
  interactive?: boolean;
  markerPosition?: [number, number] | null;
  onLocationSelect?: (lat: number, lng: number) => void;
  className?: string;
  markerLabel?: string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  center,
  zoom = 15,
  interactive = true,
  markerPosition,
  onLocationSelect,
  className = 'h-72 w-full rounded border border-slate-300 overflow-hidden shadow-xs',
  markerLabel,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Utilitarian location marker pin
  const createCustomPinIcon = () => {
    return L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-full">
          <div class="w-8 h-8 bg-slate-900 text-emerald-400 rounded-sm flex items-center justify-center shadow-md border border-slate-700">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div class="w-2 h-1 bg-black/50 absolute -bottom-0.5"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -34],
    });
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center,
        zoom,
        zoomControl: interactive,
        dragging: interactive,
        touchZoom: interactive,
        scrollWheelZoom: interactive ? 'center' : false,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // Attribution small text in bottom right
      L.control
        .attribution({ position: 'bottomright', prefix: 'OSM' })
        .addTo(map);

      mapInstanceRef.current = map;

      if (interactive && onLocationSelect) {
        map.on('click', (e: L.LeafletMouseEvent) => {
          onLocationSelect(e.latlng.lat, e.latlng.lng);
        });
      }
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update center view if center changes significantly
  useEffect(() => {
    if (mapInstanceRef.current && center) {
      mapInstanceRef.current.setView(center, zoom, { animate: true });
    }
  }, [center[0], center[1], zoom]);

  // Update marker position
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const targetPos = markerPosition || center;

    if (markerRef.current) {
      markerRef.current.setLatLng(targetPos);
    } else {
      const marker = L.marker(targetPos, {
        icon: createCustomPinIcon(),
        draggable: interactive && Boolean(onLocationSelect),
      }).addTo(map);

      if (interactive && onLocationSelect) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onLocationSelect(pos.lat, pos.lng);
        });
      }

      if (markerLabel) {
        marker.bindPopup(`<b>${markerLabel}</b>`).openPopup();
      }

      markerRef.current = marker;
    }

    if (markerLabel && markerRef.current) {
      markerRef.current.setPopupContent(`<b>${markerLabel}</b>`);
    }
  }, [markerPosition?.[0], markerPosition?.[1], markerLabel, interactive, onLocationSelect]);

  return <div ref={mapContainerRef} className={className} />;
};
