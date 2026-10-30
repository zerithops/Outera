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

export type DivisionName =
  | 'Dhaka'
  | 'Chattogram'
  | 'Rajshahi'
  | 'Khulna'
  | 'Barishal'
  | 'Sylhet'
  | 'Rangpur'
  | 'Mymensingh';

export type CrowdLevel = 'Low' | 'Medium' | 'High';
export type VibeType = 'Relaxed' | 'Energetic' | 'Social' | 'Quiet';
export type PricePerception = 'Cheap' | 'Fair' | 'Expensive';
export type RevisitDecision = 'Yes' | 'Maybe' | 'No';
export type GroupFit = 'Solo' | 'Friends' | 'Family' | 'Date';
export type EnvironmentType = 'Indoor' | 'Outdoor' | 'Rooftop';

export type MarkerState =
  | 'Normal'
  | 'Popular'
  | 'Trending'
  | 'HiddenGem'
  | 'CommunityReviewed';

export type CommunityConfidenceLevel = 'High' | 'Mixed' | 'Low';

export type VerificationResponseOption = 'Mostly' | 'Partly' | 'Not really';

export type DifferenceReason =
  | 'Price'
  | 'Quality'
  | 'Crowd'
  | 'Location'
  | 'Opening hours'
  | 'Service'
  | 'Overall experience'
  | 'Other';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface VerificationStats {
  mostlyCount: number;
  partlyCount: number;
  notReallyCount: number;
  totalResponses: number;
  confidence: CommunityConfidenceLevel;
  commonDifferences: { reason: DifferenceReason; count: number }[];
}

export interface ExperienceReport {
  id: string;
  placeId: string;
  createdAt: number;
  authorName: string;
  authorHandle?: string;
  isVerifiedVisitor?: boolean;
  price: PricePerception;
  crowd: CrowdLevel;
  vibe: VibeType;
  wouldGoAgain: RevisitDecision;
  comment?: string;
  approxSpendTaka?: number;
  verification: VerificationStats;
}

export interface CommunityVerificationAction {
  id: string;
  reportId: string;
  placeId: string;
  response: VerificationResponseOption;
  differenceReason?: DifferenceReason;
  createdAt: number;
  isVerifiedVisitor: boolean;
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
  district: string;
  division: DivisionName;
  coordinates: Coordinates;
  priceLevel: {
    min: number;
    max: number;
    label: string; // e.g. "৳250–৳450"
    symbol: '৳' | '৳৳' | '৳৳৳';
  };
  communityScore: number; // percentage (e.g. 88 = 88% recommend / would go again)
  communityConfidence: CommunityConfidenceLevel;
  totalReports: number;
  verifiedVisitorsCount: number;
  markerState: MarkerState;
  isTrending?: boolean;
  isHiddenGem?: boolean;
  isEvent?: boolean;
  eventInfo?: {
    date: string;
    schedule: string;
    entryPass: string;
  };
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
  whyPick: string; // Context-aware recommendation reason
  highlights: string[];
  experienceReports: ExperienceReport[];
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

export interface FilterState {
  searchQuery: string;
  selectedCategory: 'all' | MoodCategory;
  selectedDivision: 'all' | DivisionName;
  selectedDistrict: 'all' | string;
  openNowOnly: boolean;
  priceMax: number | null; // 300, 500, or null
  maxDistanceKm: number | null; // 1, 3, 5, 20, or null
  group: 'all' | GroupFit;
  environment: 'all' | 'Indoor' | 'Outdoor';
  vibe: 'all' | VibeType | 'Popular';
  mapLayer: 'all' | 'Trending' | 'Popular' | 'HiddenGems' | 'CommunityActivity' | 'Events';
}

export interface UserLocation {
  coords: Coordinates;
  neighborhoodName: string;
  district: string;
  division: DivisionName;
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

export interface ModerationReport {
  id: string;
  targetId: string;
  targetType: 'experience' | 'place';
  reason: 'Wrong information' | 'Spam' | 'Abusive content' | 'Duplicate' | 'Potentially misleading';
  comment?: string;
  createdAt: number;
}
