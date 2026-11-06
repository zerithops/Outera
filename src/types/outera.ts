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

export type CrowdLevel = 'Low' | 'Medium' | 'High' | 'Quiet' | 'Busy';
export type VibeType = 'Relaxed' | 'Energetic' | 'Social' | 'Quiet';
export type PricePerception = 'Cheap' | 'Fair' | 'Expensive';
export type RevisitDecision = 'Yes' | 'Maybe' | 'No';
export type GroupFit = 'Solo' | 'Friends' | 'Family' | 'Date';
export type EnvironmentType = 'Indoor' | 'Outdoor' | 'Rooftop' | 'Both';

export type MarkerState =
  | 'Normal'
  | 'Popular'
  | 'Trending'
  | 'HiddenGem'
  | 'Hidden Gem'
  | 'CommunityReviewed';

export type CommunityConfidenceLevel =
  | 'High'
  | 'Medium'
  | 'Limited'
  | 'Insufficient Data'
  | 'Mixed'
  | 'Low';

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
  category: MoodCategory | string;
  subcategory?: string;
  shortDescription: string;
  fullDescription: string;
  address: string;
  neighborhood: string;
  city: string;
  upazila?: string;
  district: string;
  division: DivisionName | string;
  coordinates: Coordinates | null;
  priceLevel: {
    min: number;
    max: number;
    label: string; // e.g. "৳250–৳450"
    symbol: '৳' | '৳৳' | '৳৳৳';
  };
  priceLabel?: string;
  priceTier?: string;
  bestTimeToVisit?: string;
  timeOfDaySuitability?: string[];
  suitableFor?: string[];
  communityRating?: number | null;
  approvedPostsCount?: number;
  scoutAttributionName?: string;
  scoutAttributionHandle?: string;
  suggestedByUserId?: string | null;
  suggestedByScoutId?: string | null;
  suggestedByScoutName?: string;
  suggestedByScoutHandle?: string;
  createdByUserId?: string;
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
  image?: string;
  images: string[];
  whyPick: string; // Context-aware recommendation reason
  highlights: string[];
  experienceReports: ExperienceReport[];
  userReportsBreakdown: {
    worthVisitingPct: number;
    mostCommonCrowd: CrowdLevel;
    mostCommonVibe: VibeType;
    mostCommonPrice: PricePerception;
    recentComments: (
      | {
          text: string;
          vibe: VibeType;
          wouldGoAgain: RevisitDecision;
          timeAgo: string;
        }
      | string
    )[];
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

export type LocationStatus =
  | 'idle'
  | 'detecting'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

export interface UserLocation {
  coords: Coordinates | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number;
  neighborhoodName: string;
  district: string;
  division: DivisionName | string;
  formattedAddress?: string;
  isCustomManual: boolean;
  status: LocationStatus;
  errorMessage?: string;
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
  targetType: 'experience' | 'place' | 'post';
  reason:
    | 'Wrong information'
    | 'Spam'
    | 'Abusive content'
    | 'Duplicate'
    | 'Potentially misleading'
    | 'Closed permanently'
    | 'Inaccurate details'
    | 'Outdated info'
    | 'Spam or promotional'
    | string;
  comment?: string;
  createdAt: number;
}

// -------------------------------------------------------------
// TRANSPORT & FARE INTELLIGENCE SYSTEM
// -------------------------------------------------------------
export type TransportType =
  | 'Bus'
  | 'Train'
  | 'CNG / Auto'
  | 'Rickshaw'
  | 'Easy Bike / E-bike'
  | 'Launch / Boat'
  | 'Private Car'
  | 'Metro'
  | 'Bike / Ride Share';

export type FareSourceType = 'OFFICIAL' | 'OPERATOR' | 'COMMUNITY' | 'ESTIMATED';
export type FareConfidence = 'High' | 'Medium' | 'Low';
export type FareUnit = 'per person' | 'per vehicle' | 'per trip';

export interface RouteLeg {
  fromLocation: string;
  toLocation: string;
  transportType: TransportType;
  minFare: number;
  maxFare: number;
  fareUnit?: FareUnit;
  estimatedDurationMin: number;
  distanceKm?: number;
  notes?: string;
}

export interface TransportOption {
  id: string;
  transportType: TransportType;
  fromName: string;
  toName: string;
  origin?: string;
  destination?: string;
  minFare: number;
  maxFare: number;
  fareUnit?: FareUnit;
  currency: 'BDT';
  estimatedDurationMin: number;
  distanceKm?: number;
  sourceType: FareSourceType;
  sourceReference?: string;
  confidence: FareConfidence;
  lastUpdated: string; // ISO date e.g. "2026-11-02"
  isOutdated?: boolean;
  notes?: string;
  isMultiLeg?: boolean;
  legs?: RouteLeg[];
  communityReportsCount?: number;
}

export interface TransportRoute {
  id: string;
  originDistrict: string;
  destinationDistrict: string;
  destinationPlaceId?: string;
  destinationPlaceName?: string;
  fromLocation?: string;
  toLocation?: string;
  transportType: TransportType;
  distanceKm?: number;
  estimatedDurationMin: number;
  active: boolean;
  notes?: string;
  isMultiLeg?: boolean;
  legs?: RouteLeg[];
  created_at?: string;
}

export interface TransportFare {
  id: string;
  routeId: string;
  transportType: TransportType;
  minFare: number;
  maxFare: number;
  currency: 'BDT';
  fareUnit: FareUnit;
  sourceType: FareSourceType;
  sourceReference?: string;
  confidence: FareConfidence;
  verifiedAt?: string;
  notes?: string;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityFareReport {
  id: string;
  userId?: string | null;
  authorName?: string;
  authorHandle?: string;
  origin: string;
  destination: string;
  destinationPlaceId?: string;
  destinationPlaceName?: string;
  transportType: TransportType;
  farePaid: number;
  fareUnit?: FareUnit;
  currency: 'BDT';
  tripDate: string;
  notes?: string;
  status: 'pending' | 'verified' | 'rejected';
  createdAt: string;
}

// -------------------------------------------------------------
// LOCAL TRANSPORT CONTACTS & NEARBY TOURIST SERVICES
// -------------------------------------------------------------
export type LocalVehicleType =
  | 'CNG/Auto'
  | 'Rickshaw'
  | 'Easy Bike/E-Rickshaw'
  | 'Car'
  | 'Boat/Launch'
  | 'Other';

export interface LocalTransportContact {
  id: string;
  place_id?: string | null;
  placeId?: string | null;
  division?: string | null;
  district?: string | null;
  upazila?: string | null;
  vehicle_type?: LocalVehicleType | string;
  vehicleType?: LocalVehicleType | string;
  name?: string;
  operatorName?: string;
  service_area?: string;
  serviceArea?: string;
  phone?: string | null;
  whatsapp?: string | null;
  phone_public_permission?: boolean;
  phonePublicPermission?: boolean;
  contactPermission?: boolean;
  rate_note?: string | null;
  rateNote?: string | null;
  contact_verified?: boolean;
  contactVerified?: boolean;
  isContactVerified?: boolean;
  outera_verified?: boolean;
  outeraVerified?: boolean;
  isOuteraVerified?: boolean;
  community_recommended?: boolean;
  communityRecommended?: boolean;
  isCommunityRecommended?: boolean;
  recommendations_count?: number;
  helpfulReportsCount?: number;
  last_verified?: string | null;
  lastVerified?: string | null;
  lastVerifiedAt?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'hidden';
  submitted_by?: string | null;
  submittedBy?: string | null;
  created_at?: string;
  createdAt?: string;
}

export type NearbyServiceCategoryGroup = 'stay' | 'eat';
export type StayServiceType = 'Hotel' | 'Resort' | 'Guest House' | 'Hostel' | 'Homestay';
export type EatServiceType = 'Restaurant' | 'Cafe' | 'Street Food' | 'Family Restaurant' | 'Local Food';
export type NearbyStayType = StayServiceType;
export type NearbyEatType = EatServiceType;

export interface NearbyServiceItem {
  id: string;
  place_id?: string | null;
  placeId?: string | null;
  linked_place_id?: string | null;
  category_group?: NearbyServiceCategoryGroup;
  serviceGroup?: NearbyServiceCategoryGroup;
  serviceCategory?: NearbyServiceCategoryGroup;
  service_type?: StayServiceType | EatServiceType | string;
  serviceType?: StayServiceType | EatServiceType | string;
  category?: StayServiceType | EatServiceType | string;
  name: string;
  food_type?: string | null;
  foodType?: string | null;
  foodSpecialty?: string | null;
  division?: string | null;
  district?: string | null;
  upazila?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number | null;
  distanceKm?: number | null;
  price_min?: number | null;
  priceMin?: number | null;
  price_max?: number | null;
  priceMax?: number | null;
  price_range_label?: string | null;
  priceRangeLabel?: string | null;
  priceRange?: string | null;
  contact_phone?: string | null;
  contactPhone?: string | null;
  contact_whatsapp?: string | null;
  whatsapp?: string | null;
  contact_public_permission?: boolean;
  contactPublicPermission?: boolean;
  contactPermission?: boolean;
  directions_note?: string | null;
  directionsNote?: string | null;
  community_confidence?: CommunityConfidenceLevel;
  communityConfidence?: CommunityConfidenceLevel;
  visitor_reports_count?: number;
  visitorReportsCount?: number;
  contact_verified?: boolean;
  contactVerified?: boolean;
  isVerified?: boolean;
  outera_verified?: boolean;
  outeraVerified?: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'hidden';
  submitted_by?: string | null;
  submittedBy?: string | null;
  created_at?: string;
  createdAt?: string;
}


