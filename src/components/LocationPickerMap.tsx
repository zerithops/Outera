import React, { useEffect, useRef, useState, useCallback } from 'react';
import '../services/maplibreSetup.ts';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Navigation, Search, X, Crosshair, Check } from 'lucide-react';
import { Coordinates } from '../types/outera';
import { requestBrowserLocation, reverseGeocodeNominatim } from '../services/location';
import { getOuteraMapStyle } from '../services/mapStyle';

interface LocationPickerMapProps {
  coordinates: Coordinates | null;
  onChangeCoordinates: (coords: Coordinates | null) => void;
  onAddressDetected?: (address: string) => void;
}

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  coordinates,
  onChangeCoordinates,
  onAddressDetected,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [locatingCurrent, setLocatingCurrent] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('');

  // Default center if no coordinates chosen yet [lng, lat]
  const defaultCenterLng = coordinates?.lng || 90.4125;
  const defaultCenterLat = coordinates?.lat || 23.8103;

  const createPickerPinElement = useCallback(() => {
    const el = document.createElement('div');
    el.className = 'outera-picker-marker-container cursor-grab active:cursor-grabbing';
    el.innerHTML = `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-full">
        <div class="w-8 h-8 rounded-full bg-[#C6FF00] text-black font-extrabold flex items-center justify-center border-2 border-black shadow-[0_4px_16px_rgba(198,255,0,0.45)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <span class="absolute -bottom-1 w-2 h-2 rounded-full bg-black"></span>
      </div>
    `;
    return el;
  }, []);

  // Update or place marker at specific coords
  const setPinAt = useCallback(
    async (lat: number, lng: number, reverseLookup = false) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const roundedLat = Math.round(lat * 100000) / 100000;
      const roundedLng = Math.round(lng * 100000) / 100000;

      onChangeCoordinates({ lat: roundedLat, lng: roundedLng });

      if (!markerRef.current) {
        const marker = new maplibregl.Marker({
          element: createPickerPinElement(),
          draggable: true,
          anchor: 'bottom',
        })
          .setLngLat([roundedLng, roundedLat])
          .addTo(map);

        marker.on('dragend', async () => {
          const lngLat = marker.getLngLat();
          const dLat = Math.round(lngLat.lat * 100000) / 100000;
          const dLng = Math.round(lngLat.lng * 100000) / 100000;
          onChangeCoordinates({ lat: dLat, lng: dLng });
          const geocoded = await reverseGeocodeNominatim(dLat, dLng);
          if (geocoded.neighborhoodName) {
            setSelectedLabel(geocoded.neighborhoodName);
          }
          if (onAddressDetected && geocoded.formattedAddress) {
            onAddressDetected(geocoded.formattedAddress);
          }
        });

        markerRef.current = marker;
      } else {
        markerRef.current.setLngLat([roundedLng, roundedLat]);
      }

      if (reverseLookup) {
        const geocoded = await reverseGeocodeNominatim(roundedLat, roundedLng);
        if (geocoded.neighborhoodName) {
          setSelectedLabel(geocoded.neighborhoodName);
        }
        if (onAddressDetected && geocoded.formattedAddress) {
          onAddressDetected(geocoded.formattedAddress);
        }
      }
    },
    [createPickerPinElement, onChangeCoordinates, onAddressDetected]
  );

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isCancelled = false;

    const initMap = async () => {
      const styleObj = await getOuteraMapStyle();
      if (isCancelled || !mapContainerRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styleObj,
        center: [defaultCenterLng, defaultCenterLat],
        zoom: coordinates ? 15 : 12,
        attributionControl: false,
      });

      map.on('click', (e: maplibregl.MapMouseEvent) => {
        setPinAt(e.lngLat.lat, e.lngLat.lng, true);
      });

      map.on('load', () => {
        if (coordinates) {
          setPinAt(coordinates.lat, coordinates.lng, false);
        }
      });

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      isCancelled = true;
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Use Current Browser Location
  const handleUseCurrentLocation = async () => {
    setLocatingCurrent(true);
    setSearchError(null);

    const result = await requestBrowserLocation();
    setLocatingCurrent(false);

    if (result.success && result.location?.coords) {
      const { lat, lng } = result.location.coords;
      const map = mapInstanceRef.current;
      if (map) {
        map.flyTo({
          center: [lng, lat],
          zoom: 16,
          duration: 700,
        });
      }
      if (result.location.neighborhoodName) {
        setSelectedLabel(result.location.neighborhoodName);
      }
      setPinAt(lat, lng, true);
    } else {
      setSearchError(result.errorMessage || 'Could not detect your current location.');
    }
  };

  // Search Address / Landmark via OpenStreetMap Nominatim
  const handleSearchLocation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setSearching(true);
    setSearchError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&limit=1&accept-language=en`,
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      if (!res.ok) {
        setSearchError('Search failed. Try clicking directly on the map.');
        setSearching(false);
        return;
      }

      const data = await res.json();
      if (!data || data.length === 0) {
        setSearchError('No matching location found. Try a broader landmark or click the map.');
        setSearching(false);
        return;
      }

      const first = data[0];
      const lat = parseFloat(first.lat);
      const lng = parseFloat(first.lon);

      const map = mapInstanceRef.current;
      if (map) {
        map.flyTo({
          center: [lng, lat],
          zoom: 15,
          duration: 700,
        });
      }

      setSelectedLabel(first.name || first.display_name?.split(',')?.[0] || 'Selected spot');
      setPinAt(lat, lng, false);
      if (onAddressDetected && first.display_name) {
        onAddressDetected(first.display_name);
      }
    } catch {
      setSearchError('Search timed out. You can click anywhere on the map to set coordinates.');
    } finally {
      setSearching(false);
    }
  };

  const handleClearPin = () => {
    onChangeCoordinates(null);
    setSelectedLabel('');
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  };

  return (
    <div className="space-y-3 pt-1">
      {/* Header & Quick Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-white">
            <MapPin className="w-3.5 h-3.5 text-[#C6FF00]" />
            <span>Where is this place?</span>
            <span className="text-[#C6FF00]">*</span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Click map or use GPS to set exact coordinates on OUTERA's radar.
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={locatingCurrent}
            className="h-8 px-2.5 rounded-lg bg-[#C6FF00] text-black font-extrabold text-[11px] flex items-center gap-1.5 hover:bg-[#d4ff1a] transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-[#C6FF00]/10"
          >
            <Navigation className={`w-3 h-3 ${locatingCurrent ? 'animate-spin' : ''}`} />
            <span>{locatingCurrent ? 'Locating...' : 'Use My Current Location'}</span>
          </button>

          {coordinates && (
            <button
              type="button"
              onClick={handleClearPin}
              className="h-8 px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white text-[11px] font-semibold border border-white/[0.08] transition-all flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Clear Pin</span>
            </button>
          )}
        </div>
      </div>

      {/* Geocode Search Input */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchLocation(e)}
            placeholder="Search landmark or area (e.g. Dhanmondi Lake, Banani 11)..."
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#C6FF00]"
          />
        </div>
        <button
          type="button"
          onClick={() => handleSearchLocation()}
          disabled={searching || !searchQuery.trim()}
          className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold border border-white/[0.08] transition-all shrink-0 disabled:opacity-40 cursor-pointer"
        >
          {searching ? 'Locating...' : 'Locate'}
        </button>
      </div>

      {searchError && (
        <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
          {searchError}
        </p>
      )}

      {/* MapLibre Picker Canvas */}
      <div className="relative h-44 sm:h-52 w-full rounded-2xl bg-[#0B0D0C] border border-white/[0.1] overflow-hidden">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating crosshair guideline */}
        <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/80 border border-white/10 text-[10px] text-zinc-300 font-medium pointer-events-none z-10 flex items-center gap-1 backdrop-blur-sm">
          <Crosshair className="w-3 h-3 text-[#C6FF00]" />
          <span>Click map to place pin</span>
        </div>

        {/* Selected location indicator badge */}
        {coordinates ? (
          <div className="absolute bottom-2 left-2 max-w-[85%] px-2.5 py-1.5 rounded-md bg-black/90 border border-[#C6FF00]/50 text-[11px] text-[#C6FF00] font-medium z-10 flex items-center gap-1.5 shadow-lg backdrop-blur-sm">
            <Check className="w-3.5 h-3.5 shrink-0 text-[#C6FF00]" />
            <span className="truncate">
              📍 Location selected{selectedLabel ? `: ${selectedLabel}` : ''}
            </span>
          </div>
        ) : (
          <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-md bg-black/80 border border-white/10 text-[10px] text-zinc-400 z-10 backdrop-blur-sm">
            Click map to place pin
          </div>
        )}
      </div>
    </div>
  );
};
