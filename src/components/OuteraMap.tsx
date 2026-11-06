import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Navigation,
  Layers,
  MapPin,
  ArrowRight,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  ShieldCheck,
  Compass,
} from 'lucide-react';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { UserLocation } from '../types/outera';
import { formatDistance } from '../services/location';

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
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const placeMarkersGroupRef = useRef<L.LayerGroup | null>(null);

  const [activePlaceId, setActivePlaceId] = useState<string | null>(places[0]?.id || null);

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

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Determine initial center
      const initialLat = currentLocation.coords?.lat || 23.8103;
      const initialLng = currentLocation.coords?.lng || 90.4125;
      const initialZoom = currentLocation.coords ? 14 : 12;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: initialZoom,
        zoomControl: false, // Custom buttons
        attributionControl: false,
      });

      // CartoDB Dark Matter tiles (sleek dark palette matching OUTERA)

      const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY;
      const tileUrl = cartoApiKey
        ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${encodeURIComponent(cartoApiKey)}`
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

      const darkTiles = L.tileLayer(tileUrl, {
        maxZoom: 19,
        subdomains: 'abcd',
      });
      darkTiles.addTo(map);

      // Attribution
      L.control
        .attribution({
          position: 'bottomright',
          prefix: '<span class="text-[9px] text-zinc-500 font-mono">OUTERA · CartoDB</span>',
        })
        .addTo(map);

      // Places layer group
      const placeGroup = L.layerGroup().addTo(map);
      placeMarkersGroupRef.current = placeGroup;

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Handle container resize cleanly
    const resizeObserver = new ResizeObserver(() => {
      if (map) {
        map.invalidateSize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    // Delay invalidateSize to ensure correct initial dimensions
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, []);

  // Update User Marker & Accuracy Circle when currentLocation changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (currentLocation.coords) {
      const { lat, lng } = currentLocation.coords;

      // Pulse HTML icon for real user location
      const userHtml = `
        <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
          <span class="absolute w-8 h-8 rounded-full bg-[#ccff00]/25 animate-ping"></span>
          <span class="absolute w-5 h-5 rounded-full bg-[#ccff00]/40"></span>
          <div class="w-3.5 h-3.5 rounded-full bg-[#ccff00] border-2 border-black shadow-[0_0_12px_#ccff00]"></div>
        </div>
      `;

      const userIcon = L.divIcon({
        className: 'outera-user-location-marker',
        html: userHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      if (!userMarkerRef.current) {
        userMarkerRef.current = L.marker([lat, lng], {
          icon: userIcon,
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        userMarkerRef.current.setLatLng([lat, lng]);
      }

      // Accuracy circle
      const accuracy = currentLocation.accuracyMeters || 35;
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = L.circle([lat, lng], {
          radius: Math.max(accuracy, 25),
          color: '#ccff00',
          weight: 1,
          opacity: 0.4,
          fillColor: '#ccff00',
          fillOpacity: 0.08,
          dashArray: '4, 4',
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng([lat, lng]);
        accuracyCircleRef.current.setRadius(Math.max(accuracy, 25));
      }
    } else {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        map.removeLayer(accuracyCircleRef.current);
        accuracyCircleRef.current = null;
      }
    }
  }, [currentLocation.coords, currentLocation.accuracyMeters]);

  // Update Place Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = placeMarkersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    displayedPlaces.forEach((place) => {
      if (
        !place.coordinates ||
        typeof place.coordinates.lat !== 'number' ||
        typeof place.coordinates.lng !== 'number'
      ) {
        return;
      }

      const isSelected = activePlaceId === place.id;

      // Marker badge styling
      let badgeColor = '#ffffff';
      let bgColor = '#181b20';
      let borderColor = 'rgba(255, 255, 255, 0.2)';

      if (isSelected) {
        bgColor = '#ccff00';
        badgeColor = '#000000';
        borderColor = '#ccff00';
      } else if (place.markerState === 'Popular') {
        bgColor = '#f59e0b';
        badgeColor = '#000000';
        borderColor = '#f59e0b';
      } else if (place.isTrending || place.markerState === 'Trending') {
        bgColor = '#ccff00';
        badgeColor = '#000000';
        borderColor = '#ccff00';
      } else if (place.isHiddenGem || place.markerState === 'HiddenGem') {
        bgColor = '#06b6d4';
        badgeColor = '#000000';
        borderColor = '#06b6d4';
      } else if (place.isEvent) {
        bgColor = '#a855f7';
        badgeColor = '#ffffff';
        borderColor = '#a855f7';
      }

      const markerHtml = `
        <div class="relative flex items-center justify-center cursor-pointer transition-transform duration-200 ${
          isSelected ? 'scale-125 z-50' : 'hover:scale-110'
        }">
          <div style="background-color: ${bgColor}; border-color: ${borderColor}; color: ${badgeColor};" 
               class="w-7 h-7 rounded-full border-2 flex items-center justify-center font-black text-[10px] shadow-lg shadow-black/80 font-mono">
            ${place.name.substring(0, 1).toUpperCase()}
          </div>
          ${
            isSelected
              ? '<span class="absolute -bottom-1 w-2 h-2 rounded-full bg-[#ccff00] ring-2 ring-black"></span>'
              : ''
          }
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'outera-place-marker',
        html: markerHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const distStr = place.distanceKm !== undefined ? formatDistance(place.distanceKm) : '';
      const areaStr = place.address || place.neighborhood || (place.district ? `${place.district}, ${place.division}` : '');
      const ratingStr = place.communityScore > 0 ? `${place.communityScore}% worth it` : '';

      const popupHtml = `
        <div class="p-3 min-w-[210px] max-w-[250px] space-y-1.5 text-white font-sans">
          <div class="flex items-center justify-between text-[10px] font-bold">
            <span class="text-[#ccff00] uppercase tracking-wider">${place.category}</span>
            ${distStr ? `<span class="text-zinc-200 font-mono font-bold">${distStr}</span>` : ''}
          </div>
          <h4 class="text-sm font-bold text-white tracking-tight line-clamp-1">${place.name}</h4>
          ${areaStr ? `<p class="text-[11px] text-zinc-400 line-clamp-1">${areaStr}</p>` : ''}
          <div class="flex items-center justify-between pt-1.5 border-t border-white/10 text-[11px]">
            ${ratingStr ? `<span class="text-[#ccff00] font-mono font-bold">${ratingStr}</span>` : '<span></span>'}
            <button
              type="button"
              id="view-place-btn-${place.id}"
              class="h-7 px-2.5 rounded-lg bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-[11px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
            >
              <span>View Place</span>
              <span>→</span>
            </button>
          </div>
        </div>
      `;

      const coords = place.coordinates;
      const marker = L.marker([coords.lat, coords.lng], {
        icon: customIcon,
      });

      marker.bindPopup(popupHtml, {
        className: 'outera-custom-leaflet-popup',
        offset: [0, -12],
        closeButton: true,
      });

      marker.on('popupopen', () => {
        const btn = document.getElementById(`view-place-btn-${place.id}`);
        if (btn) {
          btn.onclick = (e) => {
            e.stopPropagation();
            onSelectPlace(place);
          };
        }
      });

      // Bind click
      marker.on('click', () => {
        setActivePlaceId(place.id);
        map.flyTo([coords.lat, coords.lng], Math.max(map.getZoom(), 15), {
          duration: 0.5,
        });
      });

      group.addLayer(marker);
    });
  }, [displayedPlaces, activePlaceId, onSelectPlace]);

  // Actions
  const handleRecenterOnUser = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (currentLocation.coords) {
      map.flyTo([currentLocation.coords.lat, currentLocation.coords.lng], 15, {
        duration: 0.8,
      });
    } else if (onRequestGPS) {
      onRequestGPS();
    }
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

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
    <div className="w-full rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-5 space-y-4">
      {/* Top Header & Layer Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#ccff00] uppercase tracking-wider">
            <Compass className="w-3.5 h-3.5" />
            <span>Interactive OpenStreetMap</span>
          </div>
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
            {currentLocation.neighborhoodName !== 'Location not set'
              ? `Spots around ${currentLocation.neighborhoodName}`
              : 'Community Discovery Map'}
          </h2>
          {currentLocation.coords && (
            <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
              GPS: {currentLocation.coords.lat.toFixed(4)}, {currentLocation.coords.lng.toFixed(4)}
              {currentLocation.accuracyMeters
                ? ` · Accurate to ~${Math.round(currentLocation.accuracyMeters)}m`
                : ''}
            </p>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleRecenterOnUser}
            className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${
              currentLocation.coords
                ? 'bg-[#ccff00] text-black border-[#ccff00] hover:bg-[#d4ff1a]'
                : 'bg-white/[0.06] text-white border-white/[0.1] hover:bg-white/[0.1]'
            }`}
            title="Re-center on my location"
          >
            <Navigation className={`w-3.5 h-3.5 ${isDetectingGPS ? 'animate-spin' : ''}`} />
            <span>{currentLocation.coords ? 'Re-center On Me' : 'Use My GPS'}</span>
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 flex items-center justify-center border border-white/[0.06]"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 flex items-center justify-center border border-white/[0.06]"
            title="Zoom out"
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
                className={`shrink-0 h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                  isActive
                    ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold shadow-sm'
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

      {/* Map Canvas Container */}
      <div className="relative aspect-[16/10] sm:aspect-[21/9] w-full rounded-2xl bg-zinc-950 border border-white/[0.08] overflow-hidden">
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

        {/* Privacy badge */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/85 border border-white/10 text-[10px] text-zinc-400 pointer-events-none z-10">
          <ShieldCheck className="w-3 h-3 text-[#ccff00]" />
          <span>Real-time GPS · Never stored to database</span>
        </div>
      </div>

      {/* Selected Marker Detail Card Popup */}
      {activePlace && (
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-150">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold mb-1 flex-wrap">
              <span className="text-[#ccff00] uppercase font-bold">{activePlace.category}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">
                {activePlace.address || `${activePlace.district}, ${activePlace.division}`}
              </span>
              {activePlace.distanceKm !== undefined && activePlace.distanceKm !== null && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-200 font-mono font-bold">
                    {formatDistance(activePlace.distanceKm)}
                  </span>
                </>
              )}
              <span className="text-zinc-600">·</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  activePlace.communityConfidence === 'High'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}
              >
                {activePlace.communityConfidence} Confidence
              </span>
            </div>

            <h3 className="text-base font-bold text-white tracking-tight truncate">
              {activePlace.name}
            </h3>

            <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
              {activePlace.shortDescription || activePlace.whyPick}
            </p>

            <div className="flex items-center gap-3 text-xs text-zinc-300 mt-2 font-medium">
              <span>{activePlace.priceLevel.label}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-[#ccff00] font-mono">{activePlace.communityScore}% worth it</span>
              <span className="text-zinc-600">·</span>
              <span>{activePlace.verifiedVisitorsCount} visited</span>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectPlace(activePlace)}
              className="w-full sm:w-auto h-11 px-4 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 hover:bg-[#d4ff1a] active:scale-[0.98] transition-all"
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
