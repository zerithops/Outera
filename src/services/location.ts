import { Coordinates, UserLocation } from '../types/outera';

export const POPULAR_NEIGHBORHOODS: { name: string; city: string; coords: Coordinates; vibe: string }[] = [
  {
    name: 'Dhanmondi Lake District',
    city: 'Dhaka',
    coords: { lat: 23.7461, lng: 90.3742 },
    vibe: 'Walkable lakeside, cozy specialty cafes & art spaces',
  },
  {
    name: 'Banani Road 11',
    city: 'Dhaka',
    coords: { lat: 23.7937, lng: 90.4043 },
    vibe: 'High-energy dining, boutique roasters & curated popups',
  },
  {
    name: 'Gulshan 2 Avenue',
    city: 'Dhaka',
    coords: { lat: 23.7925, lng: 90.4162 },
    vibe: 'Upscale listening rooms, sports hubs & evening lounges',
  },
  {
    name: 'Uttara Sector 3 & 7',
    city: 'Dhaka',
    coords: { lat: 23.8728, lng: 90.3984 },
    vibe: 'Open suburban parks, street courts & relaxed hangout spots',
  },
  {
    name: 'Old Dhaka Heritage Walk',
    city: 'Dhaka',
    coords: { lat: 23.7104, lng: 90.4074 },
    vibe: 'Historic lanes, rooftop tea shacks & vibrant alley culture',
  },
];

export const DEFAULT_LOCATION: UserLocation = {
  coords: POPULAR_NEIGHBORHOODS[0].coords,
  neighborhoodName: POPULAR_NEIGHBORHOODS[0].name,
  isCustomManual: false,
};

/**
 * Calculates distance in kilometers between two GPS coordinates using Haversine formula
 */
export function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
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

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${meters}m away`;
  }
  return `${distanceKm.toFixed(1)} km away`;
}

/**
 * Request browser location with safety timeout
 */
export async function requestBrowserLocation(): Promise<{
  success: boolean;
  location?: UserLocation;
  error?: 'denied' | 'unavailable' | 'timeout' | 'unsupported';
}> {
  if (!navigator.geolocation) {
    return { success: false, error: 'unsupported' };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userCoords: Coordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        // Find nearest popular neighborhood or label as "Current Location"
        let nearestName = 'Nearby Area';
        let minD = 99999;
        for (const hood of POPULAR_NEIGHBORHOODS) {
          const d = calculateDistanceKm(userCoords, hood.coords);
          if (d < minD) {
            minD = d;
            nearestName = hood.name;
          }
        }

        resolve({
          success: true,
          location: {
            coords: userCoords,
            neighborhoodName: minD < 4 ? nearestName : 'Detected Location',
            isCustomManual: false,
            accuracyMeters: position.coords.accuracy,
          },
        });
      },
      (err) => {
        let code: 'denied' | 'unavailable' | 'timeout' = 'unavailable';
        if (err.code === err.PERMISSION_DENIED) code = 'denied';
        if (err.code === err.TIMEOUT) code = 'timeout';
        resolve({ success: false, error: code });
      },
      {
        enableHighAccuracy: true,
        timeout: 9000,
        maximumAge: 60000,
      }
    );
  });
}
