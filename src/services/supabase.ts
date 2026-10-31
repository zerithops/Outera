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
// PROFILES TABLE & AUTH HELPERS
// Exact database columns: id, display_name, username, bio, avatar_url, role, created_at, updated_at
// -------------------------------------------------------------
export interface SupabaseProfile {
  id: string;
  display_name: string;
  username: string;
  bio?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  created_at?: string;
  updated_at?: string;
  // UI compatibility aliases
  name?: string;
  handle?: string;
}

export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const clean = username.replace(/^@/, '').trim().toLowerCase();
  if (!clean || clean.length < 3 || clean.length > 20) return false;
  if (!/^[a-z0-9_]+$/.test(clean)) return false;

  try {
    let query = supabase
      .from('profiles')
      .select('id')
      .eq('username', clean)
      .limit(1);

    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('isUsernameAvailable error:', error.message);
      return true;
    }
    return !data || data.length === 0;
  } catch {
    return true;
  }
}

export async function fetchProfile(userId?: string): Promise<SupabaseProfile | null> {
  try {
    const user = userId ? { id: userId } : await getCurrentUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, username, bio, avatar_url, role, created_at, updated_at')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('Supabase profiles fetch notice:', error.message);
      return null;
    }
    if (!data) return null;

    return {
      ...data,
      name: data.display_name,
      handle: `@${data.username}`,
    };
  } catch (err) {
    console.warn('fetchProfile error:', err);
    return null;
  }
}

export async function ensureUserProfile(user: SupabaseUser): Promise<SupabaseProfile> {
  // First check if a profile already exists in public.profiles
  const existing = await fetchProfile(user.id);
  if (existing && existing.display_name && existing.username) {
    return existing;
  }

  // Derive genuine profile strictly from the authenticated user's metadata & email
  const meta = user.user_metadata || {};
  const emailPrefix = user.email ? user.email.split('@')[0] : 'scout';
  const cleanUsername = (meta.username || meta.handle || emailPrefix)
    .replace(/^@/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '') || 'scout';
  const displayName = (meta.display_name || meta.name || emailPrefix).trim() || 'Scout';

  const newProfile: SupabaseProfile = {
    id: user.id,
    display_name: displayName,
    username: cleanUsername,
    name: displayName,
    handle: `@${cleanUsername}`,
    bio: existing?.bio || meta.bio || null,
    avatar_url: existing?.avatar_url || meta.avatar_url || null,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        display_name: displayName,
        username: cleanUsername,
        bio: newProfile.bio,
        avatar_url: newProfile.avatar_url,
        updated_at: newProfile.updated_at,
      })
      .select('id, display_name, username, bio, avatar_url, role, created_at, updated_at')
      .maybeSingle();

    if (!error && data) {
      return {
        ...data,
        name: data.display_name,
        handle: `@${data.username}`,
      };
    }
  } catch (err) {
    console.warn('ensureUserProfile notice:', err);
  }

  return newProfile;
}

export async function upsertProfile(profile: {
  display_name?: string;
  name?: string;
  username?: string;
  handle?: string;
  bio?: string;
  avatar_url?: string;
}): Promise<SupabaseProfile | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const payload: Record<string, any> = {
      id: user.id,
      updated_at: new Date().toISOString(),
    };

    const resolvedDisplayName = (profile.display_name || profile.name || '').trim();
    if (resolvedDisplayName) payload.display_name = resolvedDisplayName;

    const rawHandle = profile.username || profile.handle;
    if (rawHandle) {
      const cleanUsername = rawHandle.replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (cleanUsername) payload.username = cleanUsername;
    }

    if (profile.bio !== undefined) payload.bio = profile.bio;
    if (profile.avatar_url !== undefined) payload.avatar_url = profile.avatar_url;

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload)
      .select('id, display_name, username, bio, avatar_url, role, created_at, updated_at')
      .maybeSingle();

    if (error) {
      console.warn('Supabase upsertProfile notice:', error.message);
      return null;
    }
    if (!data) return null;

    return {
      ...data,
      name: data.display_name,
      handle: `@${data.username}`,
    };
  } catch (err) {
    console.warn('upsertProfile error:', err);
    return null;
  }
}

export async function registerUser({
  email,
  password,
  displayName,
  username,
}: {
  email: string;
  password: string;
  displayName: string;
  username: string;
}): Promise<{
  success: boolean;
  user?: SupabaseUser | null;
  session?: Session | null;
  requiresEmailVerification?: boolean;
  error?: string;
}> {
  try {
    const cleanDisplayName = displayName.trim();
    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();

    if (!cleanDisplayName) {
      return { success: false, error: 'Display name is required.' };
    }
    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 20) {
      return { success: false, error: 'Username must be between 3 and 20 characters.' };
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      return { success: false, error: 'Username can only contain letters, numbers, and underscores.' };
    }

    // Check username availability in public.profiles first
    const available = await isUsernameAvailable(cleanUsername);
    if (!available) {
      return { success: false, error: 'That username is already taken. Please choose another.' };
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          name: cleanDisplayName,
          display_name: cleanDisplayName,
          username: cleanUsername,
          handle: `@${cleanUsername}`,
        },
      },
    });

    if (error) {
      let friendly = error.message;
      if (error.message.toLowerCase().includes('password')) {
        friendly = 'Password must be at least 6 characters.';
      } else if (
        error.message.toLowerCase().includes('already registered') ||
        error.message.toLowerCase().includes('user already exists')
      ) {
        friendly = 'An account with this email already exists. Try signing in.';
      }
      return { success: false, error: friendly };
    }

    // Immediately upsert into public.profiles
    if (data.user) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          display_name: cleanDisplayName,
          username: cleanUsername,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } catch (profileErr) {
        console.warn('Profile creation upsert note:', profileErr);
      }
    }

    return {
      success: true,
      user: data.user,
      session: data.session,
      requiresEmailVerification: !data.session,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Could not complete registration. Please try again.',
    };
  }
}

export async function signInUser(
  email: string,
  password: string
): Promise<{
  success: boolean;
  user?: SupabaseUser | null;
  session?: Session | null;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      let friendly = 'That email or password is incorrect.';
      if (
        error.message.toLowerCase().includes('email not confirmed') ||
        error.message.toLowerCase().includes('confirm your email')
      ) {
        friendly = 'Please verify your email before signing in.';
      } else if (error.message.toLowerCase().includes('rate limit')) {
        friendly = 'Too many attempts. Please wait a moment and try again.';
      }
      return { success: false, error: friendly };
    }

    // If user signs in, ensure their profile exists in public.profiles
    if (data.user) {
      ensureUserProfile(data.user).catch((e) => console.warn('ensureUserProfile on signin:', e));
    }

    return { success: true, user: data.user, session: data.session };
  } catch {
    return { success: false, error: 'That email or password is incorrect.' };
  }
}

export async function sendPasswordResetEmail(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmed = email.trim();
    if (!trimmed) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to send reset link.' };
  }
}

export async function fetchUserRealStats(userId: string): Promise<{
  explored: number;
  shared: number;
  confirmed: number;
  saved: number;
  visited: number;
  verifications: number;
}> {
  if (!userId) {
    return { explored: 0, shared: 0, confirmed: 0, saved: 0, visited: 0, verifications: 0 };
  }

  try {
    const [visitsRes, expRes, verRes, savedRes] = await Promise.all([
      supabase.from('visits').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('experiences').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('experience_verifications').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('saved_places').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    const visitedCount = visitsRes.count || 0;
    const sharedCount = expRes.count || 0;
    const confirmedCount = verRes.count || 0;
    const savedCount = savedRes.count || 0;

    return {
      explored: visitedCount,
      shared: sharedCount,
      confirmed: confirmedCount,
      saved: savedCount,
      visited: visitedCount,
      verifications: confirmedCount,
    };
  } catch (err) {
    console.warn('fetchUserRealStats error:', err);
    return { explored: 0, shared: 0, confirmed: 0, saved: 0, visited: 0, verifications: 0 };
  }
}

// -------------------------------------------------------------
// LOCATIONS TABLE
// Schema: id, name, slug, type, parent_id, latitude, longitude, created_at
// -------------------------------------------------------------
export interface SupabaseLocation {
  id: string;
  name: string;
  slug?: string;
  type?: string;
  parent_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  division?: string;
  district?: string;
}

export async function fetchLocations(): Promise<SupabaseLocation[]> {
  try {
    const { data, error } = await supabase.from('locations').select('*').limit(100);
    if (error || !data) return [];
    return data;
  } catch (err) {
    console.warn('fetchLocations error:', err);
    return [];
  }
}

// -------------------------------------------------------------
// PLACES & PLACE_IMAGES & EXPERIENCES
// Schema places: id, name, category, description, address, latitude, longitude, location_id, slug, opening_hours, phone, website, status, created_at
// Schema place_images: id, place_id, image_url, caption, created_at
// Schema experiences: id, place_id, user_id, title, content, rating, status, created_at, updated_at
// -------------------------------------------------------------
export async function fetchPlacesFromSupabase(): Promise<Place[]> {
  try {
    const { data, error } = await supabase
      .from('places')
      .select(`
        *,
        place_images (
          id,
          image_url,
          caption
        ),
        experiences (
          id,
          place_id,
          user_id,
          title,
          content,
          rating,
          status,
          created_at
        )
      `)
      .limit(100);

    if (error || !data || data.length === 0) {
      return [];
    }

    // Filter approved places (status === 'approved' or status is null)
    const approvedPlaces = data.filter((row: any) => {
      if (typeof row.status === 'string') {
        return row.status.toLowerCase() === 'approved';
      }
      return true;
    });

    if (approvedPlaces.length === 0) {
      return [];
    }

    // Map Supabase rows to OUTERA Place interface
    return approvedPlaces.map((row: any): Place => {
      const images: string[] = row.place_images?.length
        ? row.place_images.map((img: any) => img.image_url).filter(Boolean)
        : Array.isArray(row.images)
        ? row.images
        : [];

      const rawExperiences = row.experiences || [];
      const experienceReports: ExperienceReport[] = rawExperiences.map((exp: any): ExperienceReport => {
        return {
          id: exp.id,
          placeId: exp.place_id || row.id,
          createdAt: exp.created_at ? new Date(exp.created_at).getTime() : Date.now(),
          authorName: exp.title || 'Community Scout',
          authorHandle: '@outera.user',
          isVerifiedVisitor: true,
          price: 'Fair',
          crowd: 'Medium',
          vibe: 'Social',
          wouldGoAgain: exp.rating && exp.rating >= 4 ? 'Yes' : exp.rating === 3 ? 'Maybe' : 'Yes',
          comment: exp.content || undefined,
          verification: {
            mostlyCount: 1,
            partlyCount: 0,
            notReallyCount: 0,
            totalResponses: 1,
            confidence: 'High',
            commonDifferences: [],
          },
        };
      });

      const totalReports = experienceReports.length || 0;
      const communityConfidence = totalReports === 0 ? 'Insufficient Data' : 'High';

      return {
        id: row.id,
        slug: row.slug || row.id,
        name: row.name,
        category: row.category || 'Chill',
        shortDescription: row.description || '',
        fullDescription: row.description || '',
        address: row.address || '',
        neighborhood: row.area || row.address || 'Dhaka',
        city: 'Dhaka',
        district: 'Dhaka',
        division: 'Dhaka',
        coordinates: {
          lat: row.latitude || 23.8103,
          lng: row.longitude || 90.4125,
        },
        priceLevel: {
          min: 150,
          max: 500,
          label: '৳150–৳500',
          symbol: '৳',
        },
        communityScore: totalReports > 0 ? 88 : 0,
        communityConfidence,
        totalReports,
        verifiedVisitorsCount: totalReports,
        markerState: 'Popular',
        isTrending: false,
        isHiddenGem: false,
        isEvent: false,
        openingHours: {
          openNow: true,
          hoursText: row.opening_hours || '10:00 AM – 11:00 PM',
          closesAt: '11:00 PM',
        },
        crowdLevel: 'Medium',
        primaryVibe: 'Social',
        secondaryVibes: ['Relaxed'],
        groupFit: ['Friends', 'Date'],
        environment: 'Indoor',
        tags: [],
        images,
        whyPick: row.description || '',
        highlights: [],
        experienceReports,
        userReportsBreakdown: {
          worthVisitingPct: totalReports > 0 ? 90 : 0,
          mostCommonCrowd: 'Medium',
          mostCommonVibe: 'Social',
          mostCommonPrice: 'Fair',
          recentComments: [],
        },
      };
    });
  } catch (err) {
    console.warn('fetchPlacesFromSupabase error:', err);
    return [];
  }
}

// -------------------------------------------------------------
// EXPERIENCES TABLE
// Schema: id, place_id, user_id, title, content, rating, status, created_at, updated_at
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
      title: report.authorName || 'Scout Experience',
      content: report.comment
        ? `${report.comment} (Vibe: ${report.vibe}, Crowd: ${report.crowd}, Spend: ৳${report.approxSpendTaka || 'N/A'})`
        : `Vibe: ${report.vibe}, Crowd: ${report.crowd}, Revisit: ${report.wouldGoAgain}`,
      rating: report.wouldGoAgain === 'Yes' ? 5 : report.wouldGoAgain === 'Maybe' ? 3 : 2,
      status: 'approved',
      created_at: new Date(report.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
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
// EXPERIENCE_VERIFICATIONS TABLE
// Schema: id, experience_id, user_id, comment, created_at
// -------------------------------------------------------------
export async function recordVerificationInSupabase(
  experienceId: string,
  _placeId: string,
  response: VerificationResponseOption,
  differenceReason?: DifferenceReason
): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const commentText = differenceReason
      ? `Response: ${response} | Different: ${differenceReason}`
      : `Response: ${response}`;

    const payload = {
      experience_id: experienceId,
      user_id: user?.id || null,
      comment: commentText,
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
// VISITS TABLE ("I've Been Here")
// Schema: id, place_id, user_id, visited_at
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
// SAVED_PLACES TABLE
// Schema: id, place_id, user_id, created_at
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
// WANT_TO_TRY TABLE
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
// FOLLOWS TABLE
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
// EVENTS & EVENT_ATTENDANCE
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
// ACTIVITIES TABLE
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
    // Non-blocking telemetry
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
// NOTIFICATIONS TABLE
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
// REPORTS TABLE (Moderation / Safety)
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
// PLACE_SUGGESTIONS TABLE
// -------------------------------------------------------------
export interface PlaceSuggestionInput {
  name: string;
  category: string;
  division: string;
  district: string;
  address?: string;
  whyWorthVisiting: string;
  approxBudget?: string;
  bestTimeToVisit?: string;
}

export async function submitPlaceSuggestion(suggestion: PlaceSuggestionInput): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const payload = {
      name: suggestion.name,
      category: suggestion.category,
      division: suggestion.division,
      district: suggestion.district,
      address: suggestion.address || null,
      notes: suggestion.whyWorthVisiting,
      why_worth_visiting: suggestion.whyWorthVisiting,
      approx_budget: suggestion.approxBudget || null,
      best_time_to_visit: suggestion.bestTimeToVisit || null,
      user_id: user?.id || null,
      status: 'pending_review',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('place_suggestions').insert(payload);
    if (error) {
      console.warn('submitPlaceSuggestion error, attempting fallback schema:', error.message);
      const fallbackPayload = {
        name: suggestion.name,
        category: suggestion.category,
        division: suggestion.division,
        district: suggestion.district,
        address: suggestion.address || null,
        notes: `${suggestion.whyWorthVisiting}${
          suggestion.approxBudget ? ` | Budget: ${suggestion.approxBudget}` : ''
        }${suggestion.bestTimeToVisit ? ` | Best time: ${suggestion.bestTimeToVisit}` : ''}`,
        user_id: user?.id || null,
        status: 'pending_review',
        created_at: new Date().toISOString(),
      };
      const { error: err2 } = await supabase.from('place_suggestions').insert(fallbackPayload);
      if (err2) {
        console.warn('submitPlaceSuggestion fallback notice:', err2.message);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.warn('submitPlaceSuggestion catch:', err);
    return false;
  }
}

// -------------------------------------------------------------
// BUSINESS_CLAIMS TABLE
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
// SEARCH_HISTORY TABLE
// Schema: id, query, user_id, created_at
// -------------------------------------------------------------
export interface SearchHistoryEntry {
  id?: string;
  query: string;
  user_id?: string | null;
  created_at?: string;
}

export async function recordSearchToSupabase(
  query: string,
  _locationContext?: string,
  _resultCount?: number
): Promise<boolean> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return false;

  try {
    const user = await getCurrentUser();
    const payload: Record<string, any> = {
      query: trimmed,
      user_id: user?.id || null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('search_history').insert(payload);
    if (error) {
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

    const unique = Array.from(new Set(data.map((d: any) => d.query))).filter(Boolean);
    return unique as string[];
  } catch {
    return [];
  }
}
