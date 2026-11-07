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
