import { useState, useEffect, useCallback } from 'react';
import { UserLocation, LocationStatus } from '../types/outera';
import { DEFAULT_LOCATION, requestBrowserLocation } from '../services/location';

const SESSION_LOCATION_KEY = 'outera_session_location';

export function useUserLocation() {
  const [currentLocation, setCurrentLocation] = useState<UserLocation>(() => {
    if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
      try {
        const saved = window.sessionStorage.getItem(SESSION_LOCATION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.coords) {
            return parsed;
          }
        }
      } catch {
        // Fallback to default
      }
    }
    return DEFAULT_LOCATION;
  });

  const [detecting, setDetecting] = useState<boolean>(false);

  // Store in sessionStorage on update
  const persistSessionLocation = useCallback((loc: UserLocation) => {
    setCurrentLocation(loc);
    if (typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined') {
      try {
        window.sessionStorage.setItem(SESSION_LOCATION_KEY, JSON.stringify(loc));
      } catch {}
    }
  }, []);

  const detectLocation = useCallback(async () => {
    setDetecting(true);
    setCurrentLocation((prev) => ({
      ...prev,
      status: 'detecting',
      errorMessage: undefined,
    }));

    const result = await requestBrowserLocation();
    setDetecting(false);

    if (result.success && result.location) {
      persistSessionLocation(result.location);
      return result.location;
    } else {
      const errLoc: UserLocation = {
        ...currentLocation,
        status: result.error || 'unavailable',
        errorMessage: result.errorMessage,
      };
      setCurrentLocation(errLoc);
      return null;
    }
  }, [currentLocation, persistSessionLocation]);

  const setManualLocation = useCallback((loc: UserLocation) => {
    persistSessionLocation({
      ...loc,
      isCustomManual: true,
      status: 'ready',
    });
  }, [persistSessionLocation]);

  return {
    currentLocation,
    detecting,
    detectLocation,
    setManualLocation,
    setCurrentLocation,
  };
}
