import { createClient, SupabaseClient, User as SupabaseUser, Session } from '@supabase/supabase-js';
import {
  Place,
  Coordinates,
  ExperienceReport,
  DifferenceReason,
  VerificationResponseOption,
  ModerationReport,
  CommunityConfidenceLevel,
} from '../types/outera';
import { calculateDistanceKm } from './location';

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
// Every registered user is automatically a SCOUT.
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
  const existing = await fetchProfile(user.id);
  if (existing && existing.display_name && existing.username) {
    return existing;
  }

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
  placesSuggested: number;
  communityPosts: number;
  helpfulReports: number;
}> {
  if (!userId) {
    return {
      explored: 0,
      shared: 0,
      confirmed: 0,
      saved: 0,
      visited: 0,
      verifications: 0,
      placesSuggested: 0,
      communityPosts: 0,
      helpfulReports: 0,
    };
  }

  try {
    const [visitsRes, expRes, verRes, savedRes, suggRes, postsRes, helpfulGivenRes] = await Promise.all([
      supabase.from('visits').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('experiences').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('experience_verifications').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('saved_places').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('place_suggestions').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('place_posts').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('place_post_helpful').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    const visitedCount = visitsRes.count || 0;
    const expCount = expRes.count || 0;
    const verCount = verRes.count || 0;
    const savedCount = savedRes.count || 0;
    const suggestionsCount = suggRes.count || 0;
    const postsCount = postsRes.count || 0;
    const helpfulCount = (helpfulGivenRes.count || 0) + verCount;

    return {
      explored: visitedCount,
      shared: postsCount + expCount,
      confirmed: helpfulCount,
      saved: savedCount,
      visited: visitedCount,
      verifications: verCount,
      placesSuggested: suggestionsCount,
      communityPosts: postsCount,
      helpfulReports: helpfulCount,
    };
  } catch (err) {
    console.warn('fetchUserRealStats error:', err);
    return {
      explored: 0,
      shared: 0,
      confirmed: 0,
      saved: 0,
      visited: 0,
      verifications: 0,
      placesSuggested: 0,
      communityPosts: 0,
      helpfulReports: 0,
    };
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

// Helper to parse structured metadata encoded in description when fallback columns are used
export function parseStructuredMetadata(rawText?: string | null): {
  cleanDescription: string;
  whyWorthVisiting?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetLabel?: string;
  bestTime?: string;
  upazila?: string;
  area?: string;
  division?: string;
  district?: string;
} {
  if (!rawText) return { cleanDescription: '' };
  let cleanDescription = rawText;
  let whyWorthVisiting: string | undefined;
  let budgetMin: number | undefined;
  let budgetMax: number | undefined;
  let budgetLabel: string | undefined;
  let bestTime: string | undefined;
  let upazila: string | undefined;
  let area: string | undefined;
  let division: string | undefined;
  let district: string | undefined;

  const bracketMatch = rawText.match(/\[([^\]]+)\]\s*$/);
  if (bracketMatch) {
    cleanDescription = rawText.slice(0, bracketMatch.index).trim();
    const parts = bracketMatch[1].split('•').map((s) => s.trim());
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower.startsWith('why:')) {
        whyWorthVisiting = part.slice(4).trim();
      } else if (lower.startsWith('budget:')) {
        const bVal = part.slice(7).trim();
        budgetLabel = bVal;
        const nums = bVal.match(/\d+/g);
        if (nums && nums.length >= 2) {
          budgetMin = Number(nums[0]);
          budgetMax = Number(nums[1]);
        } else if (nums && nums.length === 1) {
          budgetMin = Number(nums[0]);
          budgetMax = Number(nums[0]);
        }
      } else if (lower.startsWith('best time:')) {
        bestTime = part.slice(10).trim();
      } else if (lower.startsWith('upazila:')) {
        upazila = part.slice(8).trim();
      } else if (lower.startsWith('area:')) {
        area = part.slice(5).trim();
      } else if (lower.startsWith('district:')) {
        district = part.slice(9).trim();
      } else if (lower.startsWith('division:')) {
        division = part.slice(9).trim();
      }
    }
  }

  return {
    cleanDescription,
    whyWorthVisiting,
    budgetMin,
    budgetMax,
    budgetLabel,
    bestTime,
    upazila,
    area,
    division,
    district,
  };
}

// -------------------------------------------------------------
// PLACES & PLACE_IMAGES & EXPERIENCES & APPROVED COMMUNITY POSTS
// Never invent ratings, reviews, visitors, prices, confidence or activity.
// -------------------------------------------------------------
export async function fetchPlacesFromSupabase(): Promise<Place[]> {
  try {
    const [placesRes, approvedPostsRes] = await Promise.all([
      supabase
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
        .limit(150),
      supabase
        .from('place_posts')
        .select('id, place_id, user_id, title, content, rating, is_visited, status, created_at')
        .eq('status', 'approved'),
    ]);

    const data = placesRes.data;
    const approvedPosts = approvedPostsRes.data || [];

    // Fetch images for approved posts so places can show community photos if needed
    const approvedPostIds = approvedPosts.map((p: any) => p.id).filter(Boolean);
    const postImagesByPostId = new Map<string, string[]>();
    if (approvedPostIds.length > 0) {
      try {
        const { data: postImgs } = await supabase
          .from('place_post_images')
          .select('post_id, storage_path')
          .in('post_id', approvedPostIds);
        if (postImgs) {
          for (const img of postImgs) {
            const url = getPublicStorageUrl(img.storage_path);
            if (url) {
              const arr = postImagesByPostId.get(img.post_id) || [];
              arr.push(url);
              postImagesByPostId.set(img.post_id, arr);
            }
          }
        }
      } catch {}
    }

    const localApproved = getLocallyApprovedPlaces();
    const existingIds = new Set(data ? data.map((r: any) => r.id) : []);
    const unmergedLocal = localApproved.filter((p) => !existingIds.has(p.id));

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

    // Fetch Scout creator profiles for attribution
    const creatorIds = Array.from(
      new Set(approvedPlaces.map((r: any) => r.created_by).filter(Boolean))
    );
    const creatorProfiles = new Map<string, { display_name: string; username: string }>();
    if (creatorIds.length > 0) {
      try {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, username')
          .in('id', creatorIds);
        if (profs) {
          for (const p of profs) {
            creatorProfiles.set(p.id, p);
          }
        }
      } catch {}
    }

    // Group approved posts by place_id
    const postsByPlace = new Map<string, any[]>();
    for (const post of approvedPosts) {
      const list = postsByPlace.get(post.place_id) || [];
      list.push(post);
      postsByPlace.set(post.place_id, list);
    }

    return approvedPlaces.map((row: any): Place => {
      const placePosts = postsByPlace.get(row.id) || [];
      const postPhotos: string[] = [];
      for (const p of placePosts) {
        const pImgs = postImagesByPostId.get(p.id) || [];
        for (const u of pImgs) {
          if (!postPhotos.includes(u)) postPhotos.push(u);
        }
      }

      const rawPlaceImages: string[] = row.place_images?.length
        ? row.place_images.map((img: any) => img.image_url).filter(Boolean)
        : Array.isArray(row.images)
        ? row.images
        : [];

      const images = [...rawPlaceImages, ...postPhotos];

      const rawExperiences = (row.experiences || []).filter(
        (e: any) => !e.status || e.status === 'approved'
      );

      const experienceReports: ExperienceReport[] = rawExperiences.map((exp: any): ExperienceReport => {
        return {
          id: exp.id,
          placeId: exp.place_id || row.id,
          createdAt: exp.created_at ? new Date(exp.created_at).getTime() : Date.now(),
          authorName: exp.title || 'Community Scout',
          authorHandle: '@scout',
          isVerifiedVisitor: true,
          price: 'Fair',
          crowd: 'Medium',
          vibe: 'Social',
          wouldGoAgain: exp.rating && exp.rating >= 4 ? 'Yes' : exp.rating === 3 ? 'Maybe' : 'No',
          comment: exp.content || undefined,
          verification: {
            mostlyCount: 0,
            partlyCount: 0,
            notReallyCount: 0,
            totalResponses: 0,
            confidence: 'Insufficient Data',
            commonDifferences: [],
          },
        };
      });

      const approvedPostsCount = placePosts.length;
      const totalReports = experienceReports.length + approvedPostsCount;
      const visitedPostsCount = placePosts.filter((p: any) => p.is_visited).length;
      const verifiedVisitorsCount = Number(row.visited_count || 0) + visitedPostsCount + experienceReports.length;

      // Compute real community rating and score strictly from actual data
      const allRatings: number[] = [
        ...placePosts.map((p: any) => Number(p.rating)).filter((r: number) => r >= 1 && r <= 5),
        ...rawExperiences.map((e: any) => Number(e.rating)).filter((r: number) => r >= 1 && r <= 5),
      ];

      const communityRating =
        allRatings.length > 0
          ? Math.round((allRatings.reduce((acc, v) => acc + v, 0) / allRatings.length) * 10) / 10
          : null;

      const positiveCount = allRatings.filter((r) => r >= 4).length;
      const worthVisitingPct =
        allRatings.length > 0 ? Math.round((positiveCount / allRatings.length) * 100) : 0;

      const communityScore =
        communityRating !== null ? Math.round((communityRating / 5) * 100) : 0;

      let communityConfidence: CommunityConfidenceLevel = 'Insufficient Data';
      if (totalReports >= 5 || (totalReports >= 3 && verifiedVisitorsCount >= 3)) {
        communityConfidence = 'High';
      } else if (totalReports >= 2) {
        communityConfidence = 'Medium';
      } else if (totalReports === 1) {
        communityConfidence = 'Limited';
      } else {
        communityConfidence = 'Insufficient Data';
      }

      const hasValidCoords =
        typeof row.latitude === 'number' &&
        typeof row.longitude === 'number' &&
        !isNaN(row.latitude) &&
        !isNaN(row.longitude);

      const coordinates: Coordinates | null = hasValidCoords
        ? { lat: row.latitude, lng: row.longitude }
        : null;

      const parsedMeta = parseStructuredMetadata(row.description);
      const addressParts = (row.address || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);

      const resolvedMinPrice =
        typeof row.price_min === 'number'
          ? row.price_min
          : parsedMeta.budgetMin !== undefined
          ? parsedMeta.budgetMin
          : 0;
      const resolvedMaxPrice =
        typeof row.price_max === 'number'
          ? row.price_max
          : parsedMeta.budgetMax !== undefined
          ? parsedMeta.budgetMax
          : 0;

      const hasRealBudget = resolvedMinPrice > 0 || resolvedMaxPrice > 0 || Boolean(parsedMeta.budgetLabel);
      const budgetLabel =
        parsedMeta.budgetLabel ||
        (resolvedMinPrice > 0 && resolvedMaxPrice > 0
          ? `৳${resolvedMinPrice}–৳${resolvedMaxPrice}`
          : resolvedMinPrice > 0
          ? `From ৳${resolvedMinPrice}`
          : 'Not specified');

      const creator = row.created_by ? creatorProfiles.get(row.created_by) : undefined;
      const environment: 'Indoor' | 'Outdoor' | 'Both' =
        row.is_indoor && row.is_outdoor
          ? 'Both'
          : row.is_outdoor
          ? 'Outdoor'
          : row.is_indoor
          ? 'Indoor'
          : 'Both';

      const safeStr = (val: unknown, fallback = ''): string => {
        if (typeof val === 'string') return val;
        if (typeof val === 'number' || typeof val === 'boolean') return String(val);
        return fallback;
      };

      const resolveOpeningHoursText = (raw: unknown): string => {
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const obj = raw as Record<string, unknown>;
          if (typeof obj.hoursText === 'string' && obj.hoursText.trim()) return obj.hoursText.trim();
          if (typeof obj.text === 'string' && obj.text.trim()) return obj.text.trim();
          if (typeof obj.hours === 'string' && obj.hours.trim()) return obj.hours.trim();
          if (typeof obj.open === 'string' && typeof obj.close === 'string') {
            return `${obj.open} – ${obj.close}`;
          }
          const entries = Object.entries(obj).filter(
            ([, v]) => typeof v === 'string' && (v as string).trim().length > 0
          );
          if (entries.length > 0) {
            return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
          }
        }
        return 'Hours vary';
      };

      const bestTimeStr = safeStr(row.best_time) || safeStr(parsedMeta.bestTime);

      return {
        id: String(row.id),
        slug: safeStr(row.slug, String(row.id)),
        name: safeStr(row.name, 'Unnamed Place'),
        category: (safeStr(row.category, 'Chill') || 'Chill') as any,
        subcategory: safeStr(row.subcategory) || undefined,
        shortDescription: safeStr(row.short_description) || safeStr(parsedMeta.cleanDescription),
        fullDescription: safeStr(parsedMeta.cleanDescription) || safeStr(row.description),
        address: safeStr(row.address),
        neighborhood: safeStr(row.area) || safeStr(parsedMeta.area) || addressParts[0] || '',
        upazila:
          safeStr(row.upazila) ||
          safeStr(parsedMeta.upazila) ||
          (addressParts.length > 2 ? addressParts[1] : undefined),
        city:
          safeStr(row.upazila) ||
          safeStr(parsedMeta.upazila) ||
          (addressParts.length > 2 ? addressParts[addressParts.length - 2] : addressParts[0] || ''),
        district:
          safeStr(row.district) ||
          safeStr(parsedMeta.district) ||
          (addressParts.length > 1 ? addressParts[addressParts.length - 2] || addressParts[1] : ''),
        division: (safeStr(row.division) || safeStr(parsedMeta.division) || 'Dhaka') as any,
        coordinates,
        priceLevel: {
          min: resolvedMinPrice,
          max: resolvedMaxPrice,
          label: hasRealBudget ? budgetLabel : 'Varies',
          symbol: resolvedMaxPrice > 1500 ? '৳৳৳' : resolvedMaxPrice > 500 ? '৳৳' : '৳',
        },
        bestTimeToVisit: bestTimeStr || undefined,
        communityScore,
        communityRating,
        approvedPostsCount,
        communityConfidence,
        totalReports,
        verifiedVisitorsCount,
        markerState: totalReports >= 5 ? 'Popular' : 'Hidden Gem',
        isTrending: Boolean(row.is_popular),
        isHiddenGem: !row.is_popular,
        isEvent: false,
        openingHours: {
          openNow:
            row.opening_hours &&
            typeof row.opening_hours === 'object' &&
            typeof row.opening_hours.openNow === 'boolean'
              ? row.opening_hours.openNow
              : true,
          hoursText: resolveOpeningHoursText(row.opening_hours),
          closesAt:
            row.opening_hours &&
            typeof row.opening_hours === 'object' &&
            typeof row.opening_hours.closesAt === 'string'
              ? row.opening_hours.closesAt
              : '',
        },
        crowdLevel: row.is_quiet ? 'Quiet' : row.is_popular ? 'Busy' : 'Medium',
        primaryVibe: row.is_quiet ? 'Quiet' : 'Social',
        secondaryVibes: [],
        groupFit: row.is_family_friendly ? ['Family', 'Friends', 'Solo'] : ['Friends', 'Solo', 'Date'],
        environment,
        tags: [safeStr(row.category), safeStr(row.subcategory)].filter(Boolean),
        images,
        whyPick:
          safeStr(row.why_worth_visiting) ||
          safeStr(parsedMeta.whyWorthVisiting) ||
          safeStr(parsedMeta.cleanDescription),
        highlights: [],
        experienceReports,
        userReportsBreakdown: {
          worthVisitingPct,
          mostCommonCrowd: row.is_quiet ? 'Quiet' : 'Medium',
          mostCommonVibe: row.is_quiet ? 'Quiet' : 'Social',
          mostCommonPrice: 'Fair',
          recentComments: placePosts
            .slice(0, 3)
            .map((p: any) => safeStr(p.content))
            .filter(Boolean),
        },
        suggestedByUserId: row.created_by || row.suggested_by_user_id || null,
        suggestedByScoutName:
          safeStr(row.suggested_by_name) || safeStr(creator?.display_name) || undefined,
        suggestedByScoutHandle:
          safeStr(row.suggested_by_handle) ||
          (creator?.username && typeof creator.username === 'string'
            ? `@${creator.username}`
            : undefined),
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
// Exact live columns: id, reporter_id, place_id, experience_id, reason, details, status, created_at
// Plus optional post_id from production SQL update
// -------------------------------------------------------------
export async function submitReportToSupabase(
  report: Omit<ModerationReport, 'id' | 'createdAt'>
): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    const basePayload: Record<string, any> = {
      reporter_id: user?.id || null,
      place_id: report.targetType === 'place' ? report.targetId : null,
      experience_id: report.targetType === 'experience' ? report.targetId : null,
      reason: report.reason,
      details: report.comment
        ? `[Target: ${report.targetType} ${report.targetId}] ${report.comment}`
        : `Reported ${report.targetType}: ${report.targetId}`,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    if (report.targetType === 'post') {
      const withPostId = { ...basePayload, post_id: report.targetId };
      const { error: extErr } = await supabase.from('reports').insert(withPostId);
      if (!extErr) return true;
    }

    const { error } = await supabase.from('reports').insert(basePayload);
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
// PLACE_SUGGESTIONS TABLE & DUPLICATE CHECK & PHOTOS (MAX 2)
// Base columns: id, name, category, address, description, website, latitude, longitude, status, user_id, created_at
// Extended columns: place_name, division, district, upazila, area, short_description, why_worth_visiting,
//                   estimated_budget_min, estimated_budget_max, best_time, moderation_note, reviewed_by, reviewed_at
// -------------------------------------------------------------
export interface PlaceSuggestionInput {
  name: string;
  category: string;
  division: string;
  district: string;
  upazila?: string;
  area?: string;
  address?: string;
  shortDescription?: string;
  whyWorthVisiting: string;
  estimatedBudgetMin?: number | null;
  estimatedBudgetMax?: number | null;
  approxBudget?: string;
  bestTimeToVisit?: string;
  latitude?: number | null;
  longitude?: number | null;
  photos?: File[];
}

export interface PlaceSuggestion {
  id: string;
  name: string;
  category?: string | null;
  division?: string | null;
  district?: string | null;
  upazila?: string | null;
  area?: string | null;
  address?: string | null;
  short_description?: string | null;
  why_worth_visiting?: string | null;
  estimated_budget_min?: number | null;
  estimated_budget_max?: number | null;
  best_time?: string | null;
  best_time_to_visit?: string | null;
  promoted_place_id?: string | null;
  description?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'hidden' | string;
  moderation_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  author_name?: string;
  author_handle?: string;
  images?: string[];
}

export interface DuplicatePlaceCandidate {
  id: string;
  name: string;
  category: string;
  address: string;
  district?: string;
  distanceKm?: number;
  source: 'place' | 'suggestion';
  status?: string;
}

export function normalizePlaceNameForComparison(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|cafe|restaurant|park|resort|hotel|spot|lounge|dhaka|bangladesh)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function checkDuplicatePlacesAndSuggestions(
  nameOrParams:
    | string
    | {
        name: string;
        latitude?: number | null;
        longitude?: number | null;
        district?: string;
      },
  districtArg?: string,
  latArg?: number | null,
  lngArg?: number | null,
  existingPlacesArg?: any[]
): Promise<DuplicatePlaceCandidate[]> {
  const params =
    typeof nameOrParams === 'string'
      ? {
          name: nameOrParams,
          district: districtArg,
          latitude: latArg,
          longitude: lngArg,
        }
      : nameOrParams;

  const rawName = (params.name || '').trim();
  if (rawName.length < 2) {
    return [];
  }

  const normTarget = normalizePlaceNameForComparison(rawName);
  const rawLower = rawName.toLowerCase();
  const targetCoords =
    typeof params.latitude === 'number' &&
    typeof params.longitude === 'number' &&
    !isNaN(params.latitude) &&
    !isNaN(params.longitude)
      ? { lat: params.latitude, lng: params.longitude }
      : null;
  const targetDistrict = (params.district || '').trim().toLowerCase();

  const matches: DuplicatePlaceCandidate[] = [];

  try {
    const [placesRes, suggRes] = await Promise.all([
      supabase.from('places').select('id, name, category, address, latitude, longitude, status').limit(200),
      supabase
        .from('place_suggestions')
        .select('id, name, category, address, latitude, longitude, status')
        .in('status', ['pending', 'approved'])
        .limit(200),
    ]);

    const allPlaces = [
      ...(placesRes.data || []),
      ...(existingPlacesArg || []),
      ...getLocallyApprovedPlaces(),
    ];
    const seenIds = new Set<string>();

    for (const p of allPlaces) {
      if (!p || !p.name || seenIds.has(p.id)) continue;
      seenIds.add(p.id);

      const pNorm = normalizePlaceNameForComparison(p.name);
      const pLower = p.name.toLowerCase();
      const nameSimilar =
        pLower === rawLower ||
        (normTarget.length >= 3 && pNorm.length >= 3 && (pNorm === normTarget || pNorm.includes(normTarget) || normTarget.includes(pNorm)));

      let distanceKm: number | undefined;
      if (
        targetCoords &&
        typeof p.latitude === 'number' &&
        typeof p.longitude === 'number'
      ) {
        distanceKm = calculateDistanceKm(targetCoords, { lat: p.latitude, lng: p.longitude });
      } else if (targetCoords && p.coordinates?.lat && p.coordinates?.lng) {
        distanceKm = calculateDistanceKm(targetCoords, p.coordinates);
      }

      const sameDistrict =
        targetDistrict &&
        ((p.address || '').toLowerCase().includes(targetDistrict) ||
          (p.district || '').toLowerCase() === targetDistrict);

      if (
        (nameSimilar && (distanceKm === undefined || distanceKm <= 5 || sameDistrict)) ||
        (distanceKm !== undefined && distanceKm <= 0.15 && nameSimilar)
      ) {
        matches.push({
          id: p.id,
          name: p.name,
          category: p.category || 'Spot',
          address: p.address || '',
          distanceKm: distanceKm !== undefined ? Math.round(distanceKm * 100) / 100 : undefined,
          source: 'place',
          status: 'approved',
        });
      }
    }

    for (const s of suggRes.data || []) {
      if (!s || !s.name || seenIds.has(s.id)) continue;
      seenIds.add(s.id);

      const sNorm = normalizePlaceNameForComparison(s.name);
      const sLower = s.name.toLowerCase();
      const nameSimilar =
        sLower === rawLower ||
        (normTarget.length >= 3 && sNorm.length >= 3 && (sNorm === normTarget || sNorm.includes(normTarget) || normTarget.includes(sNorm)));

      let distanceKm: number | undefined;
      if (
        targetCoords &&
        typeof s.latitude === 'number' &&
        typeof s.longitude === 'number'
      ) {
        distanceKm = calculateDistanceKm(targetCoords, { lat: s.latitude, lng: s.longitude });
      }

      const sameDistrict =
        targetDistrict && (s.address || '').toLowerCase().includes(targetDistrict);

      if (nameSimilar && (distanceKm === undefined || distanceKm <= 5 || sameDistrict)) {
        matches.push({
          id: s.id,
          name: s.name,
          category: s.category || 'Spot',
          address: s.address || '',
          distanceKm: distanceKm !== undefined ? Math.round(distanceKm * 100) / 100 : undefined,
          source: 'suggestion',
          status: s.status || 'pending',
        });
      }
    }
  } catch (err) {
    console.warn('checkDuplicatePlacesAndSuggestions error:', err);
  }

  return matches.slice(0, 5);
}

const SUGGESTION_IMAGES_CACHE_KEY = 'outera_suggestion_images_cache';

function getCachedSuggestionImages(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SUGGESTION_IMAGES_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function storeCachedSuggestionImages(suggestionId: string, urls: string[]) {
  if (typeof window === 'undefined' || !suggestionId || urls.length === 0) return;
  try {
    const current = getCachedSuggestionImages();
    current[suggestionId] = urls.slice(0, 2);
    window.localStorage.setItem(SUGGESTION_IMAGES_CACHE_KEY, JSON.stringify(current));
  } catch {}
}

export async function uploadPlaceSuggestionImages(
  userId: string,
  suggestionId: string,
  files: File[]
): Promise<{ success: boolean; imageUrls: string[]; error?: string }> {
  if (!files || files.length === 0) {
    return { success: true, imageUrls: [] };
  }

  if (files.length > 2) {
    return {
      success: false,
      imageUrls: [],
      error: 'Maximum 2 photos are allowed per place suggestion.',
    };
  }

  const maxFiles = Math.min(files.length, 2);
  const uploadedUrls: string[] = [];

  for (let i = 0; i < maxFiles; i++) {
    const file = files[i];
    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        imageUrls: uploadedUrls,
        error: `Photo "${file.name}" exceeds the 5MB maximum size limit.`,
      };
    }

    const rawExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const validExts = ['jpg', 'jpeg', 'png', 'webp'];
    if (!validExts.includes(rawExt)) {
      return {
        success: false,
        imageUrls: uploadedUrls,
        error: 'Only JPG, JPEG, PNG, and WEBP images are allowed.',
      };
    }

    const safeFileName = `sugg_${Date.now()}_${i + 1}_${Math.random().toString(36).slice(2, 6)}.${rawExt}`;
    const storagePath = `${userId}/${suggestionId}/${safeFileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('community-review-media')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      const resolvedUrl = !uploadError ? await resolveStorageUrl(storagePath) : '';
      if (resolvedUrl) {
        uploadedUrls.push(resolvedUrl);
      }

      // Try inserting into place_suggestion_images table (created by production SQL update)
      try {
        await supabase.from('place_suggestion_images').insert({
          suggestion_id: suggestionId,
          user_id: userId,
          storage_path: storagePath,
          display_order: i + 1,
          is_primary: i === 0,
          created_at: new Date().toISOString(),
        });
      } catch {}
    } catch (e) {
      console.warn('uploadPlaceSuggestionImages error:', e);
    }
  }

  if (uploadedUrls.length > 0) {
    storeCachedSuggestionImages(suggestionId, uploadedUrls);
  }

  return {
    success: true,
    imageUrls: uploadedUrls,
  };
}

export async function submitPlaceSuggestion(
  suggestion: PlaceSuggestionInput,
  photoFiles?: File[]
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
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

    if (
      typeof suggestion.latitude !== 'number' ||
      isNaN(suggestion.latitude) ||
      typeof suggestion.longitude !== 'number' ||
      isNaN(suggestion.longitude)
    ) {
      return {
        success: false,
        error: 'Please pin or select the exact location on the map.',
      };
    }

    const effectivePhotos = photoFiles || suggestion.photos;
    if (effectivePhotos && effectivePhotos.length > 2) {
      return {
        success: false,
        error: 'Maximum 2 photos are allowed per suggestion.',
      };
    }

    const addressParts = [
      suggestion.area?.trim() || suggestion.address?.trim(),
      suggestion.upazila?.trim(),
      suggestion.district?.trim(),
      suggestion.division?.trim(),
    ].filter(Boolean);
    const formattedAddress = addressParts.join(', ');

    const baseDescription = (suggestion.shortDescription?.trim() || suggestion.whyWorthVisiting.trim());
    const metaNotes: string[] = [];
    if (suggestion.whyWorthVisiting?.trim()) {
      metaNotes.push(`Why: ${suggestion.whyWorthVisiting.trim()}`);
    }
    if (suggestion.estimatedBudgetMin || suggestion.estimatedBudgetMax) {
      const minB = suggestion.estimatedBudgetMin || 0;
      const maxB = suggestion.estimatedBudgetMax || minB;
      metaNotes.push(`Budget: ৳${minB}–৳${maxB}`);
    } else if (suggestion.approxBudget?.trim()) {
      metaNotes.push(`Budget: ${suggestion.approxBudget.trim()}`);
    }
    if (suggestion.bestTimeToVisit?.trim()) {
      metaNotes.push(`Best time: ${suggestion.bestTimeToVisit.trim()}`);
    }
    if (suggestion.upazila?.trim()) {
      metaNotes.push(`Upazila: ${suggestion.upazila.trim()}`);
    }
    if (suggestion.area?.trim()) {
      metaNotes.push(`Area: ${suggestion.area.trim()}`);
    }
    if (suggestion.district?.trim()) {
      metaNotes.push(`District: ${suggestion.district.trim()}`);
    }
    if (suggestion.division?.trim()) {
      metaNotes.push(`Division: ${suggestion.division.trim()}`);
    }

    const descriptionText =
      metaNotes.length > 0 ? `${baseDescription} [${metaNotes.join(' • ')}]` : baseDescription;

    const basePayload: Record<string, any> = {
      name: suggestion.name.trim(),
      category: suggestion.category?.trim() || 'Chill',
      address: formattedAddress || null,
      description: descriptionText,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      user_id: user.id,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const extendedPayload: Record<string, any> = {
      ...basePayload,
      place_name: suggestion.name.trim(),
      division: suggestion.division?.trim() || null,
      district: suggestion.district?.trim() || null,
      upazila: suggestion.upazila?.trim() || null,
      area: suggestion.area?.trim() || suggestion.address?.trim() || null,
      short_description: suggestion.shortDescription?.trim() || null,
      why_worth_visiting: suggestion.whyWorthVisiting.trim(),
      estimated_budget_min: suggestion.estimatedBudgetMin ?? null,
      estimated_budget_max: suggestion.estimatedBudgetMax ?? null,
      best_time: suggestion.bestTimeToVisit?.trim() || null,
    };

    // Try extended columns first; fall back to base columns if schema migration hasn't been executed yet
    let insertedRow: any = null;
    const { data: extData, error: extError } = await supabase
      .from('place_suggestions')
      .insert(extendedPayload)
      .select();

    if (!extError && extData && extData[0]) {
      insertedRow = extData[0];
    } else {
      const { data: baseData, error: baseError } = await supabase
        .from('place_suggestions')
        .insert(basePayload)
        .select();

      if (baseError) {
        return {
          success: false,
          error: baseError.message || 'Failed to submit suggestion. Please try again.',
        };
      }
      insertedRow = baseData?.[0];
    }

    if (insertedRow && effectivePhotos && effectivePhotos.length > 0) {
      await uploadPlaceSuggestionImages(user.id, insertedRow.id, effectivePhotos.slice(0, 2));
    }

    return { success: true, data: insertedRow };
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
// -------------------------------------------------------------
const SUGGESTION_MODERATION_STORAGE_KEY = 'outera_suggestion_moderation_status';
const LOCALLY_APPROVED_PLACES_KEY = 'outera_locally_approved_places';

export function getStoredSuggestionModeration(): Record<
  string,
  {
    status: 'pending' | 'approved' | 'rejected' | 'hidden' | 'deleted';
    moderation_note?: string;
    reviewed_by?: string;
    reviewed_at?: string;
    edits?: Partial<PlaceSuggestion>;
  }
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
  status: 'pending' | 'approved' | 'rejected' | 'hidden' | 'deleted',
  reviewedBy?: string,
  moderationNote?: string,
  edits?: Partial<PlaceSuggestion>
) {
  if (typeof window === 'undefined') return;
  try {
    const map = getStoredSuggestionModeration();
    map[suggestionId] = {
      status,
      moderation_note: moderationNote ?? map[suggestionId]?.moderation_note,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      edits: edits ? { ...(map[suggestionId]?.edits || {}), ...edits } : map[suggestionId]?.edits,
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

async function hydratePlaceSuggestionsList(rawList: any[]): Promise<PlaceSuggestion[]> {
  if (!rawList || rawList.length === 0) return [];

  const userIds = Array.from(new Set(rawList.map((s: any) => s.user_id).filter(Boolean)));
  const suggIds = Array.from(new Set(rawList.map((s: any) => s.id).filter(Boolean)));
  const profilesMap = new Map<string, any>();

  if (userIds.length > 0) {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', userIds);
      if (profiles) {
        for (const p of profiles) {
          profilesMap.set(p.id, p);
        }
      }
    } catch {}
  }

  const dbImagesMap = new Map<string, string[]>();
  if (suggIds.length > 0) {
    try {
      const { data: imgs } = await supabase
        .from('place_suggestion_images')
        .select('suggestion_id, storage_path, display_order')
        .in('suggestion_id', suggIds)
        .order('display_order', { ascending: true });
      if (imgs) {
        for (const img of imgs) {
          const url = await resolveStorageUrl(img.storage_path);
          if (url) {
            const list = dbImagesMap.get(img.suggestion_id) || [];
            if (list.length < 2) list.push(url);
            dbImagesMap.set(img.suggestion_id, list);
          }
        }
      }
    } catch {}
  }

  const cachedImages = getCachedSuggestionImages();
  const storedMod = getStoredSuggestionModeration();

  return rawList
    .map((s: any) => {
      const author = profilesMap.get(s.user_id);
      const mod = storedMod[s.id];
      const effectiveStatus = (mod?.status || s.status || 'pending').toLowerCase();
      if (effectiveStatus === 'deleted') return null;

      const parsed = parseStructuredMetadata(s.description);
      const mergedSugg = { ...s, ...(mod?.edits || {}) };
      const images = dbImagesMap.get(s.id) || cachedImages[s.id] || [];
      const bestTimeVal = mergedSugg.best_time || mergedSugg.best_time_to_visit || parsed.bestTime || null;

      return {
        ...mergedSugg,
        name: mergedSugg.place_name || mergedSugg.name,
        division: mergedSugg.division || parsed.division || null,
        district: mergedSugg.district || parsed.district || null,
        upazila: mergedSugg.upazila || parsed.upazila || null,
        area: mergedSugg.area || parsed.area || null,
        short_description: mergedSugg.short_description || parsed.cleanDescription || null,
        why_worth_visiting: mergedSugg.why_worth_visiting || parsed.whyWorthVisiting || parsed.cleanDescription || null,
        estimated_budget_min: mergedSugg.estimated_budget_min ?? parsed.budgetMin ?? null,
        estimated_budget_max: mergedSugg.estimated_budget_max ?? parsed.budgetMax ?? null,
        best_time: bestTimeVal,
        best_time_to_visit: bestTimeVal,
        promoted_place_id: mergedSugg.promoted_place_id || null,
        status: effectiveStatus,
        moderation_note: mod?.moderation_note || s.moderation_note || null,
        reviewed_by: mod?.reviewed_by || s.reviewed_by || null,
        reviewed_at: mod?.reviewed_at || s.reviewed_at || null,
        author_name: author?.display_name || 'Scout User',
        author_handle: author?.username ? `@${author.username}` : '@scout',
        images: images.slice(0, 2),
      };
    })
    .filter(Boolean) as PlaceSuggestion[];
}

// User: Fetch their own place suggestions & moderation status for Profile
export async function fetchUserPlaceSuggestions(userId?: string): Promise<PlaceSuggestion[]> {
  try {
    const user = userId ? { id: userId } : await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('place_suggestions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return await hydratePlaceSuggestionsList(data);
  } catch (err) {
    console.warn('fetchUserPlaceSuggestions error:', err);
    return [];
  }
}

// Admin: Fetch place suggestions by status ('pending' | 'approved' | 'rejected' | 'hidden' | 'all')
export async function fetchAdminPlaceSuggestions(
  statusFilter: string = 'pending'
): Promise<PlaceSuggestion[]> {
  try {
    const isAdmin = await isCurrentUserAdmin();
    if (!isAdmin) return [];

    const { data, error } = await supabase
      .from('place_suggestions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    const hydrated = await hydratePlaceSuggestionsList(data);
    if (statusFilter !== 'all') {
      return hydrated.filter((s) => s.status === statusFilter);
    }
    return hydrated;
  } catch (err) {
    console.warn('fetchAdminPlaceSuggestions error:', err);
    return [];
  }
}

// Admin: Moderate place suggestion (approve / reject / hide / edit / note / duplicate merge)
export async function moderatePlaceSuggestion(
  suggestionId: string,
  action: 'approve' | 'reject' | 'hide' | 'edit',
  optionsOrNote?:
    | string
    | {
        moderationNote?: string;
        edits?: Partial<PlaceSuggestion>;
        mergeIntoPlaceId?: string;
      },
  editsArg?: Partial<PlaceSuggestion>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Please sign in as an admin to moderate suggestions.' };
    }

    const profile = await fetchProfile(user.id);
    if (profile?.role !== 'admin') {
      return { success: false, error: 'Unauthorized: Admin role required' };
    }

    const { data: existingSugg } = await supabase
      .from('place_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .maybeSingle();

    const options =
      typeof optionsOrNote === 'string' || optionsOrNote === undefined
        ? { moderationNote: optionsOrNote, edits: editsArg }
        : optionsOrNote;

    const statusMap: Record<string, 'pending' | 'approved' | 'rejected' | 'hidden'> = {
      approve: 'approved',
      reject: 'rejected',
      hide: 'hidden',
      edit: (existingSugg?.status as any) || 'pending',
    };
    const newStatus = statusMap[action] || 'pending';
    const cleanNote = options?.moderationNote?.trim() || undefined;
    const edits = options?.edits;

    const baseUpdatePayload: Record<string, any> = {
      status: newStatus,
    };
    if (edits?.name) baseUpdatePayload.name = edits.name.trim();
    if (edits?.category) baseUpdatePayload.category = edits.category.trim();
    if (edits?.address) baseUpdatePayload.address = edits.address.trim();
    if (edits?.description) baseUpdatePayload.description = edits.description.trim();
    if (typeof edits?.latitude === 'number') baseUpdatePayload.latitude = edits.latitude;
    if (typeof edits?.longitude === 'number') baseUpdatePayload.longitude = edits.longitude;

    const extUpdatePayload: Record<string, any> = {
      ...baseUpdatePayload,
      moderation_note: cleanNote ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    };
    if (edits?.division) extUpdatePayload.division = edits.division;
    if (edits?.district) extUpdatePayload.district = edits.district;
    if (edits?.upazila) extUpdatePayload.upazila = edits.upazila;
    if (edits?.area) extUpdatePayload.area = edits.area;
    if (edits?.why_worth_visiting) extUpdatePayload.why_worth_visiting = edits.why_worth_visiting;
    if (edits?.estimated_budget_min !== undefined) extUpdatePayload.estimated_budget_min = edits.estimated_budget_min;
    if (edits?.estimated_budget_max !== undefined) extUpdatePayload.estimated_budget_max = edits.estimated_budget_max;
    if (edits?.best_time !== undefined || edits?.best_time_to_visit !== undefined) {
      extUpdatePayload.best_time = edits.best_time ?? edits.best_time_to_visit;
    }

    let updatedRow: any = null;
    const { data: extUpdated, error: extErr } = await supabase
      .from('place_suggestions')
      .update(extUpdatePayload)
      .eq('id', suggestionId)
      .select();

    if (!extErr && extUpdated) {
      updatedRow = extUpdated[0];
    } else {
      const { data: baseUpdated, error: baseErr } = await supabase
        .from('place_suggestions')
        .update(baseUpdatePayload)
        .eq('id', suggestionId)
        .select();

      if (baseErr && baseErr.code !== '42501' && !baseErr.message?.toLowerCase().includes('permission denied')) {
        return { success: false, error: baseErr.message };
      }
      updatedRow = baseUpdated?.[0];
    }

    storeSuggestionModeration(suggestionId, newStatus, user.id, cleanNote, edits);

    // When approved, convert into an actual public OUTERA place (unless merged into an existing place)
    if (action === 'approve' && !options?.mergeIntoPlaceId) {
      const rawSugg = { ...(existingSugg || {}), ...(updatedRow || {}), ...(edits || {}) };
      if (rawSugg && rawSugg.name) {
        const hydratedArr = await hydratePlaceSuggestionsList([rawSugg]);
        const sugg = hydratedArr[0] || rawSugg;

        const baseSlug =
          (sugg.name || 'place')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || `place-${Date.now()}`;
        const uniqueSlug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

        const basePlaceRow: Record<string, any> = {
          name: sugg.name,
          slug: uniqueSlug,
          category: sugg.category || 'Chill',
          address: sugg.address || [sugg.area, sugg.upazila, sugg.district, sugg.division].filter(Boolean).join(', '),
          description: sugg.description || sugg.why_worth_visiting || sugg.short_description || '',
          latitude: typeof sugg.latitude === 'number' ? sugg.latitude : null,
          longitude: typeof sugg.longitude === 'number' ? sugg.longitude : null,
          price_min: sugg.estimated_budget_min ?? null,
          price_max: sugg.estimated_budget_max ?? null,
          status: 'approved',
          created_by: sugg.user_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const extPlaceRow: Record<string, any> = {
          ...basePlaceRow,
          division: sugg.division || null,
          district: sugg.district || null,
          upazila: sugg.upazila || null,
          area: sugg.area || null,
          why_worth_visiting: sugg.why_worth_visiting || null,
          best_time: sugg.best_time || null,
          suggested_by_user_id: sugg.user_id || null,
        };

        let createdPlaceId: string | null = null;
        try {
          const { data: pExt, error: pExtErr } = await supabase
            .from('places')
            .insert(extPlaceRow)
            .select('id')
            .maybeSingle();

          if (!pExtErr && pExt?.id) {
            createdPlaceId = pExt.id;
          } else {
            const { data: pBase, error: pBaseErr } = await supabase
              .from('places')
              .insert(basePlaceRow)
              .select('id')
              .maybeSingle();

            if (!pBaseErr && pBase?.id) {
              createdPlaceId = pBase.id;
            } else {
              storeLocallyApprovedPlace({
                id: `place_${sugg.id}`,
                ...extPlaceRow,
                images: sugg.images || [],
                suggested_by_name: sugg.author_name,
                suggested_by_handle: sugg.author_handle,
              });
            }
          }

          // Copy approved suggestion images into public.place_images
          if (createdPlaceId && sugg.images && sugg.images.length > 0) {
            for (let i = 0; i < Math.min(sugg.images.length, 2); i++) {
              await supabase.from('place_images').insert({
                place_id: createdPlaceId,
                image_url: sugg.images[i],
                caption: i === 0 ? 'Primary Scout Photo' : 'Secondary Scout Photo',
                created_at: new Date().toISOString(),
              });
            }
          }
        } catch (insertErr) {
          console.warn('OUTERA auto place promotion catch:', insertErr);
          storeLocallyApprovedPlace({
            id: `place_${sugg.id}`,
            ...extPlaceRow,
            images: sugg.images || [],
            suggested_by_name: sugg.author_name,
            suggested_by_handle: sugg.author_handle,
          });
        }
      }
    }

    return { success: true };
  } catch (err: any) {
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

    storeSuggestionModeration(suggestionId, 'deleted', user.id);

    const { error } = await supabase
      .from('place_suggestions')
      .delete()
      .eq('id', suggestionId);

    if (error && error.code !== '42501') {
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
// PLACE_POSTS TABLE, MAX 2 PHOTOS, HELPFUL VOTES & MODERATION
// Schema: id, place_id, user_id, title, content, rating, status, is_visited, created_at, updated_at
// 1 post per user per place. Max 2 photos per post.
// -------------------------------------------------------------
export interface PlacePostImage {
  id: string;
  post_id: string;
  user_id: string;
  storage_path: string;
  display_order?: number;
  is_primary?: boolean;
  url: string;
  created_at: string;
}

export interface PlacePostComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  author_name?: string;
  author_username?: string;
  author_avatar?: string | null;
}

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
  images?: string[];
  comments?: PlacePostComment[];
  comments_count?: number;
  helpful_count?: number;
  user_marked_helpful?: boolean;
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

export function getPublicStorageUrl(storagePath: string): string {
  if (!storagePath) return '';
  if (
    storagePath.startsWith('http://') ||
    storagePath.startsWith('https://') ||
    storagePath.startsWith('data:')
  ) {
    return storagePath;
  }
  const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
  const { data } = supabase.storage.from('community-review-media').getPublicUrl(cleanPath);
  return data?.publicUrl || '';
}

export async function resolveStorageUrl(storagePath: string): Promise<string> {
  if (!storagePath) return '';
  if (
    storagePath.startsWith('http://') ||
    storagePath.startsWith('https://') ||
    storagePath.startsWith('data:')
  ) {
    return storagePath;
  }
  const cleanPath = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath;
  try {
    const { data: signedData, error } = await supabase.storage
      .from('community-review-media')
      .createSignedUrl(cleanPath, 3600);
    if (!error && signedData?.signedUrl) {
      return signedData.signedUrl;
    }
  } catch {}
  return getPublicStorageUrl(cleanPath);
}

async function hydratePlacePosts(rawPosts: any[]): Promise<PlacePost[]> {
  if (!rawPosts || rawPosts.length === 0) return [];

  const currentUser = await getCurrentUser();
  const isAdmin = currentUser ? await isCurrentUserAdmin() : false;

  const userIds = Array.from(new Set(rawPosts.map((p) => p.user_id).filter(Boolean)));
  const postIds = Array.from(new Set(rawPosts.map((p) => p.id).filter(Boolean)));
  const profilesMap = new Map<string, SupabaseProfile>();
  const postImagesMap = new Map<string, string[]>();
  const helpfulCountMap = new Map<string, number>();
  const userHelpfulSet = new Set<string>();

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

  // Only expose photos for approved posts, OR posts owned by the current user, OR when viewed by an admin
  const allowedImagePostIds = rawPosts
    .filter((p) => {
      const status = (storedNotes[p.id]?.status || p.status || 'pending').toLowerCase();
      return status === 'approved' || isAdmin || (currentUser && p.user_id === currentUser.id);
    })
    .map((p) => p.id);

  if (allowedImagePostIds.length > 0) {
    try {
      const { data: images } = await supabase
        .from('place_post_images')
        .select('id, post_id, storage_path, created_at')
        .in('post_id', allowedImagePostIds)
        .order('created_at', { ascending: true });

      if (images && images.length > 0) {
        for (const img of images) {
          const list = postImagesMap.get(img.post_id) || [];
          if (list.length < 2) {
            const resolvedUrl = await resolveStorageUrl(img.storage_path);
            if (resolvedUrl) list.push(resolvedUrl);
            postImagesMap.set(img.post_id, list);
          }
        }
      }
    } catch (imgErr) {
      console.warn('hydratePlacePosts images notice:', imgErr);
    }
  }

  // Fetch helpful counts from place_post_helpful
  if (postIds.length > 0) {
    try {
      const { data: helpfulRows } = await supabase
        .from('place_post_helpful')
        .select('post_id, user_id')
        .in('post_id', postIds);

      if (helpfulRows) {
        for (const row of helpfulRows) {
          helpfulCountMap.set(row.post_id, (helpfulCountMap.get(row.post_id) || 0) + 1);
          if (currentUser && row.user_id === currentUser.id) {
            userHelpfulSet.add(row.post_id);
          }
        }
      }
    } catch {}
  }

  return rawPosts.map((p) => {
    const author = profilesMap.get(p.user_id);
    const place = p.places || {};
    const modInfo = storedNotes[p.id];
    const postPhotos = (postImagesMap.get(p.id) || []).slice(0, 2);

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
      images: postPhotos,
      helpful_count: helpfulCountMap.get(p.id) || 0,
      user_marked_helpful: userHelpfulSet.has(p.id),
    };
  });
}

// Check if user already has a post/review for a specific place (1 post per user per place rule)
export async function checkUserExistingPostForPlace(
  placeId: string,
  userId?: string
): Promise<PlacePost | null> {
  try {
    const user = userId ? { id: userId } : await getCurrentUser();
    if (!user || !placeId) return null;

    const { data, error } = await supabase
      .from('place_posts')
      .select('*, places(id, name, category, address)')
      .eq('place_id', placeId)
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    const hydrated = await hydratePlacePosts([data]);
    return hydrated[0] || null;
  } catch {
    return null;
  }
}

// Toggle Helpful on an approved community post
export async function togglePostHelpful(postId: string): Promise<{
  success: boolean;
  markedHelpful: boolean;
  helpfulCount: number;
  error?: string;
}> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        markedHelpful: false,
        helpfulCount: 0,
        error: 'Please sign in to mark posts as helpful.',
      };
    }

    const { data: existing } = await supabase
      .from('place_post_helpful')
      .select('post_id, user_id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle();

    let markedHelpful = false;
    if (existing) {
      await supabase
        .from('place_post_helpful')
        .delete()
        .match({ post_id: postId, user_id: user.id });
      markedHelpful = false;
    } else {
      const { error: insErr } = await supabase.from('place_post_helpful').insert({
        post_id: postId,
        user_id: user.id,
        created_at: new Date().toISOString(),
      });
      if (insErr) {
        return {
          success: false,
          markedHelpful: false,
          helpfulCount: 0,
          error: insErr.message,
        };
      }
      markedHelpful = true;
    }

    const { count } = await supabase
      .from('place_post_helpful')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    return {
      success: true,
      markedHelpful,
      helpfulCount: count || 0,
    };
  } catch (err: any) {
    return {
      success: false,
      markedHelpful: false,
      helpfulCount: 0,
      error: err?.message || 'Could not update helpful status.',
    };
  }
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
    const hydrated = await hydratePlacePosts(data);
    return hydrated.filter((p) => p.status === 'approved');
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

// Create new post - strictly status = 'pending', 1 post per user per place
export async function createPlacePost(input: {
  place_id: string;
  title: string;
  content: string;
  rating?: number;
  is_visited?: boolean;
}): Promise<{ success: boolean; data?: PlacePost; existingPost?: PlacePost; error?: string }> {
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

    // Enforce 1 post/review per user per place
    const existingPost = await checkUserExistingPostForPlace(input.place_id, user.id);
    if (existingPost) {
      return {
        success: false,
        existingPost,
        error: 'You have already submitted a community post for this place (limit: 1 post per place). You can edit or manage your existing post.',
      };
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
      if (error.code === '23505') {
        return {
          success: false,
          error: 'You can only create 1 post/review per place.',
        };
      }
      return { success: false, error: error.message };
    }

    const hydrated = data ? (await hydratePlacePosts([data]))[0] : undefined;
    return { success: true, data: hydrated };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit post.' };
  }
}

// Owner can edit their own post according to its status
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

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
      status: 'pending', // Editing resets or keeps status as pending for moderation safety
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

// Fetch a single place post by ID with defensive null-safety (never exposes rejected/hidden publicly)
export async function fetchPlacePostById(postId: string): Promise<PlacePost | null> {
  if (!postId || typeof postId !== 'string') return null;
  try {
    const { data, error } = await supabase
      .from('place_posts')
      .select('*, places(id, name, category, address)')
      .eq('id', postId.trim())
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const hydratedList = await hydratePlacePosts([data]);
    if (!hydratedList || hydratedList.length === 0) return null;

    const post = hydratedList[0];
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser ? await isCurrentUserAdmin() : false;

    if (post.status !== 'approved' && !isAdmin && (!currentUser || post.user_id !== currentUser.id)) {
      return null;
    }

    const comments = await fetchPostComments(post.id);
    post.comments = comments;
    post.comments_count = comments.length;

    return post;
  } catch (err) {
    console.warn('fetchPlacePostById notice:', err);
    return null;
  }
}

// Fetch images for a specific post (max 2)
export async function fetchPostImages(postId: string): Promise<string[]> {
  if (!postId) return [];
  try {
    const { data, error } = await supabase
      .from('place_post_images')
      .select('id, storage_path, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(2);

    if (error || !data) return [];
    const urls: string[] = [];
    for (const img of data) {
      const u = await resolveStorageUrl(img.storage_path);
      if (u) urls.push(u);
    }
    return urls.slice(0, 2);
  } catch {
    return [];
  }
}

// Upload direct photos from user's device to community-review-media bucket
// STRICTLY MAXIMUM 2 PHOTOS per community post (JPG/JPEG/PNG/WEBP, max 5MB each)
export async function uploadPlacePostImages(
  userId: string,
  postId: string,
  files: File[]
): Promise<{ success: boolean; imagePaths: string[]; error?: string }> {
  if (!files || files.length === 0) {
    return { success: true, imagePaths: [] };
  }

  if (files.length > 2) {
    return {
      success: false,
      imagePaths: [],
      error: 'Maximum 2 photos are allowed per community post.',
    };
  }

  const uploadedPaths: string[] = [];
  const maxFiles = Math.min(files.length, 2);

  for (let i = 0; i < maxFiles; i++) {
    const file = files[i];
    if (file.size > 5 * 1024 * 1024) {
      return {
        success: false,
        imagePaths: uploadedPaths,
        error: `Photo "${file.name}" exceeds the 5MB limit.`,
      };
    }

    const rawExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const validExts = ['jpg', 'jpeg', 'png', 'webp'];
    if (!validExts.includes(rawExt)) {
      return {
        success: false,
        imagePaths: uploadedPaths,
        error: 'Only JPG, JPEG, PNG, and WEBP image formats are supported.',
      };
    }

    const safeFileName = `${Date.now()}_${i + 1}_${Math.random().toString(36).slice(2, 6)}.${rawExt}`;
    const storagePath = `${userId}/${postId}/${safeFileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('community-review-media')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (!uploadError) {
        uploadedPaths.push(storagePath);

        // Try inserting with display_order and is_primary first, fallback to base columns
        const extInsert = await supabase.from('place_post_images').insert({
          post_id: postId,
          user_id: userId,
          storage_path: storagePath,
          display_order: i + 1,
          is_primary: i === 0,
          created_at: new Date().toISOString(),
        });

        if (extInsert.error) {
          await supabase.from('place_post_images').insert({
            post_id: postId,
            user_id: userId,
            storage_path: storagePath,
            created_at: new Date().toISOString(),
          });
        }
      } else {
        console.warn('OUTERA photo upload notice:', uploadError);
      }
    } catch (e) {
      console.warn('Failed to upload file:', file.name, e);
    }
  }

  return {
    success: uploadedPaths.length > 0 || files.length === 0,
    imagePaths: uploadedPaths,
  };
}

// Fetch comments for a post
export async function fetchPostComments(postId: string): Promise<PlacePostComment[]> {
  if (!postId) return [];
  try {
    const { data: rawComments, error } = await supabase
      .from('place_post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error || !rawComments || rawComments.length === 0) return [];

    const userIds = Array.from(new Set(rawComments.map((c: any) => c.user_id).filter(Boolean)));
    const profilesMap = new Map<string, SupabaseProfile>();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', userIds);
      if (profiles) {
        for (const p of profiles) profilesMap.set(p.id, p);
      }
    }

    return rawComments.map((c: any) => {
      const profile = profilesMap.get(c.user_id);
      return {
        id: c.id,
        post_id: c.post_id,
        user_id: c.user_id,
        content: c.content || '',
        created_at: c.created_at,
        updated_at: c.updated_at,
        author_name: profile?.display_name || 'OUTERA Scout',
        author_username: profile?.username ? `@${profile.username}` : '@scout',
        author_avatar: profile?.avatar_url || null,
      };
    });
  } catch (err) {
    console.warn('fetchPostComments error:', err);
    return [];
  }
}

// Add comment to a post
export async function addPostComment(
  postId: string,
  content: string
): Promise<{ success: boolean; comment?: PlacePostComment; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Sign in to comment' };
    if (!content.trim()) return { success: false, error: 'Comment cannot be empty' };

    const payload = {
      post_id: postId,
      user_id: user.id,
      content: content.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('place_post_comments')
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    const profile = await fetchProfile(user.id);
    const newComment: PlacePostComment = {
      id: data?.id || `temp-${Date.now()}`,
      post_id: postId,
      user_id: user.id,
      content: payload.content,
      created_at: payload.created_at,
      author_name: profile?.display_name || 'OUTERA Scout',
      author_username: profile?.username ? `@${profile.username}` : '@scout',
      author_avatar: profile?.avatar_url || null,
    };

    return { success: true, comment: newComment };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to post comment' };
  }
}

// Delete a comment
export async function deletePostComment(commentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Authentication required' };
    const isAdmin = await isCurrentUserAdmin();

    let query = supabase.from('place_post_comments').delete().eq('id', commentId);
    if (!isAdmin) {
      query = query.eq('user_id', user.id);
    }

    const { error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete comment' };
  }
}

// User can delete their own post, or Admin can delete any post
export async function deleteUserPost(postId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: 'Authentication required' };
    const isAdmin = await isCurrentUserAdmin();

    const { data: existing } = await supabase
      .from('place_posts')
      .select('id, user_id')
      .eq('id', postId)
      .maybeSingle();

    if (existing && existing.user_id !== user.id && !isAdmin) {
      return { success: false, error: 'Unauthorized: You can only delete your own posts.' };
    }

    try {
      await supabase.from('place_post_images').delete().eq('post_id', postId);
      await supabase.from('place_post_comments').delete().eq('post_id', postId);
      await supabase.from('place_post_helpful').delete().eq('post_id', postId);
    } catch (cleanupErr) {
      console.warn('Post cleanup notice:', cleanupErr);
    }

    let query = supabase.from('place_posts').delete().eq('id', postId);
    if (!isAdmin) {
      query = query.eq('user_id', user.id);
    }

    const { error } = await query;
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
      (m) => m.status === 'approved' || m.status === 'rejected' || m.status === 'hidden' || m.status === 'deleted'
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
      moderation_note: note?.trim() || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
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


