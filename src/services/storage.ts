import { ExperienceReport, Place, SavedCollection } from '../types/outera';
import { INITIAL_PLACES } from '../data/mockPlaces';

const STORAGE_KEYS = {
  SAVED_PLACES: 'outera_saved_places',
  COLLECTIONS: 'outera_collections',
  USER_REPORTS: 'outera_user_reports',
  USER_PROFILE: 'outera_user_profile',
};

export interface UserProfile {
  name: string;
  handle: string;
  vibePreference: string;
  budgetPreference: string;
  avatarSeed: string;
}

export const DEFAULT_PROFILE: UserProfile = {
  name: 'Samir Hasan',
  handle: '@samir.out',
  vibePreference: 'Chill & Social',
  budgetPreference: 'Under ৳500',
  avatarSeed: 'outera-user-1',
};

export const DEFAULT_COLLECTIONS: SavedCollection[] = [
  {
    id: 'col-1',
    name: 'Weekend with the crew',
    description: 'High energy games, bouldering, and rooftop bites.',
    placeIds: ['place-1', 'place-3', 'place-7'],
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'col-2',
    name: 'Solo recharge spots',
    description: 'Quiet vinyl lounges and afternoon craft corners.',
    placeIds: ['place-2', 'place-4', 'place-6'],
    createdAt: Date.now() - 86400000 * 5,
  },
];

function isStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function getSavedPlaceIds(): string[] {
  if (!isStorageAvailable()) return ['place-1', 'place-4'];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.SAVED_PLACES);
    if (!raw) return ['place-1', 'place-4']; // Default saved spots to showcase immediately
    return JSON.parse(raw);
  } catch {
    return ['place-1', 'place-4'];
  }
}

export function toggleSavePlace(placeId: string): string[] {
  const current = getSavedPlaceIds();
  let updated: string[];
  if (current.includes(placeId)) {
    updated = current.filter((id) => id !== placeId);
  } else {
    updated = [placeId, ...current];
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
  return updated;
}

export function getUserProfile(): UserProfile {
  if (!isStorageAvailable()) return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveUserProfile(profile: Partial<UserProfile>): UserProfile {
  const current = getUserProfile();
  const updated = { ...current, ...profile };
  if (isStorageAvailable()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updated));
    } catch (e) {
      console.warn(e);
    }
  }
  return updated;
}

/**
 * Returns places merged with dynamically submitted community reports
 */
export function getAugmentedPlaces(): Place[] {
  const userReports = getUserExperienceReports();
  if (userReports.length === 0) return INITIAL_PLACES;

  return INITIAL_PLACES.map((place) => {
    const matchingReports = userReports.filter((r) => r.placeId === place.id);
    if (matchingReports.length === 0) return place;

    // Recalculate stats
    const yesCount = matchingReports.filter((r) => r.wouldGoAgain === 'Yes').length;
    const addedReports = matchingReports.length;
    const newTotal = place.totalReports + addedReports;

    // Weight existing percentage with new feedback
    const baseYes = Math.round((place.communityScore / 100) * place.totalReports);
    const combinedPct = Math.round(((baseYes + yesCount) / newTotal) * 100);

    const latestComments = matchingReports
      .filter((r) => r.comment && r.comment.trim().length > 0)
      .map((r) => ({
        text: r.comment!,
        vibe: r.vibe,
        wouldGoAgain: r.wouldGoAgain,
        timeAgo: 'Just now',
      }));

    return {
      ...place,
      totalReports: newTotal,
      communityScore: Math.min(100, Math.max(10, combinedPct)),
      userReportsBreakdown: {
        ...place.userReportsBreakdown,
        worthVisitingPct: Math.min(100, Math.max(10, combinedPct)),
        recentComments: [...latestComments, ...place.userReportsBreakdown.recentComments],
      },
    };
  });
}
