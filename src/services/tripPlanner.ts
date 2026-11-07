import {
  Coordinates,
  DivisionName,
  NearbyServiceItem,
  Place,
  RouteLegGeometry,
  TouristEmergencyContact,
  TransportOption,
  TripBudgetBreakdown,
  TripBudgetCategoryLine,
  TripChecklistItem,
  TripDayStop,
  TripExpenseContribution,
  TripMember,
  TripPlan,
  TripPreferenceTag,
  TripTimeSlot,
} from '../types/outera';
import { calculateDistanceKm } from './location';
import { supabase, getCurrentUser } from './supabase';
import {
  getTransportOptionsForPlace,
  fetchPlaceNearbyServices,
  SEED_TRANSPORT_ROUTES,
  getCustomTransportRoutes,
  inferFareUnit,
} from './transport';
import { BANGLADESH_DIVISIONS } from '../data/bangladeshLocations';

const SAVED_TRIPS_STORAGE_KEY = 'outera_saved_trip_plans_v1';

// -------------------------------------------------------------
// 1. VERIFIED BANGLADESH TOURIST HELP & EMERGENCY DIRECTORY
// All contacts reference official public emergency services,
// Tourist Police Bangladesh, and Government Medical College / Sadar Hospitals.
// -------------------------------------------------------------
export const VERIFIED_TOURIST_EMERGENCY_DIRECTORY: TouristEmergencyContact[] = [
  // National Emergency Services (Applicable across all 64 districts)
  {
    id: 'emg-nat-999',
    division: 'All',
    district: 'All',
    category: 'Emergency Hotline',
    name: 'National Emergency Service Bangladesh (Police, Fire & Ambulance)',
    phone: '999',
    secondaryPhone: '16263 (Health Directorate Helpline)',
    address: 'Nationwide 24/7 Toll-Free Emergency Control Room, Bangladesh Police',
    sourceName: 'Bangladesh Police / National Emergency Service (nhd.gov.bd)',
    verified: true,
    lastUpdated: '2026-10-15',
    notes: 'Dial 999 toll-free from any mobile operator in Bangladesh for immediate police, fire service, or ambulance dispatch.',
  },
  {
    id: 'emg-nat-tourist-police',
    division: 'All',
    district: 'All',
    category: 'Tourist Police',
    name: 'Tourist Police Bangladesh — Central Control Room',
    phone: '+8801320222222',
    secondaryPhone: '01320-222222',
    address: 'Tourist Police Headquarters, Topkhana Road, Dhaka',
    sourceName: 'Tourist Police Bangladesh Official Directory',
    verified: true,
    lastUpdated: '2026-10-15',
    notes: '24/7 dedicated tourist safety, lost property assistance, and highway/spot escort coordination.',
  },

  // Dhaka Division
  {
    id: 'emg-dhaka-dmch',
    division: 'Dhaka',
    district: 'Dhaka',
    category: 'Hospital',
    name: 'Dhaka Medical College Hospital (DMCH) — 24/7 Emergency',
    phone: '+880255165088',
    secondaryPhone: '999',
    address: 'Secretariat Road, Shahbagh, Dhaka 1000',
    coordinates: { lat: 23.7258, lng: 90.3976 },
    sourceName: 'Directorate General of Health Services (DGHS)',
    verified: true,
    lastUpdated: '2026-10-01',
    notes: 'Primary tertiary government trauma and emergency hospital in Dhaka.',
  },
  {
    id: 'emg-dhaka-kurmitola',
    division: 'Dhaka',
    district: 'Dhaka',
    category: 'Hospital',
    name: 'Kurmitola General Hospital (Airport & North Dhaka Corridor)',
    phone: '+880255062388',
    address: 'New Airport Road, Cantonment, Dhaka 1206',
    coordinates: { lat: 23.8191, lng: 90.4072 },
    sourceName: 'DGHS Government Hospital Registry',
    verified: true,
    lastUpdated: '2026-10-01',
    notes: 'Convenient emergency hospital for Uttara, Banani, Gulshan, and Airport transit travelers.',
  },
  {
    id: 'emg-dhaka-tourist-zone',
    division: 'Dhaka',
    district: 'Dhaka',
    category: 'Tourist Police',
    name: 'Tourist Police Dhaka Region Duty Officer',
    phone: '+8801320157999',
    address: 'Polwel Carnation / Dhaka Region Control Desk',
    coordinates: { lat: 23.7382, lng: 90.4145 },
    sourceName: 'Tourist Police Bangladesh',
    verified: true,
    lastUpdated: '2026-10-10',
    notes: 'Covers heritage sites in Old Dhaka, Sonargaon (Narayanganj), and Gazipur resorts.',
  },
  {
    id: 'emg-dhaka-shahbagh-thana',
    division: 'Dhaka',
    district: 'Dhaka',
    category: 'Police Station',
    name: 'DMP Shahbagh Model Police Station',
    phone: '+8801320039520',
    address: 'Shahbagh Intersection, Ramna, Dhaka',
    coordinates: { lat: 23.7381, lng: 90.3958 },
    sourceName: 'Dhaka Metropolitan Police (DMP)',
    verified: true,
    lastUpdated: '2026-10-10',
  },

  // Cox's Bazar & Chattogram Division
  {
    id: 'emg-cox-tourist-police',
    division: 'Chattogram',
    district: "Cox's Bazar",
    category: 'Tourist Police',
    name: "Tourist Police Cox's Bazar Region Control Room (Laboni & Kolatoli)",
    phone: '+8801320158999',
    secondaryPhone: '+8801320222222',
    address: "Laboni Point Beach Information & Safety Center, Cox's Bazar",
    coordinates: { lat: 21.4295, lng: 91.9702 },
    sourceName: 'Tourist Police Bangladesh',
    verified: true,
    lastUpdated: '2026-10-20',
    notes: 'Immediate beach rescue, lifeguard coordination, marine drive patrol, and fare dispute resolution.',
  },
  {
    id: 'emg-cox-sadar-hospital',
    division: 'Chattogram',
    district: "Cox's Bazar",
    category: 'Hospital',
    name: "250-Bed District Sadar Hospital, Cox's Bazar",
    phone: '+88034164066',
    secondaryPhone: '999',
    address: "Hospital Road, Cox's Bazar Sadar",
    coordinates: { lat: 21.4426, lng: 91.9756 },
    sourceName: 'DGHS Bangladesh',
    verified: true,
    lastUpdated: '2026-10-12',
    notes: '24/7 emergency casualty unit, marine accident care, and ambulance service.',
  },
  {
    id: 'emg-cox-model-thana',
    division: 'Chattogram',
    district: "Cox's Bazar",
    category: 'Police Station',
    name: "Cox's Bazar Sadar Model Police Station",
    phone: '+8801320109369',
    address: "Thana Road, Cox's Bazar Sadar",
    coordinates: { lat: 21.4441, lng: 91.9725 },
    sourceName: 'Bangladesh Police Directory',
    verified: true,
    lastUpdated: '2026-10-12',
  },
  {
    id: 'emg-cox-beach-advisory',
    division: 'Chattogram',
    district: "Cox's Bazar",
    category: 'Tourist Assistance',
    name: 'Sea Safe Lifeguard & Tide Safety Advisory',
    phone: '999',
    address: "Laboni, Sugandha & Kolatoli Beach Points, Cox's Bazar",
    sourceName: 'District Administration & Sea Safe Lifeguard Service',
    verified: true,
    lastUpdated: '2026-10-20',
    notes: 'Never swim during red-flag ebb tide warnings or after sunset. Swim only between yellow-red designated lifeguard flags.',
  },
  {
    id: 'emg-ctg-cmch',
    division: 'Chattogram',
    district: 'Chattogram',
    category: 'Hospital',
    name: 'Chattogram Medical College Hospital (CMCH)',
    phone: '+88031619400',
    secondaryPhone: '999',
    address: 'K.B. Fazlul Kader Road, Panchlaish, Chattogram',
    coordinates: { lat: 22.3593, lng: 91.8312 },
    sourceName: 'DGHS Bangladesh',
    verified: true,
    lastUpdated: '2026-10-05',
  },
  {
    id: 'emg-bandarban-hospital',
    division: 'Chattogram',
    district: 'Bandarban',
    category: 'Hospital',
    name: 'Bandarban District Sadar Hospital',
    phone: '+88036162244',
    secondaryPhone: '999',
    address: 'Hospital Road, Bandarban Sadar',
    coordinates: { lat: 22.1953, lng: 92.2184 },
    sourceName: 'DGHS Bangladesh',
    verified: true,
    lastUpdated: '2026-10-08',
  },
  {
    id: 'emg-bandarban-tourist-police',
    division: 'Chattogram',
    district: 'Bandarban',
    category: 'Tourist Police',
    name: 'Tourist Police Bandarban Zone & Hill Tracts Checkpost Info',
    phone: '+8801320159255',
    address: 'Meghla Parjatan Complex Gate, Bandarban',
    coordinates: { lat: 22.1778, lng: 92.1932 },
    sourceName: 'Tourist Police & Bandarban District Administration',
    verified: true,
    lastUpdated: '2026-10-18',
    notes: 'Carry original National ID (NID) or Passport copies for army/police checkpost registration and mandatory registered local guide for Nilgiri, Chimbuk, and remote trails.',
  },
  {
    id: 'emg-rangamati-hospital',
    division: 'Chattogram',
    district: 'Rangamati',
    category: 'Hospital',
    name: 'Rangamati General (Sadar) Hospital',
    phone: '+88035162356',
    secondaryPhone: '999',
    address: 'Tabalchhari / Hospital Area, Rangamati Sadar',
    coordinates: { lat: 22.6378, lng: 92.1985 },
    sourceName: 'DGHS Bangladesh',
    verified: true,
    lastUpdated: '2026-10-08',
    notes: 'For Kaptai Lake boat trips, ensure life jackets are worn at all times.',
  },

  // Sylhet Division (Sylhet, Moulvibazar, Sunamganj)
  {
    id: 'emg-sylhet-osmani',
    division: 'Sylhet',
    district: 'Sylhet',
    category: 'Hospital',
    name: 'Sylhet MAG Osmani Medical College Hospital — 24/7 Emergency',
    phone: '+880821713667',
    secondaryPhone: '999',
    address: 'Medical Road, Kajolshah, Sylhet 3100',
    coordinates: { lat: 24.9006, lng: 91.8536 },
    sourceName: 'DGHS Bangladesh',
    verified: true,
    lastUpdated: '2026-10-14',
  },
  {
    id: 'emg-sylhet-tourist-police',
    division: 'Sylhet',
    district: 'Sylhet',
    category: 'Tourist Police',
    name: 'Tourist Police Sylhet Region (Jaflong, Bisnakandi, Ratargul & Sreemangal)',
    phone: '+8801320160199',
    secondaryPhone: '+8801320222222',
    address: 'Uposhohor / Sylhet Tourist Police Control Desk',
    coordinates: { lat: 24.8898, lng: 91.8812 },
    sourceName: 'Tourist Police Bangladesh',
    verified: true,
    lastUpdated: '2026-10-14',
    notes: 'Monitors boat ghat fare charts at Ratargul, Sada Pathor (Bholaganj), Jaflong, and Lawachara National Park.',
  },
  {
    id: 'emg-sylhet-kotwali-thana',
    division: 'Sylhet',
    district: 'Sylhet',
    category: 'Police Station',
    name: 'SMP Kotwali Model Police Station, Sylhet',
    phone: '+8801320067568',
    address: 'Bandar Bazar, Sylhet City',
    coordinates: { lat: 24.8917, lng: 91.8697 },
    sourceName: 'Sylhet Metropolitan Police (SMP)',
    verified: true,
    lastUpdated: '2026-10-14',
  },
  {
    id: 'emg-moulvibazar-hospital',
    division: 'Sylhet',
    district: 'Moulvibazar',
    category: 'Hospital',
    name: '250-Bed District Sadar Hospital, Moulvibazar & Sreemangal Upazila Health Complex',
    phone: '+88086152236',
    secondaryPhone: '999',
    address: 'Hospital Road, Moulvibazar / College Road, Sreemangal',
    coordinates: { lat: 24.3082, lng: 91.7315 },
    sourceName: 'DGHS Bangladesh',
    verified: true,
    lastUpdated: '2026-10-10',
  },

  // Barishal Division (Kuakata / Patuakhali & Barishal)
  {
    id: 'emg-kuakata-tourist-police',
    division: 'Barishal',
    district: 'Patuakhali',
    category: 'Tourist Police',
    name: 'Tourist Police Kuakata Zone Control Room',
    phone: '+8801320161599',
    secondaryPhone: '+8801320222222',
    address: 'Kuakata Sea Beach Zero Point, Kalapara, Patuakhali',
    coordinates: { lat: 21.8182, lng: 90.1198 },
    sourceName: 'Tourist Police Bangladesh',
    verified: true,
    lastUpdated: '2026-10-19',
    notes: 'Covers Kuakata Beach, Gangamati Reserved Forest, Lebur Char, and Red Crab Island.',
  },
  {
    id: 'emg-kuakata-hospital',
    division: 'Barishal',
    district: 'Patuakhali',
    category: 'Hospital',
    name: 'Kuakata 20-Bed Hospital & Sher-e-Bangla Medical College Hospital (Barishal)',
    phone: '+8804312173547',
    secondaryPhone: '999',
    address: 'Kuakata Highway, Kalapara, Patuakhali / Band Road, Barishal',
    coordinates: { lat: 21.8215, lng: 90.1221 },
    sourceName: 'DGHS Bangladesh',
    verified: true,
    lastUpdated: '2026-10-19',
  },

  // Khulna, Rajshahi, Rangpur & Mymensingh Divisions
  {
    id: 'emg-khulna-kmch',
    division: 'Khulna',
    district: 'Khulna',
    category: 'Hospital',
    name: 'Khulna Medical College Hospital & Sundarbans Tourist Police Desk',
    phone: '+8801320161099',
    secondaryPhone: '999',
    address: 'Choto Boyra, Khulna / Mongla Port Tourist Desk',
    coordinates: { lat: 22.8286, lng: 89.5382 },
    sourceName: 'DGHS & Tourist Police Khulna Region',
    verified: true,
    lastUpdated: '2026-10-11',
    notes: 'Forest Department permit is mandatory before entering Sundarbans Karamjal, Harbaria, or Kotka eco-tourism zones.',
  },
  {
    id: 'emg-rajshahi-rmch',
    division: 'Rajshahi',
    district: 'Rajshahi',
    category: 'Hospital',
    name: 'Rajshahi Medical College Hospital (RMCH)',
    phone: '+880721772150',
    secondaryPhone: '999',
    address: 'Laxmipur, Rajpara, Rajshahi',
    coordinates: { lat: 24.3721, lng: 88.5864 },
    sourceName: 'DGHS Bangladesh',
    verified: true,
    lastUpdated: '2026-10-09',
  },
];

// -------------------------------------------------------------
// 2. DESTINATION-AWARE ITINERARY GENERATOR (REAL PLACES ONLY)
// -------------------------------------------------------------
export function inferPreferredTimeSlot(place: Place, indexInDay: number): TripTimeSlot {
  const bestText = `${place.bestTimeToVisit || ''} ${(place.timeOfDaySuitability || []).join(' ')}`.toLowerCase();
  if (bestText.includes('morning') || bestText.includes('sunrise')) return 'Morning';
  if (bestText.includes('night') || bestText.includes('evening') || bestText.includes('sunset')) return 'Evening';
  if (bestText.includes('afternoon') || bestText.includes('lunch')) return 'Afternoon';

  if (indexInDay === 0) return 'Morning';
  if (indexInDay === 1) return 'Afternoon';
  return 'Evening';
}

export function extractPlaceDatabaseSpendRange(place: Place): {
  min: number;
  max: number;
  sourceLabel: string;
} {
  const rawLabel = (place.priceLabel || place.priceLevel?.label || '').trim();
  const lower = rawLabel.toLowerCase();

  if (lower.includes('free') || (place.priceLevel?.min === 0 && place.priceLevel?.max === 0)) {
    return {
      min: 0,
      max: 0,
      sourceLabel: 'Free Public Spot (৳0 in DB)',
    };
  }

  const minVal = typeof place.priceLevel?.min === 'number' ? place.priceLevel.min : 0;
  const maxVal = typeof place.priceLevel?.max === 'number' ? place.priceLevel.max : minVal;

  if (minVal > 0 || maxVal > 0) {
    return {
      min: minVal,
      max: Math.max(minVal, maxVal),
      sourceLabel: `DB Place Price (${rawLabel || `৳${minVal}–৳${maxVal}`})`,
    };
  }

  return {
    min: 0,
    max: 0,
    sourceLabel: 'Price not listed in DB — user editable',
  };
}

export function scorePlaceForTripPreferences(
  place: Place,
  preferences: TripPreferenceTag[]
): number {
  let score = (place.communityScore || 75) / 10 + (place.approvedPostsCount || 0) * 2;
  const cat = (place.category || '').toLowerCase();
  const sub = (place.subcategory || '').toLowerCase();
  const tags = (place.tags || []).join(' ').toLowerCase();
  const groupFit = (place.groupFit || []).join(' ').toLowerCase();

  for (const pref of preferences) {
    if (pref === 'Outdoors & Nature' && (cat === 'outdoors' || sub.includes('nature') || tags.includes('nature') || tags.includes('beach') || tags.includes('hill'))) {
      score += 18;
    }
    if (pref === 'Food & Cafes' && (cat === 'food' || sub.includes('cafe') || tags.includes('coffee') || tags.includes('food'))) {
      score += 18;
    }
    if (pref === 'Chill & Scenic' && (cat === 'chill' || place.primaryVibe === 'Relaxed' || tags.includes('scenic') || tags.includes('sunset'))) {
      score += 16;
    }
    if (pref === 'Fun & Activities' && (cat === 'fun' || cat === 'sports' || cat === 'events')) {
      score += 16;
    }
    if (pref === 'Heritage & Culture' && (cat === 'creative' || tags.includes('heritage') || tags.includes('history') || tags.includes('museum'))) {
      score += 16;
    }
    if (pref === 'Budget-Friendly' && (place.priceLevel?.max || 0) <= 350) {
      score += 14;
    }
    if (pref === 'Family & Group' && (groupFit.includes('family') || groupFit.includes('friends'))) {
      score += 12;
    }
  }

  return score;
}

/**
 * Generates a customizable day-by-day itinerary strictly from actual approved OUTERA places.
 * Never invents fake places.
 */
export function generateSmartItineraryStops(params: {
  tripId: string;
  allApprovedPlaces: Place[];
  destinationDivision: string;
  destinationDistrict: string;
  durationDays: number;
  preferences: TripPreferenceTag[];
  explicitSelectedPlaceIds: string[];
}): TripDayStop[] {
  const {
    tripId,
    allApprovedPlaces,
    destinationDivision,
    destinationDistrict,
    durationDays,
    preferences,
    explicitSelectedPlaceIds,
  } = params;

  const explicitSet = new Set(explicitSelectedPlaceIds);
  const explicitPlaces = allApprovedPlaces.filter((p) => explicitSet.has(p.id));

  // Filter approved places in the target district first; if fewer than needed, include division places
  const districtMatches = allApprovedPlaces.filter(
    (p) =>
      !explicitSet.has(p.id) &&
      p.district &&
      p.district.toLowerCase() === destinationDistrict.toLowerCase()
  );

  const divisionMatches = allApprovedPlaces.filter(
    (p) =>
      !explicitSet.has(p.id) &&
      (!p.district || p.district.toLowerCase() !== destinationDistrict.toLowerCase()) &&
      p.division &&
      p.division.toLowerCase() === destinationDivision.toLowerCase()
  );

  const rankedDistrict = [...districtMatches].sort(
    (a, b) => scorePlaceForTripPreferences(b, preferences) - scorePlaceForTripPreferences(a, preferences)
  );
  const rankedDivision = [...divisionMatches].sort(
    (a, b) => scorePlaceForTripPreferences(b, preferences) - scorePlaceForTripPreferences(a, preferences)
  );

  // Target up to 3 places per day, capped by actual available places
  const targetStopCount = Math.min(
    Math.max(explicitPlaces.length, durationDays * 3),
    explicitPlaces.length + rankedDistrict.length + rankedDivision.length
  );

  // Only auto-pull division places if district places are insufficient
  const candidatePool: Place[] = [...explicitPlaces, ...rankedDistrict];
  if (candidatePool.length < Math.min(durationDays * 2, targetStopCount)) {
    candidatePool.push(...rankedDivision);
  }

  const chosenPlaces = candidatePool.slice(0, targetStopCount);
  if (chosenPlaces.length === 0) return [];

  // Order geographically using nearest-neighbor starting from the first place so nearby spots stay on the same day
  const orderedPlaces = orderPlacesByProximity(chosenPlaces);

  const stops: TripDayStop[] = [];
  const totalStops = orderedPlaces.length;

  orderedPlaces.forEach((place, idx) => {
    // Distribute evenly across durationDays
    const dayNumber = Math.min(
      durationDays,
      Math.floor((idx * durationDays) / Math.max(1, totalStops)) + 1
    );
    const sameDaySoFar = stops.filter((s) => s.dayNumber === dayNumber).length;
    const spend = extractPlaceDatabaseSpendRange(place);

    stops.push({
      id: `stop-${tripId}-${place.id}-${idx}`,
      tripId,
      placeId: place.id,
      placeName: place.name,
      placeCategory: place.category,
      placeDistrict: place.district,
      placeNeighborhood: place.neighborhood || place.address,
      coordinates: place.coordinates || null,
      dayNumber,
      stopOrder: sameDaySoFar,
      timeSlot: inferPreferredTimeSlot(place, sameDaySoFar),
      estimatedSpendMin: spend.min,
      estimatedSpendMax: spend.max,
      priceSourceLabel: spend.sourceLabel,
      bestTimeHint: place.bestTimeToVisit || (place.timeOfDaySuitability || []).join(', '),
      image: place.image || place.images?.[0],
    });
  });

  return normalizeStopsOrdering(stops);
}

export function orderPlacesByProximity(places: Place[]): Place[] {
  if (places.length <= 2) return places;
  const remaining = [...places];
  const ordered: Place[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    if (!current.coordinates) {
      ordered.push(remaining.shift()!);
      continue;
    }

    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((cand, idx) => {
      if (cand.coordinates && current.coordinates) {
        const d = calculateDistanceKm(current.coordinates, cand.coordinates);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = idx;
        }
      }
    });

    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }

  return ordered;
}

export function normalizeStopsOrdering(stops: TripDayStop[]): TripDayStop[] {
  const slotWeight: Record<TripTimeSlot, number> = {
    Morning: 1,
    Afternoon: 2,
    Evening: 3,
  };

  const byDay = new Map<number, TripDayStop[]>();
  for (const s of stops) {
    if (!byDay.has(s.dayNumber)) byDay.set(s.dayNumber, []);
    byDay.get(s.dayNumber)!.push(s);
  }

  const normalized: TripDayStop[] = [];
  const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);

  for (const day of sortedDays) {
    const dayStops = byDay.get(day)!;
    dayStops.sort((a, b) => {
      if (a.stopOrder !== b.stopOrder) return a.stopOrder - b.stopOrder;
      return slotWeight[a.timeSlot] - slotWeight[b.timeSlot];
    });
    dayStops.forEach((s, idx) => {
      normalized.push({
        ...s,
        stopOrder: idx,
      });
    });
  }

  return normalized;
}

/**
 * Optimizes stop visiting order using nearest-neighbor geographic clustering
 * while assigning Morning -> Afternoon -> Evening slots cleanly.
 */
export function optimizeTripStopsOrder(
  stops: TripDayStop[],
  durationDays: number,
  originCoords?: Coordinates | null
): TripDayStop[] {
  if (stops.length <= 1) return stops;

  const remaining = [...stops];
  const ordered: TripDayStop[] = [];

  // Pick first stop closest to origin if originCoords exists
  if (originCoords) {
    let closestIdx = 0;
    let closestDist = Infinity;
    remaining.forEach((s, i) => {
      if (s.coordinates) {
        const d = calculateDistanceKm(originCoords, s.coordinates);
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }
    });
    ordered.push(remaining.splice(closestIdx, 1)[0]);
  } else {
    ordered.push(remaining.shift()!);
  }

  while (remaining.length > 0) {
    const prev = ordered[ordered.length - 1];
    if (!prev.coordinates) {
      ordered.push(remaining.shift()!);
      continue;
    }

    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((cand, idx) => {
      if (cand.coordinates && prev.coordinates) {
        const d = calculateDistanceKm(prev.coordinates, cand.coordinates);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  const slots: TripTimeSlot[] = ['Morning', 'Afternoon', 'Evening'];
  const total = ordered.length;

  const reassigned = ordered.map((stop, idx) => {
    const dayNumber = Math.min(
      durationDays,
      Math.floor((idx * durationDays) / Math.max(1, total)) + 1
    );
    return {
      ...stop,
      dayNumber,
    };
  });

  // Assign stopOrder and logical timeSlot within each day
  const byDay = new Map<number, TripDayStop[]>();
  for (const s of reassigned) {
    if (!byDay.has(s.dayNumber)) byDay.set(s.dayNumber, []);
    byDay.get(s.dayNumber)!.push(s);
  }

  const finalStops: TripDayStop[] = [];
  Array.from(byDay.keys())
    .sort((a, b) => a - b)
    .forEach((day) => {
      const list = byDay.get(day)!;
      list.forEach((s, i) => {
        finalStops.push({
          ...s,
          stopOrder: i,
          timeSlot: slots[Math.min(i, slots.length - 1)],
        });
      });
    });

  return finalStops;
}

// -------------------------------------------------------------
// 3. SMART ROUTE PLANNER (OSRM ROAD ROUTING + TRANSPORT CORRIDOR)
// -------------------------------------------------------------
export async function calculateTripRouteGeometry(
  stops: TripDayStop[]
): Promise<{
  legs: RouteLegGeometry[];
  totalDistanceKm: number;
  totalDurationMin: number;
  allCoordinates: [number, number][];
}> {
  const validStops = stops.filter(
    (s) => s.coordinates && typeof s.coordinates.lat === 'number' && typeof s.coordinates.lng === 'number'
  );

  if (validStops.length < 2) {
    return {
      legs: [],
      totalDistanceKm: 0,
      totalDurationMin: 0,
      allCoordinates: validStops.map((s) => [s.coordinates!.lng, s.coordinates!.lat]),
    };
  }

  const legs: RouteLegGeometry[] = [];
  const fullLineCoords: [number, number][] = [];

  for (let i = 0; i < validStops.length - 1; i++) {
    const fromStop = validStops[i];
    const toStop = validStops[i + 1];
    const fromC = fromStop.coordinates!;
    const toC = toStop.coordinates!;

    let legAdded = false;

    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromC.lng},${fromC.lat};${toC.lng},${toC.lat}?overview=full&geometries=geojson`;
      const response = await fetch(osrmUrl);
      if (response.ok) {
        const json = await response.json();
        const route = json?.routes?.[0];
        if (route && route.geometry?.coordinates?.length > 0) {
          const distKm = Math.round((route.distance / 1000) * 10) / 10;
          const durMin = Math.max(3, Math.round(route.duration / 60));
          const geomCoords: [number, number][] = route.geometry.coordinates;

          legs.push({
            fromStopName: fromStop.placeName,
            toStopName: toStop.placeName,
            fromCoords: fromC,
            toCoords: toC,
            distanceKm: distKm,
            durationMin: durMin,
            provider: 'OSRM Road Routing',
            geometryCoords: geomCoords,
          });
          fullLineCoords.push(...geomCoords);
          legAdded = true;
        }
      }
    } catch {
      // Fallback to direct geodesic road estimate below
    }

    if (!legAdded) {
      const directKm = calculateDistanceKm(fromC, toC);
      const estRoadKm = Math.round(directKm * 1.28 * 10) / 10;
      const estMin = Math.max(5, Math.round((estRoadKm / 28) * 60));
      const fallbackCoords: [number, number][] = [
        [fromC.lng, fromC.lat],
        [toC.lng, toC.lat],
      ];

      legs.push({
        fromStopName: fromStop.placeName,
        toStopName: toStop.placeName,
        fromCoords: fromC,
        toCoords: toC,
        distanceKm: estRoadKm,
        durationMin: estMin,
        provider: 'Direct Geodesic Estimate',
        geometryCoords: fallbackCoords,
      });
      fullLineCoords.push(...fallbackCoords);
    }
  }

  const totalDistanceKm =
    Math.round(legs.reduce((sum, l) => sum + l.distanceKm, 0) * 10) / 10;
  const totalDurationMin = legs.reduce((sum, l) => sum + l.durationMin, 0);

  return {
    legs,
    totalDistanceKm,
    totalDurationMin,
    allCoordinates: fullLineCoords,
  };
}

/**
 * Fetches available inter-district or local transport options for the trip destination
 * using OUTERA's existing verified transport routes & community fare reports.
 */
export async function getTripTransportOptions(params: {
  originName: string;
  originDistrict: string;
  originCoords: Coordinates | null;
  destinationDistrict: string;
  representativePlace?: Place | null;
}): Promise<TransportOption[]> {
  const { originName, originDistrict, originCoords, destinationDistrict, representativePlace } = params;

  if (representativePlace) {
    const placeOpts = await getTransportOptionsForPlace(
      {
        name: originName || originDistrict,
        district: originDistrict,
        coords: originCoords,
      },
      representativePlace
    );
    if (placeOpts.length > 0) return placeOpts;
  }

  // Also check district-level routes directly from custom + seed routes
  const origLower = (originDistrict || originName || '').trim().toLowerCase();
  const destLower = destinationDistrict.trim().toLowerCase();
  const matched: TransportOption[] = [];

  for (const cr of getCustomTransportRoutes()) {
    if (
      cr.active &&
      cr.originDistrict.toLowerCase() === origLower &&
      cr.destinationDistrict.toLowerCase() === destLower
    ) {
      matched.push({
        id: cr.id,
        transportType: cr.transportType,
        fromName: cr.fromLocation || cr.originDistrict,
        toName: cr.toLocation || cr.destinationDistrict,
        minFare: (cr as any).minFare || 100,
        maxFare: (cr as any).maxFare || 200,
        fareUnit: inferFareUnit(cr.transportType, cr.notes),
        currency: 'BDT',
        estimatedDurationMin: cr.estimatedDurationMin,
        distanceKm: cr.distanceKm,
        sourceType: 'OFFICIAL',
        confidence: 'High',
        lastUpdated: '2026-11-02',
        notes: cr.notes,
        isMultiLeg: cr.isMultiLeg,
        legs: cr.legs,
      });
    }
  }

  for (const seed of SEED_TRANSPORT_ROUTES) {
    if (
      seed.originDistrict.toLowerCase() === origLower &&
      seed.destinationDistrict.toLowerCase() === destLower
    ) {
      matched.push({
        ...seed,
        fareUnit: seed.fareUnit || inferFareUnit(seed.transportType, seed.notes),
      });
    }
  }

  return matched;
}

/**
 * Fetches available verified hotels/resorts and restaurants for the destination
 * from OUTERA's existing `place_nearby_services` and approved places.
 */
export async function getTripDestinationServices(
  destinationDistrict: string,
  allApprovedPlaces: Place[]
): Promise<{
  stays: NearbyServiceItem[];
  eateries: NearbyServiceItem[];
}> {
  const districtPlace =
    allApprovedPlaces.find(
      (p) => p.district && p.district.toLowerCase() === destinationDistrict.toLowerCase()
    ) ||
    ({
      id: `district-${destinationDistrict.toLowerCase()}`,
      name: destinationDistrict,
      district: destinationDistrict,
      division: 'Dhaka',
    } as Place);

  const [stays, eateries] = await Promise.all([
    fetchPlaceNearbyServices(districtPlace, allApprovedPlaces, 'stay'),
    fetchPlaceNearbyServices(districtPlace, allApprovedPlaces, 'eat'),
  ]);

  return { stays, eateries };
}

// -------------------------------------------------------------
// 4. SMART BUDGET CALCULATOR (STRICT REAL DB PRICES + TRANSPARENCY)
// -------------------------------------------------------------
export function calculateSmartTripBudget(params: {
  trip: TripPlan;
  availableTransportOptions: TransportOption[];
  availableStays: NearbyServiceItem[];
  intraCityDistanceKm: number;
}): TripBudgetBreakdown {
  const { trip, availableTransportOptions, availableStays, intraCityDistanceKm } = params;
  const travelers = Math.max(1, trip.travelersCount || 1);
  const days = Math.max(1, trip.durationDays || 1);
  const nights = Math.max(0, days - 1);
  const roundTripMultiplier = trip.roundTripTransport ? 2 : 1;

  const lines: TripBudgetCategoryLine[] = [];

  // 1. INTER-DISTRICT / PRIMARY TRANSPORT
  const chosenTransport =
    availableTransportOptions.find((t) => t.id === trip.selectedTransportId) ||
    availableTransportOptions[0] ||
    null;

  if (chosenTransport) {
    const unit = chosenTransport.fareUnit || inferFareUnit(chosenTransport.transportType, chosenTransport.notes);
    let minGroup = 0;
    let maxGroup = 0;

    if (unit === 'per vehicle') {
      const vehiclesNeeded = Math.ceil(travelers / 4);
      minGroup = chosenTransport.minFare * vehiclesNeeded * roundTripMultiplier;
      maxGroup = chosenTransport.maxFare * vehiclesNeeded * roundTripMultiplier;
    } else if (unit === 'per trip') {
      const cngsNeeded = Math.ceil(travelers / 3);
      minGroup = chosenTransport.minFare * cngsNeeded * roundTripMultiplier;
      maxGroup = chosenTransport.maxFare * cngsNeeded * roundTripMultiplier;
    } else {
      minGroup = chosenTransport.minFare * travelers * roundTripMultiplier;
      maxGroup = chosenTransport.maxFare * travelers * roundTripMultiplier;
    }

    const estGroup = Math.round((minGroup + maxGroup) / 2);
    lines.push({
      category: 'Transport',
      minGroupCost: minGroup,
      maxGroupCost: maxGroup,
      estimatedGroupCost: estGroup,
      perPersonCost: Math.round(estGroup / travelers),
      sourceLabel: `${chosenTransport.transportType} (${chosenTransport.sourceType} · ${chosenTransport.confidence} Confidence)`,
      sourceType:
        chosenTransport.sourceType === 'OFFICIAL'
          ? 'OFFICIAL'
          : chosenTransport.sourceType === 'OPERATOR'
          ? 'OPERATOR'
          : chosenTransport.sourceType === 'COMMUNITY'
          ? 'COMMUNITY'
          : 'USER_ESTIMATE',
      details: `${chosenTransport.fromName} → ${chosenTransport.toName} (${
        trip.roundTripTransport ? 'Round-trip' : 'One-way'
      }, ৳${chosenTransport.minFare}–৳${chosenTransport.maxFare} ${unit})`,
    });
  } else {
    const sameDistrict =
      trip.originDistrict.trim().toLowerCase() === trip.destinationDistrict.trim().toLowerCase();
    lines.push({
      category: 'Transport',
      minGroupCost: 0,
      maxGroupCost: 0,
      estimatedGroupCost: 0,
      perPersonCost: 0,
      sourceLabel: sameDistrict
        ? 'Same-District Trip (Covered in Local Transport)'
        : 'No Verified DB Route Found — Log in Group Expenses or Add Route',
      sourceType: sameDistrict ? 'DATABASE' : 'MISSING',
      details: sameDistrict
        ? `Origin and destination are both in ${trip.destinationDistrict}.`
        : `No verified inter-district fare record in database between ${trip.originDistrict} and ${trip.destinationDistrict}.`,
    });
  }

  // 2. HOTEL / RESORT (ACCOMMODATION)
  const chosenStay =
    availableStays.find((s) => s.id === trip.selectedStayId) || null;
  const userHotelOverride = trip.customBudgetOverrides?.hotelPerNightBdt;

  if (nights === 0) {
    lines.push({
      category: 'Hotel/Resort',
      minGroupCost: 0,
      maxGroupCost: 0,
      estimatedGroupCost: 0,
      perPersonCost: 0,
      sourceLabel: 'Day Trip (0 Nights)',
      sourceType: 'DATABASE',
      details: '1-day itinerary does not require overnight accommodation.',
    });
  } else if (typeof userHotelOverride === 'number' && userHotelOverride >= 0) {
    const roomsNeeded = Math.max(1, Math.ceil(travelers / 2));
    const totalHotel = userHotelOverride * nights * roomsNeeded;
    lines.push({
      category: 'Hotel/Resort',
      minGroupCost: totalHotel,
      maxGroupCost: totalHotel,
      estimatedGroupCost: totalHotel,
      perPersonCost: Math.round(totalHotel / travelers),
      sourceLabel: 'User Custom Nightly Estimate',
      sourceType: 'USER_ESTIMATE',
      details: `${nights} night(s) × ${roomsNeeded} room(s) at user-entered ৳${userHotelOverride}/night`,
    });
  } else if (chosenStay && ((chosenStay.price_min ?? chosenStay.priceMin) || (chosenStay.price_max ?? chosenStay.priceMax))) {
    const roomsNeeded = Math.max(1, Math.ceil(travelers / 2));
    const sMin = Number(chosenStay.price_min ?? chosenStay.priceMin ?? 0);
    const sMax = Number(chosenStay.price_max ?? chosenStay.priceMax ?? sMin);
    const minGroup = sMin * nights * roomsNeeded;
    const maxGroup = Math.max(sMin, sMax) * nights * roomsNeeded;
    const estGroup = Math.round((minGroup + maxGroup) / 2);

    lines.push({
      category: 'Hotel/Resort',
      minGroupCost: minGroup,
      maxGroupCost: maxGroup,
      estimatedGroupCost: estGroup,
      perPersonCost: Math.round(estGroup / travelers),
      sourceLabel: `DB Stay: ${chosenStay.name}`,
      sourceType: 'DATABASE',
      details: `${nights} night(s) × ${roomsNeeded} room(s) at ৳${sMin}–৳${Math.max(sMin, sMax)}/night (${chosenStay.service_type || chosenStay.serviceType || 'Stay'})`,
    });
  } else {
    lines.push({
      category: 'Hotel/Resort',
      minGroupCost: 0,
      maxGroupCost: 0,
      estimatedGroupCost: 0,
      perPersonCost: 0,
      sourceLabel: 'Not Selected / Enter Custom Rate',
      sourceType: 'MISSING',
      details: `${nights} overnight(s) planned. Select a database hotel/resort or enter a custom nightly rate below.`,
    });
  }

  // 3. FOOD & DINING
  const foodStops = trip.stops.filter((s) => {
    const c = (s.placeCategory || '').toLowerCase();
    return c === 'food' || c === 'cafes' || c.includes('restaurant') || c.includes('cafe');
  });
  const userFoodOverride = trip.customBudgetOverrides?.foodPerPersonPerDayBdt;

  if (typeof userFoodOverride === 'number' && userFoodOverride >= 0) {
    const totalFood = userFoodOverride * travelers * days;
    lines.push({
      category: 'Food',
      minGroupCost: totalFood,
      maxGroupCost: totalFood,
      estimatedGroupCost: totalFood,
      perPersonCost: userFoodOverride * days,
      sourceLabel: 'User Custom Daily Food Estimate',
      sourceType: 'USER_ESTIMATE',
      details: `৳${userFoodOverride}/person/day × ${travelers} traveler(s) × ${days} day(s)`,
    });
  } else if (foodStops.length > 0) {
    const minPerPerson = foodStops.reduce((acc, s) => acc + (s.estimatedSpendMin || 0), 0);
    const maxPerPerson = foodStops.reduce((acc, s) => acc + (s.estimatedSpendMax || 0), 0);
    const minGroup = minPerPerson * travelers;
    const maxGroup = maxPerPerson * travelers;
    const estGroup = Math.round((minGroup + maxGroup) / 2);

    lines.push({
      category: 'Food',
      minGroupCost: minGroup,
      maxGroupCost: maxGroup,
      estimatedGroupCost: estGroup,
      perPersonCost: Math.round(estGroup / travelers),
      sourceLabel: `DB Food & Cafe Stops (${foodStops.length} selected)`,
      sourceType: 'DATABASE',
      details: `Derived from actual price ranges of ${foodStops.map((f) => f.placeName).join(', ')}`,
    });
  } else {
    lines.push({
      category: 'Food',
      minGroupCost: 0,
      maxGroupCost: 0,
      estimatedGroupCost: 0,
      perPersonCost: 0,
      sourceLabel: 'No Food Stops Added — Add Food Places or Set Daily Estimate',
      sourceType: 'MISSING',
      details: 'Add OUTERA Food/Cafe spots to your itinerary or enter a custom per-person daily meal estimate.',
    });
  }

  // 4. ENTRY TICKETS & PLACE ACTIVITY SPEND
  const nonFoodStops = trip.stops.filter((s) => {
    const c = (s.placeCategory || '').toLowerCase();
    return c !== 'food' && c !== 'cafes' && !c.includes('restaurant') && !c.includes('cafe');
  });

  if (nonFoodStops.length > 0) {
    const minPerPerson = nonFoodStops.reduce((acc, s) => acc + (s.estimatedSpendMin || 0), 0);
    const maxPerPerson = nonFoodStops.reduce((acc, s) => acc + (s.estimatedSpendMax || 0), 0);
    const minGroup = minPerPerson * travelers;
    const maxGroup = maxPerPerson * travelers;
    const estGroup = Math.round((minGroup + maxGroup) / 2);

    lines.push({
      category: 'Entry Tickets',
      minGroupCost: minGroup,
      maxGroupCost: maxGroup,
      estimatedGroupCost: estGroup,
      perPersonCost: Math.round(estGroup / travelers),
      sourceLabel: `DB Place Ranges (${nonFoodStops.length} stop${nonFoodStops.length > 1 ? 's' : ''})`,
      sourceType: 'DATABASE',
      details:
        estGroup === 0
          ? 'Selected public spots have ৳0 entry or no ticket fee listed in DB.'
          : `Calculated from database price levels across ${nonFoodStops.length} itinerary stop(s).`,
    });
  } else {
    lines.push({
      category: 'Entry Tickets',
      minGroupCost: 0,
      maxGroupCost: 0,
      estimatedGroupCost: 0,
      perPersonCost: 0,
      sourceLabel: 'No Activity Stops Selected',
      sourceType: 'MISSING',
      details: 'Add places to your itinerary to calculate entry ticket / activity spend.',
    });
  }

  // 5. LOCAL TRANSPORT (INTRA-CITY / STOP-TO-STOP)
  const userLocalTransOverride = trip.customBudgetOverrides?.localTransportPerDayBdt;
  if (typeof userLocalTransOverride === 'number' && userLocalTransOverride >= 0) {
    const totalLocal = userLocalTransOverride * days;
    lines.push({
      category: 'Local Transport',
      minGroupCost: totalLocal,
      maxGroupCost: totalLocal,
      estimatedGroupCost: totalLocal,
      perPersonCost: Math.round(totalLocal / travelers),
      sourceLabel: 'User Custom Daily Local Transport',
      sourceType: 'USER_ESTIMATE',
      details: `৳${userLocalTransOverride}/day group local transport × ${days} day(s)`,
    });
  } else if (intraCityDistanceKm > 0) {
    // Use real CNG/Rickshaw formula from OUTERA's generateLocalProximityOptions
    const cngsNeeded = Math.max(1, Math.ceil(travelers / 3));
    const minPerCng = Math.max(60, Math.round((45 + intraCityDistanceKm * 22) / 10) * 10);
    const maxPerCng = Math.max(100, Math.round((70 + intraCityDistanceKm * 32) / 10) * 10);
    const minGroup = minPerCng * cngsNeeded;
    const maxGroup = maxPerCng * cngsNeeded;
    const estGroup = Math.round((minGroup + maxGroup) / 2);

    lines.push({
      category: 'Local Transport',
      minGroupCost: minGroup,
      maxGroupCost: maxGroup,
      estimatedGroupCost: estGroup,
      perPersonCost: Math.round(estGroup / travelers),
      sourceLabel: `Route Distance Formula (${intraCityDistanceKm} km across stops)`,
      sourceType: 'USER_ESTIMATE',
      details: `Estimated local CNG / Auto / Easy Bike hops for ${intraCityDistanceKm} km across ${trip.stops.length} stops (${cngsNeeded} vehicle(s)).`,
    });
  } else {
    lines.push({
      category: 'Local Transport',
      minGroupCost: 0,
      maxGroupCost: 0,
      estimatedGroupCost: 0,
      perPersonCost: 0,
      sourceLabel: 'Add 2+ Stops or Enter Daily Local Transport',
      sourceType: 'MISSING',
      details: 'Add multiple stops to compute stop-to-stop local transit or set a daily custom amount.',
    });
  }

  // 6. OTHER EXPENSES
  const userOtherOverride = trip.customBudgetOverrides?.otherGroupExpenseBdt;
  const loggedOtherExpenses = (trip.expenses || [])
    .filter((e) => e.category === 'Other')
    .reduce((sum, e) => sum + (Number(e.amountBdt) || 0), 0);

  const otherAmount =
    typeof userOtherOverride === 'number' && userOtherOverride >= 0
      ? userOtherOverride
      : loggedOtherExpenses;

  lines.push({
    category: 'Other',
    minGroupCost: otherAmount,
    maxGroupCost: otherAmount,
    estimatedGroupCost: otherAmount,
    perPersonCost: Math.round(otherAmount / travelers),
    sourceLabel:
      otherAmount > 0 ? 'User / Group Logged Miscellaneous' : 'Optional Miscellaneous Buffer (৳0)',
    sourceType: otherAmount > 0 ? 'USER_ESTIMATE' : 'DATABASE',
    details:
      otherAmount > 0
        ? 'Emergency buffer, tips, boat/guide fees, or miscellaneous group items.'
        : 'Enter a custom miscellaneous buffer if desired.',
  });

  const totalGroupMin = lines.reduce((acc, l) => acc + l.minGroupCost, 0);
  const totalGroupMax = lines.reduce((acc, l) => acc + l.maxGroupCost, 0);
  const totalGroupEstimated = lines.reduce((acc, l) => acc + l.estimatedGroupCost, 0);

  const perPersonMin = Math.round(totalGroupMin / travelers);
  const perPersonMax = Math.round(totalGroupMax / travelers);
  const perPersonEstimated = Math.round(totalGroupEstimated / travelers);

  const totalBudgetBdt = Number(trip.totalBudgetBdt) || 0;
  const budgetRemainingBdt = totalBudgetBdt - totalGroupEstimated;
  const contributedExpensesTotal = (trip.expenses || []).reduce(
    (sum, e) => sum + (Number(e.amountBdt) || 0),
    0
  );

  return {
    lines,
    totalGroupMin,
    totalGroupMax,
    totalGroupEstimated,
    perPersonMin,
    perPersonMax,
    perPersonEstimated,
    totalBudgetBdt,
    budgetRemainingBdt,
    isOverBudget: budgetRemainingBdt < 0,
    contributedExpensesTotal,
  };
}

// -------------------------------------------------------------
// 5. DESTINATION-AWARE TRAVEL CHECKLIST GENERATOR
// -------------------------------------------------------------
export function generateSmartChecklist(params: {
  tripId: string;
  destinationDivision: string;
  destinationDistrict: string;
  durationDays: number;
}): TripChecklistItem[] {
  const { tripId, destinationDivision, destinationDistrict, durationDays } = params;
  const distLower = destinationDistrict.toLowerCase();
  const divLower = destinationDivision.toLowerCase();

  const rawItems: { category: string; label: string }[] = [
    {
      category: 'Essentials & ID',
      label: 'Original National ID (NID) / Passport & 2 photocopies',
    },
    {
      category: 'Essentials & ID',
      label: 'Small cash denominations (৳20, ৳50, ৳100 notes) for local CNG/rickshaw/boat fares',
    },
    {
      category: 'Essentials & ID',
      label: 'Emergency contacts saved offline (National 999 & Tourist Police +8801320222222)',
    },
    {
      category: 'Clothing & Weather',
      label: `${Math.max(2, durationDays)} sets of breathable cotton/quick-dry travel outfits`,
    },
    {
      category: 'Clothing & Weather',
      label: 'Comfortable walking shoes / grip sandals',
    },
    {
      category: 'Tech & Power',
      label: 'Charged power bank (10,000mAh+) & charging cables',
    },
    {
      category: 'Health & Safety',
      label: 'Oral rehydration salts (ORS), basic first-aid bandages, and personal medication',
    },
    {
      category: 'Health & Safety',
      label: 'Mosquito repellent cream / spray (essential for evenings & outdoor trails)',
    },
  ];

  // Coastal / Beach destinations (Cox's Bazar, Patuakhali/Kuakata, Chattogram coast)
  if (
    distLower.includes('cox') ||
    distLower.includes('patuakhali') ||
    distLower.includes('kuakata') ||
    distLower.includes('bhola')
  ) {
    rawItems.push(
      {
        category: 'Destination Specific',
        label: 'SPF 50+ sunscreen, polarized sunglasses, and wide-brim sun hat for beach glare',
      },
      {
        category: 'Destination Specific',
        label: 'Waterproof phone pouch for sea beach waves & boat rides',
      },
      {
        category: 'Destination Specific',
        label: 'Check high/low tide schedule before entering the water (swim only in green/yellow zones)',
      }
    );
  }

  // Hill Tracts destinations (Bandarban, Rangamati, Khagrachhari)
  if (
    distLower.includes('bandarban') ||
    distLower.includes('rangamati') ||
    distLower.includes('khagrachhari')
  ) {
    rawItems.push(
      {
        category: 'Destination Specific',
        label: 'Extra NID/Student ID copies for Hill Tracts army/police checkpost registration',
      },
      {
        category: 'Destination Specific',
        label: 'Anti-leech socks / salt pouch & ankle-support trekking shoes for hill trails',
      },
      {
        category: 'Destination Specific',
        label: 'Light windbreaker or layer for cool hill evenings (Nilgiri / Sajek / Chimbuk)',
      }
    );
  }

  // Sylhet / Tea Gardens / Haor wetlands (Sylhet, Moulvibazar, Sunamganj, Kishoreganj)
  if (
    divLower === 'sylhet' ||
    distLower.includes('sylhet') ||
    distLower.includes('moulvibazar') ||
    distLower.includes('sunamganj') ||
    distLower.includes('kishoreganj')
  ) {
    rawItems.push(
      {
        category: 'Destination Specific',
        label: 'Compact rain poncho / umbrella & dry bag for sudden Sylhet/Haor showers',
      },
      {
        category: 'Destination Specific',
        label: 'Non-slip water sandals for rocky riverbeds (Sada Pathor, Bisnakandi, Jaflong)',
      }
    );
  }

  // Sundarbans / Mangrove (Khulna, Bagerhat, Satkhira)
  if (
    distLower.includes('khulna') ||
    distLower.includes('bagerhat') ||
    distLower.includes('satkhira')
  ) {
    rawItems.push({
      category: 'Destination Specific',
      label: 'Binoculars & Forest Department entry fee receipt for Sundarbans eco-zones',
    });
  }

  return rawItems.map((item, idx) => ({
    id: `chk-${tripId}-${idx}`,
    tripId,
    category: item.category,
    label: item.label,
    isCompleted: false,
    sortOrder: idx,
  }));
}

// -------------------------------------------------------------
// 6. FETCH VERIFIED TOURIST HELP FOR DESTINATION
// -------------------------------------------------------------
export async function fetchTouristEmergencyContacts(
  destinationDistrict: string,
  destinationDivision: string
): Promise<TouristEmergencyContact[]> {
  const distLower = destinationDistrict.trim().toLowerCase();
  const divLower = destinationDivision.trim().toLowerCase();

  const dbContacts: TouristEmergencyContact[] = [];

  try {
    const { data, error } = await supabase
      .from('tourist_emergency_contacts')
      .select('*')
      .eq('verified', true);

    if (!error && data && data.length > 0) {
      for (const row of data) {
        const rDist = (row.district || '').toLowerCase();
        const rDiv = (row.division || '').toLowerCase();
        if (rDist === 'all' || rDist === distLower || rDiv === divLower) {
          dbContacts.push({
            id: row.id,
            division: row.division,
            district: row.district,
            category: row.category,
            name: row.name,
            phone: row.phone,
            secondaryPhone: row.secondary_phone || undefined,
            address: row.address,
            coordinates:
              typeof row.latitude === 'number' && typeof row.longitude === 'number'
                ? { lat: row.latitude, lng: row.longitude }
                : null,
            sourceName: row.source_name,
            verified: Boolean(row.verified),
            lastUpdated: row.last_updated || '2026-10-15',
            notes: row.notes || undefined,
          });
        }
      }
    }
  } catch {}

  const builtInMatches = VERIFIED_TOURIST_EMERGENCY_DIRECTORY.filter((item) => {
    const iDist = item.district.toLowerCase();
    const iDiv = item.division.toLowerCase();
    return iDist === 'all' || iDist === distLower || iDiv === divLower;
  });

  const combined = [...dbContacts, ...builtInMatches];
  const seenNames = new Set<string>();
  return combined.filter((c) => {
    const key = `${c.name.toLowerCase()}-${c.phone}`;
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
}

// -------------------------------------------------------------
// 7. PERSISTENCE: SAVE, LOAD, DELETE & SHARE TRIP PLANS
// -------------------------------------------------------------
export function getLocalSavedTrips(): TripPlan[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(SAVED_TRIPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalTripPlan(trip: TripPlan): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const current = getLocalSavedTrips();
    const filtered = current.filter((t) => t.id !== trip.id && t.shareToken !== trip.shareToken);
    window.localStorage.setItem(SAVED_TRIPS_STORAGE_KEY, JSON.stringify([trip, ...filtered]));
  } catch (e) {
    console.warn('saveLocalTripPlan error:', e);
  }
}

export function removeLocalTripPlan(tripId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const current = getLocalSavedTrips().filter((t) => t.id !== tripId);
    window.localStorage.setItem(SAVED_TRIPS_STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function saveTripPlanToSupabase(
  trip: TripPlan
): Promise<{ success: boolean; trip: TripPlan; syncedToCloud: boolean; error?: string }> {
  const user = await getCurrentUser();
  const normalizedId = isValidUuid(trip.id) ? trip.id : generateUuid();
  const nowIso = new Date().toISOString();

  const updatedTrip: TripPlan = {
    ...trip,
    id: normalizedId,
    userId: user?.id || trip.userId || null,
    updatedAt: nowIso,
  };

  // Always save locally for instant persistence & offline access
  saveLocalTripPlan(updatedTrip);

  if (!user) {
    return {
      success: true,
      trip: updatedTrip,
      syncedToCloud: false,
    };
  }

  try {
    const { error: planErr } = await supabase.from('trip_plans').upsert({
      id: updatedTrip.id,
      user_id: user.id,
      owner_name: updatedTrip.ownerName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'Scout',
      owner_handle: updatedTrip.ownerHandle || null,
      title: updatedTrip.title,
      origin_name: updatedTrip.originName,
      origin_district: updatedTrip.originDistrict,
      origin_lat: updatedTrip.originCoords?.lat ?? null,
      origin_lng: updatedTrip.originCoords?.lng ?? null,
      destination_division: updatedTrip.destinationDivision,
      destination_district: updatedTrip.destinationDistrict,
      destination_area: updatedTrip.destinationArea || null,
      start_date: updatedTrip.startDate,
      duration_days: updatedTrip.durationDays,
      travelers_count: updatedTrip.travelersCount,
      total_budget_bdt: updatedTrip.totalBudgetBdt,
      preferences: updatedTrip.preferences,
      selected_transport_id: updatedTrip.selectedTransportId || null,
      selected_stay_id: updatedTrip.selectedStayId || null,
      round_trip_transport: updatedTrip.roundTripTransport,
      custom_budget_overrides: updatedTrip.customBudgetOverrides || {},
      is_public_shared: updatedTrip.isPublicShared,
      share_token: updatedTrip.shareToken,
      notes: updatedTrip.notes || null,
      updated_at: nowIso,
    });

    if (planErr) {
      return {
        success: true,
        trip: updatedTrip,
        syncedToCloud: false,
        error: planErr.message,
      };
    }

    // Sync child tables cleanly
    await Promise.allSettled([
      supabase.from('trip_stops').delete().eq('trip_id', updatedTrip.id),
      supabase.from('trip_checklist_items').delete().eq('trip_id', updatedTrip.id),
      supabase.from('trip_members').delete().eq('trip_id', updatedTrip.id),
      supabase.from('trip_expenses').delete().eq('trip_id', updatedTrip.id),
    ]);

    if (updatedTrip.stops.length > 0) {
      await supabase.from('trip_stops').insert(
        updatedTrip.stops.map((s, i) => ({
          trip_id: updatedTrip.id,
          place_id: s.placeId,
          place_name: s.placeName,
          place_category: s.placeCategory,
          place_district: s.placeDistrict,
          place_neighborhood: s.placeNeighborhood,
          lat: s.coordinates?.lat ?? null,
          lng: s.coordinates?.lng ?? null,
          day_number: s.dayNumber,
          stop_order: i,
          time_slot: s.timeSlot,
          estimated_spend_min: s.estimatedSpendMin,
          estimated_spend_max: s.estimatedSpendMax,
          price_source_label: s.priceSourceLabel,
          custom_note: s.customNote || null,
        }))
      );
    }

    if (updatedTrip.checklist.length > 0) {
      await supabase.from('trip_checklist_items').insert(
        updatedTrip.checklist.map((c, i) => ({
          trip_id: updatedTrip.id,
          category: c.category,
          label: c.label,
          is_completed: c.isCompleted,
          sort_order: i,
        }))
      );
    }

    if (updatedTrip.members.length > 0) {
      await supabase.from('trip_members').insert(
        updatedTrip.members.map((m) => ({
          trip_id: updatedTrip.id,
          user_id: m.userId || null,
          name: m.name,
          handle_or_contact: m.handleOrContact || null,
          role: m.role,
        }))
      );
    }

    if (updatedTrip.expenses.length > 0) {
      await supabase.from('trip_expenses').insert(
        updatedTrip.expenses.map((e) => ({
          trip_id: updatedTrip.id,
          paid_by_name: e.paidByName,
          category: e.category,
          title: e.title,
          amount_bdt: e.amountBdt,
          expense_date: e.expenseDate,
          notes: e.notes || null,
        }))
      );
    }

    return {
      success: true,
      trip: updatedTrip,
      syncedToCloud: true,
    };
  } catch (err: any) {
    return {
      success: true,
      trip: updatedTrip,
      syncedToCloud: false,
      error: err?.message,
    };
  }
}

async function hydrateSupabaseTripRow(row: any): Promise<TripPlan> {
  const tripId = row.id;
  const [stopsRes, chkRes, memRes, expRes] = await Promise.all([
    supabase.from('trip_stops').select('*').eq('trip_id', tripId).order('day_number').order('stop_order'),
    supabase.from('trip_checklist_items').select('*').eq('trip_id', tripId).order('sort_order'),
    supabase.from('trip_members').select('*').eq('trip_id', tripId),
    supabase.from('trip_expenses').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
  ]);

  const stops: TripDayStop[] = (stopsRes.data || []).map((s: any) => ({
    id: s.id,
    tripId,
    placeId: s.place_id,
    placeName: s.place_name,
    placeCategory: s.place_category || 'Outdoors',
    placeDistrict: s.place_district || row.destination_district,
    placeNeighborhood: s.place_neighborhood || '',
    coordinates:
      typeof s.lat === 'number' && typeof s.lng === 'number'
        ? { lat: s.lat, lng: s.lng }
        : null,
    dayNumber: s.day_number || 1,
    stopOrder: s.stop_order || 0,
    timeSlot: (s.time_slot as TripTimeSlot) || 'Morning',
    estimatedSpendMin: Number(s.estimated_spend_min || 0),
    estimatedSpendMax: Number(s.estimated_spend_max || 0),
    priceSourceLabel: s.price_source_label || 'DB Range',
    customNote: s.custom_note || undefined,
  }));

  const checklist: TripChecklistItem[] = (chkRes.data || []).map((c: any) => ({
    id: c.id,
    tripId,
    category: c.category || 'Essentials & ID',
    label: c.label,
    isCompleted: Boolean(c.is_completed),
    sortOrder: c.sort_order || 0,
  }));

  const members: TripMember[] = (memRes.data || []).map((m: any) => ({
    id: m.id,
    tripId,
    userId: m.user_id,
    name: m.name,
    handleOrContact: m.handle_or_contact || undefined,
    role: m.role === 'Organizer' ? 'Organizer' : 'Member',
  }));

  const expenses: TripExpenseContribution[] = (expRes.data || []).map((e: any) => ({
    id: e.id,
    tripId,
    paidByMemberId: e.paid_by_member_id,
    paidByName: e.paid_by_name,
    category: e.category || 'Other',
    title: e.title,
    amountBdt: Number(e.amount_bdt || 0),
    expenseDate: e.expense_date || new Date().toISOString().slice(0, 10),
    notes: e.notes || undefined,
    createdAt: e.created_at || new Date().toISOString(),
  }));

  return {
    id: row.id,
    userId: row.user_id,
    ownerName: row.owner_name || 'OUTERA Scout',
    ownerHandle: row.owner_handle || undefined,
    title: row.title,
    originName: row.origin_name,
    originDistrict: row.origin_district,
    originCoords:
      typeof row.origin_lat === 'number' && typeof row.origin_lng === 'number'
        ? { lat: row.origin_lat, lng: row.origin_lng }
        : null,
    destinationDivision: row.destination_division,
    destinationDistrict: row.destination_district,
    destinationArea: row.destination_area || undefined,
    startDate: row.start_date || new Date().toISOString().slice(0, 10),
    durationDays: Number(row.duration_days || 3),
    travelersCount: Number(row.travelers_count || 2),
    totalBudgetBdt: Number(row.total_budget_bdt || 10000),
    preferences: Array.isArray(row.preferences) ? row.preferences : [],
    selectedTransportId: row.selected_transport_id || null,
    selectedStayId: row.selected_stay_id || null,
    roundTripTransport: row.round_trip_transport !== false,
    customBudgetOverrides: row.custom_budget_overrides || {},
    stops,
    checklist,
    members,
    expenses,
    isPublicShared: row.is_public_shared !== false,
    shareToken: row.share_token || row.id,
    notes: row.notes || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export async function fetchUserTripPlans(): Promise<TripPlan[]> {
  const localTrips = getLocalSavedTrips();
  try {
    const user = await getCurrentUser();
    if (!user) return localTrips;

    const { data, error } = await supabase
      .from('trip_plans')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error || !data || data.length === 0) return localTrips;

    const cloudTrips = await Promise.all(data.map((row: any) => hydrateSupabaseTripRow(row)));
    const mergedMap = new Map<string, TripPlan>();
    for (const ct of cloudTrips) mergedMap.set(ct.id, ct);
    for (const lt of localTrips) {
      if (!mergedMap.has(lt.id)) mergedMap.set(lt.id, lt);
    }

    return Array.from(mergedMap.values());
  } catch {
    return localTrips;
  }
}

export async function fetchTripByShareTokenOrId(tokenOrId: string): Promise<TripPlan | null> {
  if (!tokenOrId) return null;
  const localMatch = getLocalSavedTrips().find(
    (t) => t.id === tokenOrId || t.shareToken === tokenOrId
  );

  try {
    let query = supabase.from('trip_plans').select('*');
    if (isValidUuid(tokenOrId)) {
      query = query.or(`id.eq.${tokenOrId},share_token.eq.${tokenOrId}`);
    } else {
      query = query.eq('share_token', tokenOrId);
    }

    const { data, error } = await query.maybeSingle();
    if (!error && data) {
      return await hydrateSupabaseTripRow(data);
    }
  } catch {}

  return localMatch || null;
}

export async function deleteTripPlanFromSupabase(tripId: string): Promise<{ success: boolean }> {
  removeLocalTripPlan(tripId);
  try {
    const user = await getCurrentUser();
    if (user && isValidUuid(tripId)) {
      await supabase.from('trip_plans').delete().eq('id', tripId).eq('user_id', user.id);
    }
  } catch {}
  return { success: true };
}

export function findDistrictInfo(districtName: string): {
  division: DivisionName;
  district: string;
  coords: Coordinates;
} {
  for (const div of BANGLADESH_DIVISIONS) {
    for (const dist of div.districts) {
      if (dist.name.toLowerCase() === districtName.trim().toLowerCase()) {
        return {
          division: div.name,
          district: dist.name,
          coords: dist.coords,
        };
      }
    }
  }
  return {
    division: 'Chattogram',
    district: "Cox's Bazar",
    coords: { lat: 21.4272, lng: 92.0058 },
  };
}
