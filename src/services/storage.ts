import {
  CommunityVerificationAction,
  DifferenceReason,
  ExperienceReport,
  ModerationReport,
  Place,
  SavedCollection,
  VerificationResponseOption,
} from '../types/outera';
import { INITIAL_PLACES } from '../data/mockPlaces';

const STORAGE_KEYS = {
  SAVED_PLACES: 'outera_saved_places',
  VISITED_PLACES: 'outera_visited_places',
  COLLECTIONS: 'outera_collections',
  USER_REPORTS: 'outera_user_reports',
  VERIFICATIONS: 'outera_verifications',
  MODERATION_REPORTS: 'outera_moderation_reports',
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
    description: 'High energy games, sea breezes, and rooftop bites.',
    placeIds: ['place-1', 'place-11', 'place-10'],
    createdAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'col-2',
    name: 'Scenic nature escapes',
    description: 'Serene mountain viewpoints, cloud decks and tea gardens.',
    placeIds: ['place-12', 'place-13', 'place-14', 'place-15'],
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

// ----------------- Saved Places -----------------
export function getSavedPlaceIds(): string[] {
  if (!isStorageAvailable()) return ['place-1', 'place-12'];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.SAVED_PLACES);
    if (!raw) return ['place-1', 'place-12'];
    return JSON.parse(raw);
  } catch {
    return ['place-1', 'place-12'];
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

// ----------------- Visited Places ("I've Been Here") -----------------
export function getVisitedPlaceIds(): string[] {
  if (!isStorageAvailable()) return ['place-1', 'place-11'];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.VISITED_PLACES);
    if (!raw) return ['place-1', 'place-11']; // Seed demo visits
    return JSON.parse(raw);
  } catch {
    return ['place-1', 'place-11'];
  }
}

export function toggleVisitedPlace(placeId: string): { visitedIds: string[]; isNowVisited: boolean } {
  const current = getVisitedPlaceIds();
  let updated: string[];
  let isNowVisited: boolean;
  if (current.includes(placeId)) {
    updated = current.filter((id) => id !== placeId);
    isNowVisited = false;
  } else {
    updated = [placeId, ...current];
    isNowVisited = true;
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
  return newReport;
}

// ----------------- User Profile -----------------
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

// ----------------- Augmented Places Aggregation -----------------
export function getAugmentedPlaces(): Place[] {
  const userReports = getUserExperienceReports();
  const userVerifications = getCommunityVerifications();
  const visitedPlaceIds = getVisitedPlaceIds();

  return INITIAL_PLACES.map((place) => {
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
        // Stronger weight given to visitors who marked a visit
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

      let confidence: 'High' | 'Mixed' | 'Low' = 'High';
      if (totalResponses >= 5) {
        if (mostlyRatio >= 0.75) confidence = 'High';
        else if (mostlyRatio >= 0.45) confidence = 'Mixed';
        else confidence = 'Low';
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

    // Check if user has marked a visit
    const isUserVisited = visitedPlaceIds.includes(place.id);
    const effectiveVerifiedCount = place.verifiedVisitorsCount + (isUserVisited ? 1 : 0);

    // Calculate place level community confidence
    const totalVerifications = augmentedExperienceReports.reduce(
      (sum, r) => sum + r.verification.totalResponses,
      0
    );
    const mostlyTotal = augmentedExperienceReports.reduce(
      (sum, r) => sum + r.verification.mostlyCount,
      0
    );

    let communityConfidence: 'High' | 'Mixed' | 'Low' = place.communityConfidence;
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
