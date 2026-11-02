import {
  TransportType,
  TransportOption,
  TransportRoute,
  TransportFare,
  CommunityFareReport,
  FareSourceType,
  FareConfidence,
  Place,
  Coordinates,
} from '../types/outera';
import { supabase, getCurrentUser } from './supabase';
import { calculateDistanceKm } from './location';

const CUSTOM_ROUTES_KEY = 'outera_custom_transport_routes';
const CUSTOM_FARES_KEY = 'outera_custom_transport_fares';
const COMMUNITY_REPORTS_KEY = 'outera_community_fare_reports';

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
// (Generates real, tailored transit options based on actual calculated distance)
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
      currency: 'BDT',
      estimatedDurationMin: Math.max(8, Math.round(roundedDist * 5 + 4)),
      distanceKm: roundedDist,
      sourceType: 'COMMUNITY',
      sourceReference: 'Regular local manual / paddle rickshaw fare consensus',
      confidence: 'High',
      lastUpdated: today,
      notes: 'Bargain before boarding. Rain, peak hours, or bad roads may increase fare by ৳10–20.',
    });

    options.push({
      id: `local-easybike-${roundedDist}`,
      transportType: 'Easy Bike / E-bike',
      fromName: originName,
      toName: destinationName,
      minFare: Math.max(15, Math.round(roundedDist * 10)),
      maxFare: Math.max(30, Math.round(roundedDist * 14 + 10)),
      currency: 'BDT',
      estimatedDurationMin: Math.max(6, Math.round(roundedDist * 4 + 3)),
      distanceKm: roundedDist,
      sourceType: 'ESTIMATED',
      sourceReference: 'Local battery-run auto / easy-bike standard rate',
      confidence: 'Medium',
      lastUpdated: today,
      notes: 'Shared seat fare per passenger. Reserve full auto for 4x fare.',
    });

    options.push({
      id: `local-cng-${roundedDist}`,
      transportType: 'CNG / Auto',
      fromName: originName,
      toName: destinationName,
      minFare: 70,
      maxFare: 110,
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
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 3 + 12),
      distanceKm: roundedDist,
      sourceType: 'COMMUNITY',
      sourceReference: 'Community commuter consensus',
      confidence: 'High',
      lastUpdated: today,
      notes: 'Negotiated flat rate. High traffic peak hours (5 PM – 8 PM) can command ৳30–50 higher.',
    });

    options.push({
      id: `local-bus-${roundedDist}`,
      transportType: 'Bus',
      fromName: originName,
      toName: destinationName,
      minFare: Math.max(15, Math.round(roundedDist * 2.5 + 5)),
      maxFare: Math.max(25, Math.round(roundedDist * 3.5 + 10)),
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 4.5 + 15),
      distanceKm: roundedDist,
      sourceType: 'OFFICIAL',
      sourceReference: 'BRTA Official City Route Bus Fare Ceiling (per km basis)',
      confidence: 'High',
      lastUpdated: '2026-08-10',
      notes: 'Standard public city bus. Digital ticketing (E-ticket / Pass) where available.',
    });

    options.push({
      id: `local-car-${roundedDist}`,
      transportType: 'Private Car',
      fromName: originName,
      toName: destinationName,
      minFare: Math.round(roundedDist * 35 + 120),
      maxFare: Math.round(roundedDist * 52 + 180),
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 3 + 10),
      distanceKm: roundedDist,
      sourceType: 'OPERATOR',
      sourceReference: 'App-based ride-hailing / rental rate estimates',
      confidence: 'Medium',
      lastUpdated: today,
      notes: 'Door-to-door AC car. Subject to real-time dynamic pricing during heavy rain or peak rush.',
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
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 2.2 + 25),
      distanceKm: roundedDist,
      sourceType: 'OFFICIAL',
      sourceReference: 'BRTA Regional Distance Fare Table',
      confidence: 'High',
      lastUpdated: '2026-08-10',
      notes: 'Semi-express / regional highway bus service.',
    });

    options.push({
      id: `local-cng-${roundedDist}`,
      transportType: 'CNG / Auto',
      fromName: originName,
      toName: destinationName,
      minFare: Math.round(roundedDist * 16 + 80),
      maxFare: Math.round(roundedDist * 22 + 120),
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 2 + 15),
      distanceKm: roundedDist,
      sourceType: 'COMMUNITY',
      sourceReference: 'Regional auto commuter consensus',
      confidence: 'Medium',
      lastUpdated: today,
      notes: 'Reserve full vehicle. Return trip fare may be requested if travelling to remote suburban border.',
    });

    options.push({
      id: `local-car-${roundedDist}`,
      transportType: 'Private Car',
      fromName: originName,
      toName: destinationName,
      minFare: Math.round(roundedDist * 32 + 250),
      maxFare: Math.round(roundedDist * 44 + 400),
      currency: 'BDT',
      estimatedDurationMin: Math.round(roundedDist * 1.8 + 15),
      distanceKm: roundedDist,
      sourceType: 'OPERATOR',
      sourceReference: 'Microbus / Sedan rental day rate estimate',
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
    currency: 'BDT',
    estimatedDurationMin: Math.round(roundedDist * 1.6 + 40),
    distanceKm: roundedDist,
    sourceType: 'OPERATOR',
    sourceReference: 'Inter-district highway coach operators',
    confidence: 'Medium',
    lastUpdated: today,
    notes: 'Non-AC to AC coach range. Rest stop included for journeys exceeding 2 hours.',
  });

  return options;
}

// -------------------------------------------------------------
// MAIN FARE INTELLIGENCE ENGINE: "HOW TO GET THERE"
// Matches exact inter-district routes, multi-leg tourist trails,
// verified community reports, and proximity algorithms.
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
        minFare: 100,
        maxFare: 200,
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
        fromName: `${origin.name || seed.originDistrict} to ${place.name}`,
        toName: place.name,
      });
    }
  }

  // 3. Check Community Fare Reports consensus for this specific place or corridor
  const communityReports = await fetchCommunityFareReports(place.id, origin.name);
  if (communityReports.length > 0) {
    // Group reports by transport type
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

      // Check if this transport type is already in results; if so, enhance with community data
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
          notes: `${results[existingIdx].notes || ''} (Validated by ${count} recent community scout reports: ৳${minPaid}–৳${maxPaid})`.trim(),
        };
      } else {
        // Add as distinct community verified option
        results.push({
          id: `community-consensus-${tType}-${place.id}`,
          transportType: tType,
          fromName: origin.name,
          toName: place.name,
          minFare: minPaid,
          maxFare: maxPaid,
          currency: 'BDT',
          estimatedDurationMin: 60,
          sourceType: 'COMMUNITY',
          confidence,
          lastUpdated: latestReportDate,
          communityReportsCount: count,
          notes: `Community reported fare based on ${count} verified scout submissions.`,
        });
      }
    }
  }

  // 4. If distance is computable and either:
  //    a) No inter-district match found, or
  //    b) Same district / local journey,
  //    generate dynamic proximity-based options!
  if (origin.coords && place.coordinates) {
    const directDistanceKm = calculateDistanceKm(origin.coords, place.coordinates);
    // Road driving distance is typically 1.25x to 1.35x crow-flies distance
    const roadDistanceKm = Math.round(directDistanceKm * 1.3 * 10) / 10;

    if (results.length === 0 || originDistrict === destDistrict) {
      const proximityOptions = generateLocalProximityOptions(origin.name, place.name, roadDistanceKm);

      // Merge avoiding duplicate transport types if already explicitly seeded
      for (const po of proximityOptions) {
        if (!results.some((r) => r.transportType === po.transportType)) {
          results.push(po);
        }
      }
    }
  }

  // 5. Evaluate outdated flag (if older than 180 days from local time 2026-11-02)
  const currentTimestamp = new Date('2026-11-02').getTime();
  const halfYearMs = 180 * 24 * 60 * 60 * 1000;

  return results.map((opt) => {
    const updatedTime = new Date(opt.lastUpdated).getTime();
    const isOutdated = !isNaN(updatedTime) && currentTimestamp - updatedTime > halfYearMs;
    return {
      ...opt,
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
      currency: 'BDT',
      tripDate,
      notes: input.notes?.trim() || undefined,
      status: 'verified', // Community contributions immediately assist consensus calculations
      createdAt: new Date().toISOString(),
    };

    // Store in local storage first to guarantee persistence across client sessions
    storeCommunityFareReportLocally(report);

    // Attempt insert into Supabase fare_reports if table exists
    try {
      await supabase.from('fare_reports').insert({
        origin: report.origin,
        destination: report.destination,
        destination_place_id: report.destinationPlaceId || null,
        destination_place_name: report.destinationPlaceName || null,
        transport_type: report.transportType,
        fare_paid: report.farePaid,
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

    // Query Supabase fare_reports if available
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
          currency: 'BDT',
          tripDate: d.trip_date || d.created_at?.split('T')[0] || '2026-11-02',
          notes: d.notes,
          status: d.status || 'verified',
          createdAt: d.created_at,
        }));
      }
    } catch {
      // Supabase table not created yet, continue with local
    }

    // Merge avoiding duplicate IDs
    const existingIds = new Set(dbReports.map((r) => r.id));
    const merged = [...dbReports, ...local.filter((l) => !existingIds.has(l.id))];

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

    // Also attempt remote DB insert if tables exist
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
    } catch {
      // ignore
    }
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

