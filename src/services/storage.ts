import {
  CommunityConfidenceLevel,
  CommunityVerificationAction,
  DifferenceReason,
  ExperienceReport,
  ModerationReport,
  Place,
  SavedCollection,
  VerificationResponseOption,
} from '../types/outera';
import {
  savePlaceToSupabase,
  unsavePlaceFromSupabase,
  recordVisitInSupabase,
  removeVisitInSupabase,
  createExperienceReportInSupabase,
  recordVerificationInSupabase,
  submitReportToSupabase,
  upsertProfile,
  logActivity,
} from './supabase';

const STORAGE_KEYS = {
  SAVED_PLACES: 'outera_saved_places',
  VISITED_PLACES: 'outera_visited_places',
  COLLECTIONS: 'outera_collections',
  USER_REPORTS: 'outera_user_reports',
  VERIFICATIONS: 'outera_verifications',
  MODERATION_REPORTS: 'outera_moderation_reports',
};

// Immediate purge of any legacy demo profile keys from previous sessions
if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
  try {
    const legacyKeysToPurge = [
      'outera_user_profile',
      'outera_profile',
      'user_profile',
      'mock_profile',
      'demo_profile',
    ];
    for (const key of legacyKeysToPurge) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage purge errors
  }
}

export interface UserProfile {
  name: string;
  handle: string;
  vibePreference: string;
  budgetPreference: string;
  avatarSeed: string;
  bio?: string;
}

// Neutral empty guest profile — NEVER contains hardcoded demo names or fake handles
export const EMPTY_GUEST_PROFILE: UserProfile = {
  name: '',
  handle: '',
  vibePreference: 'Chill & Social',
  budgetPreference: 'Under ৳500',
  avatarSeed: 'scout-1',
  bio: '',
};

export const DEFAULT_PROFILE: UserProfile = EMPTY_GUEST_PROFILE;

export const DEFAULT_COLLECTIONS: SavedCollection[] = [];

function isStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

// ----------------- Per-User Profile Caching -----------------
export function getUserProfileCacheKey(userId?: string): string {
  if (!userId) return 'outera_profile_guest';
  return `outera_profile_${userId}`;
}

export function getCachedUserProfile(userId?: string): UserProfile | null {
  if (!isStorageAvailable() || !userId) return null;
  try {
    const raw = window.localStorage.getItem(getUserProfileCacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setCachedUserProfile(userId: string, profile: UserProfile): void {
  if (!isStorageAvailable() || !userId) return;
  try {
    window.localStorage.setItem(getUserProfileCacheKey(userId), JSON.stringify(profile));
  } catch (e) {
    console.warn('Failed to cache user profile:', e);
  }
}

export function clearUserProfileCache(userId?: string): void {
  if (!isStorageAvailable()) return;
  try {
    if (userId) {
      window.localStorage.removeItem(getUserProfileCacheKey(userId));
    }
    window.localStorage.removeItem('outera_profile_guest');
    window.localStorage.removeItem('outera_user_profile');
  } catch (e) {
    console.warn(e);
  }
}

export function getUserProfile(userId?: string): UserProfile {
  if (!userId) return EMPTY_GUEST_PROFILE;
  const cached = getCachedUserProfile(userId);
  if (cached) return cached;
  return EMPTY_GUEST_PROFILE;
}

export function saveUserProfile(profile: Partial<UserProfile>, userId?: string): UserProfile {
  const current = userId ? (getCachedUserProfile(userId) || EMPTY_GUEST_PROFILE) : EMPTY_GUEST_PROFILE;
  const updated: UserProfile = { ...current, ...profile };

  if (userId) {
    setCachedUserProfile(userId, updated);
  }

  // Clean username if handle is passed
  const cleanUsername = updated.handle
    ? updated.handle.replace(/^@/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    : undefined;

  // Sync to Supabase public.profiles table
  upsertProfile({
    display_name: updated.name || undefined,
    username: cleanUsername,
    bio: updated.bio || undefined,
  });

  return updated;
}

// ----------------- Saved Places -----------------
export function getSavedPlaceIds(): string[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.SAVED_PLACES);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function toggleSavePlace(placeId: string): string[] {
  const current = getSavedPlaceIds();
  let updated: string[];
  const isCurrentlySaved = current.includes(placeId);

  if (isCurrentlySaved) {
    updated = current.filter((id) => id !== placeId);
    // Sync removal with Supabase
    unsavePlaceFromSupabase(placeId);
  } else {
    updated = [placeId, ...current];
    // Sync addition with Supabase
    savePlaceToSupabase(placeId);
    logActivity('save', placeId);
  }

  if (isStorageAvailable()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.SAVED_PLACES, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to save place id to localStorage', err);
    }
  }
  return updated;
}

// ----------------- Visited Places ("I've Been Here") -----------------
export function getVisitedPlaceIds(): string[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.VISITED_PLACES);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function toggleVisitedPlace(placeId: string): { visitedIds: string[]; isNowVisited: boolean } {
  const current = getVisitedPlaceIds();
  let updated: string[];
  let isNowVisited: boolean;

  if (current.includes(placeId)) {
    updated = current.filter((id) => id !== placeId);
    isNowVisited = false;
    removeVisitInSupabase(placeId);
  } else {
    updated = [placeId, ...current];
    isNowVisited = true;
    recordVisitInSupabase(placeId);
    logActivity('visit', placeId);
  }

  if (isStorageAvailable()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.VISITED_PLACES, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to save visited place to localStorage', err);
    }
  }
  return { visitedIds: updated, isNowVisited };
}

export function isPlaceVisitedByUser(placeId: string): boolean {
  return getVisitedPlaceIds().includes(placeId);
}

// ----------------- Collections -----------------
export function getSavedCollections(): SavedCollection[] {
  if (!isStorageAvailable()) return DEFAULT_COLLECTIONS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.COLLECTIONS);
    if (!raw) return DEFAULT_COLLECTIONS;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_COLLECTIONS;
  }
}

export function saveCollection(collection: SavedCollection): SavedCollection[] {
  const current = getSavedCollections();
  const existingIndex = current.findIndex((c) => c.id === collection.id);
  let updated: SavedCollection[];
  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = collection;
  } else {
    updated = [collection, ...current];
  }
  if (isStorageAvailable()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.COLLECTIONS, JSON.stringify(updated));
    } catch (e) {
      console.warn(e);
    }
  }
  return updated;
}

// ----------------- User Experience Reports -----------------
export function getUserExperienceReports(): ExperienceReport[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.USER_REPORTS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addExperienceReport(report: ExperienceReport): ExperienceReport[] {
  const current = getUserExperienceReports();
  const updated = [report, ...current];
  if (isStorageAvailable()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.USER_REPORTS, JSON.stringify(updated));
    } catch (e) {
      console.warn(e);
    }
  }

  // Sync to Supabase experiences table
  createExperienceReportInSupabase(report.placeId, report);
  logActivity('review', report.placeId, 'Shared community experience', {
    spend: report.approxSpendTaka,
    wouldGoAgain: report.wouldGoAgain,
  });

  return updated;
}

// ----------------- Community Verification Actions -----------------
export function getCommunityVerifications(): CommunityVerificationAction[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.VERIFICATIONS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function submitVerificationAction(
  reportId: string,
  placeId: string,
  response: VerificationResponseOption,
  differenceReason?: DifferenceReason
): CommunityVerificationAction[] {
  const current = getCommunityVerifications();
  const userVisited = isPlaceVisitedByUser(placeId);
  const newAction: CommunityVerificationAction = {
    id: `ver-${Date.now()}`,
    reportId,
    placeId,
    response,
    differenceReason,
    createdAt: Date.now(),
    isVerifiedVisitor: userVisited,
  };

  const updated = [newAction, ...current];
  if (isStorageAvailable()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.VERIFICATIONS, JSON.stringify(updated));
    } catch (e) {
      console.warn(e);
    }
  }

  // Sync to Supabase experience_verifications table
  recordVerificationInSupabase(reportId, placeId, response, differenceReason);
  logActivity('verify', placeId, `Community verification: ${response}`, {
    differenceReason,
    isVerifiedVisitor: userVisited,
  });

  return updated;
}

export function getUserVerificationForReport(reportId: string): CommunityVerificationAction | undefined {
  const all = getCommunityVerifications();
  return all.find((v) => v.reportId === reportId);
}

// ----------------- Trust & Safety Moderation -----------------
export function submitModerationReport(report: Omit<ModerationReport, 'id' | 'createdAt'>): ModerationReport {
  const newReport: ModerationReport = {
    ...report,
    id: `mod-${Date.now()}`,
    createdAt: Date.now(),
  };

  if (isStorageAvailable()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.MODERATION_REPORTS);
      const existing: ModerationReport[] = raw ? JSON.parse(raw) : [];
      window.localStorage.setItem(STORAGE_KEYS.MODERATION_REPORTS, JSON.stringify([newReport, ...existing]));
    } catch (e) {
      console.warn(e);
    }
  }

  // Sync to Supabase reports table
  submitReportToSupabase(report);

  return newReport;
}

// ----------------- Augmented Places Aggregation -----------------
export function getAugmentedPlaces(basePlaces: Place[] = []): Place[] {
  if (!basePlaces || basePlaces.length === 0) {
    return [];
  }

  const userReports = getUserExperienceReports();
  const userVerifications = getCommunityVerifications();
  const visitedPlaceIds = getVisitedPlaceIds();

  return basePlaces.map((place) => {
    // Add locally submitted reports
    const localPlaceReports = userReports.filter((r) => r.placeId === place.id);
    const combinedReports = [...localPlaceReports, ...(place.experienceReports || [])];

    // Compute updated verification stats on reports
    const augmentedExperienceReports = combinedReports.map((report) => {
      const relatedVerifications = userVerifications.filter((v) => v.reportId === report.id);
      if (relatedVerifications.length === 0) return report;

      let mostly = report.verification.mostlyCount;
      let partly = report.verification.partlyCount;
      let notReally = report.verification.notReallyCount;
      const diffMap = new Map<DifferenceReason, number>();

      for (const d of report.verification.commonDifferences) {
        diffMap.set(d.reason, d.count);
      }

      for (const v of relatedVerifications) {
        const weight = v.isVerifiedVisitor ? 2 : 1;
        if (v.response === 'Mostly') mostly += weight;
        else if (v.response === 'Partly') partly += weight;
        else if (v.response === 'Not really') notReally += weight;

        if (v.differenceReason) {
          diffMap.set(v.differenceReason, (diffMap.get(v.differenceReason) || 0) + 1);
        }
      }

      const totalResponses = mostly + partly + notReally;
      const mostlyRatio = totalResponses > 0 ? mostly / totalResponses : 1;

      let confidence: 'High' | 'Mixed' | 'Low' | 'Insufficient Data' = 'High';
      if (totalResponses < 3) {
        confidence = 'Insufficient Data';
      } else if (mostlyRatio >= 0.75) {
        confidence = 'High';
      } else if (mostlyRatio >= 0.45) {
        confidence = 'Mixed';
      } else {
        confidence = 'Low';
      }

      const commonDifferences: { reason: DifferenceReason; count: number }[] = [];
      diffMap.forEach((count, reason) => {
        commonDifferences.push({ reason, count });
      });

      return {
        ...report,
        verification: {
          mostlyCount: mostly,
          partlyCount: partly,
          notReallyCount: notReally,
          totalResponses,
          confidence,
          commonDifferences: commonDifferences.sort((a, b) => b.count - a.count),
        },
      };
    });

    const isUserVisited = visitedPlaceIds.includes(place.id);
    const effectiveVerifiedCount = place.verifiedVisitorsCount + (isUserVisited ? 1 : 0);

    const totalVerifications = augmentedExperienceReports.reduce(
      (sum, r) => sum + r.verification.totalResponses,
      0
    );
    const mostlyTotal = augmentedExperienceReports.reduce(
      (sum, r) => sum + r.verification.mostlyCount,
      0
    );

    let communityConfidence: CommunityConfidenceLevel = place.communityConfidence;
    if (totalVerifications > 10) {
      const agreementRate = mostlyTotal / totalVerifications;
      if (agreementRate >= 0.8) communityConfidence = 'High';
      else if (agreementRate >= 0.5) communityConfidence = 'Mixed';
      else communityConfidence = 'Low';
    }

    return {
      ...place,
      verifiedVisitorsCount: effectiveVerifiedCount,
      communityConfidence,
      experienceReports: augmentedExperienceReports,
    };
  });
}
