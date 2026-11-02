import { Coordinates, UserLocation, LocationStatus } from '../types/outera';

export const DEFAULT_LOCATION: UserLocation = {
  coords: null,
  latitude: null,
  longitude: null,
  neighborhoodName: 'Location not set',
  district: 'Select Location',
  division: '',
  formattedAddress: '',
  isCustomManual: false,
  status: 'idle',
};

export function isLocationChosen(location: UserLocation): boolean {
  return Boolean(
    location.coords &&
      (location.status === 'ready' || location.isCustomManual) &&
      location.neighborhoodName !== 'Location not set'
  );
}

/**
 * Calculates distance in kilometers between two GPS coordinates using Haversine formula
 */
export function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
  if (!from || !to || typeof from.lat !== 'number' || typeof to.lat !== 'number') {
    return 0;
  }
  const R = 6371; // Earth radius in km
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10;
}

/**
 * Formats a distance in kilometers into a clean human-readable string
 * Example: 120m away, 1.4 km away
 */
export function formatDistance(distanceKm?: number | null, withSuffix = false): string {
  if (distanceKm === null || distanceKm === undefined || isNaN(distanceKm)) {
    return '';
  }
  const suffix = withSuffix ? ' away' : '';
  if (distanceKm < 0.05) {
    return `Right here${suffix}`;
  }
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${meters} m${suffix}`;
  }
  return `${distanceKm.toFixed(1)} km${suffix}`;
}

/**
 * Real reverse-geocoding via OpenStreetMap Nominatim with English locale & fallback handling
 */
export async function reverseGeocodeNominatim(
  lat: number,
  lng: number
): Promise<{
  neighborhoodName: string;
  district: string;
  division: string;
  formattedAddress: string;
}> {
  const fallback = {
    neighborhoodName: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    district: 'Nearby Area',
    division: '',
    formattedAddress: 'Location detected - Unable to determine exact address',
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1&accept-language=en`,
      {
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      return fallback;
    }

    const data = await res.json();
    const address = data?.address || {};

    // Prioritize neighborhood, suburb, residential, road, quarter
    const neighborhood =
      address.suburb ||
      address.neighbourhood ||
      address.residential ||
      address.quarter ||
      address.road ||
      address.village ||
      address.town ||
      address.city_district ||
      address.city ||
      `Area (${lat.toFixed(3)}, ${lng.toFixed(3)})`;

    const district =
      address.city ||
      address.town ||
      address.county ||
      address.state_district ||
      address.municipality ||
      'Detected Area';

    const division = address.state || address.region || address.province || '';

    // Create high-level human-readable address summary
    const addressParts = [
      address.road,
      neighborhood !== address.road ? neighborhood : null,
      district !== neighborhood ? district : null,
      address.country,
    ].filter(Boolean);

    const formattedAddress =
      addressParts.length > 0 ? addressParts.join(', ') : data?.display_name || fallback.formattedAddress;

    return {
      neighborhoodName: neighborhood,
      district,
      division,
      formattedAddress,
    };
  } catch (err) {
    console.warn('Reverse geocoding notice:', err);
    return fallback;
  }
}

export interface GeolocationResult {
  success: boolean;
  location?: UserLocation;
  error?: LocationStatus;
  errorMessage?: string;
}

/**
 * Requests the user's real browser/device GPS coordinates via navigator.geolocation.getCurrentPosition()
 */
export async function requestBrowserLocation(): Promise<GeolocationResult> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      success: false,
      error: 'unsupported',
      errorMessage: 'Geolocation is not supported by your browser.',
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        const geocoded = await reverseGeocodeNominatim(lat, lng);

        const location: UserLocation = {
          coords: { lat, lng },
          latitude: lat,
          longitude: lng,
          accuracyMeters: accuracy,
          neighborhoodName: geocoded.neighborhoodName,
          district: geocoded.district,
          division: geocoded.division,
          formattedAddress: geocoded.formattedAddress,
          isCustomManual: false,
          status: 'ready',
        };

        resolve({
          success: true,
          location,
        });
      },
      (err) => {
        let status: LocationStatus = 'unavailable';
        let message = 'Location access is unavailable.';

        if (err.code === err.PERMISSION_DENIED) {
          status = 'denied';
          message = 'Location access is off. Allow location access to discover places near you.';
        } else if (err.code === err.TIMEOUT) {
          status = 'timeout';
          message = 'Location request timed out. Please try again.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          status = 'unavailable';
          message = 'Device GPS position is currently unavailable.';
        }

        console.error('OUTERA location error', { code: err.code, message: err.message, status });

        resolve({
          success: false,
          error: status,
          errorMessage: message,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      }
    );
  });
}

/**
 * Subscribes to continuous location updates when active navigation/tracking is requested
 */
export function watchBrowserLocation(
  onUpdate: (location: UserLocation) => void,
  onError: (status: LocationStatus, message: string) => void
): () => void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
    console.error('OUTERA location error', 'Geolocation is not supported by your browser.');
    onError('unsupported', 'Geolocation is not supported by your browser.');
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      const geocoded = await reverseGeocodeNominatim(lat, lng);

      onUpdate({
        coords: { lat, lng },
        latitude: lat,
        longitude: lng,
        accuracyMeters: accuracy,
        neighborhoodName: geocoded.neighborhoodName,
        district: geocoded.district,
        division: geocoded.division,
        formattedAddress: geocoded.formattedAddress,
        isCustomManual: false,
        status: 'ready',
      });
    },
    (err) => {
      let status: LocationStatus = 'unavailable';
      let message = 'Location access is unavailable.';

      if (err.code === err.PERMISSION_DENIED) {
        status = 'denied';
        message = 'Location access is off. Allow location access to discover places near you.';
      } else if (err.code === err.TIMEOUT) {
        status = 'timeout';
        message = 'Location request timed out.';
      }

      console.error('OUTERA location error', { code: err.code, message: err.message, status });
      onError(status, message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 15000,
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}
