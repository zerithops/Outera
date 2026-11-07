import React, { useEffect, useRef, useState, useCallback } from 'react';
import '../services/maplibreSetup.ts';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ArrowLeft,
  Navigation,
  MapPin,
  Car,
  Footprints,
  Bike,
  Clock,
  Route,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Compass,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Place } from '../types/outera';
import { getOuteraMapStyle, enforceFlat2DMap, OUTERA_MAP_ACCENT } from '../services/mapStyle';
import { LiveNavigationView } from './LiveNavigationView';
import {
  SupportedTravelProfile,
  NormalizedNavigationRouteResponse,
  ValidatedCoord,
  VerifiedPlaceDestination,
  GpsPermissionState,
  fetchPlaceDestinationFromSupabase,
  requestUserGpsForNavigation,
  fetchNavigationRoute,
  formatRouteDistanceMeters,
  formatRouteDurationSeconds,
} from '../services/navigationRoute';
import {
  VoiceLanguageMode,
  VoiceAvailabilityState,
  detectAvailableNavigationVoices,
  buildBilingualManeuverPrompt,
} from '../services/navigationVoice';

interface NavigationPreviewModalProps {
  place: Place;
  isOpen: boolean;
  onBackToPlace: () => void;
  onStartNavigation?: (params: {
    place: Place;
    origin: ValidatedCoord;
    destination: ValidatedCoord;
    profile: SupportedTravelProfile;
    route: NormalizedNavigationRouteResponse;
  }) => void;
}

const PREVIEW_ROUTE_SOURCE_ID = 'outera-nav-preview-route-source';
const PREVIEW_ROUTE_CASING_LAYER_ID = 'outera-nav-preview-route-casing';
const PREVIEW_ROUTE_LINE_LAYER_ID = 'outera-nav-preview-route-line';

export const NavigationPreviewModal: React.FC<NavigationPreviewModalProps> = ({
  place,
  isOpen,
  onBackToPlace,
  onStartNavigation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // 1. Database Destination State (never fabricated)
  const [loadingDestination, setLoadingDestination] = useState(true);
  const [destinationInfo, setDestinationInfo] = useState<VerifiedPlaceDestination | null>(null);

  // 2. Live Browser GPS Origin State (never fabricated)
  const [gpsState, setGpsState] = useState<GpsPermissionState>('requesting');
  const [originCoords, setOriginCoords] = useState<ValidatedCoord | null>(null);
  const [originAccuracy, setOriginAccuracy] = useState<number | undefined>(undefined);
  const [originLabel, setOriginLabel] = useState<string>('Requesting browser GPS permission...');
  const [originAddress, setOriginAddress] = useState<string>('');
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string | null>(null);

  // 3. Travel Mode Profile State
  const [selectedProfile, setSelectedProfile] = useState<SupportedTravelProfile>('driving-car');

  // 4. Route Calculation State (`navigation-route` Edge Function)
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [routeData, setRouteData] = useState<NormalizedNavigationRouteResponse | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeErrorCode, setRouteErrorCode] = useState<string | null>(null);
  const [showStepPreview, setShowStepPreview] = useState(false);

  // 5. Active Live Navigation state (Phase 4 & Phase 5 Voice Guidance)
  const [isLiveNavigationActive, setIsLiveNavigationActive] = useState(false);
  const [voiceLanguageMode, setVoiceLanguageMode] = useState<VoiceLanguageMode>('en');
  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(false);
  const [voiceAvailability, setVoiceAvailability] = useState<VoiceAvailabilityState>(() =>
    detectAvailableNavigationVoices()
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const refreshVoices = () => {
      setVoiceAvailability(detectAvailableNavigationVoices());
    };
    refreshVoices();
    const synth = window.speechSynthesis;
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', refreshVoices);
    } else {
      synth.onvoiceschanged = refreshVoices;
    }
    return () => {
      if (typeof synth.removeEventListener === 'function') {
        synth.removeEventListener('voiceschanged', refreshVoices);
      } else if (synth.onvoiceschanged === refreshVoices) {
        synth.onvoiceschanged = null;
      }
    };
  }, []);

  // Step 1: Read actual destination coordinates from `public.places` table in Supabase
  const loadDestinationCoordinates = useCallback(async () => {
    setLoadingDestination(true);
    const verified = await fetchPlaceDestinationFromSupabase(place);
    setDestinationInfo(verified);
    setLoadingDestination(false);
    return verified;
  }, [place]);

  // Step 2: Request browser location permission and retrieve real GPS position
  const requestGpsOrigin = useCallback(async () => {
    setGpsState('requesting');
    setGpsErrorMessage(null);
    setOriginLabel('Detecting your current GPS position...');

    const res = await requestUserGpsForNavigation((neighborhood, formatted) => {
      setOriginLabel(neighborhood);
      if (formatted) setOriginAddress(formatted);
    });

    if (res.success && res.coords) {
      setGpsState('granted');
      setOriginCoords(res.coords);
      setOriginAccuracy(res.accuracyMeters);
      setOriginLabel(res.label || `GPS (${res.coords.lat.toFixed(4)}, ${res.coords.lng.toFixed(4)})`);
    } else {
      setGpsState(res.state);
      setOriginCoords(null);
      setOriginAccuracy(undefined);
      setOriginLabel('GPS Location Unavailable');
      setGpsErrorMessage(
        res.errorMessage ||
          'Location permission is required to calculate a route from your current position.'
      );
      setRouteData(null);
    }
  }, []);

  // Trigger destination lookup + GPS permission prompt when preview opens
  useEffect(() => {
    if (!isOpen) {
      setIsLiveNavigationActive(false);
      return;
    }
    setRouteData(null);
    setRouteError(null);
    setRouteErrorCode(null);
    setIsLiveNavigationActive(false);

    loadDestinationCoordinates();
    requestGpsOrigin();
  }, [isOpen, loadDestinationCoordinates, requestGpsOrigin]);

  // Step 3: Calculate route using `navigation-route` Edge Function whenever origin, destination, or travel mode changes
  const calculateRoute = useCallback(
    async (origin: ValidatedCoord, destination: ValidatedCoord, profile: SupportedTravelProfile) => {
      setCalculatingRoute(true);
      setRouteError(null);
      setRouteErrorCode(null);

      const response = await fetchNavigationRoute({
        origin,
        destination,
        profile,
      });

      setCalculatingRoute(false);

      if (response.ok === true) {
        setRouteData(response);
        setRouteError(null);
        setRouteErrorCode(null);
      } else {
        setRouteData(null);
        setRouteErrorCode(response.error.code);
        setRouteError(response.error.message);
      }
    },
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    if (!originCoords || !destinationInfo?.coordinates) return;
    calculateRoute(originCoords, destinationInfo.coordinates, selectedProfile);
  }, [isOpen, originCoords, destinationInfo?.coordinates, selectedProfile, calculateRoute]);

  // Initialize flat 2D MapLibre GL preview map (re-initializes cleanly when returning from LiveNavigationView)
  useEffect(() => {
    if (!isOpen || isLiveNavigationActive || !mapContainerRef.current) return;
    let isCancelled = false;

    const initMap = async () => {
      const styleObj = await getOuteraMapStyle();
      if (isCancelled || !mapContainerRef.current) return;

      const destCoords = destinationInfo?.coordinates || place.coordinates;
      const initialCenter: [number, number] = destCoords
        ? [destCoords.lng, destCoords.lat]
        : originCoords
        ? [originCoords.lng, originCoords.lat]
        : [90.4125, 23.8103];

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styleObj,
        center: initialCenter,
        zoom: 13,
        pitch: 0,
        maxPitch: 0,
        bearing: 0,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: false,
      });

      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution:
            '<span class="text-[9px] text-zinc-400 font-mono">OUTERA · <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · OpenRouteService</span>',
        }),
        'bottom-right'
      );

      map.on('load', () => {
        if (isCancelled) return;
        enforceFlat2DMap(map);
        setIsMapLoaded(true);
      });

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

      mapRef.current = map;

      return () => {
        resizeObserver.disconnect();
      };
    };

    initMap();

    return () => {
      isCancelled = true;
      if (originMarkerRef.current) {
        originMarkerRef.current.remove();
        originMarkerRef.current = null;
      }
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setIsMapLoaded(false);
    };
  }, [isOpen, isLiveNavigationActive]);

  // Update Origin Marker, Destination Marker, and Route Geometry on the flat 2D map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const destCoords = destinationInfo?.coordinates;

    // 1. Destination Marker (Actual Database Place Coordinates)
    if (destCoords) {
      if (!destMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'outera-place-marker-wrapper';
        el.innerHTML = `
          <div class="relative flex flex-col items-center -translate-x-1/2 -translate-y-full">
            <div class="px-2 py-0.5 mb-1 rounded-md bg-[#0B0D0C]/95 border border-[#B7FF00]/60 text-[10px] font-bold text-[#B7FF00] whitespace-nowrap shadow-lg">
              ${place.name}
            </div>
            <div class="w-8 h-8 rounded-full bg-[#B7FF00] text-black font-black text-xs flex items-center justify-center border-2 border-black shadow-[0_0_16px_rgba(183,255,0,0.45)] font-mono">
              ${place.name.substring(0, 1).toUpperCase()}
            </div>
            <span class="w-2 h-2 rounded-full bg-[#B7FF00] ring-2 ring-black -mt-0.5"></span>
          </div>
        `;
        destMarkerRef.current = new maplibregl.Marker({
          element: el,
          anchor: 'bottom',
        })
          .setLngLat([destCoords.lng, destCoords.lat])
          .addTo(map);
      } else {
        destMarkerRef.current.setLngLat([destCoords.lng, destCoords.lat]);
      }
    } else if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }

    // 2. Origin Marker (Real User GPS Position)
    if (originCoords) {
      if (!originMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'outera-user-location-marker';
        el.innerHTML = `
          <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
            <span class="absolute w-9 h-9 rounded-full bg-[#B7FF00]/25 animate-ping pointer-events-none"></span>
            <span class="absolute w-5 h-5 rounded-full bg-[#B7FF00]/40 pointer-events-none"></span>
            <div class="w-3.5 h-3.5 rounded-full bg-[#B7FF00] border-2 border-black shadow-[0_0_12px_#B7FF00]"></div>
          </div>
        `;
        originMarkerRef.current = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat([originCoords.lng, originCoords.lat])
          .addTo(map);
      } else {
        originMarkerRef.current.setLngLat([originCoords.lng, originCoords.lat]);
      }
    } else if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }

    // 3. Route Polyline Layer
    const routeCoords = routeData?.geometry?.coordinates || [];
    const geojsonData = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: routeCoords.length >= 2 ? routeCoords : [],
      },
    };

    try {
      const existingSource = map.getSource(PREVIEW_ROUTE_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (existingSource) {
        existingSource.setData(geojsonData as any);
      } else {
        map.addSource(PREVIEW_ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: geojsonData as any,
        });

        map.addLayer({
          id: PREVIEW_ROUTE_CASING_LAYER_ID,
          type: 'line',
          source: PREVIEW_ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#050706',
            'line-width': 8,
            'line-opacity': 0.9,
          },
        });

        map.addLayer({
          id: PREVIEW_ROUTE_LINE_LAYER_ID,
          type: 'line',
          source: PREVIEW_ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': OUTERA_MAP_ACCENT,
            'line-width': 4,
            'line-opacity': 0.98,
          },
        });
      }
    } catch (err) {
      console.debug('Route preview layer update notice:', err);
    }

    // 4. Fit Bounds cleanly
    if (routeCoords.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      for (const pt of routeCoords) {
        bounds.extend([pt[0], pt[1]]);
      }
      map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 650 });
    } else if (originCoords && destCoords) {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([originCoords.lng, originCoords.lat]);
      bounds.extend([destCoords.lng, destCoords.lat]);
      map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 600 });
    } else if (destCoords) {
      map.flyTo({
        center: [destCoords.lng, destCoords.lat],
        zoom: 14,
        pitch: 0,
        duration: 500,
      });
    }
  }, [isMapLoaded, originCoords, destinationInfo, routeData, place.name]);

  const handleFitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const destCoords = destinationInfo?.coordinates;
    const routeCoords = routeData?.geometry?.coordinates || [];

    if (routeCoords.length >= 2) {
      const bounds = new maplibregl.LngLatBounds();
      for (const pt of routeCoords) {
        bounds.extend([pt[0], pt[1]]);
      }
      map.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 500 });
    } else if (originCoords && destCoords) {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([originCoords.lng, originCoords.lat]);
      bounds.extend([destCoords.lng, destCoords.lat]);
      map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 500 });
    } else if (destCoords) {
      map.flyTo({
        center: [destCoords.lng, destCoords.lat],
        zoom: 14,
        pitch: 0,
        duration: 400,
      });
    }
  }, [destinationInfo, originCoords, routeData]);

  if (!isOpen) return null;

  const travelModes: {
    id: SupportedTravelProfile;
    label: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    { id: 'driving-car', label: 'Driving', icon: Car },
    { id: 'foot-walking', label: 'Walking', icon: Footprints },
    { id: 'cycling-regular', label: 'Cycling', icon: Bike },
  ];

  const canStartNavigation = Boolean(
    originCoords && destinationInfo?.coordinates && routeData && !calculatingRoute
  );

  const handleStartNavigationClick = () => {
    if (!originCoords || !destinationInfo?.coordinates || !routeData) return;
    setIsLiveNavigationActive(true);
    if (onStartNavigation) {
      onStartNavigation({
        place,
        origin: originCoords,
        destination: destinationInfo.coordinates,
        profile: selectedProfile,
        route: routeData,
      });
    }
  };

  if (isLiveNavigationActive && originCoords && destinationInfo?.coordinates && routeData) {
    return (
      <LiveNavigationView
        place={place}
        initialOrigin={originCoords}
        destination={destinationInfo.coordinates}
        profile={selectedProfile}
        route={routeData}
        initialAccuracyMeters={originAccuracy ?? null}
        initialVoiceLanguage={voiceLanguageMode}
        initialVoiceMuted={isVoiceMuted}
        onEndNavigation={() => setIsLiveNavigationActive(false)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nav-preview-title"
    >
      <div className="w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[92vh] bg-[#0B0D0C] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-2xl overflow-y-auto no-scrollbar shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Sticky Top Header with Back to Place button */}
        <div className="sticky top-0 z-20 bg-[#0B0D0C]/95 backdrop-blur-md px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToPlace}
            className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-[#B7FF00]" />
            <span>Back to Place</span>
          </button>

          <div className="min-w-0 text-right">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#B7FF00] font-bold block">
              OUTERA Navigation Preview
            </span>
            <h2
              id="nav-preview-title"
              className="text-xs sm:text-sm font-extrabold text-white truncate"
            >
              {place.name}
            </h2>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* Origin & Destination Card */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#111413] border border-white/[0.08] space-y-3">
            {/* Origin Row (Real Browser GPS) */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-1 w-3 h-3 rounded-full bg-[#B7FF00] ring-4 ring-[#B7FF00]/20 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                      Origin (Your GPS)
                    </span>
                    {gpsState === 'granted' && originAccuracy !== undefined && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#B7FF00]/15 text-[#B7FF00] border border-[#B7FF00]/30">
                        ±{originAccuracy}m
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-white truncate mt-0.5">
                    {gpsState === 'requesting'
                      ? 'Requesting browser location permission...'
                      : originCoords
                      ? originLabel
                      : 'Location permission required'}
                  </p>
                  {originCoords ? (
                    <p className="text-[11px] font-mono text-zinc-400 truncate">
                      {originCoords.lat.toFixed(5)}, {originCoords.lng.toFixed(5)}
                      {originAddress ? ` · ${originAddress}` : ''}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-300/90">
                      Waiting for live device GPS coordinates (no fabricated location used)
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={requestGpsOrigin}
                disabled={gpsState === 'requesting'}
                className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[11px] font-bold text-zinc-200 hover:text-white flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                title="Refresh GPS Position"
              >
                <RefreshCw
                  className={`w-3 h-3 text-[#B7FF00] ${
                    gpsState === 'requesting' ? 'animate-spin' : ''
                  }`}
                />
                <span>{gpsState === 'requesting' ? 'Locating...' : 'Retry GPS'}</span>
              </button>
            </div>

            <div className="border-t border-white/[0.06]" />

            {/* Destination Row (Actual Places Database Coordinates) */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <MapPin className="w-4 h-4 text-[#B7FF00] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                      Destination (Places DB)
                    </span>
                    {destinationInfo?.coordinates && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Verified DB Coords
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-white truncate mt-0.5">
                    {place.name}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {place.address || place.neighborhood || `${place.district}, ${place.division}`}
                  </p>
                  {loadingDestination ? (
                    <p className="text-[11px] font-mono text-zinc-500">
                      Reading coordinates from Places database...
                    </p>
                  ) : destinationInfo?.coordinates ? (
                    <p className="text-[11px] font-mono text-zinc-400">
                      {destinationInfo.coordinates.lat.toFixed(5)},{' '}
                      {destinationInfo.coordinates.lng.toFixed(5)}
                    </p>
                  ) : (
                    <p className="text-[11px] text-rose-400 font-medium">
                      {destinationInfo?.errorMessage ||
                        'Destination coordinates unavailable in database.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Clear GPS Denied / Unavailable Explanation & Retry Banner */}
          {gpsState !== 'granted' && gpsState !== 'requesting' && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-xs sm:text-sm font-bold text-amber-200">
                    {gpsState === 'denied'
                      ? 'Browser Location Permission Denied'
                      : gpsState === 'timeout'
                      ? 'GPS Location Request Timed Out'
                      : 'Current GPS Position Unavailable'}
                  </h3>
                  <p className="text-xs text-amber-100/85 leading-relaxed">
                    {gpsErrorMessage}
                  </p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    OUTERA never uses a fabricated starting location. Enable Location permission in
                    your browser address bar (lock/tune icon → Location → Allow) and tap{' '}
                    <strong className="text-white">Retry Location Permission</strong> below.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={requestGpsOrigin}
                  className="h-9 px-4 rounded-xl bg-[#B7FF00] hover:bg-[#c8ff33] text-black font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Retry Location Permission</span>
                </button>
                <button
                  type="button"
                  onClick={onBackToPlace}
                  className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 text-xs font-bold border border-white/[0.1] cursor-pointer"
                >
                  Return to Place Page
                </button>
              </div>
            </div>
          )}

          {/* Travel Mode Switcher: Driving, Walking, Cycling */}
          <div className="grid grid-cols-3 gap-2">
            {travelModes.map((mode) => {
              const Icon = mode.icon;
              const isSelected = selectedProfile === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setSelectedProfile(mode.id)}
                  className={`h-11 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#B7FF00] text-black border-[#B7FF00] shadow-md shadow-[#B7FF00]/15'
                      : 'bg-[#111413] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          {/* Phase 5: Bilingual Voice Navigation Controls (English / বাংলা / Both) */}
          <div className="p-3.5 rounded-2xl bg-[#111413] border border-white/[0.08] space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsVoiceMuted((prev) => !prev)}
                  className={`h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    !isVoiceMuted
                      ? 'bg-[#B7FF00]/15 text-[#B7FF00] border-[#B7FF00]/40'
                      : 'bg-white/[0.05] text-zinc-400 border-white/[0.1]'
                  }`}
                >
                  {isVoiceMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5" />
                      <span>Voice Off</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-[#B7FF00]" />
                      <span>Voice On</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-1 flex-wrap">
                  {(
                    [
                      { id: 'en', label: 'English' },
                      { id: 'bn', label: 'বাংলা' },
                      { id: 'both', label: 'Both (EN + বাংলা)' },
                    ] as { id: VoiceLanguageMode; label: string }[]
                  ).map((opt) => {
                    const active = voiceLanguageMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setVoiceLanguageMode(opt.id);
                          setIsVoiceMuted(false);
                        }}
                        className={`h-8 px-2.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          active
                            ? 'bg-[#B7FF00] text-black border-[#B7FF00]'
                            : 'bg-white/[0.04] text-zinc-300 border-white/[0.08] hover:bg-white/[0.1]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Honest Device Voice Availability Status */}
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <span
                  className={`px-2 py-0.5 rounded border ${
                    voiceAvailability.englishVoiceAvailable
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-zinc-800 border-white/10 text-zinc-400'
                  }`}
                >
                  EN: {voiceAvailability.englishVoiceAvailable ? 'Ready' : 'Unavailable'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded border ${
                    voiceAvailability.bengaliVoiceAvailable
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  বাংলা: {voiceAvailability.bengaliVoiceAvailable ? 'Ready' : 'No Device Voice'}
                </span>
              </div>
            </div>

            {(voiceLanguageMode === 'bn' || voiceLanguageMode === 'both') &&
              !voiceAvailability.bengaliVoiceAvailable && (
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  Note: No compatible Bengali (<code className="font-mono">bn-BD</code>) speech voice
                  was detected on this browser/device. OUTERA will display natural{' '}
                  <strong>বাংলা</strong> turn instructions on screen and fall back to English voice
                  audio during navigation.
                </p>
              )}
          </div>

          {/* Route Distance & Estimated Duration Summary Bar */}
          <div className="p-4 rounded-2xl bg-[#111413] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {calculatingRoute ? (
              <div className="flex items-center gap-2.5 text-xs text-zinc-300 py-1">
                <RefreshCw className="w-4 h-4 text-[#B7FF00] animate-spin shrink-0" />
                <span>
                  Calculating{' '}
                  <strong className="text-white">
                    {travelModes.find((m) => m.id === selectedProfile)?.label}
                  </strong>{' '}
                  route via <code className="font-mono text-[#B7FF00]">navigation-route</code>...
                </span>
              </div>
            ) : routeData ? (
              <>
                <div className="flex items-center gap-5 flex-wrap">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block">
                      Estimated Duration
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-4 h-4 text-[#B7FF00]" />
                      <span className="text-lg sm:text-xl font-black text-[#B7FF00] font-mono">
                        {formatRouteDurationSeconds(routeData.duration)}
                      </span>
                    </div>
                  </div>

                  <div className="h-8 w-px bg-white/[0.08]" />

                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block">
                      Route Distance
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Route className="w-4 h-4 text-zinc-300" />
                      <span className="text-lg sm:text-xl font-black text-white font-mono">
                        {formatRouteDistanceMeters(routeData.distance)}
                      </span>
                    </div>
                  </div>

                  <div className="h-8 w-px bg-white/[0.08] hidden sm:block" />

                  <div className="hidden sm:block">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block">
                      Turn Steps
                    </span>
                    <span className="text-sm font-bold text-zinc-200 font-mono mt-0.5 block">
                      {routeData.instructions.length} maneuvers
                    </span>
                  </div>
                </div>

                {routeData.instructions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowStepPreview((prev) => !prev)}
                    className="h-8 px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                  >
                    <span>{showStepPreview ? 'Hide Steps' : 'Preview Steps'}</span>
                    {showStepPreview ? (
                      <ChevronUp className="w-3.5 h-3.5 text-[#B7FF00]" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-[#B7FF00]" />
                    )}
                  </button>
                )}
              </>
            ) : routeError ? (
              <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2 text-xs text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-rose-200 block">
                      Route calculation unavailable ({routeErrorCode || 'ERROR'})
                    </span>
                    <span className="text-[11px] text-zinc-300">{routeError}</span>
                  </div>
                </div>
                {originCoords && destinationInfo?.coordinates && (
                  <button
                    type="button"
                    onClick={() =>
                      calculateRoute(originCoords, destinationInfo.coordinates!, selectedProfile)
                    }
                    className="h-8 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-white flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#B7FF00]" />
                    <span>Retry Route</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="text-xs text-zinc-400">
                Allow browser GPS access above to calculate distance and duration to{' '}
                <strong className="text-white">{place.name}</strong>.
              </div>
            )}
          </div>

          {/* Optional Collapsible Step-by-Step Instructions Preview */}
          {routeData && showStepPreview && routeData.instructions.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-[#111413] border border-white/[0.08] max-h-48 overflow-y-auto space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#B7FF00] font-bold">
                Turn-by-Turn Instructions ({routeData.instructions.length})
              </div>
              <div className="divide-y divide-white/[0.05]">
                {routeData.instructions.map((step) => {
                  const bilingualStep = buildBilingualManeuverPrompt({
                    step,
                    distanceMeters: step.distance,
                    hasArrived: step.maneuverType === 'arrive',
                  });
                  return (
                    <div
                      key={step.index}
                      className="py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-white/[0.06] text-[#B7FF00] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {step.index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-zinc-200 font-medium truncate">
                            {bilingualStep.englishText}
                          </p>
                          <p className="text-[11px] text-[#B7FF00]/90 truncate">
                            {bilingualStep.bengaliText}
                          </p>
                          {step.streetName && (
                            <p className="text-[10px] text-zinc-500 truncate">{step.streetName}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                        {formatRouteDistanceMeters(step.distance)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Flat 2D MapLibre Route Preview Canvas */}
          <div className="relative h-[280px] sm:h-[340px] w-full rounded-2xl bg-[#0B0D0C] border border-white/[0.08] overflow-hidden">
            <div ref={mapContainerRef} className="w-full h-full z-0" />

            {/* Map Controls Overlay */}
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
                onClick={handleFitBounds}
                className="w-8 h-8 rounded-lg bg-[#0B0D0C]/90 hover:bg-[#161918] border border-white/10 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer"
                title="Fit route in view"
                aria-label="Fit route in view"
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

            {/* Bottom Left Badge */}
            <div className="absolute bottom-2.5 left-2.5 z-10 pointer-events-none">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/85 border border-white/10 text-[10px] text-zinc-400 backdrop-blur-sm">
                <ShieldCheck className="w-3 h-3 text-[#B7FF00] shrink-0" />
                <span>2D Route Preview · {selectedProfile}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bottom CTA Bar: Return to Place + START NAVIGATION */}
        <div className="sticky bottom-0 z-20 bg-[#0B0D0C]/95 backdrop-blur-md p-3.5 sm:p-4 border-t border-white/[0.08] flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToPlace}
            className="h-11 sm:h-12 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-zinc-200 hover:text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Place</span>
          </button>

          <button
            type="button"
            disabled={!canStartNavigation}
            onClick={handleStartNavigationClick}
            className={`flex-1 h-11 sm:h-12 rounded-xl font-extrabold text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-all ${
              canStartNavigation
                ? 'bg-[#B7FF00] hover:bg-[#c8ff33] text-black shadow-lg shadow-[#B7FF00]/20 active:scale-[0.99] cursor-pointer'
                : 'bg-white/[0.06] text-zinc-500 border border-white/[0.08] cursor-not-allowed'
            }`}
          >
            <Navigation className="w-4 h-4" />
            <span>START NAVIGATION</span>
          </button>
        </div>
      </div>
    </div>
  );
};
