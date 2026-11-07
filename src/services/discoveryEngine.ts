import { CanonicalCategoryId, Coordinates, FilterState, MoodCategory, Place } from '../types/outera';
import { calculateDistanceKm } from './location';

export interface PlaceWithDistance extends Place {
  distanceKm?: number;
  rankScore: number;
}

export interface CategoryDescriptor {
  id: MoodCategory;
  label: string;
  iconKey: string;
  aliases: string[];
  placeCount: number;
  postCount: number;
}

const CANONICAL_CATEGORY_DEFINITIONS: {
  id: CanonicalCategoryId;
  label: string;
  iconKey: string;
  aliases: string[];
}[] = [
  {
    id: 'Culture & Art',
    label: 'Culture & Art',
    iconKey: 'Palette',
    aliases: [
      'culture & art',
      'creative',
      'art',
      'culture',
      'art & culture',
      'gallery',
      'museum',
      'art cafe',
      'art caffe',
    ],
  },
  {
    id: 'Food & Drink',
    label: 'Food & Drink',
    iconKey: 'Utensils',
    aliases: [
      'food & drink',
      'food',
      'cafe',
      'restaurant',
      'dining',
      'coffee',
      'snacks',
      'street food',
      'bakery',
    ],
  },
  {
    id: 'Chill',
    label: 'Chill',
    iconKey: 'Coffee',
    aliases: ['chill', 'hangout', 'lounge', 'relax', 'spot'],
  },
  {
    id: 'Outdoors & Nature',
    label: 'Outdoors & Nature',
    iconKey: 'Trees',
    aliases: [
      'outdoors & nature',
      'outdoors',
      'outdoor',
      'nature',
      'park',
      'parks',
      'scenic',
      'lake',
      'river',
    ],
  },
  {
    id: 'Active & Sports',
    label: 'Active & Sports',
    iconKey: 'Trophy',
    aliases: [
      'active & sports',
      'sports',
      'sport',
      'active',
      'fitness',
      'turf',
      'swimming',
      'climbing',
    ],
  },
  {
    id: 'Gaming & Arcade',
    label: 'Gaming & Arcade',
    iconKey: 'Gamepad2',
    aliases: [
      'gaming & arcade',
      'fun',
      'gaming',
      'arcade',
      'board games',
      'vr',
      'bowling',
      'entertainment',
    ],
  },
  {
    id: 'Late Night',
    label: 'Late Night',
    iconKey: 'Moon',
    aliases: ['late night', 'nightlife', 'night', 'rooftop night'],
  },
  {
    id: 'Tourist Spot',
    label: 'Tourist Spot',
    iconKey: 'Compass',
    aliases: ['tourist spot', 'tourism', 'landmark', 'sightseeing', 'heritage', 'historical'],
  },
  {
    id: 'Hotel / Resort',
    label: 'Hotel / Resort',
    iconKey: 'Building2',
    aliases: ['hotel / resort', 'hotel', 'resort', 'stay', 'retreat'],
  },
  {
    id: 'Study & Work',
    label: 'Study & Work',
    iconKey: 'BookOpen',
    aliases: ['study & work', 'study', 'coworking', 'library', 'work', 'workspace'],
  },
  {
    id: 'Shopping',
    label: 'Shopping',
    iconKey: 'ShoppingBag',
    aliases: ['shopping', 'mall', 'market', 'boutique', 'craft'],
  },
  {
    id: 'Events',
    label: 'Events',
    iconKey: 'Calendar',
    aliases: ['events', 'event', 'live music', 'concert', 'exhibition', 'festival'],
  },
];

const ALIAS_TO_CANONICAL_MAP: Map<string, CanonicalCategoryId> = (() => {
  const map = new Map<string, CanonicalCategoryId>();
  for (const def of CANONICAL_CATEGORY_DEFINITIONS) {
    map.set(def.id.toLowerCase(), def.id);
    map.set(def.label.toLowerCase(), def.id);
    for (const alias of def.aliases) {
      map.set(alias.toLowerCase().trim(), def.id);
    }
  }
  return map;
})();

/**
 * Normalizes any raw category string or legacy alias (e.g., 'Creative' -> 'Culture & Art',
 * 'Food' -> 'Food & Drink', 'Sports' -> 'Active & Sports') into its canonical OUTERA category name.
 * Preserves custom categories cleanly without data loss.
 */
export function normalizeCategoryName(rawCategory: string | null | undefined): MoodCategory {
  if (!rawCategory || typeof rawCategory !== 'string') {
    return 'Chill';
  }
  const cleaned = rawCategory.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Chill';
  }

  const lower = cleaned.toLowerCase();
  const directMatch = ALIAS_TO_CANONICAL_MAP.get(lower);
  if (directMatch) {
    return directMatch;
  }

  return cleaned as MoodCategory;
}

/**
 * Checks whether a place or post category matches the currently selected category filter.
 * Supports canonical names, legacy aliases, and custom database categories.
 */
export function doesCategoryMatch(
  itemCategory: string | null | undefined,
  selectedCategory: MoodCategory | 'all' | null | undefined
): boolean {
  if (!selectedCategory || selectedCategory === 'all') {
    return true;
  }
  const normalizedSelected = normalizeCategoryName(selectedCategory).toLowerCase();
  const normalizedItem = normalizeCategoryName(itemCategory).toLowerCase();
  return normalizedItem === normalizedSelected;
}

/**
 * Builds the deduplicated list of all available categories, computing real place & approved post counts
 * and dynamically including any custom categories present in the database without duplicates.
 */
export function getAvailableCategories(
  places: Place[] = [],
  posts: { place_id?: string; place_category?: string; status?: string }[] = []
): CategoryDescriptor[] {
  const placeById = new Map<string, Place>();
  for (const p of places) {
    if (p?.id) {
      placeById.set(p.id, p);
    }
  }

  const placeCounts = new Map<string, number>();
  const postCounts = new Map<string, number>();
  const customCategories = new Map<string, string>();

  const knownCanonicalKeys = new Set(
    CANONICAL_CATEGORY_DEFINITIONS.map((d) => d.id.toLowerCase())
  );

  for (const place of places) {
    if (!place) continue;
    const norm = normalizeCategoryName(place.category);
    const key = norm.toLowerCase();
    placeCounts.set(key, (placeCounts.get(key) || 0) + 1);
    if (!knownCanonicalKeys.has(key) && !customCategories.has(key)) {
      customCategories.set(key, norm);
    }
  }

  for (const post of posts) {
    if (!post) continue;
    if (post.status && post.status.toLowerCase() !== 'approved') continue;
    const linkedPlace = post.place_id ? placeById.get(post.place_id) : undefined;
    const rawCat = linkedPlace?.category || post.place_category;
    if (!rawCat) continue;
    const norm = normalizeCategoryName(rawCat);
    const key = norm.toLowerCase();
    postCounts.set(key, (postCounts.get(key) || 0) + 1);
    if (!knownCanonicalKeys.has(key) && !customCategories.has(key)) {
      customCategories.set(key, norm);
    }
  }

  const seenKeys = new Set<string>();
  const result: CategoryDescriptor[] = [];

  for (const def of CANONICAL_CATEGORY_DEFINITIONS) {
    const key = def.id.toLowerCase();
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    result.push({
      id: def.id,
      label: def.label,
      iconKey: def.iconKey,
      aliases: def.aliases,
      placeCount: placeCounts.get(key) || 0,
      postCount: postCounts.get(key) || 0,
    });
  }

  // Append any custom database categories not in the default list (preventing duplicates)
  for (const [key, label] of customCategories.entries()) {
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    result.push({
      id: label as MoodCategory,
      label,
      iconKey: 'Sparkles',
      aliases: [key],
      placeCount: placeCounts.get(key) || 0,
      postCount: postCounts.get(key) || 0,
    });
  }

  return result;
}

/**
 * Canonical list of category options for place suggestion, admin editing, and mood scroller fallback.
 */
export const MOOD_CATEGORIES: { id: MoodCategory; label: string; iconKey: string }[] =
  CANONICAL_CATEGORY_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.label,
    iconKey: def.iconKey,
  }));

export const PLACE_CATEGORY_OPTIONS: CanonicalCategoryId[] = CANONICAL_CATEGORY_DEFINITIONS.map(
  (def) => def.id
);

/**
 * Filters approved public community posts by selected category, search query, and location filters.
 * Ensures each post is accurately linked to its parent place's category and location.
 */
export function filterApprovedPublicPosts<
  T extends {
    id: string;
    place_id: string;
    title?: string;
    content?: string;
    status?: string;
    place_name?: string;
    place_category?: string;
    place_address?: string;
    author_name?: string;
  }
>(
  posts: T[],
  places: Place[],
  filters: Pick<
    FilterState,
    'selectedCategory' | 'searchQuery' | 'selectedDivision' | 'selectedDistrict'
  >
): T[] {
  if (!Array.isArray(posts) || posts.length === 0) return [];

  const placeById = new Map<string, Place>();
  const placeByName = new Map<string, Place>();
  for (const place of places || []) {
    if (!place) continue;
    if (place.id) placeById.set(place.id, place);
    if (place.name) placeByName.set(place.name.trim().toLowerCase(), place);
  }

  const seenPostIds = new Set<string>();

  return posts.filter((post) => {
    if (!post || !post.id) return false;
    if (seenPostIds.has(post.id)) return false;

    // Strictly only approved public posts
    if (post.status && post.status.toLowerCase() !== 'approved') {
      return false;
    }

    const linkedPlace =
      (post.place_id ? placeById.get(post.place_id) : undefined) ||
      (post.place_name ? placeByName.get(post.place_name.trim().toLowerCase()) : undefined);

    const effectiveCategory = normalizeCategoryName(
      linkedPlace?.category || post.place_category || 'Chill'
    );

    // 1. Category filter
    if (filters.selectedCategory && filters.selectedCategory !== 'all') {
      if (!doesCategoryMatch(effectiveCategory, filters.selectedCategory)) {
        return false;
      }
    }

    // 2. Division filter
    if (filters.selectedDivision && filters.selectedDivision !== 'all') {
      const targetDiv = filters.selectedDivision.toLowerCase();
      const placeDiv = (linkedPlace?.division || '').toLowerCase();
      const addrLower = (post.place_address || linkedPlace?.address || '').toLowerCase();
      if (placeDiv && placeDiv !== targetDiv) {
        return false;
      }
      if (!placeDiv && !addrLower.includes(targetDiv)) {
        return false;
      }
    }

    // 3. District filter
    if (filters.selectedDistrict && filters.selectedDistrict !== 'all') {
      const targetDist = filters.selectedDistrict.toLowerCase();
      const placeDist = (linkedPlace?.district || '').toLowerCase();
      const addrLower = (post.place_address || linkedPlace?.address || '').toLowerCase();
      if (placeDist && placeDist !== targetDist) {
        return false;
      }
      if (!placeDist && !addrLower.includes(targetDist)) {
        return false;
      }
    }

    // 4. Search query filter
    if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
      const q = filters.searchQuery.trim().toLowerCase();
      const matchTitle = (post.title || '').toLowerCase().includes(q);
      const matchContent = (post.content || '').toLowerCase().includes(q);
      const matchPlaceName = (linkedPlace?.name || post.place_name || '').toLowerCase().includes(q);
      const matchCategory =
        effectiveCategory.toLowerCase().includes(q) ||
        (post.place_category || '').toLowerCase().includes(q);
      const matchAddress = (post.place_address || linkedPlace?.address || '')
        .toLowerCase()
        .includes(q);
      const matchNeighborhood = (linkedPlace?.neighborhood || '').toLowerCase().includes(q);
      const matchDistrict = (linkedPlace?.district || '').toLowerCase().includes(q);
      const matchDivision = (linkedPlace?.division || '').toLowerCase().includes(q);
      const matchAuthor = (post.author_name || '').toLowerCase().includes(q);

      if (
        !matchTitle &&
        !matchContent &&
        !matchPlaceName &&
        !matchCategory &&
        !matchAddress &&
        !matchNeighborhood &&
        !matchDistrict &&
        !matchDivision &&
        !matchAuthor
      ) {
        return false;
      }
    }

    seenPostIds.add(post.id);
    return true;
  });
}

export function filterAndRankPlaces(
  places: Place[],
  userCoords: Coordinates | null,
  filters: FilterState
): PlaceWithDistance[] {
  // Deduplicate places by ID and normalize category on each place
  const seenPlaceIds = new Set<string>();
  const processed: PlaceWithDistance[] = [];

  for (const place of places || []) {
    if (!place || !place.id || seenPlaceIds.has(place.id)) continue;
    seenPlaceIds.add(place.id);

    const distanceKm =
      userCoords && place.coordinates && typeof place.coordinates.lat === 'number'
        ? calculateDistanceKm(userCoords, place.coordinates)
        : undefined;

    const normalizedCategory = normalizeCategoryName(place.category);

    processed.push({
      ...place,
      category: normalizedCategory,
      distanceKm,
      rankScore: 0,
    });
  }

  const filtered = processed.filter((place) => {
    // Search query
    if (filters.searchQuery.trim().length > 0) {
      const q = filters.searchQuery.trim().toLowerCase();
      const matchName = place.name.toLowerCase().includes(q);
      const matchCat = place.category.toLowerCase().includes(q);
      const matchDesc = place.shortDescription.toLowerCase().includes(q);
      const matchFullDesc = (place.fullDescription || '').toLowerCase().includes(q);
      const matchTags = place.tags.some((t) => t.toLowerCase().includes(q));
      const matchHood = place.neighborhood.toLowerCase().includes(q);
      const matchDistrict = place.district.toLowerCase().includes(q);
      const matchDivision = place.division.toLowerCase().includes(q);
      const matchAddress = (place.address || '').toLowerCase().includes(q);
      if (
        !matchName &&
        !matchCat &&
        !matchDesc &&
        !matchFullDesc &&
        !matchTags &&
        !matchHood &&
        !matchDistrict &&
        !matchDivision &&
        !matchAddress
      ) {
        return false;
      }
    }

    // Division filter (case-insensitive)
    if (filters.selectedDivision && filters.selectedDivision !== 'all') {
      const targetDiv = filters.selectedDivision.toLowerCase();
      const placeDiv = (place.division || '').toLowerCase();
      const addrLower = (place.address || '').toLowerCase();
      if (placeDiv !== targetDiv && !addrLower.includes(targetDiv)) return false;
    }

    // District filter (case-insensitive)
    if (filters.selectedDistrict && filters.selectedDistrict !== 'all') {
      const targetDist = filters.selectedDistrict.toLowerCase();
      const placeDist = (place.district || '').toLowerCase();
      const addrLower = (place.address || '').toLowerCase();
      if (placeDist !== targetDist && !addrLower.includes(targetDist)) return false;
    }

    // Category filter (using canonical normalizer & alias matcher)
    if (filters.selectedCategory && filters.selectedCategory !== 'all') {
      if (!doesCategoryMatch(place.category, filters.selectedCategory)) {
        return false;
      }
    }

    // Open now filter
    if (filters.openNowOnly && !place.openingHours.openNow) {
      return false;
    }

    // Price max filter
    if (filters.priceMax !== null) {
      if (place.priceLevel.min > filters.priceMax) return false;
    }

    // Max distance filter (requires known distance)
    if (filters.maxDistanceKm !== null && filters.selectedDivision === 'all') {
      if (place.distanceKm === undefined || place.distanceKm > filters.maxDistanceKm) {
        return false;
      }
    }

    // Group fit
    if (filters.group !== 'all') {
      if (!place.groupFit.includes(filters.group)) return false;
    }

    // Environment
    if (filters.environment !== 'all') {
      if (filters.environment === 'Indoor' && place.environment !== 'Indoor') return false;
      if (
        filters.environment === 'Outdoor' &&
        place.environment !== 'Outdoor' &&
        place.environment !== 'Rooftop'
      ) {
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

    // Map Layer filter
    if (filters.mapLayer && filters.mapLayer !== 'all') {
      if (filters.mapLayer === 'Trending' && !place.isTrending && place.markerState !== 'Trending')
        return false;
      if (
        filters.mapLayer === 'Popular' &&
        place.markerState !== 'Popular' &&
        place.communityScore < 90
      )
        return false;
      if (
        filters.mapLayer === 'HiddenGems' &&
        !place.isHiddenGem &&
        place.markerState !== 'HiddenGem'
      )
        return false;
      if (filters.mapLayer === 'Events' && !place.isEvent) return false;
      if (
        filters.mapLayer === 'CommunityActivity' &&
        (place.experienceReports?.length || 0) < 1
      )
        return false;
    }

    return true;
  });

  // Ranking algorithm: Proximity (if available) + Community Score + Confidence + Open bonus
  return filtered
    .map((place) => {
      // Proximity score: closer is exponentially rewarded up to 20km if user location is available
      const proximityScore =
        place.distanceKm !== undefined ? Math.max(0, 60 - place.distanceKm * 2) : 0;

      // Community rating score (0 - 30)
      const communityWeight = (place.communityScore / 100) * 30;

      // Confidence weight: High confidence gives slight boost
      const confidenceBonus =
        place.communityConfidence === 'High' ? 10 : place.communityConfidence === 'Mixed' ? 5 : 0;

      // Open now bonus
      const openBonus = place.openingHours.openNow ? 10 : 0;

      // Trending bonus
      const trendingBonus = place.isTrending ? 8 : 0;

      const rankScore =
        proximityScore + communityWeight + confidenceBonus + openBonus + trendingBonus;
      return {
        ...place,
        rankScore,
      };
    })
    .sort((a, b) => {
      // If user has location coordinates, sort strictly by nearest first!
      if (userCoords) {
        if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
          return a.distanceKm - b.distanceKm;
        }
        if (a.distanceKm !== undefined) return -1;
        if (b.distanceKm !== undefined) return 1;
      }
      return b.rankScore - a.rankScore;
    });
}

/**
 * Surprise Me engine: Picks a standout place with a context-aware reason
 */
export function getSurpriseRecommendation(
  places: Place[],
  userCoords: Coordinates | null,
  excludeId?: string
): { place: PlaceWithDistance; reason: string } {
  const candidates = places
    .filter((p) => p.id !== excludeId)
    .map((place) => {
      const distanceKm =
        userCoords && place.coordinates
          ? calculateDistanceKm(userCoords, place.coordinates)
          : undefined;
      return {
        ...place,
        category: normalizeCategoryName(place.category),
        distanceKm,
        rankScore: 0,
      };
    });

  // Prefer places that are open now and have high community score
  const sorted = candidates.sort((a, b) => {
    const aDistancePenalty = a.distanceKm !== undefined ? a.distanceKm * 0.5 : 0;
    const bDistancePenalty = b.distanceKm !== undefined ? b.distanceKm * 0.5 : 0;
    const aScore = (a.openingHours.openNow ? 20 : 0) + a.communityScore - aDistancePenalty;
    const bScore = (b.openingHours.openNow ? 20 : 0) + b.communityScore - bDistancePenalty;
    return bScore - aScore;
  });

  // Pick from the top 5 to keep it fresh on "Try Another"
  const pool = sorted.slice(0, Math.min(5, sorted.length));
  const picked = pool[Math.floor(Math.random() * pool.length)] || sorted[0];

  // Dynamic reason builder
  let reason =
    picked.distanceKm !== undefined
      ? `You're ${picked.distanceKm < 1 ? 'just a short walk away' : `${picked.distanceKm.toFixed(1)} km out`}`
      : 'Top community verified pick';

  if (picked.openingHours.openNow) {
    reason += ', it is open right now';
  }
  if (picked.priceLevel.min <= 300) {
    reason += ', fits an accessible ৳300–500 budget';
  }
  reason += `, and ${picked.communityScore}% of community reports (${picked.communityConfidence} Confidence) say it is genuinely worth going out for.`;

  return {
    place: picked,
    reason,
  };
}
