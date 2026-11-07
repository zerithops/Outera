import React, { useEffect, useRef, useState } from 'react';
import '../services/maplibreSetup.ts';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Box, Compass, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { Coordinates, TripDayStop } from '../types/outera';
import { getOuteraMapStyle, ensure3DBuildingsLayer } from '../services/mapStyle';

interface TripRouteMapProps {
  stops: TripDayStop[];
  routeCoordinates: [number, number][];
  destinationCenter: Coordinates;
  selectedDayFilter: number | 'all';
  onSelectDayFilter: (day: number | 'all') => void;
  durationDays: number;
  onSelectStop?: (stop: TripDayStop) => void;
}

const ROUTE_SOURCE_ID = 'outera-trip-route-source';
const ROUTE_CASING_LAYER_ID = 'outera-trip-route-casing';
const ROUTE_LINE_LAYER_ID = 'outera-trip-route-line';

export const TripRouteMap: React.FC<TripRouteMapProps> = ({
  stops,
  routeCoordinates,
  destinationCenter,
  selectedDayFilter,
  onSelectDayFilter,
  durationDays,
  onSelectStop,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [is3D, setIs3D] = useState(false);

  const visibleStops =
    selectedDayFilter === 'all'
      ? stops
      : stops.filter((s) => s.dayNumber === selectedDayFilter);

  const validStops = visibleStops.filter(
    (s) => s.coordinates && typeof s.coordinates.lat === 'number' && typeof s.coordinates.lng === 'number'
  );

  // Initialize MapLibre GL map
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const init = async () => {
      const style = await getOuteraMapStyle();
      if (cancelled || !containerRef.current) return;

      const initialCenter: [number, number] = validStops[0]?.coordinates
        ? [validStops[0].coordinates.lng, validStops[0].coordinates.lat]
        : [destinationCenter.lng, destinationCenter.lat];

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: initialCenter,
        zoom: 12,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        maxPitch: 70,
      });

      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: '<span class="text-[9px] text-zinc-500 font-mono">OUTERA · OpenFreeMap · OSRM</span>',
        }),
        'bottom-right'
      );

      map.on('load', () => {
        if (cancelled) return;
        ensure3DBuildingsLayer(map);
        setIsLoaded(true);
      });

      mapRef.current = map;
    };

    init();

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Render route polyline & numbered stop markers whenever stops or routeCoordinates change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Determine line coordinates to draw
    const lineCoords: [number, number][] =
      selectedDayFilter === 'all' && routeCoordinates.length >= 2
        ? routeCoordinates
        : validStops.map((s) => [s.coordinates!.lng, s.coordinates!.lat]);

    const geojsonData = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: lineCoords.length >= 2 ? lineCoords : [],
      },
    };

    try {
      const existingSource = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (existingSource) {
        existingSource.setData(geojsonData as any);
      } else {
        map.addSource(ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: geojsonData as any,
        });

        map.addLayer({
          id: ROUTE_CASING_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#080A09',
            'line-width': 6,
            'line-opacity': 0.85,
          },
        });

        map.addLayer({
          id: ROUTE_LINE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#C6FF00',
            'line-width': 3,
            'line-opacity': 0.95,
          },
        });
      }
    } catch (err) {
      console.warn('Route layer update notice:', err);
    }

    // Add numbered markers for each stop
    validStops.forEach((stop, index) => {
      const coords = stop.coordinates!;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'group relative flex items-center justify-center focus:outline-none cursor-pointer';
      el.innerHTML = `
        <div class="w-7 h-7 rounded-full bg-[#C6FF00] text-[#0B0D0C] font-mono font-extrabold text-xs flex items-center justify-center shadow-lg border-2 border-[#0B0D0C] transition-transform duration-150 group-hover:scale-110">
          ${index + 1}
        </div>
        <div class="absolute bottom-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-[#0B0D0C]/95 border border-white/15 text-[11px] font-semibold text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-30">
          Day ${stop.dayNumber} · ${stop.timeSlot}: ${stop.placeName}
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        map.flyTo({
          center: [coords.lng, coords.lat],
          zoom: Math.max(map.getZoom(), 14),
          duration: 600,
        });
        if (onSelectStop) onSelectStop(stop);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Fit map bounds to stops or center on destination
    if (validStops.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      validStops.forEach((s) => bounds.extend([s.coordinates!.lng, s.coordinates!.lat]));
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 650 });
    } else if (validStops.length === 1) {
      map.flyTo({
        center: [validStops[0].coordinates!.lng, validStops[0].coordinates!.lat],
        zoom: 13,
        duration: 600,
      });
    } else {
      map.flyTo({
        center: [destinationCenter.lng, destinationCenter.lat],
        zoom: 11,
        duration: 600,
      });
    }
  }, [isLoaded, stops, routeCoordinates, selectedDayFilter, destinationCenter]);

  const handleFitRoute = () => {
    const map = mapRef.current;
    if (!map) return;
    if (validStops.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      validStops.forEach((s) => bounds.extend([s.coordinates!.lng, s.coordinates!.lat]));
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 600 });
    } else if (validStops.length === 1) {
      map.flyTo({
        center: [validStops[0].coordinates!.lng, validStops[0].coordinates!.lat],
        zoom: 13.5,
        duration: 500,
      });
    }
  };

  const handleToggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3D;
    setIs3D(next);
    map.easeTo({
      pitch: next ? 52 : 0,
      bearing: next ? -18 : 0,
      duration: 500,
    });
  };

  return (
    <div className="relative w-full h-[360px] sm:h-[430px] rounded-2xl overflow-hidden border border-white/[0.08] bg-[#0B0D0C]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Top Left: Day Route Filter Bar */}
      <div className="absolute top-3 left-3 right-14 z-10 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => onSelectDayFilter('all')}
          className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer border ${
            selectedDayFilter === 'all'
              ? 'bg-[#C6FF00] text-[#0B0D0C] border-[#C6FF00]'
              : 'bg-[#0B0D0C]/90 text-zinc-300 border-white/10 hover:text-white'
          }`}
        >
          Full Trip Route ({stops.length})
        </button>
        {Array.from({ length: durationDays }, (_, i) => i + 1).map((dayNum) => {
          const count = stops.filter((s) => s.dayNumber === dayNum).length;
          return (
            <button
              key={dayNum}
              type="button"
              onClick={() => onSelectDayFilter(dayNum)}
              className={`h-8 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer border ${
                selectedDayFilter === dayNum
                  ? 'bg-[#C6FF00] text-[#0B0D0C] border-[#C6FF00]'
                  : 'bg-[#0B0D0C]/90 text-zinc-300 border-white/10 hover:text-white'
              }`}
            >
              Day {dayNum} ({count})
            </button>
          );
        })}
      </div>

      {/* Top Right: Map Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
          className="w-8 h-8 rounded-lg bg-[#0B0D0C]/90 hover:bg-[#161918] border border-white/10 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
          className="w-8 h-8 rounded-lg bg-[#0B0D0C]/90 hover:bg-[#161918] border border-white/10 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleToggle3D}
          className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
            is3D
              ? 'bg-[#C6FF00] text-[#0B0D0C] border-[#C6FF00]'
              : 'bg-[#0B0D0C]/90 hover:bg-[#161918] text-zinc-200 border-white/10'
          }`}
          title="Toggle 3D buildings tilt"
          aria-label="Toggle 3D buildings tilt"
        >
          <Box className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleFitRoute}
          className="w-8 h-8 rounded-lg bg-[#0B0D0C]/90 hover:bg-[#161918] border border-white/10 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer"
          title="Fit all stops"
          aria-label="Fit all stops"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 400 })}
          className="w-8 h-8 rounded-lg bg-[#0B0D0C]/90 hover:bg-[#161918] border border-white/10 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer"
          title="Reset north"
          aria-label="Reset north"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Left Status Legend */}
      <div className="absolute bottom-3 left-3 z-10 px-3 py-1.5 rounded-lg bg-[#0B0D0C]/90 border border-white/10 text-[11px] text-zinc-300 flex items-center gap-3">
        <span className="font-mono tabular-nums text-[#C6FF00] font-bold">
          {validStops.length} Mapped Stop{validStops.length === 1 ? '' : 's'}
        </span>
        <span aria-hidden="true" className="text-zinc-600">·</span>
        <span className="text-zinc-400">Click any numbered marker to inspect</span>
      </div>
    </div>
  );
};
