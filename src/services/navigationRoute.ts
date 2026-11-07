import { supabase } from './supabase';
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

/**
 * Invokes the secure `navigation-route` Supabase Edge Function using the public anon client.
 * Never uses service-role credentials or exposes ORS_API_KEY in the frontend.
 */
export async function fetchNavigationRoute(
  params: RequestNavigationRouteParams
): Promise<NormalizedNavigationRouteResponse | NavigationRouteErrorResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('navigation-route', {
      body: {
        origin: {
          lat: params.origin.lat,
          lng: params.origin.lng,
        },
        destination: {
          lat: params.destination.lat,
          lng: params.destination.lng,
        },
        profile: params.profile,
      },
    });

    if (!error && data && typeof data === 'object' && 'ok' in data) {
      return data as NormalizedNavigationRouteResponse | NavigationRouteErrorResponse;
    }

    if (error) {
      // If Supabase Edge Function returned a structured JSON error body in context
      try {
        const ctxBody = await (error as any)?.context?.json?.();
        if (ctxBody && typeof ctxBody === 'object' && 'ok' in ctxBody) {
          return ctxBody as NavigationRouteErrorResponse;
        }
      } catch {
        // ignore
      }

      return {
        ok: false,
        error: {
          code: 'UPSTREAM_ERROR',
          message: error.message || 'Unable to reach navigation-route Edge Function.',
        },
      };
    }

    return {
      ok: false,
      error: {
        code: 'UPSTREAM_ERROR',
        message: 'Unexpected response from navigation-route Edge Function.',
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: 'UPSTREAM_ERROR',
        message: err?.message || 'Network error while requesting route.',
      },
    };
  }
}
