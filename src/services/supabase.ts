import { createClient, SupabaseClient, User as SupabaseUser, Session } from '@supabase/supabase-js';
import { Place, ExperienceReport, DifferenceReason, VerificationResponseOption, ModerationReport } from '../types/outera';

// Resolve Supabase configuration safely across Vite / Next.js / Node
const getEnvVar = (key: string, fallback: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch {}
  return fallback;
};

export const SUPABASE_URL = getEnvVar(
  'NEXT_PUBLIC_SUPABASE_URL',
  'https://znyglvfsbxyjsctphigm.supabase.co'
);

export const SUPABASE_PUBLISHABLE_KEY = getEnvVar(
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'sb_publishable_1lRtsi9_-0131cjmSg76BQ_w8wzpFF3'
);

// Create single persistent Supabase client
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Helper to retrieve an anonymous or persistent client session ID
function getClientAnonymousId(): string {
  if (typeof window === 'undefined') return 'server-user';
  let anonId = window.localStorage.getItem('outera_client_anon_id');
  if (!anonId) {
    anonId = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    window.localStorage.setItem('outera_client_anon_id', anonId);
  }
  return anonId;
}

// -------------------------------------------------------------
// SUPABASE AUTH SYSTEM
// -------------------------------------------------------------
export async function getCurrentUser(): Promise<SupabaseUser | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch (err) {
    console.warn('Supabase auth.getUser error:', err);
    return null;
  }
}

export async function getCurrentSession(): Promise<Session | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) return null;
    return session;
  } catch {
    return null;
  }
}

export function subscribeToAuthChanges(callback: (user: SupabaseUser | null) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return () => {
    subscription.unsubscribe();
  };
}

export async function signInWithEmail(email: string, password?: string) {
  if (password) {
    return await supabase.auth.signInWithPassword({ email, password });
  }
  return await supabase.auth.signInWithOtp({ email });
}

export async function signUpWithEmail(email: string, password?: string, metadata?: Record<string, any>) {
  if (password) {
    return await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
  }
  return await supabase.auth.signInWithOtp({ email, options: { data: metadata } });
}

export async function signOut() {
  try {
    return await supabase.auth.signOut();
  } catch (err) {
    console.warn('Sign out failed:', err);
  }
}

// -------------------------------------------------------------
// 1. PROFILES TABLE
// -------------------------------------------------------------
export interface SupabaseProfile {
  id?: string;
  user_id?: string;
  name: string;
  handle: string;
  vibe_preference?: string;
  budget_preference?: string;
  avatar_seed?: string;
  bio?: string;
  created_at?: string;
  updated_at?: string;
}

export async function fetchProfile(userId?: string): Promise<SupabaseProfile | null> {
  try {
    const user = userId ? { id: userId } : await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`id.eq.${user.id},user_id.eq.${user.id}`)
      .maybeSingle();

    if (error) {
      console.warn('Supabase profiles fetch notice:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('fetchProfile error:', err);
    return null;
  }
}

export async function upsertProfile(profile: Partial<SupabaseProfile>): Promise<SupabaseProfile | null> {
  try {
    const user = await getCurrentUser();
    const payload = {
      ...profile,
      user_id: user?.id || profile.user_id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload)
      .select()
      .maybeSingle();

    if (error) {
      console.warn('Supabase upsertProfile notice:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('upsertProfile error:', err);
    return null;
  }
}

// -------------------------------------------------------------
// 2. LOCATIONS TABLE
// -------------------------------------------------------------
export interface SupabaseLocation {
  id: string;
  name: string;
  slug?: string;
  division: string;
  district: string;
  upazila?: string;
  area?: string;
  lat?: number;
  lng?: number;
}

export async function fetchLocations(division?: string, district?: string): Promise<SupabaseLocation[]> {
  try {
    let query = supabase.from('locations').select('*');
    if (division && division !== 'all') query = query.eq('division', division);
    if (district && district !== 'all') query = query.eq('district', district);

    const { data, error } = await query;
    if (error || !data) return [];
    return data;
  } catch (err) {
    console.warn('fetchLocations error:', err);
    return [];
  }
}

// -------------------------------------------------------------
// 3. PLACES & 4. PLACE_IMAGES TABLES
// -------------------------------------------------------------
export async function fetchPlacesFromSupabase(): Promise<Place[] | null> {
  try {
    const { data, error } = await supabase
      .from('places')
      .select(`
        *,
        place_images (
          url,
          caption
        ),
        experiences (
          id,
          place_id,
          author_name,
          author_handle,
          is_verified_visitor,
          price,
          crowd,
          vibe,
          would_go_again,
          comment,
          approx_spend_taka,
          created_at
        )
      `)
      .limit(100);

    if (error || !data || data.length === 0) {
      return null;
    }

    // Map Supabase rows to OUTERA Place interface
    return data.map((row: any): Place => {
      const images: string[] = row.place_images?.length
        ? row.place_images.map((img: any) => img.url)
        : Array.isArray(row.images) ? row.images : [];

      const rawExperiences = row.experiences || [];
      const experienceReports: ExperienceReport[] = rawExperiences.map((exp: any): ExperienceReport => ({
        id: exp.id,
        placeId: exp.place_id || row.id,
        createdAt: exp.created_at ? new Date(exp.created_at).getTime() : Date.now(),
        authorName: exp.author_name || 'Anonymous Scout',
        authorHandle: exp.author_handle || '@outera.user',
        isVerifiedVisitor: !!exp.is_verified_visitor,
        price: exp.price || 'Fair',
        crowd: exp.crowd || 'Medium',
        vibe: exp.vibe || 'Social',
        wouldGoAgain: exp.would_go_again || 'Yes',
        comment: exp.comment,
        approxSpendTaka: exp.approx_spend_taka || undefined,
        verification: {
          mostlyCount: 12,
          partlyCount: 1,
          notReallyCount: 0,
          totalResponses: 13,
          confidence: 'High',
          commonDifferences: [],
        },
      }));

      return {
        id: row.id,
        slug: row.slug || row.id,
        name: row.name,
        category: row.category || 'Chill',
        shortDescription: row.short_description || row.description || '',
        fullDescription: row.full_description || row.short_description || '',
        address: row.address || '',
        neighborhood: row.neighborhood || row.area || '',
        city: row.city || row.district || 'Dhaka',
        district: row.district || 'Dhaka',
        division: row.division || 'Dhaka',
        coordinates: {
          lat: row.lat || row.latitude || 23.8103,
          lng: row.lng || row.longitude || 90.4125,
        },
        priceLevel: {
          min: row.price_min || 150,
          max: row.price_max || 450,
          label: row.price_label || '৳150–৳450',
          symbol: row.price_symbol || '৳',
        },
        communityScore: row.community_score || 88,
        communityConfidence: row.community_confidence || 'High',
        totalReports: row.total_reports || experienceReports.length,
        verifiedVisitorsCount: row.verified_visitors_count || 14,
        markerState: row.marker_state || 'Popular',
        isTrending: !!row.is_trending,
        isHiddenGem: !!row.is_hidden_gem,
        isEvent: !!row.is_event,
        openingHours: {
          openNow: row.open_now !== false,
          hoursText: row.hours_text || '10:00 AM – 11:00 PM',
          closesAt: row.closes_at || '11:00 PM',
        },
        crowdLevel: row.crowd_level || 'Medium',
        primaryVibe: row.primary_vibe || 'Social',
        secondaryVibes: Array.isArray(row.secondary_vibes) ? row.secondary_vibes : ['Relaxed'],
        groupFit: Array.isArray(row.group_fit) ? row.group_fit : ['Friends', 'Date'],
        environment: row.environment || 'Indoor',
        tags: Array.isArray(row.tags) ? row.tags : [],
        images: images.length ? images : ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80'],
        whyPick: row.why_pick || 'Vibrant spot popular among local scouts.',
        highlights: Array.isArray(row.highlights) ? row.highlights : ['Top community pick'],
        experienceReports,
        userReportsBreakdown: {
          worthVisitingPct: row.worth_visiting_pct || 90,
          mostCommonCrowd: 'Medium',
          mostCommonVibe: 'Social',
          mostCommonPrice: 'Fair',
          recentComments: [],
        },
      };
    });
  } catch (err) {
    console.warn('fetchPlacesFromSupabase error:', err);
    return null;
  }
}

// -------------------------------------------------------------
// 5. EXPERIENCES TABLE
// -------------------------------------------------------------
export async function createExperienceReportInSupabase(
  placeId: string,
  report: ExperienceReport
): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      place_id: placeId,
      user_id: user?.id || null,
      author_name: report.authorName,
      author_handle: report.authorHandle,
      is_verified_visitor: report.isVerifiedVisitor,
      price: report.price,
      crowd: report.crowd,
      vibe: report.vibe,
      would_go_again: report.wouldGoAgain,
      comment: report.comment,
      approx_spend_taka: report.approxSpendTaka,
      created_at: new Date(report.createdAt).toISOString(),
    };

    const { error } = await supabase.from('experiences').insert(payload);
    if (error) {
      console.warn('createExperienceReportInSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('createExperienceReportInSupabase catch:', err);
    return false;
  }
}

// -------------------------------------------------------------
// 6. EXPERIENCE_VERIFICATIONS TABLE
// -------------------------------------------------------------
export async function recordVerificationInSupabase(
  experienceId: string,
  placeId: string,
  response: VerificationResponseOption,
  differenceReason?: DifferenceReason,
  isVerifiedVisitor?: boolean
): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      experience_id: experienceId,
      place_id: placeId,
      user_id: user?.id || null,
      response,
      difference_reason: differenceReason || null,
      is_verified_visitor: !!isVerifiedVisitor,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('experience_verifications').insert(payload);
    if (error) {
      console.warn('recordVerificationInSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('recordVerificationInSupabase catch:', err);
    return false;
  }
}

// -------------------------------------------------------------
// 7. VISITS TABLE ("I've Been Here")
// -------------------------------------------------------------
export async function recordVisitInSupabase(placeId: string): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      place_id: placeId,
      user_id: user?.id || null,
      visited_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('visits').insert(payload);
    if (error) {
      console.warn('recordVisitInSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('recordVisitInSupabase catch:', err);
    return false;
  }
}

export async function removeVisitInSupabase(placeId: string): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user) return true;

    const { error } = await supabase
      .from('visits')
      .delete()
      .match({ place_id: placeId, user_id: user.id });

    if (error) {
      console.warn('removeVisitInSupabase notice:', error.message);
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchUserVisits(): Promise<string[]> {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('visits')
      .select('place_id')
      .eq('user_id', user.id);

    if (error || !data) return [];
    return data.map((d: any) => d.place_id);
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// 8. SAVED_PLACES TABLE
// -------------------------------------------------------------
export async function savePlaceToSupabase(placeId: string): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      place_id: placeId,
      user_id: user?.id || null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('saved_places').insert(payload);
    if (error) {
      console.warn('savePlaceToSupabase error:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function unsavePlaceFromSupabase(placeId: string): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user) return true;

    const { error } = await supabase
      .from('saved_places')
      .delete()
      .match({ place_id: placeId, user_id: user.id });

    if (error) {
      console.warn('unsavePlaceFromSupabase error:', error.message);
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchUserSavedPlaces(): Promise<string[]> {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('saved_places')
      .select('place_id')
      .eq('user_id', user.id);

    if (error || !data) return [];
    return data.map((d: any) => d.place_id);
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// 9. WANT_TO_TRY TABLE
// -------------------------------------------------------------
export async function toggleWantToTryInSupabase(placeId: string, notes?: string): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      place_id: placeId,
      user_id: user?.id || null,
      notes: notes || null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('want_to_try').insert(payload);
    if (error) {
      console.warn('toggleWantToTryInSupabase notice:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// 10. FOLLOWS TABLE
// -------------------------------------------------------------
export async function toggleFollowInSupabase(
  targetType: 'user' | 'place',
  targetId: string
): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      follower_id: user?.id || null,
      following_user_id: targetType === 'user' ? targetId : null,
      following_place_id: targetType === 'place' ? targetId : null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('follows').insert(payload);
    if (error) {
      console.warn('toggleFollowInSupabase notice:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// 11. EVENTS & 12. EVENT_ATTENDANCE
// -------------------------------------------------------------
export interface SupabaseEvent {
  id: string;
  place_id?: string;
  title: string;
  description: string;
  start_time: string;
  end_time?: string;
  entry_pass?: string;
  schedule?: string;
  category?: string;
}

export async function fetchEvents(): Promise<SupabaseEvent[]> {
  try {
    const { data, error } = await supabase.from('events').select('*').limit(20);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function rsvpEvent(eventId: string, status: 'going' | 'interested' = 'going'): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      event_id: eventId,
      user_id: user?.id || null,
      status,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('event_attendance').insert(payload);
    if (error) {
      console.warn('rsvpEvent notice:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// 13. ACTIVITIES TABLE
// -------------------------------------------------------------
export async function logActivity(
  activityType: 'visit' | 'save' | 'verify' | 'review' | 'search',
  targetId?: string,
  targetTitle?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const user = await getCurrentUser();
    await supabase.from('activities').insert({
      user_id: user?.id || null,
      activity_type: activityType,
      target_id: targetId || null,
      target_title: targetTitle || null,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-blocking telemetry/feed
  }
}

export async function fetchRecentActivities(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// 14. NOTIFICATIONS TABLE
// -------------------------------------------------------------
export async function fetchUserNotifications(): Promise<any[]> {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// 15. REPORTS TABLE (Moderation / Safety)
// -------------------------------------------------------------
export async function submitReportToSupabase(
  report: Omit<ModerationReport, 'id' | 'createdAt'>
): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      user_id: user?.id || null,
      target_id: report.targetId,
      target_type: report.targetType,
      reason: report.reason,
      comment: report.comment || null,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('reports').insert(payload);
    if (error) {
      console.warn('submitReportToSupabase error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('submitReportToSupabase catch:', err);
    return false;
  }
}

// -------------------------------------------------------------
// 16. PLACE_SUGGESTIONS TABLE
// -------------------------------------------------------------
export async function submitPlaceSuggestion(suggestion: {
  name: string;
  category: string;
  district: string;
  division: string;
  address?: string;
  notes?: string;
}): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      ...suggestion,
      user_id: user?.id || null,
      status: 'pending_review',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('place_suggestions').insert(payload);
    if (error) {
      console.warn('submitPlaceSuggestion error:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// 17. BUSINESS_CLAIMS TABLE
// -------------------------------------------------------------
export async function submitBusinessClaim(claim: {
  placeId: string;
  businessName: string;
  contactPhone: string;
  contactEmail: string;
  role: string;
}): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      place_id: claim.placeId,
      business_name: claim.businessName,
      contact_phone: claim.contactPhone,
      contact_email: claim.contactEmail,
      role: claim.role,
      user_id: user?.id || null,
      status: 'pending_verification',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('business_claims').insert(payload);
    if (error) {
      console.warn('submitBusinessClaim error:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// 18. SEARCH_HISTORY TABLE (Required Hook & Service)
// -------------------------------------------------------------
export interface SearchHistoryEntry {
  id?: string;
  query: string;
  location_context?: string;
  result_count?: number;
  user_id?: string | null;
  created_at?: string;
}

export async function recordSearchToSupabase(
  query: string,
  locationContext?: string,
  resultCount?: number
): Promise<boolean> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return false;

  try {
    const user = await getCurrentUser();
    const anonId = !user ? getClientAnonymousId() : null;

    const payload: Record<string, any> = {
      query: trimmed,
      location_context: locationContext || null,
      result_count: typeof resultCount === 'number' ? resultCount : null,
      user_id: user?.id || null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('search_history').insert(payload);
    if (error) {
      // If table expects different column or RLS policy restricts anonymous writes, log gracefully
      console.warn('Supabase search_history insert notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('recordSearchToSupabase error:', err);
    return false;
  }
}

export async function fetchRecentSearches(limit = 6): Promise<string[]> {
  try {
    const user = await getCurrentUser();
    let query = supabase
      .from('search_history')
      .select('query')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (user) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    // Deduplicate queries
    const unique = Array.from(new Set(data.map((d: any) => d.query))).filter(Boolean);
    return unique as string[];
  } catch {
    return [];
  }
}
