import { supabase } from './supabase';
import { reverseGeocodeNominatim } from './location';
import type {
  SupportedTravelProfile,
  NormalizedManeuverType,
  NormalizedRouteStep,
  NormalizedRouteSummary,
  NormalizedNavigationRouteResponse,
  NavigationRouteErrorResponse,
  ValidatedCoord,
} from '../../supabase/functions/navigation-route/index';

export type {
  SupportedTravelProfile,
  NormalizedManeuverType,
  NormalizedRouteStep,
  NormalizedRouteSummary,
  NormalizedNavigationRouteResponse,
  NavigationRouteErrorResponse,
  ValidatedCoord,
};

export interface RequestNavigationRouteParams {
  origin: ValidatedCoord;
  destination: ValidatedCoord;
  profile: SupportedTravelProfile;
}

export interface VerifiedPlaceDestination {
  placeId: string;
  name: string;
  address: string;
  district: string;
  division: string;
  coordinates: ValidatedCoord | null;
  source: 'supabase_places_table' | 'loaded_place_record' | 'missing';
  errorMessage?: string;
}

export type GpsPermissionState =
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

export interface LiveGpsOriginResult {
  success: boolean;
  state: GpsPermissionState;
  coords: ValidatedCoord | null;
  accuracyMeters?: number;
  label?: string;
  formattedAddress?: string;
  errorMessage?: string;
}

function isValidCoordPair(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
  );
}

/**
 * 1. Reads the actual destination coordinates for a place directly from the existing
 * Supabase `public.places` table. Never fabricates destination coordinates.
 */
export async function fetchPlaceDestinationFromSupabase(place: {
  id: string;
  name: string;
  address?: string;
  district?: string;
  division?: string;
  coordinates?: { lat: number; lng: number } | null;
}): Promise<VerifiedPlaceDestination> {
  try {
    const { data, error } = await supabase
      .from('places')
      .select('id, name, address, area, upazila, district, division, latitude, longitude')
      .eq('id', place.id)
      .maybeSingle();

    if (!error && data) {
      const lat = Number(data.latitude);
      const lng = Number(data.longitude);

      if (isValidCoordPair(lat, lng)) {
        return {
          placeId: String(data.id),
          name: String(data.name || place.name),
          address: String(data.address || data.area || place.address || ''),
          district: String(data.district || place.district || ''),
          division: String(data.division || place.division || ''),
          coordinates: {
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
          },
          source: 'supabase_places_table',
        };
      }
    }
  } catch (err) {
    console.warn('Supabase places coordinate lookup notice:', err);
  }

  // Fallback to the already-loaded place record from `public.places` if its coordinates are valid
  if (place.coordinates && isValidCoordPair(place.coordinates.lat, place.coordinates.lng)) {
    return {
      placeId: place.id,
      name: place.name,
      address: place.address || '',
      district: place.district || '',
      division: place.division || '',
      coordinates: {
        lat: Number(place.coordinates.lat.toFixed(6)),
        lng: Number(place.coordinates.lng.toFixed(6)),
      },
      source: 'loaded_place_record',
    };
  }

  return {
    placeId: place.id,
    name: place.name,
    address: place.address || '',
    district: place.district || '',
    division: place.division || '',
    coordinates: null,
    source: 'missing',
    errorMessage:
      'Exact latitude and longitude coordinates are not recorded for this place in the database.',
  };
}

/**
 * 2. Requests browser location permission and retrieves the user's real current GPS position.
 * Never returns a fabricated or default starting location.
 */
export async function requestUserGpsForNavigation(
  onAddressResolved?: (label: string, formattedAddress: string) => void
): Promise<LiveGpsOriginResult> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      success: false,
      state: 'unsupported',
      coords: null,
      errorMessage:
        'Geolocation is not supported by this browser or device. Please open OUTERA in a browser with GPS/Location support.',
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        if (!isValidCoordPair(lat, lng)) {
          resolve({
            success: false,
            state: 'unavailable',
            coords: null,
            errorMessage: 'Received invalid GPS coordinates from the device sensor. Please retry.',
          });
          return;
        }

        const coords: ValidatedCoord = {
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
        };

        // Resolve immediately with real GPS coordinates so route calculation starts without delay
        resolve({
          success: true,
          state: 'granted',
          coords,
          accuracyMeters: typeof accuracy === 'number' ? Math.round(accuracy) : undefined,
          label: `Current GPS (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`,
        });

        // Resolve human-readable street/neighborhood name asynchronously in the background
        if (onAddressResolved) {
          reverseGeocodeNominatim(coords.lat, coords.lng)
            .then((geo) => {
              if (geo?.neighborhoodName) {
                onAddressResolved(geo.neighborhoodName, geo.formattedAddress || '');
              }
            })
            .catch(() => {});
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({
            success: false,
            state: 'denied',
            coords: null,
            errorMessage:
              'Location permission was denied. To preview your route and start navigation, please allow Location access in your browser site settings and tap Retry GPS.',
          });
          return;
        }

        if (err.code === err.TIMEOUT) {
          resolve({
            success: false,
            state: 'timeout',
            coords: null,
            errorMessage:
              'GPS signal request timed out. Please ensure your device Location/GPS is turned on and tap Retry GPS.',
          });
          return;
        }

        resolve({
          success: false,
          state: 'unavailable',
          coords: null,
          errorMessage:
            'Your current GPS position could not be determined. Check that Location Services are enabled on your device and tap Retry GPS.',
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * 3. Invokes the secure `navigation-route` Supabase Edge Function using the public anon client.
 * Never uses service-role credentials or exposes ORS_API_KEY in the frontend.
 */
export async function fetchNavigationRoute(
  params: RequestNavigationRouteParams
): Promise<NormalizedNavigationRouteResponse | NavigationRouteErrorResponse> {
  const requestBody = {
    origin: {
      lat: params.origin.lat,
      lng: params.origin.lng,
    },
    destination: {
      lat: params.destination.lat,
      lng: params.destination.lng,
    },
    profile: params.profile,
  };

  try {
    const { data, error } = await supabase.functions.invoke('navigation-route', {
      body: requestBody,
    });

    if (!error && data && typeof data === 'object' && 'ok' in data) {
      return data as NormalizedNavigationRouteResponse | NavigationRouteErrorResponse;
    }

    if (error) {
      // Check if the Edge Function returned a structured JSON error body
      try {
        const ctxBody = await (error as any)?.context?.json?.();
        if (ctxBody && typeof ctxBody === 'object' && 'ok' in ctxBody) {
          return ctxBody as NavigationRouteErrorResponse;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // Fall through to server-side proxy endpoint if Edge Function is not yet deployed remotely
  }

  // Fallback to same-origin server endpoint `/api/navigation-route` (which runs the exact Edge Function handler)
  try {
    const res = await fetch('/api/navigation-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const json = await res.json();
    if (json && typeof json === 'object' && 'ok' in json) {
      return json as NormalizedNavigationRouteResponse | NavigationRouteErrorResponse;
    }
  } catch {
    // ignore
  }

  return {
    ok: false,
    error: {
      code: 'UPSTREAM_ERROR',
      message:
        'Unable to reach the navigation-route Edge Function. Ensure `navigation-route` is deployed to Supabase and `ORS_API_KEY` is set in Edge Function secrets.',
    },
  };
}

/**
 * Formats route distance in meters into a clean display string (e.g., "850 m" or "3.4 km")
 */
export function formatRouteDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/**
 * Formats route duration in seconds into a clean display string (e.g., "8 min" or "1 hr 24 min")
 */
export function formatRouteDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

/**
 * Formats an ETA timestamp given remaining seconds from now (e.g., "4:35 PM")
 */
export function formatArrivalTime(remainingSeconds: number): string {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds < 0) return '—';
  const arrival = new Date(Date.now() + remainingSeconds * 1000);
  return arrival.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Haversine distance in meters between two {lat, lng} coordinates
 */
export function haversineDistanceMeters(a: ValidatedCoord, b: ValidatedCoord): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Computes initial bearing in degrees [0, 360) from coordinate A to coordinate B
 */
export function computeBearingDegrees(a: ValidatedCoord, b: ValidatedCoord): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export type ArrivalDetectionState = 'en_route' | 'near_low_accuracy' | 'arrived_estimated';

export interface ArrivalEvaluation {
  state: ArrivalDetectionState;
  hasArrived: boolean;
  directDistanceMeters: number;
  effectiveThresholdMeters: number;
  gpsAccuracyMeters: number | null;
  statusNote: string;
}

export interface OffRouteEvaluation {
  isOffRoute: boolean;
  rawOffRouteMeters: number;
  accuracyBufferMeters: number;
  netOffRouteMeters: number;
  configuredThresholdMeters: number;
  suppressedByLowAccuracy: boolean;
  reason: string;
}

export const DEFAULT_OFF_ROUTE_THRESHOLD_BY_PROFILE: Record<SupportedTravelProfile, number> = {
  'driving-car': 50,
  'cycling-regular': 35,
  'foot-walking': 30,
};

export const CONFIGURABLE_OFF_ROUTE_THRESHOLDS_METERS = [30, 50, 75] as const;

/**
 * Evaluates whether the user has deviated from the active route after accounting for
 * the current GPS accuracy radius (`gpsAccuracyMeters`) and the configured threshold.
 */
export function evaluateOffRouteDeviation(params: {
  offRouteDistanceMeters: number;
  configuredThresholdMeters: number;
  gpsAccuracyMeters: number | null;
  hasArrived: boolean;
}): OffRouteEvaluation {
  const {
    offRouteDistanceMeters,
    configuredThresholdMeters,
    gpsAccuracyMeters,
    hasArrived,
  } = params;

  const threshold = Math.max(20, configuredThresholdMeters || 50);
  const rawMeters = Math.max(0, Math.round(offRouteDistanceMeters));

  if (hasArrived) {
    return {
      isOffRoute: false,
      rawOffRouteMeters: rawMeters,
      accuracyBufferMeters: 0,
      netOffRouteMeters: 0,
      configuredThresholdMeters: threshold,
      suppressedByLowAccuracy: false,
      reason: 'Near destination',
    };
  }

  // If GPS accuracy is worse than 90m, do not declare route deviation due to coarse sensor reading
  if (
    gpsAccuracyMeters !== null &&
    Number.isFinite(gpsAccuracyMeters) &&
    gpsAccuracyMeters > 90
  ) {
    return {
      isOffRoute: false,
      rawOffRouteMeters: rawMeters,
      accuracyBufferMeters: Math.round(gpsAccuracyMeters),
      netOffRouteMeters: 0,
      configuredThresholdMeters: threshold,
      suppressedByLowAccuracy: true,
      reason: `Reroute paused: GPS accuracy (±${Math.round(gpsAccuracyMeters)}m) is too coarse to confirm route deviation.`,
    };
  }

  const accuracyBufferMeters =
    gpsAccuracyMeters !== null && Number.isFinite(gpsAccuracyMeters)
      ? Math.min(45, Math.round(gpsAccuracyMeters * 0.65))
      : 12;

  const netOffRouteMeters = Math.max(0, rawMeters - accuracyBufferMeters);
  const isOffRoute = netOffRouteMeters >= threshold;

  return {
    isOffRoute,
    rawOffRouteMeters: rawMeters,
    accuracyBufferMeters,
    netOffRouteMeters,
    configuredThresholdMeters: threshold,
    suppressedByLowAccuracy: false,
    reason: isOffRoute
      ? `Deviated ~${rawMeters}m from route (net ${netOffRouteMeters}m beyond ±${accuracyBufferMeters}m GPS buffer; threshold ${threshold}m)`
      : 'On route',
  };
}

/**
 * Evaluates destination arrival using distance thresholds and current GPS accuracy.
 * Never claims exact GPS positioning or guaranteed arrival detection.
 */
export function evaluateDestinationArrival(params: {
  directDistanceMeters: number;
  remainingRouteMeters: number;
  gpsAccuracyMeters: number | null;
  profile?: SupportedTravelProfile;
}): ArrivalEvaluation {
  const { directDistanceMeters, remainingRouteMeters, gpsAccuracyMeters, profile } = params;
  const baseThreshold = profile === 'driving-car' ? 30 : 24;
  const accuracy =
    gpsAccuracyMeters !== null && Number.isFinite(gpsAccuracyMeters)
      ? Math.round(gpsAccuracyMeters)
      : null;

  // Expand the arrival threshold modestly when GPS accuracy is wider, capped at 50m
  const effectiveThresholdMeters =
    accuracy !== null
      ? Math.min(50, Math.max(baseThreshold, Math.round(accuracy * 0.8)))
      : baseThreshold;

  const dDirect = Math.round(directDistanceMeters);
  const dRoute = Math.round(remainingRouteMeters);
  const withinZone = dDirect <= effectiveThresholdMeters || dRoute <= Math.min(22, baseThreshold);

  if (!withinZone) {
    return {
      state: 'en_route',
      hasArrived: false,
      directDistanceMeters: dDirect,
      effectiveThresholdMeters,
      gpsAccuracyMeters: accuracy,
      statusNote: `Approximately ${dDirect}m to destination`,
    };
  }

  // If GPS accuracy is very coarse (> 60m), indicate near-destination rather than confirmed arrival
  if (accuracy !== null && accuracy > 60) {
    return {
      state: 'near_low_accuracy',
      hasArrived: false,
      directDistanceMeters: dDirect,
      effectiveThresholdMeters,
      gpsAccuracyMeters: accuracy,
      statusNote: `Near destination (~${dDirect}m), but GPS accuracy is coarse (±${accuracy}m).`,
    };
  }

  return {
    state: 'arrived_estimated',
    hasArrived: true,
    directDistanceMeters: dDirect,
    effectiveThresholdMeters,
    gpsAccuracyMeters: accuracy,
    statusNote:
      accuracy !== null
        ? `Estimated arrival within ~${dDirect}m (GPS accuracy ±${accuracy}m; browser GPS is approximate)`
        : `Estimated arrival within ~${dDirect}m (browser GPS is approximate)`,
  };
}

export interface LiveNavigationProgress {
  /** Closest vertex index along route.geometry.coordinates */
  closestCoordIndex: number;
  /** Snapped/projected point on the route polyline */
  snappedCoord: ValidatedCoord;
  /** Perpendicular distance in meters from the user's raw GPS to the route line */
  offRouteDistanceMeters: number;
  /** Direct straight-line distance in meters from user to destination */
  directDistanceToDestMeters: number;
  /** Remaining distance in meters along the route to the destination */
  remainingDistanceMeters: number;
  /** Remaining estimated duration in seconds */
  remainingDurationSeconds: number;
  /** Current or next active maneuver step */
  nextManeuver: NormalizedRouteStep | null;
  /** Following maneuver step after nextManeuver (for "Then..." preview) */
  followingManeuver: NormalizedRouteStep | null;
  /** Distance in meters from current position to the upcoming maneuver */
  distanceToNextManeuverMeters: number;
  /** Remaining GeoJSON [lng, lat][] coordinates from user's current position to destination */
  remainingCoordinates: [number, number][];
  /** Traversed GeoJSON [lng, lat][] coordinates from origin to user's current position */
  traversedCoordinates: [number, number][];
  /** True when user is within estimated arrival threshold of the destination */
  hasArrived: boolean;
  /** Detailed accuracy-aware arrival evaluation */
  arrivalEvaluation: ArrivalEvaluation;
}

/**
 * Projects a point P onto segment A->B in local equirectangular meters
 * and returns the interpolated [lng, lat], fraction t in [0, 1], and distance in meters.
 */
function projectPointOntoSegment(
  p: ValidatedCoord,
  a: [number, number],
  b: [number, number]
): { point: ValidatedCoord; t: number; distanceMeters: number } {
  const cosLat = Math.cos((p.lat * Math.PI) / 180);
  const ax = a[0] * cosLat;
  const ay = a[1];
  const bx = b[0] * cosLat;
  const by = b[1];
  const px = p.lng * cosLat;
  const py = p.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t = 0;
  if (lenSq > 1e-12) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  }

  const projLng = a[0] + t * (b[0] - a[0]);
  const projLat = a[1] + t * (b[1] - a[1]);
  const point: ValidatedCoord = { lat: projLat, lng: projLng };
  const distanceMeters = haversineDistanceMeters(p, point);

  return { point, t, distanceMeters };
}

/**
 * Computes live turn-by-turn navigation progress from the user's current GPS position
 * and the normalized route returned by `navigation-route`.
 * Pure in-memory calculation — never uploads GPS coordinates to Supabase.
 */
export function computeLiveNavigationProgress(
  userCoord: ValidatedCoord,
  destinationCoord: ValidatedCoord,
  route: NormalizedNavigationRouteResponse,
  gpsAccuracyMeters: number | null = null
): LiveNavigationProgress {
  const coords = route.geometry?.coordinates || [];
  const steps = route.instructions || [];
  const directToDestMeters = haversineDistanceMeters(userCoord, destinationCoord);

  // Fallback if route has fewer than 2 coordinates
  if (coords.length < 2) {
    const arrivalEval = evaluateDestinationArrival({
      directDistanceMeters: directToDestMeters,
      remainingRouteMeters: directToDestMeters,
      gpsAccuracyMeters,
      profile: route.profile,
    });
    const ratio = route.distance > 0 ? Math.min(1, directToDestMeters / route.distance) : 1;
    return {
      closestCoordIndex: 0,
      snappedCoord: userCoord,
      offRouteDistanceMeters: 0,
      directDistanceToDestMeters: Math.round(directToDestMeters),
      remainingDistanceMeters: Math.round(directToDestMeters),
      remainingDurationSeconds: Math.max(0, Math.round(route.duration * ratio)),
      nextManeuver: steps[0] || null,
      followingManeuver: steps[1] || null,
      distanceToNextManeuverMeters: Math.round(directToDestMeters),
      remainingCoordinates: [
        [userCoord.lng, userCoord.lat],
        [destinationCoord.lng, destinationCoord.lat],
      ],
      traversedCoordinates: [],
      hasArrived: arrivalEval.hasArrived,
      arrivalEvaluation: arrivalEval,
    };
  }

  // 1. Find the closest segment along the route polyline
  let bestSegmentIdx = 0;
  let bestT = 0;
  let minDistanceMeters = Infinity;
  let bestProjectedPoint: ValidatedCoord = {
    lat: coords[0][1],
    lng: coords[0][0],
  };

  for (let i = 0; i < coords.length - 1; i++) {
    const proj = projectPointOntoSegment(userCoord, coords[i], coords[i + 1]);
    if (proj.distanceMeters < minDistanceMeters) {
      minDistanceMeters = proj.distanceMeters;
      bestSegmentIdx = i;
      bestT = proj.t;
      bestProjectedPoint = proj.point;
    }
  }

  const closestCoordIndex = bestT >= 0.5 ? bestSegmentIdx + 1 : bestSegmentIdx;

  // 2. Calculate remaining polyline distance from the projected point to the end of the route
  let remainingRouteMeters = haversineDistanceMeters(bestProjectedPoint, {
    lat: coords[bestSegmentIdx + 1][1],
    lng: coords[bestSegmentIdx + 1][0],
  });

  for (let i = bestSegmentIdx + 1; i < coords.length - 1; i++) {
    remainingRouteMeters += haversineDistanceMeters(
      { lat: coords[i][1], lng: coords[i][0] },
      { lat: coords[i + 1][1], lng: coords[i + 1][0] }
    );
  }

  // Include off-route offset if the user is > 20m away from the route line
  const effectiveRemainingMeters =
    minDistanceMeters > 20 ? remainingRouteMeters + minDistanceMeters : remainingRouteMeters;

  const arrivalEvaluation = evaluateDestinationArrival({
    directDistanceMeters: directToDestMeters,
    remainingRouteMeters,
    gpsAccuracyMeters,
    profile: route.profile,
  });
  const hasArrived = arrivalEvaluation.hasArrived;

  // 3. Calculate remaining ETA duration proportionally to route distance (and average speed)
  const totalRouteDistance = Math.max(1, route.distance);
  const fractionRemaining = Math.max(0, Math.min(1.25, effectiveRemainingMeters / totalRouteDistance));
  const remainingDurationSeconds = hasArrived
    ? 0
    : Math.max(15, Math.round(route.duration * fractionRemaining));

  // 4. Determine the upcoming maneuver and distance to it using step wayPoints
  const effectiveSegmentIdx =
    bestT >= 0.95 && bestSegmentIdx + 1 < coords.length - 1
      ? bestSegmentIdx + 1
      : bestSegmentIdx;

  let activeStepArrayIndex = 0;
  for (let s = 0; s < steps.length; s++) {
    const wpEnd = steps[s].wayPoints?.[1] ?? coords.length - 1;
    if (effectiveSegmentIdx < wpEnd || s === steps.length - 1) {
      activeStepArrayIndex = s;
      break;
    }
  }

  const currentStep = steps[activeStepArrayIndex] || null;
  const nextStep = steps[activeStepArrayIndex + 1] || currentStep;
  const followingStep = steps[activeStepArrayIndex + 2] || null;

  // Compute distance along the polyline from projected point to the end of the current step
  // (which is the exact location where the next maneuver occurs)
  const targetWaypointIdx = Math.min(
    coords.length - 1,
    Math.max(effectiveSegmentIdx + 1, currentStep?.wayPoints?.[1] ?? coords.length - 1)
  );

  let distToTurnMeters = haversineDistanceMeters(bestProjectedPoint, {
    lat: coords[effectiveSegmentIdx + 1][1],
    lng: coords[effectiveSegmentIdx + 1][0],
  });

  for (let i = effectiveSegmentIdx + 1; i < targetWaypointIdx; i++) {
    distToTurnMeters += haversineDistanceMeters(
      { lat: coords[i][1], lng: coords[i][0] },
      { lat: coords[i + 1][1], lng: coords[i + 1][0] }
    );
  }

  // Build remaining & traversed coordinate arrays for live route rendering
  const projectedLngLat: [number, number] = [bestProjectedPoint.lng, bestProjectedPoint.lat];
  const remainingCoordinates: [number, number][] = [
    projectedLngLat,
    ...coords.slice(bestSegmentIdx + 1),
  ];
  const traversedCoordinates: [number, number][] = [
    ...coords.slice(0, bestSegmentIdx + 1),
    projectedLngLat,
  ];

  return {
    closestCoordIndex,
    snappedCoord: bestProjectedPoint,
    offRouteDistanceMeters: Math.round(minDistanceMeters),
    directDistanceToDestMeters: Math.round(directToDestMeters),
    remainingDistanceMeters: hasArrived ? 0 : Math.round(effectiveRemainingMeters),
    remainingDurationSeconds,
    nextManeuver: hasArrived
      ? steps[steps.length - 1] || currentStep
      : nextStep || currentStep,
    followingManeuver: hasArrived ? null : followingStep,
    distanceToNextManeuverMeters: hasArrived ? 0 : Math.max(0, Math.round(distToTurnMeters)),
    remainingCoordinates,
    traversedCoordinates,
    hasArrived,
    arrivalEvaluation,
  };
}


