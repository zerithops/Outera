import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import '../services/maplibreSetup.ts';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Volume2,
  VolumeX,
  LocateFixed,
  XCircle,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  CornerUpLeft,
  CornerUpRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  RotateCcw,
  Compass,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Radio,
  Smartphone,
  Car,
  Footprints,
  Bike,
  ChevronDown,
  ChevronUp,
  Languages,
  Route,
} from 'lucide-react';
import { Place } from '../types/outera';
import { getOuteraMapStyle, enforceFlat2DMap, OUTERA_MAP_ACCENT } from '../services/mapStyle';
import {
  SupportedTravelProfile,
  NormalizedNavigationRouteResponse,
  NormalizedManeuverType,
  ValidatedCoord,
  LiveNavigationProgress,
  OffRouteEvaluation,
  DEFAULT_OFF_ROUTE_THRESHOLD_BY_PROFILE,
  CONFIGURABLE_OFF_ROUTE_THRESHOLDS_METERS,
  computeLiveNavigationProgress,
  evaluateOffRouteDeviation,
  fetchNavigationRoute,
  haversineDistanceMeters,
  computeBearingDegrees,
  formatRouteDistanceMeters,
  formatRouteDurationSeconds,
  formatArrivalTime,
} from '../services/navigationRoute';
import {
  VoiceLanguageMode,
  VoiceAvailabilityState,
  BilingualManeuverPrompt,
  detectAvailableNavigationVoices,
  buildBilingualManeuverPrompt,
  buildReroutedManeuverPrompt,
  speakNavigationPrompt,
  toBengaliNumerals,
} from '../services/navigationVoice';

export interface LiveNavigationViewProps {
  place: Place;
  initialOrigin: ValidatedCoord;
  destination: ValidatedCoord;
  profile: SupportedTravelProfile;
  route: NormalizedNavigationRouteResponse;
  initialAccuracyMeters?: number | null;
  initialVoiceLanguage?: VoiceLanguageMode;
  initialVoiceMuted?: boolean;
  onEndNavigation: () => void;
}

const ACTIVE_ROUTE_SOURCE_ID = 'outera-live-nav-active-route-source';
const ACTIVE_ROUTE_CASING_LAYER_ID = 'outera-live-nav-active-route-casing';
const ACTIVE_ROUTE_LINE_LAYER_ID = 'outera-live-nav-active-route-line';

const TRAVERSED_ROUTE_SOURCE_ID = 'outera-live-nav-traversed-route-source';
const TRAVERSED_ROUTE_LINE_LAYER_ID = 'outera-live-nav-traversed-route-line';

/** Cooldown between automatic reroute requests (15 seconds) */
const REROUTE_COOLDOWN_MS = 15000;
/** Minimum GPS movement required before re-triggering auto-reroute after a recent attempt */
const MIN_DISPLACEMENT_BETWEEN_REROUTES_METERS = 15;
/** Consecutive off-route GPS fixes required before declaring route deviation */
const REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES = 2;

function renderManeuverIcon(type: NormalizedManeuverType | undefined, className = 'w-6 h-6') {
  switch (type) {
    case 'turn-left':
    case 'turn-sharp-left':
      return <CornerUpLeft className={className} />;
    case 'turn-right':
    case 'turn-sharp-right':
      return <CornerUpRight className={className} />;
    case 'turn-slight-left':
    case 'keep-left':
      return <ArrowUpLeft className={className} />;
    case 'turn-slight-right':
    case 'keep-right':
      return <ArrowUpRight className={className} />;
    case 'u-turn':
    case 'enter-roundabout':
    case 'exit-roundabout':
      return <RotateCcw className={className} />;
    case 'arrive':
      return <CheckCircle2 className={className} />;
    case 'depart':
    case 'continue-straight':
    default:
      return <ArrowUp className={className} />;
  }
}

function getAccuracyFeedback(accuracyMeters: number | null): {
  label: string;
  shortLabel: string;
  tone: 'high' | 'medium' | 'low' | 'unknown';
} {
  if (accuracyMeters === null || !Number.isFinite(accuracyMeters)) {
    return { label: 'Acquiring GPS lock...', shortLabel: 'GPS...', tone: 'unknown' };
  }
  const rounded = Math.round(accuracyMeters);
  if (rounded <= 20) {
    return {
      label: `±${rounded}m · High GPS Accuracy`,
      shortLabel: `±${rounded}m Strong`,
      tone: 'high',
    };
  }
  if (rounded <= 60) {
    return {
      label: `±${rounded}m · Moderate GPS Accuracy`,
      shortLabel: `±${rounded}m Fair`,
      tone: 'medium',
    };
  }
  return {
    label: `±${rounded}m · Weak GPS Signal`,
    shortLabel: `±${rounded}m Weak`,
    tone: 'low',
  };
}

export const LiveNavigationView: React.FC<LiveNavigationViewProps> = ({
  place,
  initialOrigin,
  destination,
  profile,
  route,
  initialAccuracyMeters = null,
  initialVoiceLanguage = 'en',
  initialVoiceMuted = false,
  onEndNavigation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userHeadingElRef = useRef<HTMLDivElement | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Active geolocation watchPosition ID ref for guaranteed cleanup
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const previousCoordRef = useRef<ValidatedCoord>(initialOrigin);
  const announcedKeysRef = useRef<Set<string>>(new Set());
  const isProgrammaticCameraMoveRef = useRef<boolean>(false);

  // Phase 6: Automatic Rerouting Throttling & Cooldown Refs
  const isReroutingRef = useRef<boolean>(false);
  const lastRerouteTimestampRef = useRef<number>(0);
  const lastRerouteOriginRef = useRef<ValidatedCoord | null>(null);
  const consecutiveOffRouteCountRef = useRef<number>(0);

  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Active route state (updated dynamically when automatic rerouting succeeds)
  const [activeRoute, setActiveRoute] = useState<NormalizedNavigationRouteResponse>(route);
  useEffect(() => {
    setActiveRoute(route);
  }, [route]);

  // Phase 6: Configurable off-route threshold & reroute status state
  const [offRouteThresholdMeters, setOffRouteThresholdMeters] = useState<number>(
    () => DEFAULT_OFF_ROUTE_THRESHOLD_BY_PROFILE[profile] ?? 50
  );
  const [isRecalculatingRoute, setIsRecalculatingRoute] = useState(false);
  const [rerouteCount, setRerouteCount] = useState(0);
  const [rerouteErrorBanner, setRerouteErrorBanner] = useState<string | null>(null);
  const [rerouteSuccessNotice, setRerouteSuccessNotice] = useState(false);

  // Live GPS state (strictly local in memory — never uploaded to Supabase)
  const [userCoord, setUserCoord] = useState<ValidatedCoord>(initialOrigin);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(initialAccuracyMeters);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [gpsSpeedMps, setGpsSpeedMps] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [permissionRevoked, setPermissionRevoked] = useState(false);

  // Camera follow & UI controls
  const [isCameraCentered, setIsCameraCentered] = useState(true);
  const [showUpcomingSteps, setShowUpcomingSteps] = useState(false);

  // Phase 5: Bilingual Voice Navigation State (English, বাংলা, Both)
  const [isVoiceMuted, setIsVoiceMuted] = useState<boolean>(initialVoiceMuted);
  const [voiceLanguageMode, setVoiceLanguageMode] =
    useState<VoiceLanguageMode>(initialVoiceLanguage);
  const [voiceAvailability, setVoiceAvailability] = useState<VoiceAvailabilityState>(() =>
    detectAvailableNavigationVoices()
  );
  const [showVoiceSettingsPanel, setShowVoiceSettingsPanel] = useState(false);

  // Honest mobile background / screen wake lock state
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [resumedFromBackgroundNotice, setResumedFromBackgroundNotice] = useState(false);
  const [showMobileLimitInfo, setShowMobileLimitInfo] = useState(true);

  // 1. Detect installed voices via `speechSynthesis.getVoices()` and refresh when `voiceschanged` fires
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

  // 2. Compute live navigation progress & accuracy-aware arrival status from `activeRoute`
  const progress: LiveNavigationProgress = useMemo(
    () => computeLiveNavigationProgress(userCoord, destination, activeRoute, gpsAccuracyMeters),
    [userCoord, destination, activeRoute, gpsAccuracyMeters]
  );

  // 3. Evaluate off-route deviation accounting for GPS accuracy and configured threshold
  const offRouteEval: OffRouteEvaluation = useMemo(
    () =>
      evaluateOffRouteDeviation({
        offRouteDistanceMeters: progress.offRouteDistanceMeters,
        configuredThresholdMeters: offRouteThresholdMeters,
        gpsAccuracyMeters,
        hasArrived: progress.hasArrived,
      }),
    [
      progress.offRouteDistanceMeters,
      offRouteThresholdMeters,
      gpsAccuracyMeters,
      progress.hasArrived,
    ]
  );

  // 4. Build deterministic English + Bengali maneuver instruction pair from our translation dictionary
  const currentPrompt: BilingualManeuverPrompt = useMemo(
    () =>
      buildBilingualManeuverPrompt({
        step: progress.nextManeuver,
        distanceMeters: progress.distanceToNextManeuverMeters,
        hasArrived: progress.hasArrived,
      }),
    [progress.nextManeuver, progress.distanceToNextManeuverMeters, progress.hasArrived]
  );

  // 5. Request a new route from the latest GPS position to the original destination
  const triggerReroute = useCallback(
    async (originForReroute: ValidatedCoord, isManualRetry = false) => {
      if (isReroutingRef.current) return;

      const now = Date.now();
      if (!isManualRetry && now - lastRerouteTimestampRef.current < REROUTE_COOLDOWN_MS) {
        return;
      }

      if (!isManualRetry && lastRerouteOriginRef.current) {
        const movedSinceLastReroute = haversineDistanceMeters(
          lastRerouteOriginRef.current,
          originForReroute
        );
        if (
          movedSinceLastReroute < MIN_DISPLACEMENT_BETWEEN_REROUTES_METERS &&
          now - lastRerouteTimestampRef.current < REROUTE_COOLDOWN_MS * 2.5
        ) {
          return;
        }
      }

      isReroutingRef.current = true;
      lastRerouteTimestampRef.current = now;
      lastRerouteOriginRef.current = originForReroute;
      setIsRecalculatingRoute(true);
      setRerouteErrorBanner(null);

      try {
        const response = await fetchNavigationRoute({
          origin: originForReroute,
          destination,
          profile,
        });

        if (response.ok === true) {
          const nextCount = rerouteCount + 1;
          setRerouteCount(nextCount);
          setActiveRoute(response);
          consecutiveOffRouteCountRef.current = 0;
          setRerouteErrorBanner(null);
          setRerouteSuccessNotice(true);
          setTimeout(() => setRerouteSuccessNotice(false), 4000);

          // Reset spoken maneuver deduplication keys for the new route and announce recalculated turn
          announcedKeysRef.current.clear();
          const newProgress = computeLiveNavigationProgress(
            originForReroute,
            destination,
            response,
            gpsAccuracyMeters
          );
          const rerouteAnnouncement = buildReroutedManeuverPrompt({
            firstStep: newProgress.nextManeuver,
            distanceToFirstTurnMeters: newProgress.distanceToNextManeuverMeters,
            rerouteCount: nextCount,
          });

          const spokenRes = speakNavigationPrompt({
            prompt: rerouteAnnouncement,
            languageMode: voiceLanguageMode,
            voices: voiceAvailability,
            isMuted: isVoiceMuted,
          });
          if (spokenRes.spoken) {
            // Mark the initial bucket of the new first step as announced so it doesn't double-fire immediately
            const basePrompt = buildBilingualManeuverPrompt({
              step: newProgress.nextManeuver,
              distanceMeters: newProgress.distanceToNextManeuverMeters,
              hasArrived: newProgress.hasArrived,
            });
            announcedKeysRef.current.add(basePrompt.dedupeKey);
          }
        } else {
          // Handle routing API failure gracefully without losing the current navigation screen
          setRerouteErrorBanner(
            response.error?.message ||
              'Unable to recalculate route right now. Keeping your current route on screen.'
          );
        }
      } catch {
        setRerouteErrorBanner(
          'Network error during route recalculation. Keeping your current route on screen.'
        );
      } finally {
        isReroutingRef.current = false;
        setIsRecalculatingRoute(false);
      }
    },
    [
      destination,
      profile,
      rerouteCount,
      gpsAccuracyMeters,
      voiceLanguageMode,
      voiceAvailability,
      isVoiceMuted,
    ]
  );

  // 6. Monitor off-route deviation across consecutive GPS fixes and trigger automatic rerouting
  useEffect(() => {
    if (progress.hasArrived) {
      consecutiveOffRouteCountRef.current = 0;
      return;
    }

    if (offRouteEval.isOffRoute) {
      consecutiveOffRouteCountRef.current += 1;
      if (consecutiveOffRouteCountRef.current >= REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES) {
        triggerReroute(userCoord, false);
      }
    } else {
      consecutiveOffRouteCountRef.current = 0;
    }
  }, [userCoord, offRouteEval.isOffRoute, progress.hasArrived, triggerReroute]);

  // 7. Announce upcoming turns & arrival without repeating the same maneuver/distance bucket
  useEffect(() => {
    if (isVoiceMuted || isRecalculatingRoute) return;
    if (announcedKeysRef.current.has(currentPrompt.dedupeKey)) {
      return;
    }

    const result = speakNavigationPrompt({
      prompt: currentPrompt,
      languageMode: voiceLanguageMode,
      voices: voiceAvailability,
      isMuted: isVoiceMuted,
    });

    if (result.spoken) {
      announcedKeysRef.current.add(currentPrompt.dedupeKey);
    }
  }, [currentPrompt, voiceLanguageMode, voiceAvailability, isVoiceMuted, isRecalculatingRoute]);

  // Manual repeat voice announcement handler
  const handleSpeakCurrentPromptNow = useCallback(
    (overrideLang?: VoiceLanguageMode) => {
      const targetLang = overrideLang || voiceLanguageMode;
      if (isVoiceMuted) {
        setIsVoiceMuted(false);
      }
      speakNavigationPrompt({
        prompt: currentPrompt,
        languageMode: targetLang,
        voices: voiceAvailability,
        isMuted: false,
      });
      announcedKeysRef.current.add(currentPrompt.dedupeKey);
    },
    [currentPrompt, voiceLanguageMode, voiceAvailability, isVoiceMuted]
  );

  // Toggle Voice Mute / Unmute
  const handleToggleVoiceMute = useCallback(() => {
    setIsVoiceMuted((prev) => {
      const nextMuted = !prev;
      if (nextMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      } else if (!nextMuted) {
        setTimeout(() => {
          speakNavigationPrompt({
            prompt: currentPrompt,
            languageMode: voiceLanguageMode,
            voices: voiceAvailability,
            isMuted: false,
          });
        }, 50);
      }
      return nextMuted;
    });
  }, [currentPrompt, voiceLanguageMode, voiceAvailability]);

  // Change language mode (English, বাংলা, Both)
  const handleSelectLanguageMode = useCallback(
    (mode: VoiceLanguageMode) => {
      setVoiceLanguageMode(mode);
      if (!isVoiceMuted) {
        speakNavigationPrompt({
          prompt: currentPrompt,
          languageMode: mode,
          voices: voiceAvailability,
          isMuted: false,
        });
      }
    },
    [currentPrompt, voiceAvailability, isVoiceMuted]
  );

  // Clear GPS watcher helper
  const stopGpsWatcher = useCallback(() => {
    if (
      watchIdRef.current !== null &&
      typeof navigator !== 'undefined' &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Start `navigator.geolocation.watchPosition()` for live GPS tracking
  const startGpsWatcher = useCallback(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }

    stopGpsWatcher();
    setGpsError(null);

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const nextCoord: ValidatedCoord = {
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
        };

        let resolvedHeading: number | null =
          typeof position.coords.heading === 'number' &&
          Number.isFinite(position.coords.heading) &&
          position.coords.heading >= 0
            ? Math.round(position.coords.heading)
            : null;

        if (resolvedHeading === null && previousCoordRef.current) {
          const prev = previousCoordRef.current;
          const movedLat = Math.abs(nextCoord.lat - prev.lat);
          const movedLng = Math.abs(nextCoord.lng - prev.lng);
          if (movedLat > 0.00003 || movedLng > 0.00003) {
            resolvedHeading = Math.round(computeBearingDegrees(prev, nextCoord));
          }
        }

        previousCoordRef.current = nextCoord;
        setUserCoord(nextCoord);
        setGpsAccuracyMeters(
          typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null
        );
        if (resolvedHeading !== null) {
          setUserHeading(resolvedHeading);
        }
        setGpsSpeedMps(
          typeof position.coords.speed === 'number' &&
            Number.isFinite(position.coords.speed) &&
            position.coords.speed >= 0
            ? position.coords.speed
            : null
        );
        setGpsError(null);
        setPermissionRevoked(false);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionRevoked(true);
          setGpsError(
            'Location permission was denied or revoked. Enable browser location permission and tap Reconnect GPS.'
          );
        } else if (err.code === err.TIMEOUT) {
          setGpsError('GPS signal timed out. Move to an area with a clearer sky view or tap Reconnect GPS.');
        } else {
          setGpsError('Live GPS position temporarily unavailable. Checking device sensor...');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      }
    );

    watchIdRef.current = id;
  }, [stopGpsWatcher]);

  // Manage `watchPosition`, Permissions API listener, and cleanup on unmount / End Navigation
  useEffect(() => {
    startGpsWatcher();

    let permissionStatus: PermissionStatus | null = null;
    const handlePermissionChange = () => {
      if (!permissionStatus) return;
      if (permissionStatus.state === 'denied') {
        setPermissionRevoked(true);
        setGpsError(
          'Location permission was turned off in browser settings. Re-enable Location to resume live tracking.'
        );
        stopGpsWatcher();
      } else if (permissionStatus.state === 'granted') {
        setPermissionRevoked(false);
        setGpsError(null);
        startGpsWatcher();
      }
    };

    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          permissionStatus = status;
          permissionStatus.addEventListener('change', handlePermissionChange);
        })
        .catch(() => {});
    }

    return () => {
      stopGpsWatcher();
      if (permissionStatus) {
        try {
          permissionStatus.removeEventListener('change', handlePermissionChange);
        } catch {
          // ignore
        }
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [startGpsWatcher, stopGpsWatcher]);

  // Handle mobile browser background limitations honestly + Screen Wake Lock API
  useEffect(() => {
    let isMounted = true;

    const requestWakeLock = async () => {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        try {
          const lock = await (navigator as any).wakeLock.request('screen');
          if (!isMounted) {
            lock.release().catch(() => {});
            return;
          }
          wakeLockRef.current = lock;
          setWakeLockActive(true);
          lock.addEventListener('release', () => {
            if (isMounted) setWakeLockActive(false);
          });
        } catch {
          if (isMounted) setWakeLockActive(false);
        }
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setResumedFromBackgroundNotice(true);
        startGpsWatcher();
        requestWakeLock();
        setTimeout(() => {
          if (isMounted) setResumedFromBackgroundNotice(false);
        }, 4500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        try {
          wakeLockRef.current.release();
        } catch {
          // ignore
        }
        wakeLockRef.current = null;
      }
    };
  }, [startGpsWatcher]);

  // Initialize flat 2D MapLibre GL map for live navigation
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let isCancelled = false;

    const initMap = async () => {
      const styleObj = await getOuteraMapStyle();
      if (isCancelled || !mapContainerRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styleObj,
        center: [initialOrigin.lng, initialOrigin.lat],
        zoom: 16.5,
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
            '<span class="text-[9px] text-zinc-400 font-mono">OUTERA Live Nav · <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></span>',
        }),
        'bottom-right'
      );

      // Pause auto-centering when user manually drags/pans the map
      const onUserInteractionStart = (e: any) => {
        if (e?.originalEvent && !isProgrammaticCameraMoveRef.current) {
          setIsCameraCentered(false);
        }
      };

      map.on('dragstart', onUserInteractionStart);

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
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
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
  }, []);

  // Render & update GeoJSON LineString route layers + Live User Marker + Destination Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    // 1. Destination Marker
    if (!destMarkerRef.current) {
      const destEl = document.createElement('div');
      destEl.className = 'outera-live-dest-marker';
      destEl.innerHTML = `
        <div class="relative flex flex-col items-center -translate-x-1/2 -translate-y-full">
          <div class="px-2 py-0.5 mb-1 rounded-md bg-[#0B0D0C]/95 border border-[#B7FF00] text-[10px] font-extrabold text-[#B7FF00] whitespace-nowrap shadow-lg">
            ${place.name}
          </div>
          <div class="w-8 h-8 rounded-full bg-[#B7FF00] text-black font-black text-xs flex items-center justify-center border-2 border-black shadow-[0_0_16px_rgba(183,255,0,0.55)] font-mono">
            ${place.name.substring(0, 1).toUpperCase()}
          </div>
          <span class="w-2 h-2 rounded-full bg-[#B7FF00] ring-2 ring-black -mt-0.5"></span>
        </div>
      `;
      destMarkerRef.current = new maplibregl.Marker({
        element: destEl,
        anchor: 'bottom',
      })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);
    } else {
      destMarkerRef.current.setLngLat([destination.lng, destination.lat]);
    }

    // 2. Live Current-Location Marker
    if (!userMarkerRef.current) {
      const userEl = document.createElement('div');
      userEl.className = 'outera-live-user-marker';
      userEl.innerHTML = `
        <div class="relative flex items-center justify-center w-14 h-14 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <span class="absolute w-12 h-12 rounded-full bg-[#B7FF00]/20 animate-ping"></span>
          <span class="absolute w-8 h-8 rounded-full bg-[#B7FF00]/30 border border-[#B7FF00]/50"></span>
          <div class="outera-heading-indicator absolute inset-0 flex items-start justify-center transition-transform duration-300" style="transform: rotate(0deg);">
            <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-[#B7FF00] -mt-0.5 drop-shadow-[0_0_6px_#B7FF00]"></div>
          </div>
          <div class="relative w-4 h-4 rounded-full bg-[#B7FF00] border-[2.5px] border-[#0B0D0C] shadow-[0_0_14px_#B7FF00]"></div>
        </div>
      `;
      userHeadingElRef.current = userEl.querySelector('.outera-heading-indicator');
      userMarkerRef.current = new maplibregl.Marker({
        element: userEl,
        anchor: 'center',
      })
        .setLngLat([userCoord.lng, userCoord.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userCoord.lng, userCoord.lat]);
    }

    if (userHeadingElRef.current && userHeading !== null) {
      userHeadingElRef.current.style.transform = `rotate(${userHeading}deg)`;
    }

    // 3. Traversed Route GeoJSON LineString
    const traversedCoords =
      progress.traversedCoordinates.length >= 2 ? progress.traversedCoordinates : [];
    const traversedGeoJSON = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: traversedCoords,
      },
    };

    // 4. Active Route GeoJSON LineString in Electric Lime (#B7FF00)
    const activeCoords =
      progress.remainingCoordinates.length >= 2
        ? progress.remainingCoordinates
        : activeRoute.geometry?.coordinates || [];
    const activeGeoJSON = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: activeCoords,
      },
    };

    try {
      const existingTraversed = map.getSource(TRAVERSED_ROUTE_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (existingTraversed) {
        existingTraversed.setData(traversedGeoJSON as any);
      } else {
        map.addSource(TRAVERSED_ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: traversedGeoJSON as any,
        });
        map.addLayer({
          id: TRAVERSED_ROUTE_LINE_LAYER_ID,
          type: 'line',
          source: TRAVERSED_ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#3A413D',
            'line-width': 4,
            'line-opacity': 0.65,
            'line-dasharray': [2, 2],
          },
        });
      }

      const existingActive = map.getSource(ACTIVE_ROUTE_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (existingActive) {
        existingActive.setData(activeGeoJSON as any);
      } else {
        map.addSource(ACTIVE_ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: activeGeoJSON as any,
        });
        map.addLayer({
          id: ACTIVE_ROUTE_CASING_LAYER_ID,
          type: 'line',
          source: ACTIVE_ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#050706',
            'line-width': 9,
            'line-opacity': 0.92,
          },
        });
        map.addLayer({
          id: ACTIVE_ROUTE_LINE_LAYER_ID,
          type: 'line',
          source: ACTIVE_ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': OUTERA_MAP_ACCENT,
            'line-width': 5,
            'line-opacity': 1,
          },
        });
      }
    } catch (err) {
      console.debug('Live route GeoJSON layer update notice:', err);
    }

    // 5. Keep map camera centered on user's live location when follow mode is active
    if (isCameraCentered) {
      isProgrammaticCameraMoveRef.current = true;
      map.easeTo({
        center: [userCoord.lng, userCoord.lat],
        zoom: Math.max(map.getZoom(), 15.8),
        pitch: 0,
        duration: 450,
      });
      setTimeout(() => {
        isProgrammaticCameraMoveRef.current = false;
      }, 480);
    }
  }, [
    isMapLoaded,
    userCoord,
    userHeading,
    destination,
    activeRoute.geometry,
    progress.remainingCoordinates,
    progress.traversedCoordinates,
    isCameraCentered,
    place.name,
  ]);

  // Recenter control handler
  const handleRecenter = useCallback(() => {
    setIsCameraCentered(true);
    const map = mapRef.current;
    if (!map) return;
    isProgrammaticCameraMoveRef.current = true;
    map.easeTo({
      center: [userCoord.lng, userCoord.lat],
      zoom: 16.5,
      pitch: 0,
      bearing: 0,
      duration: 500,
    });
    setTimeout(() => {
      isProgrammaticCameraMoveRef.current = false;
    }, 520);
  }, [userCoord]);

  // Fit full route overview
  const handleShowRouteOverview = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setIsCameraCentered(false);
    const coords = activeRoute.geometry?.coordinates || [];
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([userCoord.lng, userCoord.lat]);
    bounds.extend([destination.lng, destination.lat]);
    for (const pt of coords) {
      bounds.extend([pt[0], pt[1]]);
    }
    map.fitBounds(bounds, { padding: 72, maxZoom: 16, duration: 550 });
  }, [activeRoute.geometry, userCoord, destination]);

  // Cleanly end navigation and stop all watchers/speech
  const handleEndNavigation = useCallback(() => {
    stopGpsWatcher();
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    onEndNavigation();
  }, [stopGpsWatcher, onEndNavigation]);

  const accuracyInfo = getAccuracyFeedback(gpsAccuracyMeters);
  const ProfileIcon =
    profile === 'foot-walking' ? Footprints : profile === 'cycling-regular' ? Bike : Car;
  const profileLabel =
    profile === 'foot-walking' ? 'Walking' : profile === 'cycling-regular' ? 'Cycling' : 'Driving';

  const needsBengaliVoiceWarning =
    (voiceLanguageMode === 'bn' || voiceLanguageMode === 'both') &&
    !voiceAvailability.bengaliVoiceAvailable;

  return (
    <div
      className="fixed inset-0 z-[60] w-full h-[100dvh] bg-[#0B0D0C] flex flex-col justify-between overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Live navigation to ${place.name}`}
    >
      {/* Full-Viewport Flat 2D MapLibre Canvas */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />

      {/* TOP HUD: Next Maneuver Banner (English + বাংলা) + Reroute Status + GPS Accuracy */}
      <div className="relative z-10 w-full max-w-2xl mx-auto p-2.5 sm:p-4 space-y-2 pointer-events-none">
        {/* Primary Next Maneuver Card */}
        <div className="pointer-events-auto rounded-2xl bg-[#0B0D0C]/95 backdrop-blur-md border border-[#B7FF00]/45 shadow-[0_8px_30px_rgba(0,0,0,0.75)] overflow-hidden">
          <div className="p-3 sm:p-4 flex items-start justify-between gap-2.5 sm:gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {/* Maneuver Direction Icon Box */}
              <button
                type="button"
                onClick={() => handleSpeakCurrentPromptNow()}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#B7FF00] hover:bg-[#c8ff33] text-black flex flex-col items-center justify-center shrink-0 shadow-[0_0_20px_rgba(183,255,0,0.3)] cursor-pointer transition-transform active:scale-95"
                title="Tap to speak current turn instruction"
              >
                {renderManeuverIcon(currentPrompt.maneuverType, 'w-6 h-6 sm:w-7 sm:h-7')}
              </button>

              {/* Distance to Next Maneuver & Bilingual Instructions */}
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xl sm:text-2xl font-black text-[#B7FF00] font-mono tracking-tight">
                    {progress.hasArrived
                      ? voiceLanguageMode === 'bn'
                        ? 'আনুমানিক গন্তব্য'
                        : 'Estimated Arrival'
                      : formatRouteDistanceMeters(progress.distanceToNextManeuverMeters)}
                  </span>
                  {!progress.hasArrived &&
                    (voiceLanguageMode === 'bn' || voiceLanguageMode === 'both') && (
                      <span className="text-xs font-bold text-[#B7FF00]/90">
                        ({toBengaliNumerals(formatRouteDistanceMeters(progress.distanceToNextManeuverMeters).replace(' km', ' কি.মি.').replace(' m', ' মিটার'))})
                      </span>
                    )}
                  {progress.nextManeuver?.streetName && !progress.hasArrived && (
                    <span className="text-xs font-mono text-zinc-300 truncate max-w-[160px] sm:max-w-xs">
                      · {progress.nextManeuver.streetName}
                    </span>
                  )}
                </div>

                {/* English Maneuver Instruction */}
                {(voiceLanguageMode === 'en' || voiceLanguageMode === 'both') && (
                  <p className="text-xs sm:text-sm font-extrabold text-white leading-snug mt-0.5">
                    {currentPrompt.englishText}
                  </p>
                )}

                {/* Bengali Maneuver Instruction */}
                {(voiceLanguageMode === 'bn' || voiceLanguageMode === 'both') && (
                  <p
                    className={`font-bold leading-snug ${
                      voiceLanguageMode === 'bn'
                        ? 'text-xs sm:text-sm text-white mt-0.5'
                        : 'text-xs text-[#B7FF00] mt-0.5'
                    }`}
                  >
                    {currentPrompt.bengaliText}
                  </p>
                )}

                {/* Honest Accuracy-Aware Arrival Note */}
                {(progress.hasArrived ||
                  progress.arrivalEvaluation.state === 'near_low_accuracy') && (
                  <p className="text-[11px] text-zinc-300 mt-1 leading-snug">
                    {progress.arrivalEvaluation.statusNote}
                  </p>
                )}
              </div>
            </div>

            {/* Expand Steps Toggle */}
            {activeRoute.instructions.length > 1 && (
              <button
                type="button"
                onClick={() => setShowUpcomingSteps((prev) => !prev)}
                className="h-9 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200 flex items-center gap-1 text-[11px] font-bold shrink-0 cursor-pointer"
                title="Toggle upcoming turns"
              >
                <span className="hidden sm:inline">Steps</span>
                {showUpcomingSteps ? (
                  <ChevronUp className="w-4 h-4 text-[#B7FF00]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#B7FF00]" />
                )}
              </button>
            )}
          </div>

          {/* Phase 6: Route Recalculation Indicator Banner */}
          {isRecalculatingRoute && (
            <div className="px-3 sm:px-4 py-2 bg-[#B7FF00]/15 border-t border-[#B7FF00]/40 flex items-center justify-between gap-2 text-xs text-[#B7FF00]">
              <div className="flex items-center gap-2 font-bold">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>
                  Recalculating {profileLabel.toLowerCase()} route from live GPS... / রুট
                  পুনর্নির্ধারণ করা হচ্ছে...
                </span>
              </div>
              <span className="font-mono text-[10px] text-zinc-300 shrink-0">
                Off-route ~{progress.offRouteDistanceMeters}m
              </span>
            </div>
          )}

          {/* Phase 6: Route Updated Confirmation Notice */}
          {rerouteSuccessNotice && !isRecalculatingRoute && (
            <div className="px-3 sm:px-4 py-1.5 bg-emerald-500/15 border-t border-emerald-500/35 flex items-center justify-between gap-2 text-[11px] text-emerald-300">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Route updated ({formatRouteDistanceMeters(activeRoute.distance)} ·{' '}
                  {formatRouteDurationSeconds(activeRoute.duration)})
                </span>
              </div>
              <span className="font-mono text-[10px]">Reroutes: {rerouteCount}</span>
            </div>
          )}

          {/* Secondary Strip: Voice Language Quick Switcher + GPS Accuracy Badge */}
          <div className="px-3 sm:px-4 py-2 bg-[#121614] border-t border-white/[0.07] flex items-center justify-between gap-2 flex-wrap text-[11px]">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 mr-1 hidden sm:inline">
                Voice:
              </span>
              {(
                [
                  { id: 'en', label: 'English' },
                  { id: 'bn', label: 'বাংলা' },
                  { id: 'both', label: 'Both (EN+বাংলা)' },
                ] as { id: VoiceLanguageMode; label: string }[]
              ).map((opt) => {
                const active = voiceLanguageMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectLanguageMode(opt.id)}
                    className={`h-6 px-2 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                      active
                        ? 'bg-[#B7FF00] text-black shadow-sm'
                        : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setShowVoiceSettingsPanel((prev) => !prev)}
                className="h-6 px-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-[10px] text-zinc-300 flex items-center gap-1 cursor-pointer ml-0.5"
                title="Voice & Reroute Threshold Settings"
              >
                <Languages className="w-3 h-3 text-[#B7FF00]" />
                <span>Settings</span>
              </button>
            </div>

            {/* Live GPS Accuracy Feedback Pill */}
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-mono text-[10px] shrink-0 ${
                accuracyInfo.tone === 'high'
                  ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                  : accuracyInfo.tone === 'medium'
                  ? 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                  : accuracyInfo.tone === 'low'
                  ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                  : 'bg-white/[0.06] border-white/[0.12] text-zinc-300'
              }`}
              title={accuracyInfo.label}
            >
              <Radio className="w-3 h-3 text-[#B7FF00] animate-pulse" />
              <span>{accuracyInfo.shortLabel}</span>
            </div>
          </div>

          {/* Honest Bengali Voice Availability Fallback Banner */}
          {needsBengaliVoiceWarning && (
            <div className="px-3 sm:px-4 py-2 bg-amber-500/10 border-t border-amber-500/25 flex items-center justify-between gap-2 text-[11px] text-amber-200">
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="leading-tight">
                  No Bengali (<code className="font-mono">bn-BD</code>) TTS voice is installed on this
                  device. Showing <strong>বাংলা</strong> text on screen and using{' '}
                  <strong>
                    {voiceAvailability.englishVoiceAvailable
                      ? 'English audio fallback'
                      : 'on-screen guidance'}
                  </strong>
                  .
                </span>
              </div>
            </div>
          )}

          {/* Expandable Voice & Off-Route Threshold Settings Panel */}
          {showVoiceSettingsPanel && (
            <div className="px-3 sm:px-4 py-2.5 bg-[#0E1210] border-t border-white/[0.08] space-y-2.5 text-[11px]">
              {/* Voice Status Row */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono uppercase tracking-wider text-[10px] text-[#B7FF00] font-bold">
                    Web Speech API Voice Status
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSpeakCurrentPromptNow()}
                    className="px-2 py-0.5 rounded bg-[#B7FF00]/15 border border-[#B7FF00]/40 text-[#B7FF00] font-bold text-[10px] cursor-pointer"
                  >
                    Test Announcement
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-2">
                    <span className="text-zinc-400">English Voice:</span>
                    <span
                      className={`font-mono text-[10px] truncate ${
                        voiceAvailability.englishVoiceAvailable ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {voiceAvailability.englishVoiceAvailable
                        ? voiceAvailability.englishVoiceName || 'Available'
                        : 'Not detected on device'}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-2">
                    <span className="text-zinc-400">বাংলা (Bengali) Voice:</span>
                    <span
                      className={`font-mono text-[10px] truncate ${
                        voiceAvailability.bengaliVoiceAvailable ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {voiceAvailability.bengaliVoiceAvailable
                        ? voiceAvailability.bengaliVoiceName || 'Available (bn)'
                        : 'Not installed (Fallback active)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Phase 6: Configurable Off-Route Threshold Selector */}
              <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Route className="w-3.5 h-3.5 text-[#B7FF00]" />
                  <span className="text-zinc-300 font-semibold">
                    Auto-Reroute Deviation Threshold:
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {CONFIGURABLE_OFF_ROUTE_THRESHOLDS_METERS.map((meters) => (
                    <button
                      key={meters}
                      type="button"
                      onClick={() => setOffRouteThresholdMeters(meters)}
                      className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border cursor-pointer ${
                        offRouteThresholdMeters === meters
                          ? 'bg-[#B7FF00] text-black border-[#B7FF00]'
                          : 'bg-white/[0.05] text-zinc-300 border-white/[0.1] hover:bg-white/[0.1]'
                      }`}
                    >
                      {meters}m
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={isRecalculatingRoute}
                    onClick={() => triggerReroute(userCoord, true)}
                    className="ml-1 px-2 py-0.5 rounded bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-2.5 h-2.5 text-[#B7FF00] ${
                        isRecalculatingRoute ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Reroute Now</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Collapsible Upcoming Steps List (Bilingual) */}
          {showUpcomingSteps && (
            <div className="max-h-48 overflow-y-auto bg-[#0D100F] border-t border-white/[0.08] divide-y divide-white/[0.05] px-3 py-1.5">
              {activeRoute.instructions.map((step) => {
                const stepPrompt = buildBilingualManeuverPrompt({
                  step,
                  distanceMeters: step.distance,
                  hasArrived: step.maneuverType === 'arrive',
                });
                return (
                  <div
                    key={step.index}
                    className="py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-[#B7FF00] shrink-0 mt-0.5">
                        {renderManeuverIcon(stepPrompt.maneuverType, 'w-4 h-4')}
                      </span>
                      <div className="min-w-0">
                        {(voiceLanguageMode === 'en' || voiceLanguageMode === 'both') && (
                          <p className="text-zinc-200 truncate">{stepPrompt.englishText}</p>
                        )}
                        {(voiceLanguageMode === 'bn' || voiceLanguageMode === 'both') && (
                          <p className="text-[11px] text-[#B7FF00]/90 truncate">
                            {stepPrompt.bengaliText}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-400 shrink-0">
                      {formatRouteDistanceMeters(step.distance)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Phase 6: Non-Destructive Reroute API Failure Banner (keeps active route on screen) */}
        {rerouteErrorBanner && !isRecalculatingRoute && (
          <div className="pointer-events-auto p-3 rounded-xl bg-amber-950/95 border border-amber-500/40 backdrop-blur-md flex items-center justify-between gap-3 text-xs text-amber-100 shadow-lg">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold text-amber-200">Reroute Request Failed</p>
                <p className="text-[11px] text-amber-100/90 leading-snug">{rerouteErrorBanner}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => triggerReroute(userCoord, true)}
              className="h-8 px-3 rounded-lg bg-[#B7FF00] text-black font-extrabold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Location Error / Permission Revoked Alert Banner */}
        {(gpsError || permissionRevoked) && (
          <div className="pointer-events-auto p-3 rounded-xl bg-rose-950/95 border border-rose-500/40 backdrop-blur-md flex items-center justify-between gap-3 text-xs text-rose-100 shadow-lg">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-bold text-rose-200">
                  {permissionRevoked ? 'GPS Permission Required' : 'GPS Signal Issue'}
                </p>
                <p className="text-[11px] text-rose-100/90 leading-snug">{gpsError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={startGpsWatcher}
              className="h-8 px-3 rounded-lg bg-[#B7FF00] text-black font-extrabold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reconnect GPS</span>
            </button>
          </div>
        )}

        {/* Resumed from mobile background notification */}
        {resumedFromBackgroundNotice && (
          <div className="pointer-events-auto px-3 py-2 rounded-xl bg-[#111413]/95 border border-[#B7FF00]/40 text-[11px] text-zinc-200 flex items-center gap-2 shadow-md">
            <RefreshCw className="w-3.5 h-3.5 text-[#B7FF00] animate-spin shrink-0" />
            <span>Resumed from background — syncing live GPS position...</span>
          </div>
        )}
      </div>

      {/* FLOATING RIGHT-SIDE MAP CONTROLS: Recenter, Voice Mute/Unmute, Overview, Zoom */}
      <div className="relative z-10 flex-1 flex items-center justify-end px-2.5 sm:px-4 pointer-events-none">
        <div className="pointer-events-auto flex flex-col gap-2">
          {/* Recenter Control */}
          <button
            type="button"
            onClick={handleRecenter}
            className={`h-11 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg transition-all cursor-pointer ${
              isCameraCentered
                ? 'bg-[#0B0D0C]/90 text-[#B7FF00] border-[#B7FF00]/40'
                : 'bg-[#B7FF00] text-black border-[#B7FF00] shadow-[#B7FF00]/25 animate-pulse'
            }`}
            title="Recenter camera on your live GPS location"
            aria-label="Recenter on my location"
          >
            <LocateFixed className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-extrabold">
              {isCameraCentered ? 'Centered' : 'Recenter'}
            </span>
          </button>

          {/* Voice Guidance Mute / Unmute Control */}
          <button
            type="button"
            onClick={handleToggleVoiceMute}
            className={`h-11 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg transition-all cursor-pointer ${
              !isVoiceMuted
                ? 'bg-[#0B0D0C]/90 text-[#B7FF00] border-[#B7FF00]/40 hover:bg-[#161A18]'
                : 'bg-[#0B0D0C]/90 text-zinc-400 border-white/15 hover:text-white'
            }`}
            title={isVoiceMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
            aria-label={isVoiceMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
          >
            {isVoiceMuted ? (
              <>
                <VolumeX className="w-4 h-4 text-zinc-400 shrink-0" />
                <span className="text-[11px]">Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-[#B7FF00] shrink-0" />
                <span className="text-[11px]">
                  {voiceLanguageMode === 'en'
                    ? 'Voice: EN'
                    : voiceLanguageMode === 'bn'
                    ? 'Voice: বাংলা'
                    : 'Voice: Both'}
                </span>
              </>
            )}
          </button>

          {/* Route Overview Button */}
          <button
            type="button"
            onClick={handleShowRouteOverview}
            className="w-11 h-10 self-end rounded-xl bg-[#0B0D0C]/90 hover:bg-[#161918] border border-white/15 flex items-center justify-center text-zinc-200 hover:text-white shadow-lg cursor-pointer"
            title="View full route overview"
            aria-label="View full route overview"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Zoom In / Out & Reset North */}
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn({ duration: 220 })}
            className="w-11 h-10 self-end rounded-xl bg-[#0B0D0C]/90 hover:bg-[#161918] border border-white/15 flex items-center justify-center text-zinc-200 hover:text-white shadow-lg cursor-pointer"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut({ duration: 220 })}
            className="w-11 h-10 self-end rounded-xl bg-[#0B0D0C]/90 hover:bg-[#161918] border border-white/15 flex items-center justify-center text-zinc-200 hover:text-white shadow-lg cursor-pointer"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 350 })}
            className="w-11 h-10 self-end rounded-xl bg-[#0B0D0C]/90 hover:bg-[#161918] border border-white/15 flex items-center justify-center text-zinc-200 hover:text-white shadow-lg cursor-pointer"
            title="Reset north"
            aria-label="Reset north"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BOTTOM HUD: Honest Mobile Browser Notice + Live Remaining Distance / ETA + End Navigation */}
      <div className="relative z-10 w-full max-w-2xl mx-auto p-2.5 sm:p-4 space-y-2 pointer-events-none">
        {/* Honest Mobile Browser Background Limitation Notice */}
        {showMobileLimitInfo && (
          <div className="pointer-events-auto px-3 py-2 rounded-xl bg-[#0B0D0C]/90 border border-white/[0.1] backdrop-blur-md flex items-center justify-between gap-2 text-[11px] text-zinc-300">
            <div className="flex items-center gap-2 min-w-0">
              <Smartphone className="w-3.5 h-3.5 text-[#B7FF00] shrink-0" />
              <span className="leading-tight">
                {wakeLockActive
                  ? 'Screen Wake Lock active. Keep browser open on screen — mobile browsers pause GPS & voice in background.'
                  : 'Keep this browser screen open during navigation. Mobile browsers pause GPS updates when locked or backgrounded.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileLimitInfo(false)}
              className="text-[10px] font-mono text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-white/[0.05] shrink-0 cursor-pointer"
            >
              Got it
            </button>
          </div>
        )}

        {/* Primary Telemetry & End Navigation Bar */}
        <div className="pointer-events-auto rounded-2xl bg-[#0B0D0C]/95 backdrop-blur-md border border-white/[0.12] shadow-[0_-8px_30px_rgba(0,0,0,0.8)] p-3 sm:p-4 flex items-center justify-between gap-3">
          {/* Remaining Duration, Distance & ETA */}
          <div className="flex items-center gap-3 sm:gap-5 min-w-0 flex-wrap">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg sm:text-2xl font-black text-[#B7FF00] font-mono leading-none">
                  {progress.hasArrived
                    ? 'Near Goal'
                    : formatRouteDurationSeconds(progress.remainingDurationSeconds)}
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mt-1">
                {progress.hasArrived
                  ? `Est. Arrival (±${gpsAccuracyMeters ?? 15}m)`
                  : `ETA ${formatArrivalTime(progress.remainingDurationSeconds)}`}
              </span>
            </div>

            <div className="h-8 w-px bg-white/[0.1]" />

            <div>
              <span className="text-base sm:text-xl font-black text-white font-mono leading-none block">
                {formatRouteDistanceMeters(progress.remainingDistanceMeters)}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block mt-1">
                Remaining
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs font-bold text-zinc-300">
              <ProfileIcon className="w-3.5 h-3.5 text-[#B7FF00]" />
              <span>{profileLabel}</span>
              {gpsSpeedMps !== null && gpsSpeedMps > 0.5 && (
                <span className="font-mono text-[11px] text-[#B7FF00] ml-1">
                  · {Math.round(gpsSpeedMps * 3.6)} km/h
                </span>
              )}
            </div>
          </div>

          {/* End Navigation Button */}
          <button
            type="button"
            onClick={handleEndNavigation}
            className="h-11 sm:h-12 px-4 sm:px-5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-extrabold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/25 shrink-0 transition-all cursor-pointer"
          >
            <XCircle className="w-4 h-4 shrink-0" />
            <span>End Navigation</span>
          </button>
        </div>
      </div>
    </div>
  );
};
