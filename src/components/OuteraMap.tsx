import React, { useEffect, useRef, useState, useCallback } from 'react';
import '../services/maplibreSetup.ts';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Navigation,
  MapPin,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Compass,
  ShieldCheck,
} from 'lucide-react';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { UserLocation } from '../types/outera';
import { formatDistance } from '../services/location';
import { getOuteraMapStyle, enforceFlat2DMap, OUTERA_MAP_ACCENT } from '../services/mapStyle';

interface OuteraMapProps {
  places: PlaceWithDistance[];
  currentLocation: UserLocation;
  selectedLayer?: 'all' | 'Trending' | 'Popular' | 'HiddenGems' | 'CommunityActivity' | 'Events';
  onChangeLayer?: (
    layer: 'all' | 'Trending' | 'Popular' | 'HiddenGems' | 'CommunityActivity' | 'Events'
  ) => void;
  onSelectPlace: (place: PlaceWithDistance) => void;
  onRequestGPS?: () => void;
  isDetectingGPS?: boolean;
}

// Generate smooth polygon circle for real-time accuracy radius around user
function createGeoJSONCircle(center: [number, number], radiusInMeters: number, points = 32) {
  const coords: [number, number][] = [];
  const km = Math.max(radiusInMeters, 25) / 1000;
  const distanceX = km / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([center[0] + x, center[1] + y]);
  }
  coords.push(coords[0]);

  return {
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [coords],
    },
    properties: {},
  };
}

export const OuteraMap: React.FC<OuteraMapProps> = ({
  places,
  currentLocation,
  selectedLayer = 'all',
  onChangeLayer,
  onSelectPlace,
  onRequestGPS,
  isDetectingGPS = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const placeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const activePopupRef = useRef<maplibregl.Popup | null>(null);

  const [activePlaceId, setActivePlaceId] = useState<string | null>(places[0]?.id || null);
  const [mapBearing, setMapBearing] = useState(0);
  const [isStyleLoaded, setIsStyleLoaded] = useState(false);

  // Filter places based on active map layer
  const displayedPlaces = places.filter((p) => {
    if (selectedLayer === 'all') return true;
    if (selectedLayer === 'Trending') return p.isTrending || p.markerState === 'Trending';
    if (selectedLayer === 'Popular') return p.markerState === 'Popular' || p.communityScore >= 90;
    if (selectedLayer === 'HiddenGems') return p.isHiddenGem || p.markerState === 'HiddenGem';
    if (selectedLayer === 'Events') return p.isEvent;
    if (selectedLayer === 'CommunityActivity') return (p.experienceReports?.length || 0) >= 1;
    return true;
  });

  const activePlace =
    displayedPlaces.find((p) => p.id === activePlaceId) ||
    places.find((p) => p.id === activePlaceId) ||
    displayedPlaces[0];

  // Initialize flat 2D MapLibre GL with OpenFreeMap dark vector style
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isCancelled = false;

    const initMap = async () => {
      // Determine initial center: [lng, lat] (MapLibre order)
      const initialLng = currentLocation.coords?.lng || 90.4125;
      const initialLat = currentLocation.coords?.lat || 23.8103;
      const initialZoom = currentLocation.coords ? 14 : 12;

      const styleObj = await getOuteraMapStyle();
      if (isCancelled || !mapContainerRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styleObj,
        center: [initialLng, initialLat],
        zoom: initialZoom,
        pitch: 0,
        maxPitch: 0,
        bearing: 0,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: false,
      });

      // Maintain correct OpenFreeMap & OpenStreetMap attribution
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution:
            '<span class="text-[9px] text-zinc-400 font-mono">OUTERA · <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></span>',
        }),
        'bottom-right'
      );

      map.on('load', () => {
        if (isCancelled) return;
        enforceFlat2DMap(map);
        setIsStyleLoaded(true);
      });

      map.on('rotate', () => {
        setMapBearing(Math.round(map.getBearing()));
      });

      // Resize observer for responsive Android & Desktop containers
      const resizeObserver = new ResizeObserver(() => {
        try {
          map.resize();
        } catch {
          // ignore
        }
      });
      if (mapContainerRef.current) {
        resizeObserver.observe(mapContainerRef.current);
      }

      mapInstanceRef.current = map;

      return () => {
        resizeObserver.disconnect();
      };
    };

    initMap();

    // Clean up map instance on unmount to prevent memory leaks
    return () => {
      isCancelled = true;
      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      placeMarkersRef.current.forEach((m) => m.remove());
      placeMarkersRef.current = [];
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      setIsStyleLoaded(false);
    };
  }, []);

  // Update User Marker & Accuracy Circle GeoJSON
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isStyleLoaded) return;

    if (currentLocation.coords) {
      const { lng, lat } = currentLocation.coords;

      // Pulse element for real user location in Electric Lime (#B7FF00)
      if (!userMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'outera-user-location-marker';
        el.innerHTML = `
          <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
            <span class="absolute w-8 h-8 rounded-full bg-[#B7FF00]/25 animate-ping pointer-events-none"></span>
            <span class="absolute w-5 h-5 rounded-full bg-[#B7FF00]/40 pointer-events-none"></span>
            <div class="w-3.5 h-3.5 rounded-full bg-[#B7FF00] border-2 border-black shadow-[0_0_12px_#B7FF00]"></div>
          </div>
        `;

        userMarkerRef.current = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat([lng, lat])
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat([lng, lat]);
      }

      // Accuracy radius GeoJSON polygon
      const accuracy = currentLocation.accuracyMeters || 35;
      const circleData = createGeoJSONCircle([lng, lat], accuracy);

      const source = map.getSource('user-accuracy-source') as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(circleData);
      } else {
        map.addSource('user-accuracy-source', {
          type: 'geojson',
          data: circleData,
        });

        map.addLayer({
          id: 'user-accuracy-fill',
          type: 'fill',
          source: 'user-accuracy-source',
          paint: {
            'fill-color': OUTERA_MAP_ACCENT,
            'fill-opacity': 0.08,
          },
        });

        map.addLayer({
          id: 'user-accuracy-line',
          type: 'line',
          source: 'user-accuracy-source',
          paint: {
            'line-color': OUTERA_MAP_ACCENT,
            'line-width': 1,
            'line-opacity': 0.45,
            'line-dasharray': [3, 3],
          },
        });
      }
    } else {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      if (map.getLayer('user-accuracy-line')) map.removeLayer('user-accuracy-line');
      if (map.getLayer('user-accuracy-fill')) map.removeLayer('user-accuracy-fill');
      if (map.getSource('user-accuracy-source')) map.removeSource('user-accuracy-source');
    }
  }, [currentLocation.coords, currentLocation.accuracyMeters, isStyleLoaded]);

  // Update Place Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isStyleLoaded) return;

    // Clear old markers
    placeMarkersRef.current.forEach((m) => m.remove());
    placeMarkersRef.current = [];

    displayedPlaces.forEach((place) => {
      const coords = place.coordinates;
      if (
        !coords ||
        typeof coords.lat !== 'number' ||
        typeof coords.lng !== 'number'
      ) {
        return;
      }

      const isSelected = activePlaceId === place.id;

      // Color scheme: dark charcoal with Electric Lime (#B7FF00) accents for selected/active/trending
      let badgeColor = '#E2E6E3';
      let bgColor = '#141715';
      let borderColor = 'rgba(255, 255, 255, 0.22)';

      if (isSelected) {
        bgColor = OUTERA_MAP_ACCENT;
        badgeColor = '#000000';
        borderColor = OUTERA_MAP_ACCENT;
      } else if (place.markerState === 'Popular') {
        bgColor = '#f59e0b';
        badgeColor = '#000000';
        borderColor = '#f59e0b';
      } else if (place.isTrending || place.markerState === 'Trending') {
        bgColor = '#181E17';
        badgeColor = OUTERA_MAP_ACCENT;
        borderColor = OUTERA_MAP_ACCENT;
      } else if (place.isHiddenGem || place.markerState === 'HiddenGem') {
        bgColor = '#0891b2';
        badgeColor = '#000000';
        borderColor = '#0891b2';
      } else if (place.isEvent) {
        bgColor = '#9333ea';
        badgeColor = '#ffffff';
        borderColor = '#9333ea';
      }

      const markerEl = document.createElement('div');
      markerEl.className = 'outera-place-marker-wrapper cursor-pointer';
      markerEl.innerHTML = `
        <div class="relative flex items-center justify-center transition-transform duration-200 ${
          isSelected ? 'scale-125 z-50' : 'hover:scale-110'
        }">
          <div style="background-color: ${bgColor}; border-color: ${borderColor}; color: ${badgeColor};" 
               class="w-7 h-7 rounded-full border-2 flex items-center justify-center font-black text-[10px] shadow-lg shadow-black/80 font-mono">
            ${place.name.substring(0, 1).toUpperCase()}
          </div>
          ${
            isSelected
              ? '<span class="absolute -bottom-1 w-2 h-2 rounded-full bg-[#B7FF00] ring-2 ring-black"></span>'
              : ''
          }
        </div>
      `;

      const distStr = place.distanceKm !== undefined ? formatDistance(place.distanceKm) : '';
      const areaStr = place.address || place.neighborhood || (place.district ? `${place.district}, ${place.division}` : '');
      const ratingStr = place.communityScore > 0 ? `${place.communityScore}% worth it` : '';

      const popupNode = document.createElement('div');
      popupNode.className = 'p-3 min-w-[210px] max-w-[250px] space-y-1.5 text-white font-sans';
      popupNode.innerHTML = `
        <div class="flex items-center justify-between text-[10px] font-bold">
          <span class="text-[#B7FF00] uppercase tracking-wider">${place.category}</span>
          ${distStr ? `<span class="text-zinc-200 font-mono font-bold">${distStr}</span>` : ''}
        </div>
        <h4 class="text-sm font-bold text-white tracking-tight line-clamp-1">${place.name}</h4>
        ${areaStr ? `<p class="text-[11px] text-zinc-400 line-clamp-1">${areaStr}</p>` : ''}
        <div class="flex items-center justify-between pt-1.5 border-t border-white/10 text-[11px]">
          ${ratingStr ? `<span class="text-[#B7FF00] font-mono font-bold">${ratingStr}</span>` : '<span></span>'}
          <button
            type="button"
            id="popup-btn-${place.id}"
            class="h-7 px-2.5 rounded-lg bg-[#B7FF00] hover:bg-[#c8ff33] text-black font-extrabold text-[11px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
          >
            <span>View Place</span>
            <span>→</span>
          </button>
        </div>
      `;

      const popup = new maplibregl.Popup({
        offset: [0, -14],
        closeButton: true,
        closeOnClick: false,
        className: 'outera-maplibre-popup',
      }).setDOMContent(popupNode);

      popup.on('open', () => {
        const btn = document.getElementById(`popup-btn-${place.id}`);
        if (btn) {
          btn.onclick = (e) => {
            e.stopPropagation();
            onSelectPlace(place);
          };
        }
      });

      const marker = new maplibregl.Marker({
        element: markerEl,
        anchor: 'center',
      })
        .setLngLat([coords.lng, coords.lat])
        .setPopup(popup)
        .addTo(map);

      markerEl.addEventListener('click', () => {
        setActivePlaceId(place.id);
        activePopupRef.current = popup;
        map.easeTo({
          center: [coords.lng, coords.lat],
          zoom: Math.max(map.getZoom(), 15),
          pitch: 0,
          duration: 500,
        });
      });

      placeMarkersRef.current.push(marker);
    });
  }, [displayedPlaces, activePlaceId, isStyleLoaded, onSelectPlace]);

  // Actions
  const handleRecenterOnUser = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (currentLocation.coords) {
      map.flyTo({
        center: [currentLocation.coords.lng, currentLocation.coords.lat],
        zoom: 15,
        pitch: 0,
        bearing: 0,
        duration: 800,
      });
    } else if (onRequestGPS) {
      onRequestGPS();
    }
  }, [currentLocation.coords, onRequestGPS]);

  const handleResetNorth = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.easeTo({
      bearing: 0,
      pitch: 0,
      duration: 500,
    });
  }, []);

  const handleZoomIn = useCallback(() => {
    mapInstanceRef.current?.zoomIn({ duration: 250 });
  }, []);

  const handleZoomOut = useCallback(() => {
    mapInstanceRef.current?.zoomOut({ duration: 250 });
  }, []);

  const layers = [
    { id: 'all' as const, label: 'All Places', count: places.length },
    {
      id: 'Trending' as const,
      label: '⚡ Trending',
      count: places.filter((p) => p.isTrending || p.markerState === 'Trending').length,
    },
    {
      id: 'Popular' as const,
      label: '🔥 Popular',
      count: places.filter((p) => p.markerState === 'Popular').length,
    },
    {
      id: 'HiddenGems' as const,
      label: '💎 Hidden Gems',
      count: places.filter((p) => p.isHiddenGem || p.markerState === 'HiddenGem').length,
    },
    {
      id: 'CommunityActivity' as const,
      label: '✓ Verified Hotspots',
      count: places.filter((p) => (p.experienceReports?.length || 0) > 0).length,
    },
    {
      id: 'Events' as const,
      label: '🎟️ Pop-ups & Events',
      count: places.filter((p) => p.isEvent).length,
    },
  ];

  return (
    <div className="w-full rounded-2xl bg-[#0E1110] border border-white/[0.08] p-3.5 sm:p-5 space-y-4 shadow-xl">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#B7FF00] uppercase tracking-wider">
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span>OpenFreeMap 2D Vector Map</span>
          </div>
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5 truncate">
            {currentLocation.neighborhoodName !== 'Location not set'
              ? `Spots around ${currentLocation.neighborhoodName}`
              : 'Community Discovery Map'}
          </h2>
          {currentLocation.coords && (
            <p className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
              GPS: {currentLocation.coords.lat.toFixed(4)}, {currentLocation.coords.lng.toFixed(4)}
              {currentLocation.accuracyMeters
                ? ` · Accurate to ~${Math.round(currentLocation.accuracyMeters)}m`
                : ''}
            </p>
          )}
        </div>

        {/* Flat 2D Map Controls: GPS, North Compass, Zoom In/Out */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={handleRecenterOnUser}
            className={`h-9 sm:h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
              currentLocation.coords
                ? 'bg-[#B7FF00] text-black border-[#B7FF00] hover:bg-[#c8ff33]'
                : 'bg-white/[0.06] text-white border-white/[0.1] hover:bg-white/[0.1]'
            }`}
            title="Re-center on my location"
          >
            <Navigation className={`w-3.5 h-3.5 ${isDetectingGPS ? 'animate-spin' : ''}`} />
            <span>{currentLocation.coords ? 'Re-center' : 'Use My GPS'}</span>
          </button>

          {/* Reset North Compass Control */}
          <button
            type="button"
            onClick={handleResetNorth}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center border border-white/[0.06] transition-all cursor-pointer"
            title="Reset North"
            aria-label="Reset North"
          >
            <Compass
              className="w-4 h-4 transition-transform duration-200"
              style={{ transform: `rotate(${-mapBearing}deg)` }}
            />
          </button>

          {/* Zoom controls */}
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center border border-white/[0.06] transition-all cursor-pointer"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center border border-white/[0.06] transition-all cursor-pointer"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Layer Toggles */}
      {onChangeLayer && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {layers.map((layer) => {
            const isActive = selectedLayer === layer.id;
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => onChangeLayer(layer.id)}
                className={`shrink-0 h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
                  isActive
                    ? 'bg-[#B7FF00] text-black border-[#B7FF00] font-bold shadow-sm'
                    : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
                }`}
              >
                <span>{layer.label}</span>
                <span className={`text-[10px] font-mono ${isActive ? 'text-black' : 'text-zinc-500'}`}>
                  ({layer.count})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Map Canvas Container (Responsive for Android mobile & Desktop) */}
      <div className="relative h-[340px] sm:h-[430px] lg:h-[490px] w-full rounded-2xl bg-[#0B0D0C] border border-white/[0.08] overflow-hidden touch-pan-x touch-pan-y">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Empty state overlay if no places on map */}
        {displayedPlaces.length === 0 && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-none">
            <MapPin className="w-8 h-8 text-zinc-500 mb-2" />
            <p className="text-sm font-bold text-white">No places placed on map here yet</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm">
              Be the first scout to add a spot in this area!
            </p>
          </div>
        )}

        {/* Flat 2D Vector Map status badge */}
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2 pointer-events-none z-10">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/85 border border-white/10 text-[10px] text-zinc-400 backdrop-blur-sm">
            <ShieldCheck className="w-3 h-3 text-[#B7FF00] shrink-0" />
            <span>OpenFreeMap 2D Vector · Deep Charcoal</span>
          </div>
        </div>
      </div>

      {/* Selected Marker Detail Card Popup */}
      {activePlace && (
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-150">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium mb-1 flex-wrap text-zinc-400">
              <span className="text-[#B7FF00] font-bold">{activePlace.category}</span>
              <span className="text-zinc-600">·</span>
              <span className="truncate max-w-[200px]">
                {activePlace.address || `${activePlace.district}, ${activePlace.division}`}
              </span>
              {activePlace.distanceKm !== undefined && activePlace.distanceKm !== null && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-200 font-mono tabular-nums font-bold">
                    {formatDistance(activePlace.distanceKm)}
                  </span>
                </>
              )}
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-300">
                {activePlace.communityConfidence} Confidence
              </span>
            </div>

            <h3 className="text-base font-bold text-white tracking-tight truncate">
              {activePlace.name}
            </h3>

            <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
              {activePlace.shortDescription || activePlace.whyPick}
            </p>

            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300 mt-2 font-medium">
              <span className="font-mono tabular-nums">{activePlace.priceLevel.label}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-[#B7FF00] font-mono tabular-nums">
                {activePlace.communityScore}% worth it
              </span>
              <span className="text-zinc-600">·</span>
              <span className="font-mono tabular-nums">{activePlace.verifiedVisitorsCount} visited</span>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectPlace(activePlace)}
              className="w-full sm:w-auto h-11 px-4 rounded-xl bg-[#B7FF00] text-black font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 hover:bg-[#c8ff33] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shadow-md shadow-[#B7FF00]/10"
            >
              <span>View Spot Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
