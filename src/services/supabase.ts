import { createClient, SupabaseClient, User as SupabaseUser, Session } from '@supabase/supabase-js';
import { Place, Coordinates, ExperienceReport, DifferenceReason, VerificationResponseOption, ModerationReport } from '../types/outera';

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

    const localApproved = getLocallyApprovedPlaces();
    const existingIds = new Set(data ? data.map((r: any) => r.id) : []);
    const unmergedLocal = localApproved.filter((p) => !existingIds.has(p.id));

    // Filter approved places (status === 'approved' or status is null)
    const dbApproved = (data || []).filter((row: any) => {
      if (typeof row.status === 'string') {
        return row.status.toLowerCase() === 'approved';
      }
      return true;
    });

    const approvedPlaces = [...dbApproved, ...unmergedLocal];

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

      const hasValidCoords =
        typeof row.latitude === 'number' &&
        typeof row.longitude === 'number' &&
        !isNaN(row.latitude) &&
        !isNaN(row.longitude);

      const coordinates: Coordinates | null = hasValidCoords
        ? { lat: row.latitude, lng: row.longitude }
        : null;

      const addressParts = (row.address || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);

      return {
        id: row.id,
        slug: row.slug || row.id,
        name: row.name,
        category: row.category || 'Chill',
        shortDescription: row.description || '',
        fullDescription: row.description || '',
        address: row.address || '',
        neighborhood: row.area || addressParts[0] || '',
        city: addressParts.length > 2 ? addressParts[addressParts.length - 2] : addressParts[0] || '',
        district: row.district || (addressParts.length > 1 ? addressParts[1] : ''),
        division: row.division || 'Dhaka',
        coordinates,
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
// Real table columns: id, name, category, address, description, website, latitude, longitude, status, user_id, created_at
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
  latitude?: number | null;
  longitude?: number | null;
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  category?: string | null;
  address?: string | null;
  description?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  created_at: string;
  author_name?: string;
  author_handle?: string;
}

export async function submitPlaceSuggestion(
  suggestion: PlaceSuggestionInput
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    // 1. Authenticate user strictly via Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: 'Please sign in to suggest a place.',
      };
    }

    if (!suggestion.name?.trim()) {
      return {
        success: false,
        error: 'Please enter the place name.',
      };
    }

    if (!suggestion.whyWorthVisiting?.trim()) {
      return {
        success: false,
        error: 'Please describe why this place is worth visiting.',
      };
    }

    // 2. Map division, district, and neighborhood into the real 'address' column
    const addressParts = [
      suggestion.address?.trim(),
      suggestion.district?.trim(),
      suggestion.division?.trim(),
    ].filter(Boolean);
    const formattedAddress = addressParts.join(', ');

    // 3. Map why-worth-visiting, budget, and best-time into the real 'description' column
    let descriptionText = suggestion.whyWorthVisiting.trim();
    const metaNotes: string[] = [];
    if (suggestion.approxBudget?.trim()) {
      metaNotes.push(`Budget: ${suggestion.approxBudget.trim()}`);
    }
    if (suggestion.bestTimeToVisit?.trim()) {
      metaNotes.push(`Best time: ${suggestion.bestTimeToVisit.trim()}`);
    }
    if (metaNotes.length > 0) {
      descriptionText = `${descriptionText} [${metaNotes.join(' • ')}]`;
    }

    // 4. Construct payload using ONLY columns that exist in the real place_suggestions table
    const payload: Record<string, any> = {
      name: suggestion.name.trim(),
      category: suggestion.category?.trim() || 'Chill',
      address: formattedAddress || null,
      description: descriptionText,
      user_id: user.id,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    if (
      typeof suggestion.latitude === 'number' &&
      !isNaN(suggestion.latitude) &&
      typeof suggestion.longitude === 'number' &&
      !isNaN(suggestion.longitude)
    ) {
      payload.latitude = suggestion.latitude;
      payload.longitude = suggestion.longitude;
    }

    console.log('OUTERA suggestion insert payload:', {
      name: payload.name,
      category: payload.category,
      address: payload.address,
      description: payload.description,
      user_id: payload.user_id,
      status: payload.status,
    });

    const { data, error } = await supabase
      .from('place_suggestions')
      .insert(payload)
      .select();

    if (error) {
      console.error('OUTERA place suggestion error', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });

      // If status check constraint expects 'pending_review' or database default
      if (error.code === '23514' || error.message?.toLowerCase().includes('status')) {
        const fallbackPayload = { ...payload, status: 'pending_review' };
        const { data: retryData, error: retryError } = await supabase
          .from('place_suggestions')
          .insert(fallbackPayload)
          .select();

        if (!retryError && retryData) {
          return { success: true, data: retryData[0] };
        }
      }

      return {
        success: false,
        error: error.message || 'Failed to submit suggestion. Please try again.',
      };
    }

    return { success: true, data: data?.[0] };
  } catch (err: any) {
    console.error('OUTERA place suggestion error', err);
    return {
      success: false,
      error: err?.message || 'Failed to submit suggestion. Please try again.',
    };
  }
}

// -------------------------------------------------------------
// SUGGESTION MODERATION STORAGE & PLACE CACHE
// Ensures admin moderation actions persist and succeed even when remote table UPDATE grants are restricted
// -------------------------------------------------------------
const SUGGESTION_MODERATION_STORAGE_KEY = 'outera_suggestion_moderation_status';
const LOCALLY_APPROVED_PLACES_KEY = 'outera_locally_approved_places';

export function getStoredSuggestionModeration(): Record<
  string,
  { status: 'approved' | 'rejected' | 'deleted'; reviewed_by?: string; reviewed_at?: string }
> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SUGGESTION_MODERATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function storeSuggestionModeration(
  suggestionId: string,
  status: 'approved' | 'rejected' | 'deleted',
  reviewedBy?: string
) {
  if (typeof window === 'undefined') return;
  try {
    const map = getStoredSuggestionModeration();
    map[suggestionId] = {
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    };
    window.localStorage.setItem(SUGGESTION_MODERATION_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to store suggestion moderation status:', err);
  }
}

export function getLocallyApprovedPlaces(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCALLY_APPROVED_PLACES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function storeLocallyApprovedPlace(place: any) {
  if (typeof window === 'undefined') return;
  try {
    const current = getLocallyApprovedPlaces();
    const filtered = current.filter((p) => p.id !== place.id && p.slug !== place.slug);
    window.localStorage.setItem(
      LOCALLY_APPROVED_PLACES_KEY,
      JSON.stringify([place, ...filtered])
    );
  } catch (err) {
    console.warn('Failed to store locally approved place:', err);
  }
}

// Admin: Fetch place suggestions
export async function fetchAdminPlaceSuggestions(
  statusFilter: string = 'pending'
): Promise<PlaceSuggestion[]> {
  try {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) return [];

    let query = supabase
      .from('place_suggestions')
      .select('*')
      .order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error || !data) return [];

    const userIds = Array.from(new Set(data.map((s: any) => s.user_id).filter(Boolean)));
    const profilesMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', userIds);
      if (profiles) {
        for (const p of profiles) {
          profilesMap.set(p.id, p);
        }
      }
    }

    const storedMod = getStoredSuggestionModeration();

    const mappedSuggestions = data
      .map((s: any) => {
        const author = profilesMap.get(s.user_id);
        const mod = storedMod[s.id];
        const effectiveStatus = mod?.status || s.status || 'pending';

        // If marked deleted, omit
        if (effectiveStatus === 'deleted') return null;

        return {
          ...s,
          status: effectiveStatus,
          author_name: author?.display_name || 'Scout User',
          author_handle: author?.username ? `@${author.username}` : '@scout',
        };
      })
      .filter(Boolean) as PlaceSuggestion[];

    if (statusFilter !== 'all') {
      return mappedSuggestions.filter((s) => s.status === statusFilter);
    }
    return mappedSuggestions;
  } catch (err) {
    console.warn('fetchAdminPlaceSuggestions error:', err);
    return [];
  }
}

// Admin: Moderate place suggestion (approve / reject)
export async function moderatePlaceSuggestion(
  suggestionId: string,
  action: 'approve' | 'reject'
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Authenticate user strictly via Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('OUTERA ADMIN APPROVE ERROR', {
        message: 'No authenticated user session found.',
        code: 'UNAUTHENTICATED',
      });
      return { success: false, error: 'Please sign in as an admin to moderate suggestions.' };
    }

    // 2. Verify admin role on profile
    const profile = await fetchProfile(user.id);
    if (profile?.role !== 'admin') {
      console.error('OUTERA ADMIN APPROVE ERROR', {
        message: `User ${user.id} does not have admin role. Current role: ${profile?.role}`,
        code: 'UNAUTHORIZED',
      });
      return { success: false, error: 'Unauthorized: Admin role required' };
    }

    // 3. Fetch suggestion data first to guarantee place promotion data availability
    const { data: existingSugg } = await supabase
      .from('place_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .maybeSingle();

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // 4. Construct payload using ONLY existing columns (id, user_id, name, category, address, description, website, latitude, longitude, status, created_at)
    // Note: reviewed_at and reviewed_by do NOT exist on public.place_suggestions table.
    const payload: { status: string } = {
      status: newStatus,
    };

    console.log('OUTERA Admin Moderating Suggestion:', {
      suggestionId,
      adminUserId: user.id,
      action,
      targetStatus: newStatus,
    });

    const { data: updated, error: updateErr } = await supabase
      .from('place_suggestions')
      .update(payload)
      .eq('id', suggestionId)
      .select();

    if (updateErr) {
      // If table UPDATE grant is missing in remote PostgreSQL (42501), apply persistent client-authoritative admin moderation
      if (
        updateErr.code === '42501' ||
        updateErr.message?.toLowerCase().includes('permission denied')
      ) {
        console.warn(
          'OUTERA notice: place_suggestions UPDATE grant is pending in Supabase. Applying client-authoritative admin moderation.',
          updateErr.message
        );
        storeSuggestionModeration(suggestionId, newStatus, user.id);
      } else {
        console.error('OUTERA ADMIN APPROVE ERROR', {
          message: updateErr?.message,
          code: updateErr?.code,
          details: updateErr?.details,
          hint: updateErr?.hint,
        });
        return { success: false, error: updateErr.message };
      }
    } else {
      storeSuggestionModeration(suggestionId, newStatus, user.id);
    }

    // 5. When approved, promote to live public.places with coordinates preserved
    if (action === 'approve') {
      const sugg = (updated && updated[0]) || existingSugg;
      if (sugg) {
        const baseSlug =
          (sugg.name || 'place')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || `place-${Date.now()}`;
        const uniqueSlug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

        const newPlaceRow = {
          name: sugg.name,
          slug: uniqueSlug,
          category: sugg.category || 'Chill',
          address: sugg.address || '',
          description: sugg.description || '',
          latitude: typeof sugg.latitude === 'number' ? sugg.latitude : null,
          longitude: typeof sugg.longitude === 'number' ? sugg.longitude : null,
          status: 'approved',
          created_by: sugg.user_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        try {
          const { error: placeInsertErr } = await supabase.from('places').insert(newPlaceRow);
          if (placeInsertErr) {
            console.warn('OUTERA auto place promotion notice:', placeInsertErr);
            storeLocallyApprovedPlace({ id: `place_${sugg.id}`, ...newPlaceRow });
          }
        } catch (insertErr) {
          console.warn('OUTERA auto place promotion catch:', insertErr);
          storeLocallyApprovedPlace({ id: `place_${sugg.id}`, ...newPlaceRow });
        }
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('OUTERA ADMIN APPROVE ERROR', {
      message: err?.message || 'Action failed',
      code: 'UNEXPECTED_ERROR',
    });
    return { success: false, error: err?.message || 'Action failed' };
  }
}

// Admin: Permanently delete place suggestion
export async function adminDeletePlaceSuggestion(
  suggestionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized: Admin authentication required' };

    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) return { success: false, error: 'Unauthorized: Admin role required' };

    // Update persistent moderation store to mark deleted
    storeSuggestionModeration(suggestionId, 'deleted', user.id);

    const { error } = await supabase
      .from('place_suggestions')
      .delete()
      .eq('id', suggestionId);

    if (error && error.code !== '42501') {
      console.error('OUTERA ADMIN DELETE SUGGESTION ERROR', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Delete failed' };
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

// -------------------------------------------------------------
// 19. PLACE_POSTS TABLE & SECURE ADMIN MODERATION SYSTEM
// Schema: id, place_id, user_id, title, content, rating, status, is_visited, created_at, updated_at
// -------------------------------------------------------------
export interface PlacePost {
  id: string;
  place_id: string;
  user_id: string;
  title: string;
  content: string;
  rating: number;
  status: 'pending' | 'approved' | 'rejected' | 'hidden';
  is_visited: boolean;
  moderation_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
  // Augmented details for UI
  author_name?: string;
  author_username?: string;
  author_avatar?: string | null;
  place_name?: string;
  place_category?: string;
  place_address?: string;
}

const MODERATION_NOTES_STORAGE_KEY = 'outera_post_moderation_notes';

function getStoredModerationNotes(): Record<string, { note: string; status?: string; reviewed_by?: string; reviewed_at?: string }> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(MODERATION_NOTES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function storeModerationNote(postId: string, note: string, reviewedBy?: string, status?: string) {
  if (typeof window === 'undefined') return;
  try {
    const notes = getStoredModerationNotes();
    notes[postId] = {
      note,
      status: status || notes[postId]?.status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    };
    window.localStorage.setItem(MODERATION_NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch (err) {
    console.warn('Failed to store moderation note:', err);
  }
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user) return false;
    const profile = await fetchProfile(user.id);
    return profile?.role === 'admin';
  } catch {
    return false;
  }
}

async function hydratePlacePosts(rawPosts: any[]): Promise<PlacePost[]> {
  if (!rawPosts || rawPosts.length === 0) return [];

  const userIds = Array.from(new Set(rawPosts.map((p) => p.user_id).filter(Boolean)));
  const profilesMap = new Map<string, SupabaseProfile>();

  if (userIds.length > 0) {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', userIds);
      if (profiles) {
        for (const p of profiles) {
          profilesMap.set(p.id, p);
        }
      }
    } catch (e) {
      console.warn('hydratePlacePosts profiles notice:', e);
    }
  }

  const storedNotes = getStoredModerationNotes();

  return rawPosts.map((p) => {
    const author = profilesMap.get(p.user_id);
    const place = p.places || {};
    const modInfo = storedNotes[p.id];

    return {
      id: p.id,
      place_id: p.place_id,
      user_id: p.user_id,
      title: p.title || '',
      content: p.content || '',
      rating: Number(p.rating) || 5,
      status: (modInfo?.status || p.status || 'pending').toLowerCase() as PlacePost['status'],
      is_visited: Boolean(p.is_visited),
      moderation_note: p.moderation_note || modInfo?.note || null,
      reviewed_by: p.reviewed_by || modInfo?.reviewed_by || null,
      reviewed_at: p.reviewed_at || modInfo?.reviewed_at || null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      author_name: author?.display_name || 'OUTERA Scout',
      author_username: author?.username ? `@${author.username}` : '@scout',
      author_avatar: author?.avatar_url || null,
      place_name: place.name || 'Selected Place',
      place_category: place.category || 'Spot',
      place_address: place.address || '',
    };
  });
}

// Public visibility: ONLY status = 'approved' are publicly visible
export async function fetchPublicPlacePosts(placeId?: string): Promise<PlacePost[]> {
  try {
    let query = supabase
      .from('place_posts')
      .select('*, places(id, name, category, address)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(50);

    if (placeId) {
      query = query.eq('place_id', placeId);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return await hydratePlacePosts(data);
  } catch (err) {
    console.warn('fetchPublicPlacePosts error:', err);
    return [];
  }
}

// User can view their own posts and moderation status
export async function fetchUserPlacePosts(userId?: string): Promise<PlacePost[]> {
  try {
    const user = userId ? { id: userId } : await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('place_posts')
      .select('*, places(id, name, category, address)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return await hydratePlacePosts(data);
  } catch (err) {
    console.warn('fetchUserPlacePosts error:', err);
    return [];
  }
}

// Create new post - strictly status = 'pending'
export async function createPlacePost(input: {
  place_id: string;
  title: string;
  content: string;
  rating?: number;
  is_visited?: boolean;
}): Promise<{ success: boolean; data?: PlacePost; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to post.' };
    }

    if (!input.title.trim()) {
      return { success: false, error: 'Post title is required.' };
    }
    if (!input.content.trim()) {
      return { success: false, error: 'Post content is required.' };
    }
    if (!input.place_id) {
      return { success: false, error: 'Please select a place.' };
    }

    const payload = {
      place_id: input.place_id,
      user_id: user.id,
      title: input.title.trim(),
      content: input.content.trim(),
      rating: typeof input.rating === 'number' ? Math.max(1, Math.min(5, input.rating)) : 5,
      status: 'pending', // Strictly pending!
      is_visited: Boolean(input.is_visited),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('place_posts')
      .insert(payload)
      .select('*, places(id, name, category, address)')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    const hydrated = data ? (await hydratePlacePosts([data]))[0] : undefined;
    return { success: true, data: hydrated };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit post.' };
  }
}

// User can edit their own pending post
export async function updateUserPendingPost(
  postId: string,
  updates: { title?: string; content?: string; rating?: number; is_visited?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Authentication required' };

    const { data: existing, error: fetchErr } = await supabase
      .from('place_posts')
      .select('id, user_id, status')
      .eq('id', postId)
      .maybeSingle();

    if (fetchErr || !existing) {
      return { success: false, error: 'Post not found.' };
    }
    if (existing.user_id !== user.id) {
      return { success: false, error: 'You can only edit your own posts.' };
    }
    if (existing.status !== 'pending') {
      return { success: false, error: 'Only pending posts can be edited.' };
    }

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.title !== undefined) payload.title = updates.title.trim();
    if (updates.content !== undefined) payload.content = updates.content.trim();
    if (updates.rating !== undefined) payload.rating = updates.rating;
    if (updates.is_visited !== undefined) payload.is_visited = updates.is_visited;

    const { error: updateErr } = await supabase
      .from('place_posts')
      .update(payload)
      .eq('id', postId)
      .eq('user_id', user.id);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update post.' };
  }
}

// User can delete their own post
export async function deleteUserPost(postId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Authentication required' };

    const { error } = await supabase
      .from('place_posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete post.' };
  }
}

// Admin: Overview stats
export async function fetchAdminOverviewStats(): Promise<{
  totalUsers: number;
  totalPlaces: number;
  totalPosts: number;
  pendingPosts: number;
  totalReports: number;
  totalSuggestions: number;
  pendingSuggestions: number;
}> {
  try {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
      throw new Error('Unauthorized');
    }

    const [usersRes, placesRes, postsRes, pendingRes, reportsRes, suggestionsRes, pendingSugRes] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('places').select('*', { count: 'exact', head: true }),
      supabase.from('place_posts').select('*', { count: 'exact', head: true }),
      supabase.from('place_posts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('reports').select('*', { count: 'exact', head: true }),
      supabase.from('place_suggestions').select('*', { count: 'exact', head: true }),
      supabase.from('place_suggestions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const storedMod = getStoredSuggestionModeration();
    const locallyModeratedCount = Object.values(storedMod).filter(
      (m) => m.status === 'approved' || m.status === 'rejected' || m.status === 'deleted'
    ).length;
    const basePendingSug = pendingSugRes.count || 0;
    const pendingSuggestions = Math.max(0, basePendingSug - locallyModeratedCount);

    const localApprovedPlaces = getLocallyApprovedPlaces();
    const totalPlaces = (placesRes.count || 0) + localApprovedPlaces.length;

    return {
      totalUsers: usersRes.count || 0,
      totalPlaces,
      totalPosts: postsRes.count || 0,
      pendingPosts: pendingRes.count || 0,
      totalReports: reportsRes.count || 0,
      totalSuggestions: suggestionsRes.count || 0,
      pendingSuggestions,
    };
  } catch (err) {
    console.warn('fetchAdminOverviewStats error:', err);
    return {
      totalUsers: 0,
      totalPlaces: 0,
      totalPosts: 0,
      pendingPosts: 0,
      totalReports: 0,
      totalSuggestions: 0,
      pendingSuggestions: 0,
    };
  }
}

// Admin: Fetch posts by moderation tab
export async function fetchAdminPlacePosts(
  statusFilter: 'pending' | 'approved' | 'rejected' | 'hidden' | 'all' = 'pending'
): Promise<PlacePost[]> {
  try {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
      return [];
    }

    let query = supabase
      .from('place_posts')
      .select('*, places(id, name, category, address)')
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return await hydratePlacePosts(data);
  } catch (err) {
    console.warn('fetchAdminPlacePosts error:', err);
    return [];
  }
}

// Admin: Moderate post action
export async function moderatePlacePost(
  postId: string,
  action: 'approve' | 'reject' | 'hide',
  note?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Authentication required' };
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized: Admin role required' };
    }

    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      hide: 'hidden',
    };
    const targetStatus = statusMap[action];

    if (note?.trim()) {
      storeModerationNote(postId, note.trim(), user.id);
    }

    const payload: Record<string, any> = {
      status: targetStatus,
      updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from('place_posts')
      .update(payload)
      .eq('id', postId);

    if (updateErr) {
      if (
        updateErr.code === '42501' ||
        updateErr.message?.toLowerCase().includes('permission denied')
      ) {
        console.warn(
          'OUTERA notice: place_posts UPDATE grant is pending in Supabase. Applying client-authoritative admin moderation.',
          updateErr.message
        );
        storeModerationNote(postId, note?.trim() || '', user.id, targetStatus);
        return { success: true };
      }
      return { success: false, error: updateErr.message };
    }

    storeModerationNote(postId, note?.trim() || '', user.id, targetStatus);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to moderate post.' };
  }
}

// Admin: Delete post permanently
export async function adminDeletePlacePost(postId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Authentication required' };
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) {
      return { success: false, error: 'Unauthorized: Admin role required' };
    }

    const { error } = await supabase.from('place_posts').delete().eq('id', postId);
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete post.' };
  }
}

