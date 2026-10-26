export type MoodCategory =
  | 'Food'
  | 'Chill'
  | 'Fun'
  | 'Sports'
  | 'Study'
  | 'Shopping'
  | 'Outdoors'
  | 'Events'
  | 'Creative'
  | 'Nightlife';

export type CrowdLevel = 'Low' | 'Medium' | 'High';
export type VibeType = 'Relaxed' | 'Energetic' | 'Social' | 'Quiet';
export type PricePerception = 'Cheap' | 'Fair' | 'Expensive';
export type RevisitDecision = 'Yes' | 'Maybe' | 'No';
export type GroupFit = 'Solo' | 'Friends' | 'Family' | 'Date';
export type EnvironmentType = 'Indoor' | 'Outdoor' | 'Rooftop';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  slug: string;
  name: string;
  category: MoodCategory;
  shortDescription: string;
  fullDescription: string;
  address: string;
  neighborhood: string;
  city: string;
  coordinates: Coordinates;
  priceLevel: {
    min: number;
    max: number;
    label: string; // e.g. "৳250–৳450"
    symbol: '৳' | '৳৳' | '৳৳৳';
  };
  communityScore: number; // percentage (e.g. 88 = 88% recommend / would go again)
  totalReports: number;
  openingHours: {
    openNow: boolean;
    hoursText: string;
    closesAt?: string;
  };
  crowdLevel: CrowdLevel;
  primaryVibe: VibeType;
  secondaryVibes: VibeType[];
  groupFit: GroupFit[];
  environment: EnvironmentType;
  tags: string[];
  images: string[];
  whyPick: string; // Tailored recommendation reason for Surprise Me & discovery
  highlights: string[];
  userReportsBreakdown: {
    worthVisitingPct: number;
    mostCommonCrowd: CrowdLevel;
    mostCommonVibe: VibeType;
    mostCommonPrice: PricePerception;
    recentComments: {
      text: string;
      vibe: VibeType;
      wouldGoAgain: RevisitDecision;
      timeAgo: string;
    }[];
  };
}

export interface ExperienceReport {
  id: string;
  placeId: string;
  createdAt: number;
  price: PricePerception;
  crowd: CrowdLevel;
  vibe: VibeType;
  wouldGoAgain: RevisitDecision;
  comment?: string;
  authorName?: string;
}

export interface FilterState {
  searchQuery: string;
  selectedCategory: 'all' | MoodCategory;
  openNowOnly: boolean;
  priceMax: number | null; // 300, 500, or null
  maxDistanceKm: number | null; // 1, 3, 5, or null
  group: 'all' | GroupFit;
  environment: 'all' | 'Indoor' | 'Outdoor';
  vibe: 'all' | VibeType | 'Popular';
}

export interface UserLocation {
  coords: Coordinates;
  neighborhoodName: string;
  isCustomManual: boolean;
  accuracyMeters?: number;
}

export interface SavedCollection {
  id: string;
  name: string;
  description: string;
  placeIds: string[];
  createdAt: number;
}
