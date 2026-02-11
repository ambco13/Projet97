
import React, { useEffect, useRef } from 'react';

interface Props {
  lat: number;
  lng: number;
  zoom?: number;
}

const MapView: React.FC<Props> = ({ lat, lng, zoom = 15 }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      // @ts-ignore
      const L = window.L;
      if (!L) return;

      mapInstance.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        touchZoom: true,
        scrollWheelZoom: false
      }).setView([lat, lng], zoom);

      // On utilise "as any" pour les options afin d'éviter les erreurs strictes de TypeScript 
      // sur les propriétés de rendu des serveurs de tuiles.
      const tileOptions: any = {
        maxZoom: 20
      };

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', tileOptions).addTo(mapInstance.current);

      const customIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-8 h-8 bg-red-500/30 rounded-full animate-ping"></div>
            <div class="relative w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-[0_0_15px_rgba(239,68,68,1)]"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      L.marker([lat, lng], { icon: customIcon }).addTo(mapInstance.current);
    } else if (mapInstance.current) {
      mapInstance.current.setView([lat, lng], zoom);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [lat, lng, zoom]);

  return (
    <div 
      ref={mapRef} 
      className="w-full h-full rounded-2xl overflow-hidden shadow-inner"
      style={{ touchAction: 'pan-x pan-y' }}
    />
  );
};

export default MapView;
