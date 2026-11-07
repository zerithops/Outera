/**
 * OUTERA — Supabase Edge Function: `navigation-route`
 *
 * Secure server-side routing backend powered by OpenRouteService Directions V2 API.
 * Supported travel profiles:
 *   - driving-car
 *   - foot-walking
 *   - cycling-regular
 *
 * Security & Privacy Guarantees:
 *   - Reads `ORS_API_KEY` exclusively from Supabase Edge Function secrets (`Deno.env.get('ORS_API_KEY')`).
 *   - Never exposes `ORS_API_KEY` in responses, headers, or error messages.
 *   - Never stores, logs, or persists user GPS coordinates to any database table or log stream.
 *   - Enforces strict coordinate validation, profile validation, request timeouts, and per-client request throttling.
 */

declare const Deno:
  | {
      env: {
        get(key: string): string | undefined;
      };
      serve?: (handler: (req: Request) => Response | Promise<Response>) => void;
    }
  | undefined;

export type SupportedTravelProfile = 'driving-car' | 'foot-walking' | 'cycling-regular';

export const SUPPORTED_PROFILES: readonly SupportedTravelProfile[] = [
  'driving-car',
  'foot-walking',
  'cycling-regular',
] as const;

export type NormalizedManeuverType =
  | 'turn-left'
  | 'turn-right'
  | 'turn-sharp-left'
  | 'turn-sharp-right'
  | 'turn-slight-left'
  | 'turn-slight-right'
  | 'continue-straight'
  | 'enter-roundabout'
  | 'exit-roundabout'
  | 'u-turn'
  | 'arrive'
  | 'depart'
  | 'keep-left'
  | 'keep-right'
  | 'unknown';

export interface ValidatedCoord {
  lat: number;
  lng: number;
}

export interface NormalizedRouteStep {
  index: number;
  instruction: string;
  streetName: string;
  distance: number; // meters
  duration: number; // seconds
  maneuverType: NormalizedManeuverType;
  orsTypeCode: number;
  wayPoints: [number, number];
  maneuverLocation: [number, number]; // [lng, lat]
  bearingBefore?: number;
  bearingAfter?: number;
  exitNumber?: number;
}

export interface NormalizedRouteSummary {
  profile: SupportedTravelProfile;
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  stepCount: number;
  bbox?: [number, number, number, number];
}

export interface NormalizedNavigationRouteResponse {
  ok: true;
  profile: SupportedTravelProfile;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [lng, lat][]
  };
  distance: number; // meters
  distanceKm: number;
  duration: number; // seconds
  durationMin: number;
  summary: NormalizedRouteSummary;
  instructions: NormalizedRouteStep[];
  maneuverTypes: NormalizedManeuverType[];
  stepDistances: number[]; // meters per step
  bbox?: [number, number, number, number];
}

export interface NavigationRouteErrorResponse {
  ok: false;
  error: {
    code:
      | 'METHOD_NOT_ALLOWED'
      | 'RATE_LIMITED'
      | 'INVALID_JSON'
      | 'INVALID_COORDINATES'
      | 'UNSUPPORTED_PROFILE'
      | 'MISSING_API_KEY'
      | 'UPSTREAM_TIMEOUT'
      | 'UPSTREAM_RATE_LIMITED'
      | 'ROUTE_NOT_FOUND'
      | 'UPSTREAM_ERROR';
    message: string;
    retryAfterSeconds?: number;
  };
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

// ---------------------------------------------------------------------------
// Request Throttling (In-Memory Sliding Window per Client Identifier)
//Note: Does NOT store or key by GPS coordinates—only an anonymized client key.
// ---------------------------------------------------------------------------
const THROTTLE_WINDOW_MS = 60_000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 20; // Max 20 route calculations per minute per client
const MIN_BURST_INTERVAL_MS = 350; // Prevent simultaneous duplicate spam bursts

interface ClientRateRecord {
  timestamps: number[];
  lastRequestAt: number;
}

const rateLimitStore = new Map<string, ClientRateRecord>();

export function resetThrottleStoreForTesting(): void {
  rateLimitStore.clear();
}

function getClientThrottleKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) return `ip:${firstIp}`;
  }
  const realIp =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-client-info') ||
    'anon-client';
  return `client:${realIp}`;
}

function checkRequestThrottle(
  clientKey: string,
  now = Date.now()
): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  // Periodic cleanup of expired buckets to keep memory bounded
  if (rateLimitStore.size > 500) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (now - v.lastRequestAt > THROTTLE_WINDOW_MS) {
        rateLimitStore.delete(k);
      }
    }
  }

  const record = rateLimitStore.get(clientKey) || {
    timestamps: [],
    lastRequestAt: 0,
  };

  // Filter timestamps within current sliding window
  const recent = record.timestamps.filter((t) => now - t < THROTTLE_WINDOW_MS);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = recent[0] || now;
    const retryAfterSeconds = Math.max(1, Math.ceil((THROTTLE_WINDOW_MS - (now - oldest)) / 1000));
    rateLimitStore.set(clientKey, { timestamps: recent, lastRequestAt: record.lastRequestAt });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  if (record.lastRequestAt > 0 && now - record.lastRequestAt < MIN_BURST_INTERVAL_MS) {
    return {
      allowed: false,
      remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - recent.length),
      retryAfterSeconds: 1,
    };
  }

  recent.push(now);
  rateLimitStore.set(clientKey, {
    timestamps: recent,
    lastRequestAt: now,
  });

  return {
    allowed: true,
    remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - recent.length),
    retryAfterSeconds: 0,
  };
}

// ---------------------------------------------------------------------------
// Coordinate & Profile Validation
// ---------------------------------------------------------------------------
export function parseAndValidateCoordinate(
  raw: unknown,
  fieldName: 'origin' | 'destination'
): { valid: true; coord: ValidatedCoord } | { valid: false; message: string } {
  if (!raw) {
    return { valid: false, message: `Missing ${fieldName} coordinates.` };
  }

  let lat: number | undefined;
  let lng: number | undefined;

  if (Array.isArray(raw) && raw.length >= 2) {
    // GeoJSON [lng, lat] array format
    lng = typeof raw[0] === 'number' ? raw[0] : Number(raw[0]);
    lat = typeof raw[1] === 'number' ? raw[1] : Number(raw[1]);
  } else if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const rawLat = obj.lat ?? obj.latitude;
    const rawLng = obj.lng ?? obj.lon ?? obj.longitude;
    lat = typeof rawLat === 'number' ? rawLat : Number(rawLat);
    lng = typeof rawLng === 'number' ? rawLng : Number(rawLng);
  } else {
    return {
      valid: false,
      message: `Invalid ${fieldName} format. Expected { lat, lng } or [lng, lat].`,
    };
  }

  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      valid: false,
      message: `${fieldName} latitude and longitude must be finite numbers.`,
    };
  }

  if (lat < -90 || lat > 90) {
    return {
      valid: false,
      message: `${fieldName} latitude must be between -90 and 90 degrees.`,
    };
  }

  if (lng < -180 || lng > 180) {
    return {
      valid: false,
      message: `${fieldName} longitude must be between -180 and 180 degrees.`,
    };
  }

  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) {
    return {
      valid: false,
      message: `${fieldName} coordinates cannot be (0, 0).`,
    };
  }

  return {
    valid: true,
    coord: {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    },
  };
}

export function haversineDistanceMeters(a: ValidatedCoord, b: ValidatedCoord): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function validateTravelProfile(raw: unknown): SupportedTravelProfile | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === 'driving-car' ||
    normalized === 'foot-walking' ||
    normalized === 'cycling-regular'
  ) {
    return normalized;
  }
  return null;
}

// ---------------------------------------------------------------------------
// OpenRouteService Step Type Code -> Normalized Maneuver Type
// Ref: https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options
// ---------------------------------------------------------------------------
export function mapOrsStepTypeToManeuver(typeCode: unknown): NormalizedManeuverType {
  const code = typeof typeCode === 'number' ? typeCode : Number(typeCode);
  switch (code) {
    case 0:
      return 'turn-left';
    case 1:
      return 'turn-right';
    case 2:
      return 'turn-sharp-left';
    case 3:
      return 'turn-sharp-right';
    case 4:
      return 'turn-slight-left';
    case 5:
      return 'turn-slight-right';
    case 6:
      return 'continue-straight';
    case 7:
      return 'enter-roundabout';
    case 8:
      return 'exit-roundabout';
    case 9:
      return 'u-turn';
    case 10:
      return 'arrive';
    case 11:
      return 'depart';
    case 12:
      return 'keep-left';
    case 13:
      return 'keep-right';
    default:
      return 'unknown';
  }
}

/**
 * Normalizes an OpenRouteService Directions V2 GeoJSON response into OUTERA's
 * structured navigation route format.
 */
export function normalizeOrsGeoJsonResponse(
  orsData: any,
  profile: SupportedTravelProfile
): NormalizedNavigationRouteResponse {
  const feature = orsData?.features?.[0];
  if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) {
    throw new Error('Malformed OpenRouteService GeoJSON response: missing route feature geometry.');
  }

  const rawCoords: unknown[] = feature.geometry.coordinates;
  const coordinates: [number, number][] = rawCoords
    .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2)
    .map((pt) => [Number(pt[0]), Number(pt[1])]);

  if (coordinates.length < 2) {
    throw new Error('OpenRouteService returned fewer than 2 geometry coordinates.');
  }

  const properties = feature.properties || {};
  const summaryObj = properties.summary || {};
  const segments: any[] = Array.isArray(properties.segments) ? properties.segments : [];

  const instructions: NormalizedRouteStep[] = [];
  let stepIdx = 0;

  for (const segment of segments) {
    const steps: any[] = Array.isArray(segment?.steps) ? segment.steps : [];
    for (const step of steps) {
      const wayPointsRaw = Array.isArray(step.way_points) ? step.way_points : [0, 0];
      const startWp = Math.max(0, Math.min(coordinates.length - 1, Number(wayPointsRaw[0]) || 0));
      const endWp = Math.max(0, Math.min(coordinates.length - 1, Number(wayPointsRaw[1]) || startWp));

      const maneuverObj = step.maneuver || {};
      const maneuverLoc: [number, number] =
        Array.isArray(maneuverObj.location) && maneuverObj.location.length >= 2
          ? [Number(maneuverObj.location[0]), Number(maneuverObj.location[1])]
          : coordinates[startWp] || coordinates[0];

      const orsTypeCode = typeof step.type === 'number' ? step.type : Number(step.type ?? -1);
      const maneuverType = mapOrsStepTypeToManeuver(orsTypeCode);
      const stepDistance = Math.max(0, Math.round((Number(step.distance) || 0) * 10) / 10);
      const stepDuration = Math.max(0, Math.round((Number(step.duration) || 0) * 10) / 10);

      instructions.push({
        index: stepIdx++,
        instruction: String(step.instruction || '').trim() || 'Continue on route',
        streetName:
          typeof step.name === 'string' && step.name !== '-' ? step.name.trim() : '',
        distance: stepDistance,
        duration: stepDuration,
        maneuverType,
        orsTypeCode,
        wayPoints: [startWp, endWp],
        maneuverLocation: maneuverLoc,
        bearingBefore:
          typeof maneuverObj.bearing_before === 'number'
            ? maneuverObj.bearing_before
            : undefined,
        bearingAfter:
          typeof maneuverObj.bearing_after === 'number'
            ? maneuverObj.bearing_after
            : undefined,
        exitNumber:
          typeof step.exit_number === 'number' ? step.exit_number : undefined,
      });
    }
  }

  const totalDistanceMeters =
    typeof summaryObj.distance === 'number'
      ? Math.round(summaryObj.distance * 10) / 10
      : Math.round(instructions.reduce((acc, s) => acc + s.distance, 0) * 10) / 10;

  const totalDurationSeconds =
    typeof summaryObj.duration === 'number'
      ? Math.round(summaryObj.duration * 10) / 10
      : Math.round(instructions.reduce((acc, s) => acc + s.duration, 0) * 10) / 10;

  const distanceKm = Math.round((totalDistanceMeters / 1000) * 100) / 100;
  const durationMinutes = Math.max(1, Math.round(totalDurationSeconds / 60));

  const rawBbox = feature.bbox || orsData.bbox;
  const bbox: [number, number, number, number] | undefined =
    Array.isArray(rawBbox) && rawBbox.length >= 4
      ? [Number(rawBbox[0]), Number(rawBbox[1]), Number(rawBbox[2]), Number(rawBbox[3])]
      : undefined;

  return {
    ok: true,
    profile,
    geometry: {
      type: 'LineString',
      coordinates,
    },
    distance: totalDistanceMeters,
    distanceKm,
    duration: totalDurationSeconds,
    durationMin: durationMinutes,
    summary: {
      profile,
      distanceMeters: totalDistanceMeters,
      distanceKm,
      durationSeconds: totalDurationSeconds,
      durationMinutes,
      stepCount: instructions.length,
      bbox,
    },
    instructions,
    maneuverTypes: instructions.map((s) => s.maneuverType),
    stepDistances: instructions.map((s) => s.distance),
    bbox,
  };
}

function readOrsApiKeyFromSecrets(): string | undefined {
  try {
    if (typeof Deno !== 'undefined' && Deno?.env?.get) {
      const val = Deno.env.get('ORS_API_KEY');
      if (val && val.trim()) return val.trim();
    }
  } catch {
    // ignore
  }
  try {
    if (typeof process !== 'undefined' && process?.env?.ORS_API_KEY) {
      const val = process.env.ORS_API_KEY;
      if (val && val.trim()) return val.trim();
    }
  } catch {
    // ignore
  }
  return undefined;
}

function jsonResponse(
  body: NormalizedNavigationRouteResponse | NavigationRouteErrorResponse,
  status: number,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export interface HandleNavigationRouteOptions {
  apiKeyOverride?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  bypassThrottle?: boolean;
}

/**
 * Primary Edge Function HTTP handler for `navigation-route`.
 */
export async function handleNavigationRouteRequest(
  req: Request,
  options: HandleNavigationRouteOptions = {}
): Promise<Response> {
  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 2. Method Validation
  if (req.method !== 'POST') {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only POST requests are supported by navigation-route.',
        },
      },
      405
    );
  }

  // 3. Per-Client Request Throttling
  let rateLimitHeaders: Record<string, string> = {};
  if (!options.bypassThrottle) {
    const clientKey = getClientThrottleKey(req);
    const throttle = checkRequestThrottle(clientKey);
    rateLimitHeaders = {
      'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
      'X-RateLimit-Remaining': String(throttle.remaining),
    };

    if (!throttle.allowed) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: `Too many routing requests. Please wait ${throttle.retryAfterSeconds}s before requesting another route.`,
            retryAfterSeconds: throttle.retryAfterSeconds,
          },
        },
        429,
        {
          ...rateLimitHeaders,
          'Retry-After': String(throttle.retryAfterSeconds),
        }
      );
    }
  }

  // 4. Parse Request JSON Body
  let payload: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Request body must be a JSON object containing origin, destination, and profile.',
          },
        },
        400,
        rateLimitHeaders
      );
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Malformed JSON body.',
        },
      },
      400,
      rateLimitHeaders
    );
  }

  // 5. Validate Origin & Destination Coordinates
  const originValidation = parseAndValidateCoordinate(payload.origin, 'origin');
  if (originValidation.valid === false) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'INVALID_COORDINATES',
          message: originValidation.message,
        },
      },
      400,
      rateLimitHeaders
    );
  }

  const destValidation = parseAndValidateCoordinate(payload.destination, 'destination');
  if (destValidation.valid === false) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'INVALID_COORDINATES',
          message: destValidation.message,
        },
      },
      400,
      rateLimitHeaders
    );
  }

  const origin = originValidation.coord;
  const destination = destValidation.coord;

  const separationMeters = haversineDistanceMeters(origin, destination);
  if (separationMeters < 3) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'INVALID_COORDINATES',
          message: 'Origin and destination coordinates are identical or less than 3 meters apart.',
        },
      },
      400,
      rateLimitHeaders
    );
  }

  // 6. Validate Travel Profile
  const profile = validateTravelProfile(payload.profile ?? 'driving-car');
  if (!profile) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'UNSUPPORTED_PROFILE',
          message: `Unsupported travel profile. Allowed values: ${SUPPORTED_PROFILES.join(', ')}.`,
        },
      },
      400,
      rateLimitHeaders
    );
  }

  // 7. Read ORS_API_KEY from Supabase Edge Function Secrets
  const orsApiKey = options.apiKeyOverride ?? readOrsApiKeyFromSecrets();
  if (!orsApiKey) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'MISSING_API_KEY',
          message:
            'Routing service secret (ORS_API_KEY) is not configured in Supabase Edge Function secrets.',
        },
      },
      503,
      rateLimitHeaders
    );
  }

  // 8. Make Server-Side Request to OpenRouteService Directions V2 GeoJSON Endpoint
  const orsUrl = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const fetchFn = options.fetchImpl ?? fetch;

  try {
    const orsResponse = await fetchFn(orsUrl, {
      method: 'POST',
      headers: {
        Authorization: orsApiKey,
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/geo+json, application/json',
      },
      body: JSON.stringify({
        coordinates: [
          [origin.lng, origin.lat],
          [destination.lng, destination.lat],
        ],
        instructions: true,
        instructions_format: 'text',
        language: 'en',
        elevation: false,
        maneuvers: true,
        units: 'm',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!orsResponse.ok) {
      let orsErrorMessage = '';
      try {
        const errJson = await orsResponse.json();
        orsErrorMessage =
          typeof errJson?.error === 'string'
            ? errJson.error
            : typeof errJson?.error?.message === 'string'
            ? errJson.error.message
            : '';
      } catch {
        // ignore parse failure
      }

      if (orsResponse.status === 429) {
        return jsonResponse(
          {
            ok: false,
            error: {
              code: 'UPSTREAM_RATE_LIMITED',
              message: 'OpenRouteService rate limit reached. Please retry in a few seconds.',
              retryAfterSeconds: 5,
            },
          },
          429,
          rateLimitHeaders
        );
      }

      if (orsResponse.status === 401 || orsResponse.status === 403) {
        return jsonResponse(
          {
            ok: false,
            error: {
              code: 'UPSTREAM_ERROR',
              message: 'OpenRouteService authentication failed. Verify the ORS_API_KEY secret in Supabase.',
            },
          },
          502,
          rateLimitHeaders
        );
      }

      if (orsResponse.status === 404 || orsResponse.status === 400) {
        return jsonResponse(
          {
            ok: false,
            error: {
              code: 'ROUTE_NOT_FOUND',
              message:
                orsErrorMessage ||
                'No navigable route could be found between the specified coordinates for this travel profile.',
            },
          },
          404,
          rateLimitHeaders
        );
      }

      return jsonResponse(
        {
          ok: false,
          error: {
            code: 'UPSTREAM_ERROR',
            message: `Routing provider returned status ${orsResponse.status}.`,
          },
        },
        502,
        rateLimitHeaders
      );
    }

    const orsJson = await orsResponse.json();
    const normalized = normalizeOrsGeoJsonResponse(orsJson, profile);
    return jsonResponse(normalized, 200, rateLimitHeaders);
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err?.name === 'AbortError') {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: 'UPSTREAM_TIMEOUT',
            message: 'OpenRouteService request timed out.',
          },
        },
        504,
        rateLimitHeaders
      );
    }

    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'UPSTREAM_ERROR',
          message: 'Failed to compute navigation route from upstream provider.',
        },
      },
      502,
      rateLimitHeaders
    );
  }
}

// Register with Supabase Edge Runtime (`Deno.serve`) when running in Deno
if (typeof Deno !== 'undefined' && typeof Deno?.serve === 'function') {
  Deno.serve((req: Request) => handleNavigationRouteRequest(req));
}
