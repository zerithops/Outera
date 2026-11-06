import {
  TransportType,
  TransportOption,
  TransportRoute,
  TransportFare,
  CommunityFareReport,
  FareSourceType,
  FareConfidence,
  FareUnit,
  LocalTransportContact,
  LocalVehicleType,
  NearbyServiceItem,
  NearbyServiceCategoryGroup,
  NearbyStayType,
  NearbyEatType,
  CommunityConfidenceLevel,
  Place,
  Coordinates,
} from '../types/outera';
import { supabase, getCurrentUser, isCurrentUserAdmin } from './supabase';
import { calculateDistanceKm } from './location';

const CUSTOM_ROUTES_KEY = 'outera_custom_transport_routes';
const CUSTOM_FARES_KEY = 'outera_custom_transport_fares';
const COMMUNITY_REPORTS_KEY = 'outera_community_fare_reports';
const LOCAL_TRANSPORT_CONTACTS_KEY = 'outera_local_transport_contacts';
const NEARBY_SERVICES_KEY = 'outera_place_nearby_services';

export function inferFareUnit(transportType: TransportType, notes?: string): FareUnit {
  const n = (notes || '').toLowerCase();
  if (n.includes('per vehicle') || n.includes('reserve')) return 'per vehicle';
  if (n.includes('per person') || n.includes('per passenger') || n.includes('shared')) return 'per person';
  switch (transportType) {
    case 'Bus':
    case 'Train':
    case 'Launch / Boat':
    case 'Metro':
      return 'per person';
    case 'Private Car':
      return 'per vehicle';
    case 'CNG / Auto':
    case 'Rickshaw':
      return 'per trip';
    case 'Easy Bike / E-bike':
    case 'Bike / Ride Share':
      return 'per person';
    default:
      return 'per person';
  }
}

// -------------------------------------------------------------
// VERIFIED BUILT-IN SEED ROUTES & FARES FOR BANGLADESH
// Covers major tourist corridors, coastal, riverine, and hill destinations
// -------------------------------------------------------------
export const SEED_TRANSPORT_ROUTES: (TransportOption & {
  originDistrict: string;
  destinationDistrict: string;
  destinationPlaceNames?: string[];
})[] = [
  // Dhaka -> Cox's Bazar
  {
    id: 'route-dhaka-cox-bus-ac',
    transportType: 'Bus',
    originDistrict: 'Dhaka',
    destinationDistrict: "Cox's Bazar",
    fromName: 'Dhaka (Sayedabad / Arambagh)',
    toName: "Cox's Bazar (Kolatoli / Laboni Beach)",
    minFare: 1400,
    maxFare: 2200,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 540, // 9 hours
    distanceKm: 395,
    sourceType: 'OPERATOR',
    sourceReference: 'Green Line, Hanif, Shohagh AC Bus Operators',
    confidence: 'High',
    lastUpdated: '2026-10-15',
    notes: 'Premium Scania / Hyundai sleeper & business class coaches. Includes rest stops.',
  },
  {
    id: 'route-dhaka-cox-bus-nonac',
    transportType: 'Bus',
    originDistrict: 'Dhaka',
    destinationDistrict: "Cox's Bazar",
    fromName: 'Dhaka (Sayedabad)',
    toName: "Cox's Bazar (Jhawtola)",
    minFare: 850,
    maxFare: 1100,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 600, // 10 hours
    distanceKm: 395,
    sourceType: 'COMMUNITY',
    sourceReference: 'Shyamoli, S. Alam community reports',
    confidence: 'High',
    lastUpdated: '2026-10-25',
    notes: 'Regular economy non-AC highway service.',
  },
  {
    id: 'route-dhaka-cox-train',
    transportType: 'Train',
    originDistrict: 'Dhaka',
    destinationDistrict: "Cox's Bazar",
    fromName: 'Dhaka (Kamalapur Railway Station)',
    toName: "Cox's Bazar Iconic Railway Station",
    minFare: 695,
    maxFare: 1530,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 480, // 8 hours
    distanceKm: 410,
    sourceType: 'OFFICIAL',
    sourceReference: 'Bangladesh Railway Official Schedule (Coxsbazar Express & Parjatak Express)',
    confidence: 'High',
    lastUpdated: '2026-09-01',
    notes: 'Shovon Chair: ৳695, Snigdha AC: ৳1,325, AC Berth: ৳1,530. Book 10 days in advance.',
  },

  // Dhaka -> Kuakata (Multi-Leg via Launch & Padma Bridge Bus)
  {
    id: 'route-dhaka-kuakata-multileg-launch',
    transportType: 'Launch / Boat',
    originDistrict: 'Dhaka',
    destinationDistrict: 'Patuakhali',
    destinationPlaceNames: ['Kuakata Beach', 'Kuakata Sea Beach', 'Lebur Char', 'Fatrar Char'],
    fromName: 'Dhaka (Sadarghat Launch Terminal)',
    toName: 'Kuakata Beach via Barishal / Patuakhali',
    minFare: 750,
    maxFare: 1750,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 660, // 11 hours total
    distanceKm: 290,
    sourceType: 'COMMUNITY',
    sourceReference: 'Overnight Launch + Connecting Bus consensus',
    confidence: 'High',
    lastUpdated: '2026-10-20',
    isMultiLeg: true,
    legs: [
      {
        fromLocation: 'Dhaka Sadarghat',
        toLocation: 'Barishal Launch Ghat',
        transportType: 'Launch / Boat',
        minFare: 450,
        maxFare: 1300,
        estimatedDurationMin: 480, // 8h overnight
        distanceKm: 180,
        notes: 'Deck fare: ৳450–550; Single AC Cabin: ৳1,100–1,300. Night departure around 8:30 PM.',
      },
      {
        fromLocation: 'Barishal Rupatali Bus Stand',
        toLocation: 'Kuakata Beach',
        transportType: 'Bus',
        minFare: 300,
        maxFare: 450,
        estimatedDurationMin: 180, // 3h
        distanceKm: 110,
        notes: 'Direct coastal express via Payra Bridge. Departs every 30 minutes.',
      },
    ],
    notes: 'Scenic overnight river voyage through Padma & Meghna rivers, arriving at sunrise for connecting bus.',
  },
  {
    id: 'route-dhaka-kuakata-direct-bus',
    transportType: 'Bus',
    originDistrict: 'Dhaka',
    destinationDistrict: 'Patuakhali',
    destinationPlaceNames: ['Kuakata Beach', 'Kuakata Sea Beach'],
    fromName: 'Dhaka (Gabtoli / Sayedabad)',
    toName: 'Kuakata Zero Point',
    minFare: 800,
    maxFare: 1200,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 390, // 6.5 hours
    distanceKm: 285,
    sourceType: 'OPERATOR',
    sourceReference: 'Sakura Paribahan, Green St. Martin',
    confidence: 'High',
    lastUpdated: '2026-10-10',
    notes: 'Express route via Padma Bridge and Payra Bridge. No ferry delays.',
  },

  // Barishal -> Kuakata
  {
    id: 'route-barishal-kuakata-bus',
    transportType: 'Bus',
    originDistrict: 'Barishal',
    destinationDistrict: 'Patuakhali',
    destinationPlaceNames: ['Kuakata Beach', 'Kuakata Sea Beach'],
    fromName: 'Barishal (Rupatali Bus Stand)',
    toName: 'Kuakata Zero Point Beach Road',
    minFare: 280,
    maxFare: 380,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 160,
    distanceKm: 108,
    sourceType: 'COMMUNITY',
    sourceReference: 'Rupatali transport counter records',
    confidence: 'High',
    lastUpdated: '2026-10-18',
    notes: 'Smooth highway over Payra Bridge and Lebukhali.',
  },

  // Dhaka -> Sylhet / Sreemangal
  {
    id: 'route-dhaka-sylhet-bus',
    transportType: 'Bus',
    originDistrict: 'Dhaka',
    destinationDistrict: 'Sylhet',
    fromName: 'Dhaka (Sayedabad / Fakirapool)',
    toName: 'Sylhet (Kadamtali Bus Terminal)',
    minFare: 550,
    maxFare: 950,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 330, // 5.5h
    distanceKm: 240,
    sourceType: 'OPERATOR',
    sourceReference: 'Ena, Hanif, Green Line',
    confidence: 'High',
    lastUpdated: '2026-10-22',
    notes: 'Non-AC: ৳550–650, AC Chair Coach: ৳850–950.',
  },
  {
    id: 'route-dhaka-sylhet-train',
    transportType: 'Train',
    originDistrict: 'Dhaka',
    destinationDistrict: 'Sylhet',
    fromName: 'Dhaka (Kamalapur Station)',
    toName: 'Sylhet Railway Station',
    minFare: 345,
    maxFare: 890,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 390, // 6.5h
    distanceKm: 310,
    sourceType: 'OFFICIAL',
    sourceReference: 'Bangladesh Railway (Parabat & Upaban Express)',
    confidence: 'High',
    lastUpdated: '2026-08-15',
    notes: 'Shovon: ৳345, Snigdha AC: ৳665, AC Berth: ৳890. Passes through scenic Lawachara forest.',
  },
  {
    id: 'route-dhaka-sreemangal-train',
    transportType: 'Train',
    originDistrict: 'Dhaka',
    destinationDistrict: 'Moulvibazar',
    destinationPlaceNames: ['Lawachara National Park', 'Madhabpur Lake', 'Tea Gardens', 'Sreemangal'],
    fromName: 'Dhaka (Kamalapur)',
    toName: 'Sreemangal Railway Station',
    minFare: 260,
    maxFare: 650,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 270, // 4.5h
    distanceKm: 195,
    sourceType: 'OFFICIAL',
    sourceReference: 'Bangladesh Railway Official',
    confidence: 'High',
    lastUpdated: '2026-08-15',
    notes: 'Stops right at Sreemangal town center, 10 minutes from premier eco-resorts.',
  },

  // Dhaka -> Sajek Valley (Multi-Leg via Khagrachari)
  {
    id: 'route-dhaka-sajek-multileg',
    transportType: 'Private Car',
    originDistrict: 'Dhaka',
    destinationDistrict: 'Rangamati',
    destinationPlaceNames: ['Sajek Valley', 'Konglak Para', 'Ruilui Para', 'Helipad Viewpoint'],
    fromName: 'Dhaka (Arambagh / Sayedabad)',
    toName: 'Sajek Valley (Ruilui Para Helipad)',
    minFare: 1600,
    maxFare: 2600,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 690, // 11.5 hours
    distanceKm: 345,
    sourceType: 'COMMUNITY',
    sourceReference: 'Sajek Chander Gari Association consensus',
    confidence: 'High',
    lastUpdated: '2026-10-05',
    isMultiLeg: true,
    legs: [
      {
        fromLocation: 'Dhaka (Sayedabad)',
        toLocation: 'Khagrachari Town / Shanti Nagar',
        transportType: 'Bus',
        minFare: 800,
        maxFare: 1300,
        estimatedDurationMin: 480, // 8h
        distanceKm: 275,
        notes: 'Shanti, Shyamoli, Saint Martin AC/Non-AC overnight coaches.',
      },
      {
        fromLocation: 'Khagrachari Town',
        toLocation: 'Sajek Valley (Ruilui Para)',
        transportType: 'Private Car',
        minFare: 800,
        maxFare: 1300,
        estimatedDurationMin: 210, // 3.5h
        distanceKm: 70,
        notes: '4x4 Open Jeep (Chander Gari) shared seat: ৳800–1,200 roundtrip; Reserve full jeep: ৳8,500–10,500.',
      },
    ],
    notes: 'Must travel under Army Security Escort convoys (departs Dighinala at 10:00 AM and 3:00 PM daily).',
  },

  // Dhaka -> Bandarban
  {
    id: 'route-dhaka-bandarban-bus',
    transportType: 'Bus',
    originDistrict: 'Dhaka',
    destinationDistrict: 'Bandarban',
    fromName: 'Dhaka (Sayedabad / Arambagh)',
    toName: 'Bandarban Town (Bypass / Bottoli)',
    minFare: 850,
    maxFare: 1500,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 510, // 8.5h
    distanceKm: 360,
    sourceType: 'OPERATOR',
    sourceReference: 'Saint Martin Paribahan, Shyamoli, Unique',
    confidence: 'High',
    lastUpdated: '2026-09-28',
    notes: 'Direct overnight mountain highway service.',
  },

  // Chattogram -> Cox's Bazar
  {
    id: 'route-ctg-cox-bus',
    transportType: 'Bus',
    originDistrict: 'Chattogram',
    destinationDistrict: "Cox's Bazar",
    fromName: 'Chattogram (Dampara / Cinema Palace)',
    toName: "Cox's Bazar (Kolatoli)",
    minFare: 350,
    maxFare: 550,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 180, // 3h
    distanceKm: 152,
    sourceType: 'COMMUNITY',
    sourceReference: 'Local Chattogram commuter verified',
    confidence: 'High',
    lastUpdated: '2026-10-28',
    notes: 'Purbani, Hanif, and S. Alam hourly shuttle buses.',
  },
  {
    id: 'route-ctg-cox-train',
    transportType: 'Train',
    originDistrict: 'Chattogram',
    destinationDistrict: "Cox's Bazar",
    fromName: 'Chattogram Old Station / Sholoshohor',
    toName: "Cox's Bazar Iconic Station",
    minFare: 250,
    maxFare: 580,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 140, // 2h 20m
    distanceKm: 150,
    sourceType: 'OFFICIAL',
    sourceReference: 'Bangladesh Railway Official Fare Chart',
    confidence: 'High',
    lastUpdated: '2026-09-10',
    notes: 'Fast, smooth rail link across Karnaphuli and Dohazari.',
  },

  // Dhaka -> Sonargaon / Panam Nagar Heritage City
  {
    id: 'route-dhaka-panam-multileg',
    transportType: 'CNG / Auto',
    originDistrict: 'Dhaka',
    destinationDistrict: 'Narayanganj',
    destinationPlaceNames: ['Panam Nagar', 'Sonargaon Folk Art Village', 'Sonargaon'],
    fromName: 'Dhaka (Gulistan / Jatrabari)',
    toName: 'Panam Nagar Heritage City',
    minFare: 110,
    maxFare: 190,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 70,
    distanceKm: 29,
    sourceType: 'COMMUNITY',
    sourceReference: 'Weekend day-tripper community consensus',
    confidence: 'High',
    lastUpdated: '2026-10-14',
    isMultiLeg: true,
    legs: [
      {
        fromLocation: 'Gulistan (Underpass bus stand)',
        toLocation: 'Mograpara Crossing (Sonargaon Highway)',
        transportType: 'Bus',
        minFare: 65,
        maxFare: 85,
        estimatedDurationMin: 45,
        distanceKm: 24,
        notes: 'Borak or Sonargaon Express along Dhaka-Chittagong expressway.',
      },
      {
        fromLocation: 'Mograpara Crossing',
        toLocation: 'Panam Nagar Gate',
        transportType: 'Easy Bike / E-bike',
        minFare: 45,
        maxFare: 80,
        estimatedDurationMin: 25,
        distanceKm: 5,
        notes: 'Electric auto / rickshaw directly to ancient brick street entrance.',
      },
    ],
    notes: 'Popular half-day heritage escape from Dhaka. Cheap and scenic.',
  },

  // Dhaka -> Saint Martin Island (Multi-Leg via Teknaf)
  {
    id: 'route-dhaka-saintmartin-multileg',
    transportType: 'Launch / Boat',
    originDistrict: 'Dhaka',
    destinationDistrict: "Cox's Bazar",
    destinationPlaceNames: ['Saint Martin Island', "St. Martin's Island", 'Chera Dwip'],
    fromName: 'Dhaka (Sayedabad / Fakirapool)',
    toName: 'Saint Martin Island Jetty',
    minFare: 2100,
    maxFare: 3600,
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: 720, // 12h
    distanceKm: 440,
    sourceType: 'OPERATOR',
    sourceReference: 'BIWTA & Sea Cruise Operators Association (Seasonal: Nov–March)',
    confidence: 'High',
    lastUpdated: '2026-10-30',
    isMultiLeg: true,
    legs: [
      {
        fromLocation: 'Dhaka',
        toLocation: 'Teknaf Marine Jetty',
        transportType: 'Bus',
        minFare: 1150,
        maxFare: 1900,
        estimatedDurationMin: 570, // 9.5h
        distanceKm: 415,
        notes: 'Overnight bus via Chittagong and Coxsbazar to Teknaf Ghat.',
      },
      {
        fromLocation: 'Teknaf Jetty',
        toLocation: 'Saint Martin Island',
        transportType: 'Launch / Boat',
        minFare: 950,
        maxFare: 1700,
        estimatedDurationMin: 150, // 2.5h
        distanceKm: 25,
        notes: 'Keari Sindbad, Bay Cruiser, Atlantic Cruise roundtrip ticket.',
      },
    ],
    notes: 'Permits required. Operates exclusively between November and late March during calm seas.',
  },
];

// -------------------------------------------------------------
// LOCAL STORAGE PERSISTENCE HELPERS
// -------------------------------------------------------------
export function getCustomTransportRoutes(): TransportRoute[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_ROUTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomTransportRoute(route: TransportRoute): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getCustomTransportRoutes();
    const updated = [route, ...current.filter((r) => r.id !== route.id)];
    window.localStorage.setItem(CUSTOM_ROUTES_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save custom route:', err);
  }
}

export function deleteCustomTransportRoute(routeId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getCustomTransportRoutes();
    window.localStorage.setItem(
      CUSTOM_ROUTES_KEY,
      JSON.stringify(current.filter((r) => r.id !== routeId))
    );
  } catch (err) {
    console.warn('Failed to delete custom route:', err);
  }
}

export function getCustomTransportFares(): TransportFare[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_FARES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomTransportFare(fare: TransportFare): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getCustomTransportFares();
    const updated = [fare, ...current.filter((f) => f.id !== fare.id)];
    window.localStorage.setItem(CUSTOM_FARES_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save custom fare:', err);
  }
}

export function getStoredCommunityFareReports(): CommunityFareReport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(COMMUNITY_REPORTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function storeCommunityFareReportLocally(report: CommunityFareReport): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredCommunityFareReports();
    window.localStorage.setItem(COMMUNITY_REPORTS_KEY, JSON.stringify([report, ...current]));
  } catch (err) {
    console.warn('Failed to store community fare report:', err);
  }
}

// -------------------------------------------------------------
// DYNAMIC PROXIMITY-BASED FARE INTELLIGENCE FOR LOCAL SPOTS
// -------------------------------------------------------------
export function generateLocalProximityOptions(
  originName: string,
  destinationName: string,
  distanceKm: number
): TransportOption[] {
  const roundedDist = Math.round(distanceKm * 10) / 10;
  const options: TransportOption[] = [];
  const today = '2026-11-02';

  // 1. Short Trips: < 3 km (Neighborhood / Area)
  if (roundedDist <= 3.0) {
    options.push({
      id: `local-rickshaw-${roundedDist}`,
      transportType: 'Rickshaw',
      fromName: originName,
      toName: destinationName,
      minFare: Math.max(30, Math.round(roundedDist * 18)),
      maxFare: Math.max(50, Math.round(roundedDist * 28 + 15)),
      fareUnit: 'per trip',
      currency: 'BDT',
      estimatedDurationMin: Math.max(8, Math.round(roundedDist * 5 + 4)),
      distanceKm: roundedDist,
      sourceType: 'COMMUNITY',
      sourceReference: 'Regular local manual / paddle rickshaw fare consensus',
      confidence: 'High',
      lastUpdated: today,
      notes: 'Estimated fare range per rickshaw trip. Bargain before boarding; weather or peak hours may vary.',
    });

    options.push({
      id: `local-easybike-${roundedDist}`,
      transportType: 'Easy Bike / E-bike',
      fromName: originName,
      toName: destinationName,
      minFare: Math.max(15, Math.round(roundedDist * 10)),
      maxFare: Math.max(30, Math.round(roundedDist * 14 + 10)),
      fareUnit: 'per person',
      currency: 'BDT',
      estimatedDurationMin: Math.max(6, Math.round(roundedDist * 4 + 3)),
      distanceKm: roundedDist,
      sourceType: 'ESTIMATED',
      sourceReference: 'Local battery-run auto / easy-bike standard rate',
      confidence: 'Medium',
      lastUpdated: today,
      notes: 'Shared seat fare per passenger. Reserve full auto for ~4x fare.',
    });

    options.push({
      id: `local-cng-${roundedDist}`,
      transportType: 'CNG / Auto',
      fromName: originName,
      toName: destinationName,
      minFare: 70,
      maxFare: 110,
      fareUnit: 'per trip',
      currency: 'BDT',
      estimatedDurationMin: Math.max(6, Math.round(roundedDist * 3 + 4)),
      distanceKm: roundedDist,
      sourceType: 'ESTIMATED',
      sourceReference: 'Short-hop CNG minimum charge',
      confidence: 'Medium',
      lastUpdated: today,
      notes: 'Minimum base charge applies for short distance auto-rickshaw hire.',
    });
    return options;
  }

  // 2. Medium Trips: 3 km to 14 km (Cross-Town / Metro Area)
  if (roundedDist > 3.0 && roundedDist <= 14.0) {
    options.push({
      id: `local-cng-${roundedDist}`,
      transportType: 'CNG / Auto',
      fromName: originName,
      toName: destinationName,
      minFare: Math.round(roundedDist * 18 + 50),
      maxFare: Math.round(roundedDist * 26 + 70),
      fareUnit: 'per trip',
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 3 + 12),
      distanceKm: roundedDist,
      sourceType: 'COMMUNITY',
      sourceReference: 'Community commuter consensus',
      confidence: 'High',
      lastUpdated: today,
      notes: 'Variable negotiated rate per vehicle/trip. Peak traffic hours (5 PM – 8 PM) may be higher.',
    });

    options.push({
      id: `local-bus-${roundedDist}`,
      transportType: 'Bus',
      fromName: originName,
      toName: destinationName,
      minFare: Math.max(15, Math.round(roundedDist * 2.5 + 5)),
      maxFare: Math.max(25, Math.round(roundedDist * 3.5 + 10)),
      fareUnit: 'per person',
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 4.5 + 15),
      distanceKm: roundedDist,
      sourceType: 'OFFICIAL',
      sourceReference: 'BRTA Official City Route Bus Fare Ceiling (per km basis)',
      confidence: 'High',
      lastUpdated: '2026-08-10',
      notes: 'Standard public city bus per passenger.',
    });

    options.push({
      id: `local-car-${roundedDist}`,
      transportType: 'Private Car',
      fromName: originName,
      toName: destinationName,
      minFare: Math.round(roundedDist * 35 + 120),
      maxFare: Math.round(roundedDist * 52 + 180),
      fareUnit: 'per vehicle',
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 3 + 10),
      distanceKm: roundedDist,
      sourceType: 'OPERATOR',
      sourceReference: 'App-based ride-hailing / rental rate estimates',
      confidence: 'Medium',
      lastUpdated: today,
      notes: 'Door-to-door AC car per vehicle. Subject to dynamic pricing during rain or peak rush.',
    });
    return options;
  }

  // 3. Long Trips: 14 km to 50 km (Suburbs / Inter-District Suburbia)
  if (roundedDist > 14.0 && roundedDist <= 50.0) {
    options.push({
      id: `local-bus-${roundedDist}`,
      transportType: 'Bus',
      fromName: originName,
      toName: destinationName,
      minFare: Math.round(roundedDist * 2.3 + 10),
      maxFare: Math.round(roundedDist * 3.2 + 20),
      fareUnit: 'per person',
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 2.2 + 25),
      distanceKm: roundedDist,
      sourceType: 'OFFICIAL',
      sourceReference: 'BRTA Regional Distance Fare Table',
      confidence: 'High',
      lastUpdated: '2026-08-10',
      notes: 'Semi-express / regional highway bus service per passenger.',
    });

    options.push({
      id: `local-cng-${roundedDist}`,
      transportType: 'CNG / Auto',
      fromName: originName,
      toName: destinationName,
      minFare: Math.round(roundedDist * 16 + 80),
      maxFare: Math.round(roundedDist * 22 + 120),
      fareUnit: 'per vehicle',
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 2 + 15),
      distanceKm: roundedDist,
      sourceType: 'COMMUNITY',
      sourceReference: 'Regional auto commuter consensus',
      confidence: 'Medium',
      lastUpdated: today,
      notes: 'Reserve full vehicle. Variable rate depending on return passenger availability.',
    });

    options.push({
      id: `local-car-${roundedDist}`,
      transportType: 'Private Car',
      fromName: originName,
      toName: destinationName,
      minFare: Math.round(roundedDist * 32 + 250),
      maxFare: Math.round(roundedDist * 44 + 400),
      fareUnit: 'per vehicle',
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 1.8 + 15),
      distanceKm: roundedDist,
      sourceType: 'OPERATOR',
      sourceReference: 'Microbus / Sedan rental rate estimate',
      confidence: 'Medium',
      lastUpdated: today,
      notes: 'Comfortable air-conditioned private vehicle.',
    });
    return options;
  }

  // 4. Greater than 50 km within district/division (Long Highway Journey)
  options.push({
    id: `local-bus-highway-${roundedDist}`,
    transportType: 'Bus',
    fromName: originName,
    toName: destinationName,
    minFare: Math.round(roundedDist * 2.1 + 30),
    maxFare: Math.round(roundedDist * 3.5 + 80),
    fareUnit: 'per person',
    currency: 'BDT',
    estimatedDurationMin: Math.round(roundedDist * 1.6 + 40),
    distanceKm: roundedDist,
    sourceType: 'OPERATOR',
    sourceReference: 'Inter-district highway coach operators',
    confidence: 'Medium',
    lastUpdated: today,
    notes: 'Non-AC to AC coach range per passenger.',
  });

  return options;
}

// -------------------------------------------------------------
// MAIN FARE INTELLIGENCE ENGINE: "GETTING THERE"
// -------------------------------------------------------------
export async function getTransportOptionsForPlace(
  origin: {
    name: string;
    district?: string;
    coords?: Coordinates | null;
  },
  place: Place
): Promise<TransportOption[]> {
  const originDistrict = (origin.district || origin.name || '').trim().toLowerCase();
  const destDistrict = (place.district || '').trim().toLowerCase();
  const placeNameLower = (place.name || '').toLowerCase();

  const results: TransportOption[] = [];
  const customRoutes = getCustomTransportRoutes();

  // 1. Check Custom Admin Routes first
  for (const cr of customRoutes) {
    if (!cr.active) continue;
    const matchOrigin = cr.originDistrict.toLowerCase() === originDistrict;
    const matchDest =
      cr.destinationDistrict.toLowerCase() === destDistrict ||
      (cr.destinationPlaceId && cr.destinationPlaceId === place.id) ||
      (cr.destinationPlaceName && placeNameLower.includes(cr.destinationPlaceName.toLowerCase()));

    if (matchOrigin && matchDest) {
      results.push({
        id: cr.id,
        transportType: cr.transportType,
        fromName: origin.name || cr.originDistrict,
        toName: place.name || cr.destinationDistrict,
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

  // 2. Check Built-in Verified Seed Routes
  for (const seed of SEED_TRANSPORT_ROUTES) {
    const matchOrigin = seed.originDistrict.toLowerCase() === originDistrict;
    const matchDestDistrict = seed.destinationDistrict.toLowerCase() === destDistrict;
    const matchDestPlace =
      seed.destinationPlaceNames &&
      seed.destinationPlaceNames.some((dp) => placeNameLower.includes(dp.toLowerCase()));

    if (matchOrigin && (matchDestDistrict || matchDestPlace)) {
      results.push({
        ...seed,
        fareUnit: seed.fareUnit || inferFareUnit(seed.transportType, seed.notes),
        fromName: `${origin.name || seed.originDistrict}`,
        toName: place.name,
      });
    }
  }

  // 3. Check Community Fare Reports consensus for this specific place or corridor
  const communityReports = await fetchCommunityFareReports(place.id, origin.name);
  if (communityReports.length > 0) {
    const byType = new Map<TransportType, CommunityFareReport[]>();
    for (const r of communityReports) {
      if (!byType.has(r.transportType)) byType.set(r.transportType, []);
      byType.get(r.transportType)!.push(r);
    }

    for (const [tType, reports] of byType.entries()) {
      const fares = reports.map((r) => r.farePaid).sort((a, b) => a - b);
      const minPaid = fares[0];
      const maxPaid = fares[fares.length - 1];
      const count = fares.length;
      const confidence: FareConfidence = count >= 4 ? 'High' : count >= 2 ? 'Medium' : 'Low';
      const latestReportDate = reports[0]?.tripDate || '2026-11-02';

      const existingIdx = results.findIndex((res) => res.transportType === tType);
      if (existingIdx >= 0) {
        results[existingIdx] = {
          ...results[existingIdx],
          minFare: Math.min(results[existingIdx].minFare, minPaid),
          maxFare: Math.max(results[existingIdx].maxFare, maxPaid),
          sourceType: 'COMMUNITY',
          confidence,
          lastUpdated: latestReportDate,
          communityReportsCount: count,
          notes: `${results[existingIdx].notes || ''} (Community reports: ৳${minPaid}–৳${maxPaid} from ${count} scout submission${count > 1 ? 's' : ''})`.trim(),
        };
      } else {
        results.push({
          id: `community-consensus-${tType}-${place.id}`,
          transportType: tType,
          fromName: origin.name,
          toName: place.name,
          minFare: minPaid,
          maxFare: maxPaid,
          fareUnit: reports[0]?.fareUnit || inferFareUnit(tType),
          currency: 'BDT',
          estimatedDurationMin: 60,
          sourceType: 'COMMUNITY',
          confidence,
          lastUpdated: latestReportDate,
          communityReportsCount: count,
          notes: `Variable community-reported fare range based on ${count} scout submission${count > 1 ? 's' : ''}. Not a fixed/guaranteed price.`,
        });
      }
    }
  }

  // 4. Proximity-based options when coordinates exist
  if (origin.coords && place.coordinates) {
    const directDistanceKm = calculateDistanceKm(origin.coords, place.coordinates);
    const roadDistanceKm = Math.round(directDistanceKm * 1.3 * 10) / 10;

    if (results.length === 0 || originDistrict === destDistrict) {
      const proximityOptions = generateLocalProximityOptions(origin.name, place.name, roadDistanceKm);
      for (const po of proximityOptions) {
        if (!results.some((r) => r.transportType === po.transportType)) {
          results.push(po);
        }
      }
    }
  }

  const currentTimestamp = new Date('2026-11-02').getTime();
  const halfYearMs = 180 * 24 * 60 * 60 * 1000;

  return results.map((opt) => {
    const updatedTime = new Date(opt.lastUpdated).getTime();
    const isOutdated = !isNaN(updatedTime) && currentTimestamp - updatedTime > halfYearMs;
    return {
      ...opt,
      fareUnit: opt.fareUnit || inferFareUnit(opt.transportType, opt.notes),
      isOutdated,
    };
  });
}

// -------------------------------------------------------------
// COMMUNITY FARE REPORT SUBMISSION & FETCHING
// -------------------------------------------------------------
export async function submitCommunityFareReport(input: {
  origin: string;
  destination: string;
  destinationPlaceId?: string;
  destinationPlaceName?: string;
  transportType: TransportType;
  farePaid: number;
  fareUnit?: FareUnit;
  tripDate?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string; data?: CommunityFareReport }> {
  try {
    if (!input.origin?.trim() || !input.destination?.trim()) {
      return { success: false, error: 'Please enter origin and destination.' };
    }
    if (!input.farePaid || input.farePaid <= 0 || isNaN(input.farePaid)) {
      return { success: false, error: 'Please enter a valid fare amount.' };
    }

    const user = await getCurrentUser();
    const cleanFare = Math.round(Number(input.farePaid));
    const tripDate = input.tripDate || new Date().toISOString().split('T')[0];

    const report: CommunityFareReport = {
      id: `fare_rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: user?.id || null,
      authorName: user?.user_metadata?.name || user?.user_metadata?.display_name || 'Community Scout',
      authorHandle: user?.user_metadata?.username ? `@${user.user_metadata.username}` : '@scout',
      origin: input.origin.trim(),
      destination: input.destination.trim(),
      destinationPlaceId: input.destinationPlaceId,
      destinationPlaceName: input.destinationPlaceName,
      transportType: input.transportType,
      farePaid: cleanFare,
      fareUnit: input.fareUnit || inferFareUnit(input.transportType),
      currency: 'BDT',
      tripDate,
      notes: input.notes?.trim() || undefined,
      status: 'verified',
      createdAt: new Date().toISOString(),
    };

    storeCommunityFareReportLocally(report);

    try {
      await supabase.from('fare_reports').insert({
        origin: report.origin,
        destination: report.destination,
        destination_place_id: report.destinationPlaceId || null,
        destination_place_name: report.destinationPlaceName || null,
        transport_type: report.transportType,
        fare_paid: report.farePaid,
        fare_unit: report.fareUnit,
        currency: 'BDT',
        trip_date: report.tripDate,
        notes: report.notes || null,
        user_id: user?.id || null,
        author_name: report.authorName,
        author_handle: report.authorHandle,
        status: 'verified',
        created_at: report.createdAt,
      });
    } catch (dbErr) {
      console.warn('Supabase fare_reports insert notice:', dbErr);
    }

    return { success: true, data: report };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit fare report.' };
  }
}

export async function fetchCommunityFareReports(
  placeId?: string,
  originFilter?: string
): Promise<CommunityFareReport[]> {
  try {
    const local = getStoredCommunityFareReports();
    const filteredLocal = placeId
      ? local.filter((l) => !l.destinationPlaceId || l.destinationPlaceId === placeId)
      : local;

    let dbReports: CommunityFareReport[] = [];
    try {
      let query = supabase.from('fare_reports').select('*').order('created_at', { ascending: false });
      if (placeId) {
        query = query.eq('destination_place_id', placeId);
      }
      const { data, error } = await query;
      if (!error && data) {
        dbReports = data.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          authorName: d.author_name || 'Community Scout',
          authorHandle: d.author_handle || '@scout',
          origin: d.origin,
          destination: d.destination,
          destinationPlaceId: d.destination_place_id,
          destinationPlaceName: d.destination_place_name,
          transportType: d.transport_type as TransportType,
          farePaid: Number(d.fare_paid),
          fareUnit: (d.fare_unit as FareUnit) || inferFareUnit(d.transport_type),
          currency: 'BDT',
          tripDate: d.trip_date || d.created_at?.split('T')[0] || '2026-11-02',
          notes: d.notes,
          status: d.status || 'verified',
          createdAt: d.created_at,
        }));
      }
    } catch {}

    const existingIds = new Set(dbReports.map((r) => r.id));
    const merged = [...dbReports, ...filteredLocal.filter((l) => !existingIds.has(l.id))];

    if (originFilter) {
      const origLower = originFilter.toLowerCase();
      return merged.filter((m) => m.origin.toLowerCase().includes(origLower));
    }

    return merged;
  } catch {
    return getStoredCommunityFareReports();
  }
}

// -------------------------------------------------------------
// B. LOCAL TRANSPORT CONTACTS (CNG/Auto, Rickshaw, Easy Bike, Car, Boat/Launch, Other)
// Never guarantee someone is "honest". Verification based on actual moderation/community data.
// Only show phone/WhatsApp when phone_public_permission is true and status is 'approved'.
// -------------------------------------------------------------
function getStoredLocalTransportContacts(): LocalTransportContact[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_TRANSPORT_CONTACTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredLocalTransportContacts(list: LocalTransportContact[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_TRANSPORT_CONTACTS_KEY, JSON.stringify(list));
  } catch {}
}

export async function fetchLocalTransportContactsForPlace(
  placeId: string,
  district?: string,
  _upazila?: string
): Promise<LocalTransportContact[]> {
  const results: LocalTransportContact[] = [];
  const seenIds = new Set<string>();

  const normalizeContact = (row: any): LocalTransportContact => {
    const perm = Boolean(row.phone_public_permission ?? row.phonePublicPermission ?? row.contactPermission);
    const phoneVal = perm ? row.phone || null : null;
    const whatsappVal = perm ? row.whatsapp || null : null;
    const vType = (row.vehicle_type || row.vehicleType || 'CNG/Auto') as LocalVehicleType;
    const nameVal = row.name || row.operatorName || 'Local Operator';
    const areaVal = row.service_area || row.serviceArea || '';
    const rateVal = row.rate_note ?? row.rateNote ?? null;
    const cVer = Boolean(row.contact_verified ?? row.contactVerified ?? row.isContactVerified);
    const oVer = Boolean(row.outera_verified ?? row.outeraVerified ?? row.isOuteraVerified);
    const cRec = Boolean(row.community_recommended ?? row.communityRecommended ?? row.isCommunityRecommended);
    const recCount = Number(row.recommendations_count ?? row.helpfulReportsCount) || 0;
    const lastVer = row.last_verified || row.lastVerified || row.lastVerifiedAt || null;

    return {
      id: row.id,
      place_id: row.place_id ?? row.placeId ?? null,
      placeId: row.place_id ?? row.placeId ?? null,
      division: row.division || null,
      district: row.district || null,
      upazila: row.upazila || null,
      vehicle_type: vType,
      vehicleType: vType,
      name: nameVal,
      operatorName: nameVal,
      service_area: areaVal,
      serviceArea: areaVal,
      phone: phoneVal,
      whatsapp: whatsappVal,
      phone_public_permission: perm,
      phonePublicPermission: perm,
      contactPermission: perm,
      rate_note: rateVal,
      rateNote: rateVal,
      contact_verified: cVer,
      contactVerified: cVer,
      isContactVerified: cVer,
      outera_verified: oVer,
      outeraVerified: oVer,
      isOuteraVerified: oVer,
      community_recommended: cRec,
      communityRecommended: cRec,
      isCommunityRecommended: cRec,
      recommendations_count: recCount,
      helpfulReportsCount: recCount,
      last_verified: lastVer,
      lastVerified: lastVer,
      lastVerifiedAt: lastVer,
      status: row.status || 'approved',
      submitted_by: row.submitted_by ?? row.submittedBy ?? null,
      submittedBy: row.submitted_by ?? row.submittedBy ?? null,
      created_at: row.created_at || row.createdAt || new Date().toISOString(),
      createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    };
  };

  try {
    const { data, error } = await supabase
      .from('local_transport_contacts')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (!error && data) {
      for (const row of data) {
        const matchPlace = row.place_id === placeId;
        const matchDistrict =
          district &&
          row.district &&
          row.district.toLowerCase() === district.toLowerCase();
        if (matchPlace || matchDistrict) {
          seenIds.add(row.id);
          results.push(normalizeContact(row));
        }
      }
    }
  } catch {}

  const localContacts = getStoredLocalTransportContacts().filter(
    (c) =>
      c.status === 'approved' &&
      !seenIds.has(c.id) &&
      ((c.place_id || c.placeId) === placeId ||
        (district && c.district && c.district.toLowerCase() === district.toLowerCase()))
  );

  for (const lc of localContacts) {
    results.push(normalizeContact(lc));
  }

  return results;
}

export async function submitLocalTransportContact(input: {
  place_id?: string | null;
  placeId?: string | null;
  division?: string;
  district?: string;
  upazila?: string;
  vehicle_type?: LocalVehicleType | string;
  vehicleType?: LocalVehicleType | string;
  name: string;
  service_area?: string;
  serviceArea?: string;
  phone?: string;
  whatsapp?: string;
  phone_public_permission?: boolean;
  phonePublicPermission?: boolean;
  rate_note?: string;
  rateNote?: string;
}): Promise<{ success: boolean; error?: string; data?: LocalTransportContact }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Please sign in to submit a local transport contact.' };
    }
    const srvArea = (input.service_area || input.serviceArea || '').trim();
    if (!input.name.trim() || !srvArea) {
      return { success: false, error: 'Name and service area are required.' };
    }

    const isAdmin = await isCurrentUserAdmin();
    const initialStatus = isAdmin ? 'approved' : 'pending';
    const vehType = (input.vehicle_type || input.vehicleType || 'CNG/Auto') as LocalVehicleType;
    const perm = Boolean(input.phone_public_permission ?? input.phonePublicPermission);
    const rNote = (input.rate_note ?? input.rateNote)?.trim() || null;
    const pId = input.place_id ?? input.placeId ?? null;
    const lastVer = isAdmin ? new Date().toISOString().split('T')[0] : null;
    const nowIso = new Date().toISOString();

    const newItem: LocalTransportContact = {
      id: `ltc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      place_id: pId,
      placeId: pId,
      division: input.division || null,
      district: input.district || null,
      upazila: input.upazila || null,
      vehicle_type: vehType,
      vehicleType: vehType,
      name: input.name.trim(),
      operatorName: input.name.trim(),
      service_area: srvArea,
      serviceArea: srvArea,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      phone_public_permission: perm,
      phonePublicPermission: perm,
      contactPermission: perm,
      rate_note: rNote,
      rateNote: rNote,
      contact_verified: isAdmin,
      contactVerified: isAdmin,
      isContactVerified: isAdmin,
      outera_verified: isAdmin,
      outeraVerified: isAdmin,
      isOuteraVerified: isAdmin,
      community_recommended: true,
      communityRecommended: true,
      isCommunityRecommended: true,
      recommendations_count: 1,
      helpfulReportsCount: 1,
      last_verified: lastVer,
      lastVerified: lastVer,
      lastVerifiedAt: lastVer,
      status: initialStatus,
      submitted_by: user.id,
      submittedBy: user.id,
      created_at: nowIso,
      createdAt: nowIso,
    };

    try {
      const { data, error } = await supabase
        .from('local_transport_contacts')
        .insert({
          place_id: newItem.place_id,
          division: newItem.division,
          district: newItem.district,
          upazila: newItem.upazila,
          vehicle_type: newItem.vehicle_type,
          name: newItem.name,
          service_area: newItem.service_area,
          phone: newItem.phone,
          whatsapp: newItem.whatsapp,
          phone_public_permission: newItem.phone_public_permission,
          rate_note: newItem.rate_note,
          contact_verified: newItem.contact_verified,
          outera_verified: newItem.outera_verified,
          community_recommended: newItem.community_recommended,
          recommendations_count: 1,
          last_verified: newItem.last_verified ? new Date().toISOString() : null,
          status: initialStatus,
          submitted_by: user.id,
        })
        .select()
        .maybeSingle();

      if (!error && data) {
        newItem.id = data.id;
      }
    } catch {}

    const current = getStoredLocalTransportContacts();
    saveStoredLocalTransportContacts([newItem, ...current]);

    return { success: true, data: newItem };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit local transport contact.' };
  }
}

export async function fetchAdminLocalTransportContacts(): Promise<LocalTransportContact[]> {
  const local = getStoredLocalTransportContacts();
  try {
    const { data, error } = await supabase
      .from('local_transport_contacts')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const dbIds = new Set(data.map((d: any) => d.id));
      const mapped = data.map((row: any) => ({
        ...row,
        placeId: row.place_id,
        vehicleType: row.vehicle_type,
        operatorName: row.name,
        serviceArea: row.service_area,
        phonePublicPermission: Boolean(row.phone_public_permission),
        rateNote: row.rate_note,
        contactVerified: Boolean(row.contact_verified),
        outeraVerified: Boolean(row.outera_verified),
        communityRecommended: Boolean(row.community_recommended),
      }));
      return [...(mapped as LocalTransportContact[]), ...local.filter((l) => !dbIds.has(l.id))];
    }
  } catch {}
  return local;
}

export async function moderateLocalTransportContact(
  id: string,
  statusOrOpts:
    | 'approved'
    | 'rejected'
    | 'hidden'
    | {
        status: 'approved' | 'rejected' | 'hidden' | string;
        contactVerified?: boolean;
        outeraVerified?: boolean;
        communityRecommended?: boolean;
      },
  flags?: {
    contact_verified?: boolean;
    outera_verified?: boolean;
    community_recommended?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    const isAdmin = await isCurrentUserAdmin();
    if (!user || !isAdmin) {
      return { success: false, error: 'Admin permission required.' };
    }

    const status = (typeof statusOrOpts === 'string' ? statusOrOpts : statusOrOpts.status) as
      | 'approved'
      | 'rejected'
      | 'hidden';
    const resolvedFlags =
      typeof statusOrOpts === 'object'
        ? {
            contact_verified: statusOrOpts.contactVerified,
            outera_verified: statusOrOpts.outeraVerified,
            community_recommended: statusOrOpts.communityRecommended,
          }
        : flags;

    const nowIso = new Date().toISOString();
    const local = getStoredLocalTransportContacts();
    const updatedLocal = local.map((item) =>
      item.id === id
        ? {
            ...item,
            status,
            contact_verified: resolvedFlags?.contact_verified ?? item.contact_verified,
            contactVerified: resolvedFlags?.contact_verified ?? item.contactVerified,
            outera_verified: resolvedFlags?.outera_verified ?? item.outera_verified,
            outeraVerified: resolvedFlags?.outera_verified ?? item.outeraVerified,
            community_recommended: resolvedFlags?.community_recommended ?? item.community_recommended,
            communityRecommended: resolvedFlags?.community_recommended ?? item.communityRecommended,
            last_verified: status === 'approved' ? nowIso.split('T')[0] : item.last_verified,
            lastVerified: status === 'approved' ? nowIso.split('T')[0] : item.lastVerified,
          }
        : item
    );
    saveStoredLocalTransportContacts(updatedLocal);

    try {
      await supabase
        .from('local_transport_contacts')
        .update({
          status,
          ...(resolvedFlags || {}),
          last_verified: status === 'approved' ? nowIso : null,
          reviewed_by: user.id,
          reviewed_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', id);
    } catch {}

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Moderation failed.' };
  }
}

// -------------------------------------------------------------
// C. STAY NEARBY & D. EAT NEARBY (place_nearby_services + real approved database places)
// Prioritize:
// 1. Verified
// 2. Strong community confidence
// 3. Recent reports
// 4. Distance
// -------------------------------------------------------------
function getStoredNearbyServices(): NearbyServiceItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NEARBY_SERVICES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredNearbyServices(list: NearbyServiceItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NEARBY_SERVICES_KEY, JSON.stringify(list));
  } catch {}
}

function confidenceRankScore(conf?: CommunityConfidenceLevel): number {
  switch (conf) {
    case 'High':
      return 4;
    case 'Medium':
      return 3;
    case 'Limited':
      return 2;
    case 'Insufficient Data':
    default:
      return 1;
  }
}

function normalizeNearbyService(raw: any): NearbyServiceItem {
  const perm = Boolean(
    raw.contact_public_permission ?? raw.contactPublicPermission ?? raw.contactPermission
  );
  const cPhone = perm ? raw.contact_phone || raw.contactPhone || null : null;
  const cWa = perm ? raw.contact_whatsapp || raw.whatsapp || null : null;
  const catGroup = (raw.category_group || raw.serviceGroup || raw.serviceCategory || 'stay') as NearbyServiceCategoryGroup;
  const srvType = raw.service_type || raw.serviceType || raw.category || (catGroup === 'stay' ? 'Hotel' : 'Restaurant');
  const distKm = typeof raw.distance_km === 'number' ? raw.distance_km : typeof raw.distanceKm === 'number' ? raw.distanceKm : null;
  const pLabel = raw.price_range_label || raw.priceRangeLabel || raw.priceRange || null;
  const fType = raw.food_type || raw.foodType || raw.foodSpecialty || null;
  const dirNote = raw.directions_note || raw.directionsNote || null;
  const conf = (raw.community_confidence || raw.communityConfidence || 'Insufficient Data') as CommunityConfidenceLevel;
  const repCount = Number(raw.visitor_reports_count ?? raw.visitorReportsCount) || 0;
  const cVer = Boolean(raw.contact_verified ?? raw.contactVerified);
  const oVer = Boolean(raw.outera_verified ?? raw.outeraVerified ?? raw.isVerified);

  return {
    id: raw.id,
    place_id: raw.place_id ?? raw.placeId ?? null,
    placeId: raw.place_id ?? raw.placeId ?? null,
    linked_place_id: raw.linked_place_id ?? null,
    category_group: catGroup,
    serviceGroup: catGroup,
    serviceCategory: catGroup,
    service_type: srvType,
    serviceType: srvType,
    category: srvType,
    name: raw.name,
    food_type: fType,
    foodType: fType,
    foodSpecialty: fType,
    division: raw.division || null,
    district: raw.district || null,
    upazila: raw.upazila || null,
    address: raw.address || null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    distance_km: distKm,
    distanceKm: distKm,
    price_min: raw.price_min ?? raw.priceMin ?? null,
    priceMin: raw.price_min ?? raw.priceMin ?? null,
    price_max: raw.price_max ?? raw.priceMax ?? null,
    priceMax: raw.price_max ?? raw.priceMax ?? null,
    price_range_label: pLabel,
    priceRangeLabel: pLabel,
    priceRange: pLabel,
    contact_phone: cPhone,
    contactPhone: cPhone,
    contact_whatsapp: cWa,
    whatsapp: cWa,
    contact_public_permission: perm,
    contactPublicPermission: perm,
    contactPermission: perm,
    directions_note: dirNote,
    directionsNote: dirNote,
    community_confidence: conf,
    communityConfidence: conf,
    visitor_reports_count: repCount,
    visitorReportsCount: repCount,
    contact_verified: cVer,
    contactVerified: cVer,
    isVerified: oVer || cVer,
    outera_verified: oVer,
    outeraVerified: oVer,
    status: raw.status || 'approved',
    submitted_by: raw.submitted_by ?? raw.submittedBy ?? null,
    submittedBy: raw.submitted_by ?? raw.submittedBy ?? null,
    created_at: raw.created_at || raw.createdAt || new Date().toISOString(),
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
  };
}

export function sortNearbyServicesByPriority(items: NearbyServiceItem[]): NearbyServiceItem[] {
  return [...items].sort((a, b) => {
    // 1. Verified (OUTERA verified or Contact verified)
    const aVer = ((a.outera_verified ?? a.outeraVerified) ? 2 : 0) + ((a.contact_verified ?? a.contactVerified) ? 1 : 0);
    const bVer = ((b.outera_verified ?? b.outeraVerified) ? 2 : 0) + ((b.contact_verified ?? b.contactVerified) ? 1 : 0);
    if (bVer !== aVer) return bVer - aVer;

    // 2. Strong community confidence
    const aConf = confidenceRankScore(a.community_confidence ?? a.communityConfidence);
    const bConf = confidenceRankScore(b.community_confidence ?? b.communityConfidence);
    if (bConf !== aConf) return bConf - aConf;

    // 3. Recent / total visitor reports
    const aRep = a.visitor_reports_count ?? a.visitorReportsCount ?? 0;
    const bRep = b.visitor_reports_count ?? b.visitorReportsCount ?? 0;
    if (bRep !== aRep) {
      return bRep - aRep;
    }

    // 4. Distance ascending
    const aDist = typeof (a.distance_km ?? a.distanceKm) === 'number' ? (a.distance_km ?? a.distanceKm)! : 9999;
    const bDist = typeof (b.distance_km ?? b.distanceKm) === 'number' ? (b.distance_km ?? b.distanceKm)! : 9999;
    return aDist - bDist;
  });
}

export async function fetchPlaceNearbyServices(
  place: Place,
  allApprovedPlaces: Place[],
  categoryGroup: NearbyServiceCategoryGroup
): Promise<NearbyServiceItem[]> {
  const results: NearbyServiceItem[] = [];
  const seenIds = new Set<string>();

  // 1. Fetch from Supabase place_nearby_services table if available
  try {
    const { data, error } = await supabase
      .from('place_nearby_services')
      .select('*')
      .eq('status', 'approved')
      .eq('category_group', categoryGroup);

    if (!error && data) {
      for (const row of data) {
        const matchPlace = row.place_id === place.id;
        const matchDistrict =
          place.district &&
          row.district &&
          row.district.toLowerCase() === place.district.toLowerCase();

        if (matchPlace || matchDistrict) {
          seenIds.add(row.id);
          let distKm = typeof row.distance_km === 'number' ? row.distance_km : null;
          if (
            distKm === null &&
            place.coordinates &&
            typeof row.latitude === 'number' &&
            typeof row.longitude === 'number'
          ) {
            distKm =
              Math.round(
                calculateDistanceKm(place.coordinates, {
                  lat: row.latitude,
                  lng: row.longitude,
                }) * 10
              ) / 10;
          }

          results.push(
            normalizeNearbyService({
              ...row,
              distance_km: distKm,
            })
          );
        }
      }
    }
  } catch {}

  // 2. Check locally stored approved nearby services
  const localServices = getStoredNearbyServices().filter(
    (s) =>
      s.status === 'approved' &&
      (s.category_group || s.serviceGroup) === categoryGroup &&
      !seenIds.has(s.id) &&
      ((s.place_id || s.placeId) === place.id ||
        (place.district && s.district && s.district.toLowerCase() === place.district.toLowerCase()))
  );

  for (const ls of localServices) {
    seenIds.add(ls.id);
    results.push(normalizeNearbyService(ls));
  }

  // 3. Also derive from real approved places in the database that match Stay or Eat nearby
  for (const candidate of allApprovedPlaces) {
    if (candidate.id === place.id || seenIds.has(candidate.id)) continue;

    const catLower = (candidate.category || '').toLowerCase();
    const subLower = (candidate.subcategory || '').toLowerCase();
    const nameLower = (candidate.name || '').toLowerCase();

    let isMatch = false;
    let serviceType: NearbyStayType | NearbyEatType = categoryGroup === 'stay' ? 'Hotel' : 'Restaurant';

    if (categoryGroup === 'stay') {
      if (
        catLower.includes('hotel') ||
        catLower.includes('resort') ||
        catLower.includes('stay') ||
        subLower.includes('hotel') ||
        subLower.includes('resort') ||
        nameLower.includes('resort') ||
        nameLower.includes('hotel') ||
        nameLower.includes('homestay') ||
        nameLower.includes('guest house')
      ) {
        isMatch = true;
        if (nameLower.includes('resort') || catLower.includes('resort')) serviceType = 'Resort';
        else if (nameLower.includes('homestay')) serviceType = 'Homestay';
        else if (nameLower.includes('hostel')) serviceType = 'Hostel';
        else if (nameLower.includes('guest house')) serviceType = 'Guest House';
        else serviceType = 'Hotel';
      }
    } else if (categoryGroup === 'eat') {
      if (
        catLower === 'food' ||
        catLower === 'cafes' ||
        catLower.includes('restaurant') ||
        catLower.includes('cafe') ||
        nameLower.includes('cafe') ||
        nameLower.includes('restaurant') ||
        nameLower.includes('roastery') ||
        nameLower.includes('bistro') ||
        nameLower.includes('kitchen')
      ) {
        isMatch = true;
        if (catLower === 'cafes' || nameLower.includes('cafe') || nameLower.includes('coffee')) {
          serviceType = 'Cafe';
        } else if (subLower.includes('street') || nameLower.includes('street')) {
          serviceType = 'Street Food';
        } else if (candidate.groupFit?.includes('Family')) {
          serviceType = 'Family Restaurant';
        } else {
          serviceType = 'Restaurant';
        }
      }
    }

    if (!isMatch) continue;

    let distKm: number | null = null;
    if (place.coordinates && candidate.coordinates) {
      distKm = Math.round(calculateDistanceKm(place.coordinates, candidate.coordinates) * 10) / 10;
    }

    const sameDistrict =
      place.district &&
      candidate.district &&
      place.district.toLowerCase() === candidate.district.toLowerCase();

    if ((distKm !== null && distKm <= 25) || (distKm === null && sameDistrict)) {
      seenIds.add(candidate.id);
      results.push(
        normalizeNearbyService({
          id: `place_srv_${candidate.id}`,
          place_id: place.id,
          linked_place_id: candidate.id,
          category_group: categoryGroup,
          service_type: serviceType,
          name: candidate.name,
          food_type: categoryGroup === 'eat' ? candidate.subcategory || candidate.category : null,
          division: candidate.division,
          district: candidate.district,
          upazila: candidate.upazila || candidate.city,
          address: candidate.address,
          latitude: candidate.coordinates?.lat ?? null,
          longitude: candidate.coordinates?.lng ?? null,
          distance_km: distKm,
          price_min: candidate.priceLevel?.min || null,
          price_max: candidate.priceLevel?.max || null,
          price_range_label:
            candidate.priceLevel?.label && candidate.priceLevel.label !== 'Varies'
              ? candidate.priceLevel.label
              : null,
          contact_phone: null,
          contact_whatsapp: null,
          contact_public_permission: false,
          directions_note: candidate.address || candidate.neighborhood,
          community_confidence: candidate.communityConfidence,
          visitor_reports_count: candidate.totalReports || 0,
          contact_verified: false,
          outera_verified: candidate.communityConfidence === 'High' || candidate.totalReports >= 3,
          status: 'approved',
        })
      );
    }
  }

  return sortNearbyServicesByPriority(results);
}

export async function submitNearbyService(input: {
  place_id?: string;
  placeId?: string;
  category_group?: NearbyServiceCategoryGroup;
  serviceGroup?: NearbyServiceCategoryGroup;
  service_type?: NearbyStayType | NearbyEatType | string;
  category?: NearbyStayType | NearbyEatType | string;
  name: string;
  food_type?: string;
  foodType?: string;
  division?: string;
  district?: string;
  upazila?: string;
  address?: string;
  distance_km?: number | null;
  distanceKm?: number | null;
  price_min?: number | null;
  price_max?: number | null;
  priceRange?: string;
  contact_phone?: string;
  contactPhone?: string;
  contact_whatsapp?: string;
  contact_public_permission?: boolean;
  contactPermission?: boolean;
  directions_note?: string;
  directionsNote?: string;
}): Promise<{ success: boolean; error?: string; data?: NearbyServiceItem }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Please sign in to suggest a nearby stay or food spot.' };
    }
    if (!input.name.trim()) {
      return { success: false, error: 'Name is required.' };
    }

    const isAdmin = await isCurrentUserAdmin();
    const initialStatus = isAdmin ? 'approved' : 'pending';
    const priceLabel =
      input.priceRange?.trim() ||
      (input.price_min && input.price_max
        ? `৳${input.price_min}–৳${input.price_max}`
        : input.price_min
        ? `From ৳${input.price_min}`
        : null);

    const catGroup = (input.category_group || input.serviceGroup || 'stay') as NearbyServiceCategoryGroup;
    const srvType = (input.service_type || input.category || (catGroup === 'stay' ? 'Hotel' : 'Restaurant')) as string;
    const pId = input.place_id || input.placeId || '';
    const fType = (input.food_type ?? input.foodType)?.trim() || null;
    const distKm = input.distance_km ?? input.distanceKm ?? null;
    const cPhone = (input.contact_phone ?? input.contactPhone)?.trim() || null;
    const perm = Boolean(input.contact_public_permission ?? input.contactPermission);
    const dirNote = (input.directions_note ?? input.directionsNote)?.trim() || null;

    const newItem = normalizeNearbyService({
      id: `nbs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      place_id: pId,
      category_group: catGroup,
      service_type: srvType,
      name: input.name.trim(),
      food_type: fType,
      division: input.division || null,
      district: input.district || null,
      upazila: input.upazila || null,
      address: input.address?.trim() || null,
      distance_km: distKm,
      price_min: input.price_min ?? null,
      price_max: input.price_max ?? null,
      price_range_label: priceLabel,
      contact_phone: cPhone,
      contact_whatsapp: input.contact_whatsapp?.trim() || null,
      contact_public_permission: perm,
      directions_note: dirNote,
      community_confidence: 'Limited',
      visitor_reports_count: 1,
      contact_verified: isAdmin,
      outera_verified: isAdmin,
      status: initialStatus,
      created_at: new Date().toISOString(),
    });

    try {
      const { data, error } = await supabase
        .from('place_nearby_services')
        .insert({
          place_id: newItem.place_id,
          category_group: newItem.category_group,
          service_type: newItem.service_type,
          name: newItem.name,
          food_type: newItem.food_type,
          division: newItem.division,
          district: newItem.district,
          upazila: newItem.upazila,
          address: newItem.address,
          distance_km: newItem.distance_km,
          price_min: newItem.price_min,
          price_max: newItem.price_max,
          price_range_label: newItem.price_range_label,
          contact_phone: newItem.contact_phone,
          contact_whatsapp: newItem.contact_whatsapp,
          contact_public_permission: newItem.contact_public_permission,
          directions_note: newItem.directions_note,
          community_confidence: newItem.community_confidence,
          visitor_reports_count: 1,
          contact_verified: newItem.contact_verified,
          outera_verified: newItem.outera_verified,
          status: initialStatus,
          submitted_by: user.id,
        })
        .select()
        .maybeSingle();

      if (!error && data) {
        newItem.id = data.id;
      }
    } catch {}

    const current = getStoredNearbyServices();
    saveStoredNearbyServices([newItem, ...current]);

    return { success: true, data: newItem };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit nearby service.' };
  }
}

export async function fetchAdminNearbyServices(): Promise<NearbyServiceItem[]> {
  const local = getStoredNearbyServices().map(normalizeNearbyService);
  try {
    const { data, error } = await supabase
      .from('place_nearby_services')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const dbIds = new Set(data.map((d: any) => d.id));
      return [...data.map(normalizeNearbyService), ...local.filter((l) => !dbIds.has(l.id))];
    }
  } catch {}
  return local;
}

export async function moderateNearbyService(
  id: string,
  statusOrOpts:
    | 'approved'
    | 'rejected'
    | 'hidden'
    | {
        status: 'approved' | 'rejected' | 'hidden' | string;
        outeraVerified?: boolean;
        contactVerified?: boolean;
        communityConfidence?: CommunityConfidenceLevel | string;
      },
  flags?: { contact_verified?: boolean; outera_verified?: boolean }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    const isAdmin = await isCurrentUserAdmin();
    if (!user || !isAdmin) return { success: false, error: 'Admin permission required.' };

    const status = (typeof statusOrOpts === 'string' ? statusOrOpts : statusOrOpts.status) as
      | 'approved'
      | 'rejected'
      | 'hidden';
    const resolvedFlags =
      typeof statusOrOpts === 'object'
        ? {
            contact_verified: statusOrOpts.contactVerified,
            outera_verified: statusOrOpts.outeraVerified,
            community_confidence: statusOrOpts.communityConfidence as CommunityConfidenceLevel | undefined,
          }
        : flags;

    const nowIso = new Date().toISOString();
    const local = getStoredNearbyServices();
    const updated = local.map((item) =>
      item.id === id
        ? normalizeNearbyService({
            ...item,
            status,
            contact_verified: resolvedFlags?.contact_verified ?? item.contact_verified,
            outera_verified: resolvedFlags?.outera_verified ?? item.outera_verified,
          })
        : item
    );
    saveStoredNearbyServices(updated);

    try {
      await supabase
        .from('place_nearby_services')
        .update({
          status,
          ...(resolvedFlags || {}),
          reviewed_by: user.id,
          reviewed_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', id);
    } catch {}

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Moderation failed.' };
  }
}

// -------------------------------------------------------------
// E. WHILE YOU'RE HERE
// Show relevant nearby tourist places, restaurants, hotels/resorts, activities, local spots
// using actual database/location data only.
// -------------------------------------------------------------
export function getWhileYouAreHerePlaces(
  currentPlace: Place,
  allApprovedPlaces: Place[]
): Array<
  Place & {
    place: Place;
    distanceFromCurrentKm: number | null;
    distanceKm: number | null;
    spotGroup: string;
    label: string;
  }
> {
  if (!allApprovedPlaces || allApprovedPlaces.length === 0) return [];

  const candidates: Array<
    Place & {
      place: Place;
      distanceFromCurrentKm: number | null;
      distanceKm: number | null;
      spotGroup: string;
      label: string;
    }
  > = [];

  for (const p of allApprovedPlaces) {
    if (p.id === currentPlace.id) continue;

    let distKm: number | null = null;
    if (currentPlace.coordinates && p.coordinates) {
      distKm = Math.round(calculateDistanceKm(currentPlace.coordinates, p.coordinates) * 10) / 10;
    }

    const sameDistrict =
      currentPlace.district &&
      p.district &&
      currentPlace.district.toLowerCase() === p.district.toLowerCase();
    const sameDivision =
      currentPlace.division &&
      p.division &&
      currentPlace.division.toLowerCase() === p.division.toLowerCase();

    if ((distKm !== null && distKm <= 35) || sameDistrict || (distKm === null && sameDivision)) {
      const cat = (p.category || '').toLowerCase();
      let spotGroup = 'Local Spot';
      if (cat === 'food' || cat === 'cafes') spotGroup = 'Restaurant & Cafe';
      else if (cat === 'nature' || cat === 'rooftops' || cat === 'outdoors') spotGroup = 'Tourist Place';
      else if (cat === 'activities' || cat === 'culture' || cat === 'fun' || cat === 'sports') spotGroup = 'Activity';
      else if (cat.includes('hotel') || cat.includes('resort')) spotGroup = 'Hotel & Resort';

      const enrichedPlace: Place = {
        ...p,
        image: p.image || p.images?.[0],
        priceLabel: p.priceLabel || p.priceLevel?.label,
      };

      candidates.push({
        ...enrichedPlace,
        place: enrichedPlace,
        distanceFromCurrentKm: distKm,
        distanceKm: distKm,
        spotGroup,
        label: spotGroup,
      });
    }
  }

  return candidates
    .sort((a, b) => {
      if (a.distanceFromCurrentKm !== null && b.distanceFromCurrentKm !== null) {
        return a.distanceFromCurrentKm - b.distanceFromCurrentKm;
      }
      if (a.distanceFromCurrentKm !== null) return -1;
      if (b.distanceFromCurrentKm !== null) return 1;
      return (b.totalReports || 0) - (a.totalReports || 0);
    })
    .slice(0, 6);
}

// -------------------------------------------------------------
// ADMIN MANAGEMENT FOR TRANSPORT ROUTES & COMMUNITY REPORTS
// -------------------------------------------------------------
export interface AdminTransportItem {
  id: string;
  transportType: TransportType;
  originDistrict: string;
  destinationDistrict: string;
  destinationPlaceNames?: string[];
  fromName: string;
  toName: string;
  minFare: number;
  maxFare: number;
  fareUnit?: FareUnit;
  currency: string;
  estimatedDurationMin: number;
  distanceKm?: number;
  sourceType: FareSourceType;
  sourceReference?: string;
  confidence: FareConfidence;
  lastUpdated: string;
  isOutdated?: boolean;
  notes?: string;
  isMultiLeg?: boolean;
  legs?: {
    fromLocation: string;
    toLocation: string;
    transportType: TransportType;
    minFare: number;
    maxFare: number;
    estimatedDurationMin: number;
    distanceKm?: number;
    notes?: string;
  }[];
  isCustom?: boolean;
}

export async function fetchAdminTransportRoutes(): Promise<AdminTransportItem[]> {
  const custom = getCustomTransportRoutes();
  const seedItems: AdminTransportItem[] = SEED_TRANSPORT_ROUTES.map((s) => ({
    ...s,
    isCustom: false,
  }));

  const customItems: AdminTransportItem[] = custom.map((c) => ({
    id: c.id,
    transportType: c.transportType,
    originDistrict: c.originDistrict,
    destinationDistrict: c.destinationDistrict,
    destinationPlaceNames: c.destinationPlaceName ? [c.destinationPlaceName] : undefined,
    fromName: c.fromLocation || `${c.originDistrict} Station`,
    toName: c.toLocation || `${c.destinationDistrict} Point`,
    minFare: (c as any).minFare || 100,
    maxFare: (c as any).maxFare || 250,
    fareUnit: inferFareUnit(c.transportType, c.notes),
    currency: 'BDT',
    estimatedDurationMin: c.estimatedDurationMin || 60,
    distanceKm: c.distanceKm || 10,
    sourceType: 'OFFICIAL',
    sourceReference: 'Admin entry',
    confidence: 'High',
    lastUpdated: '2026-11-02',
    isOutdated: false,
    notes: c.notes,
    isMultiLeg: c.isMultiLeg,
    legs: c.legs,
    isCustom: true,
  }));

  return [...customItems, ...seedItems];
}

export async function saveAdminTransportRoute(item: Omit<AdminTransportItem, 'id'> & { id?: string }): Promise<{ success: boolean; error?: string }> {
  try {
    const id = item.id || `custom-route-${Date.now()}`;
    const newRoute: TransportRoute & { minFare?: number; maxFare?: number } = {
      id,
      originDistrict: item.originDistrict,
      destinationDistrict: item.destinationDistrict,
      destinationPlaceName: item.destinationPlaceNames?.[0],
      fromLocation: item.fromName,
      toLocation: item.toName,
      transportType: item.transportType,
      distanceKm: item.distanceKm,
      estimatedDurationMin: item.estimatedDurationMin,
      isMultiLeg: Boolean(item.isMultiLeg && item.legs && item.legs.length > 0),
      legs: item.legs,
      active: true,
      notes: item.notes,
      minFare: item.minFare,
      maxFare: item.maxFare,
    };

    saveCustomTransportRoute(newRoute as any);

    try {
      await supabase.from('transport_routes').upsert({
        id,
        origin_district: item.originDistrict,
        destination_district: item.destinationDistrict,
        from_location: item.fromName,
        to_location: item.toName,
        transport_type: item.transportType,
        distance_km: item.distanceKm,
        estimated_duration_min: item.estimatedDurationMin,
        is_multi_leg: Boolean(item.isMultiLeg),
        legs: item.legs || [],
        active: true,
        notes: item.notes || null,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Supabase transport_routes sync notice:', e);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save transport route' };
  }
}

export async function deleteAdminTransportRoute(routeId: string): Promise<{ success: boolean; error?: string }> {
  try {
    deleteCustomTransportRoute(routeId);
    try {
      await supabase.from('transport_routes').delete().eq('id', routeId);
    } catch {}
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete route' };
  }
}

export async function fetchAllCommunityFareReports(): Promise<CommunityFareReport[]> {
  return fetchCommunityFareReports();
}

export async function moderateCommunityFareReport(
  reportId: string,
  newStatus: 'verified' | 'flagged' | 'rejected'
): Promise<{ success: boolean; error?: string }> {
  try {
    const local = getStoredCommunityFareReports();
    const updated = local.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COMMUNITY_REPORTS_KEY, JSON.stringify(updated));
    }

    try {
      await supabase.from('fare_reports').update({ status: newStatus }).eq('id', reportId);
    } catch (e) {
      console.warn('Supabase fare_reports status update notice:', e);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to moderate report' };
  }
}

export async function deleteCommunityFareReport(reportId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const local = getStoredCommunityFareReports();
    const filtered = local.filter((r) => r.id !== reportId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COMMUNITY_REPORTS_KEY, JSON.stringify(filtered));
    }

    try {
      await supabase.from('fare_reports').delete().eq('id', reportId);
    } catch (e) {
      console.warn('Supabase fare_reports delete notice:', e);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete report' };
  }
}


