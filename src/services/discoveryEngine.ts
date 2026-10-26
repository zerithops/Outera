import { Coordinates, FilterState, MoodCategory, Place } from '../types/outera';
import { calculateDistanceKm } from './location';

export interface PlaceWithDistance extends Place {
  distanceKm: number;
  rankScore: number;
}

export function filterAndRankPlaces(
  places: Place[],
  userCoords: Coordinates,
  filters: FilterState
): PlaceWithDistance[] {
  // First calculate distance and check baseline filter matches
  const processed = places.map((place) => {
    const distanceKm = calculateDistanceKm(userCoords, place.coordinates);
    return {
      ...place,
      distanceKm,
      rankScore: 0,
    };
  });

  const filtered = processed.filter((place) => {
    // Search query
    if (filters.searchQuery.trim().length > 0) {
      const q = filters.searchQuery.toLowerCase();
      const matchName = place.name.toLowerCase().includes(q);
      const matchCat = place.category.toLowerCase().includes(q);
      const matchDesc = place.shortDescription.toLowerCase().includes(q);
      const matchTags = place.tags.some((t) => t.toLowerCase().includes(q));
      const matchHood = place.neighborhood.toLowerCase().includes(q);
      if (!matchName && !matchCat && !matchDesc && !matchTags && !matchHood) {
        return false;
      }
    }

    // Category filter
    if (filters.selectedCategory !== 'all') {
      if (place.category !== filters.selectedCategory) return false;
    }

    // Open now filter
    if (filters.openNowOnly && !place.openingHours.openNow) {
      return false;
    }

    // Price max filter
    if (filters.priceMax !== null) {
      // If user wants Under ৳300, minimum or average price should be <= 300
      if (place.priceLevel.min > filters.priceMax) return false;
    }

    // Max distance filter
    if (filters.maxDistanceKm !== null) {
      if (place.distanceKm > filters.maxDistanceKm) return false;
    }

    // Group fit
    if (filters.group !== 'all') {
      if (!place.groupFit.includes(filters.group)) return false;
    }

    // Environment
    if (filters.environment !== 'all') {
      if (filters.environment === 'Indoor' && place.environment !== 'Indoor') return false;
      if (filters.environment === 'Outdoor' && place.environment !== 'Outdoor' && place.environment !== 'Rooftop') {
        return false;
      }
    }

    // Vibe filter
    if (filters.vibe !== 'all') {
      if (filters.vibe === 'Popular') {
        if (place.crowdLevel !== 'High' && place.totalReports < 100) return false;
      } else if (filters.vibe === 'Quiet') {
        if (place.primaryVibe !== 'Quiet' && !place.secondaryVibes.includes('Quiet')) return false;
      } else if (place.primaryVibe !== filters.vibe && !place.secondaryVibes.includes(filters.vibe)) {
        return false;
      }
    }

    return true;
  });

  // Ranking algorithm: Proximity + Community Score + Open status
  return filtered
    .map((place) => {
      // Proximity score: closer is exponentially rewarded up to 5km
      const proximityScore = Math.max(0, 50 - place.distanceKm * 8);

      // Community rating score (0 - 30)
      const communityWeight = (place.communityScore / 100) * 30;

      // Open now bonus
      const openBonus = place.openingHours.openNow ? 15 : 0;

      // Low crowd / high buzz bonus depending on score
      const buzzBonus = Math.min(10, (place.totalReports / 100) * 5);

      const rankScore = proximityScore + communityWeight + openBonus + buzzBonus;
      return {
        ...place,
        rankScore,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

/**
 * Surprise Me engine: Picks a standout place with a context-aware reason
 */
export function getSurpriseRecommendation(
  places: Place[],
  userCoords: Coordinates,
  excludeId?: string
): { place: PlaceWithDistance; reason: string } {
  const candidates = places
    .filter((p) => p.id !== excludeId)
    .map((place) => {
      const distanceKm = calculateDistanceKm(userCoords, place.coordinates);
      return {
        ...place,
        distanceKm,
        rankScore: 0,
      };
    });

  // Prefer places that are open now and have high community score
  const sorted = candidates.sort((a, b) => {
    const aScore = (a.openingHours.openNow ? 20 : 0) + a.communityScore - a.distanceKm * 3;
    const bScore = (b.openingHours.openNow ? 20 : 0) + b.communityScore - b.distanceKm * 3;
    return bScore - aScore;
  });

  // Pick from the top 3 to keep it fresh on "Try Another"
  const pool = sorted.slice(0, Math.min(4, sorted.length));
  const picked = pool[Math.floor(Math.random() * pool.length)] || sorted[0];

  // Dynamic reason builder
  let reason = `You're ${picked.distanceKm < 1 ? 'just a walk away' : `${picked.distanceKm.toFixed(1)} km out`}`;
  if (picked.openingHours.openNow) {
    reason += ', it is open right now';
  }
  if (picked.priceLevel.min <= 300) {
    reason += ', easy on the pocket (under ৳500)';
  }
  reason += `, and ${picked.communityScore}% of community reports say it is completely worth going out for.`;

  return {
    place: picked,
    reason,
  };
}

export const MOOD_CATEGORIES: { id: MoodCategory; label: string; icon: string; count: number }[] = [
  { id: 'Food', label: 'Food', icon: '🍲', count: 18 },
  { id: 'Chill', label: 'Chill', icon: '🛋️', count: 14 },
  { id: 'Fun', label: 'Fun', icon: '🎲', count: 16 },
  { id: 'Sports', label: 'Sports', icon: '🧗', count: 9 },
  { id: 'Study', label: 'Study', icon: '☕', count: 11 },
  { id: 'Shopping', label: 'Shopping', icon: '🛍️', count: 12 },
  { id: 'Outdoors', label: 'Outdoors', icon: '🌿', count: 15 },
  { id: 'Events', label: 'Events', icon: '🎟️', count: 8 },
  { id: 'Creative', label: 'Creative', icon: '🎨', count: 7 },
  { id: 'Nightlife', label: 'Nightlife', icon: '⚡', count: 10 },
];
