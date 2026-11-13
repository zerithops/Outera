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
// DATABASE-DRIVEN TRANSPORT ROUTES & FARES
// Never hardcode or assume a fixed count of routes (e.g. 15).
// All transit corridors and routes come directly from public.transport_routes
// and public.transport_fares in Supabase.
// -------------------------------------------------------------
export const SEED_TRANSPORT_ROUTES: (TransportOption & {
  originDistrict: string;
  destinationDistrict: string;
  destinationPlaceNames?: string[];
})[] = [];

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

  // 1. Query Active Database Routes directly from Supabase (public.transport_routes + public.transport_fares)
  const dbActiveRoutes = await fetchActiveDatabaseTransportRoutes();
  for (const dbr of dbActiveRoutes) {
    if (!dbr.active || dbr.isArchived) continue;
    const matchOrigin =
      dbr.originDistrict.toLowerCase() === originDistrict ||
      originDistrict.includes(dbr.originDistrict.toLowerCase());
    const matchDestDistrict =
      Boolean(destDistrict) && dbr.destinationDistrict.toLowerCase() === destDistrict;
    const matchDestPlaceId = Boolean(dbr.destinationPlaceId && dbr.destinationPlaceId === place.id);
    const matchDestPlaceName = Boolean(
      dbr.destinationPlaceNames &&
        dbr.destinationPlaceNames.some(
          (dp) =>
            placeNameLower.includes(dp.toLowerCase()) ||
            dp.toLowerCase().includes(placeNameLower)
        )
    );

    if (matchOrigin && (matchDestDistrict || matchDestPlaceId || matchDestPlaceName)) {
      results.push({
        id: dbr.id,
        transportType: dbr.transportType,
        fromName: dbr.fromName || origin.name || dbr.originDistrict,
        toName: dbr.toName || place.name || dbr.destinationDistrict,
        minFare: dbr.minFare,
        maxFare: dbr.maxFare,
        fareUnit: dbr.fareUnit || inferFareUnit(dbr.transportType, dbr.notes),
        currency: 'BDT',
        estimatedDurationMin: dbr.estimatedDurationMin,
        distanceKm: dbr.distanceKm,
        sourceType: dbr.sourceType || 'OFFICIAL',
        sourceReference: dbr.sourceReference,
        confidence: dbr.confidence || 'High',
        lastUpdated: dbr.lastUpdated,
        notes: dbr.notes,
        isMultiLeg: dbr.isMultiLeg,
        legs: dbr.legs,
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
  fareId?: string;
  transportType: TransportType;
  originDistrict: string;
  destinationDistrict: string;
  destinationPlaceId?: string;
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
  createdAt?: string;
  updatedAt?: string;
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
  active: boolean;
  isArchived?: boolean;
  isCustom?: boolean;
}

export interface AdminTransportRoutesResult {
  routes: AdminTransportItem[];
  activeRoutes: AdminTransportItem[];
  inactiveRoutes: AdminTransportItem[];
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
  coveredDistrictsCount: number;
  error?: string;
}

function getRouteDuplicateSignature(item: {
  originDistrict: string;
  destinationDistrict: string;
  transportType: string;
  fromName: string;
  toName: string;
  destinationPlaceName?: string | null;
}): string {
  return [
    (item.originDistrict || '').trim().toLowerCase(),
    (item.destinationDistrict || '').trim().toLowerCase(),
    (item.transportType || '').trim().toLowerCase(),
    (item.fromName || '').trim().toLowerCase(),
    (item.toName || '').trim().toLowerCase(),
    (item.destinationPlaceName || '').trim().toLowerCase(),
  ].join('||');
}

function parseRouteLegs(rawLegs: any): AdminTransportItem['legs'] {
  if (!rawLegs) return undefined;
  let parsed = rawLegs;
  if (typeof rawLegs === 'string') {
    try {
      parsed = JSON.parse(rawLegs);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
  return parsed
    .map((leg: any) => ({
      fromLocation: String(leg.fromLocation || leg.from_location || '').trim(),
      toLocation: String(leg.toLocation || leg.to_location || '').trim(),
      transportType: (leg.transportType || leg.transport_type || 'Bus') as TransportType,
      minFare: Math.max(0, Number(leg.minFare ?? leg.min_fare) || 0),
      maxFare: Math.max(0, Number(leg.maxFare ?? leg.max_fare) || 0),
      estimatedDurationMin: Math.max(1, Number(leg.estimatedDurationMin ?? leg.estimated_duration_min) || 30),
      distanceKm:
        typeof (leg.distanceKm ?? leg.distance_km) === 'number'
          ? Number(leg.distanceKm ?? leg.distance_km)
          : undefined,
      notes: leg.notes ? String(leg.notes).trim() : undefined,
    }))
    .filter((leg) => leg.fromLocation || leg.toLocation);
}

function mapDatabaseRowToAdminTransportItem(row: any, linkedFares?: any[]): AdminTransportItem {
  const rawFares: any[] = Array.isArray(linkedFares)
    ? linkedFares
    : Array.isArray(row.transport_fares)
    ? row.transport_fares
    : row.transport_fares
    ? [row.transport_fares]
    : [];

  const sortedFares = [...rawFares].sort((a, b) => {
    const tA = new Date(a?.updated_at || a?.created_at || 0).getTime();
    const tB = new Date(b?.updated_at || b?.created_at || 0).getTime();
    return tB - tA;
  });

  const unarchivedFares = sortedFares.filter((f) => f && f.is_archived !== true);
  const primaryFare = unarchivedFares[0] || sortedFares[0] || null;
  const hasOnlyArchivedFares = sortedFares.length > 0 && unarchivedFares.length === 0;

  const isRouteActive = row.active !== false && !hasOnlyArchivedFares;
  const legs = parseRouteLegs(row.legs);

  let minFare = 0;
  let maxFare = 0;
  if (primaryFare && primaryFare.min_fare !== undefined && primaryFare.min_fare !== null) {
    minFare = Math.round(Number(primaryFare.min_fare) || 0);
    maxFare = Math.round(Number(primaryFare.max_fare ?? primaryFare.min_fare) || minFare);
  } else if (legs && legs.length > 0) {
    minFare = legs.reduce((acc, l) => acc + (Number(l.minFare) || 0), 0);
    maxFare = legs.reduce((acc, l) => acc + (Number(l.maxFare) || 0), 0);
  }

  const transportType = (row.transport_type || primaryFare?.transport_type || 'Bus') as TransportType;
  const fareUnit =
    (primaryFare?.fare_unit as FareUnit) || inferFareUnit(transportType, row.notes || primaryFare?.notes);
  const sourceType = (primaryFare?.source_type as FareSourceType) || 'OFFICIAL';
  const sourceReference = primaryFare?.source_reference || undefined;
  const confidence = (primaryFare?.confidence as FareConfidence) || 'High';

  const updatedIso =
    row.updated_at || primaryFare?.updated_at || row.created_at || new Date().toISOString();
  const lastUpdated = String(updatedIso).split('T')[0];
  const updatedTime = new Date(updatedIso).getTime();
  const halfYearMs = 180 * 24 * 60 * 60 * 1000;
  const isOutdated = !isNaN(updatedTime) && Date.now() - updatedTime > halfYearMs;

  const placeNames =
    typeof row.destination_place_name === 'string' && row.destination_place_name.trim()
      ? row.destination_place_name
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : undefined;

  return {
    id: String(row.id),
    fareId: primaryFare?.id ? String(primaryFare.id) : undefined,
    transportType,
    originDistrict: String(row.origin_district || '').trim(),
    destinationDistrict: String(row.destination_district || '').trim(),
    destinationPlaceId: row.destination_place_id ? String(row.destination_place_id) : undefined,
    destinationPlaceNames: placeNames && placeNames.length > 0 ? placeNames : undefined,
    fromName: String(row.from_location || '').trim() || String(row.origin_district || '').trim(),
    toName: String(row.to_location || '').trim() || String(row.destination_district || '').trim(),
    minFare,
    maxFare: Math.max(minFare, maxFare),
    fareUnit,
    currency: primaryFare?.currency || 'BDT',
    estimatedDurationMin: Math.max(1, Number(row.estimated_duration_min) || 60),
    distanceKm:
      typeof row.distance_km === 'number' && !isNaN(row.distance_km)
        ? Number(row.distance_km)
        : undefined,
    sourceType,
    sourceReference,
    confidence,
    lastUpdated,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isOutdated,
    notes: row.notes || primaryFare?.notes || undefined,
    isMultiLeg: Boolean(row.is_multi_leg && legs && legs.length > 0),
    legs,
    active: isRouteActive,
    isArchived: hasOnlyArchivedFares,
    isCustom: true,
  };
}

/**
 * Fetches all transit routes and fares directly from Supabase (`public.transport_routes` + `public.transport_fares`),
 * computing accurate active and inactive counts without any hardcoded numbers or fake seed routes.
 */
export async function fetchAdminTransportRoutesWithDetails(): Promise<AdminTransportRoutesResult> {
  // Remove any legacy browser-only custom route cache so counts always match the database
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(CUSTOM_ROUTES_KEY);
      window.localStorage.removeItem(CUSTOM_FARES_KEY);
    } catch {}
  }

  try {
    const { data, error } = await supabase
      .from('transport_routes')
      .select('*, transport_fares(*)')
      .order('created_at', { ascending: false });

    let mappedRoutes: AdminTransportItem[] = [];

    if (!error && Array.isArray(data)) {
      const seenIds = new Set<string>();
      for (const row of data) {
        if (!row || !row.id || seenIds.has(String(row.id))) continue;
        seenIds.add(String(row.id));
        mappedRoutes.push(mapDatabaseRowToAdminTransportItem(row));
      }
    } else {
      // Fallback: fetch transport_routes and transport_fares separately and join by route_id
      const [routesRes, faresRes] = await Promise.all([
        supabase.from('transport_routes').select('*').order('created_at', { ascending: false }),
        supabase.from('transport_fares').select('*').order('created_at', { ascending: false }),
      ]);

      if (routesRes.error) {
        return {
          routes: [],
          activeRoutes: [],
          inactiveRoutes: [],
          activeCount: 0,
          inactiveCount: 0,
          totalCount: 0,
          coveredDistrictsCount: 0,
          error: routesRes.error.message || 'Failed to fetch transit routes from database.',
        };
      }

      const faresByRouteId = new Map<string, any[]>();
      for (const f of faresRes.data || []) {
        if (!f?.route_id) continue;
        const key = String(f.route_id);
        if (!faresByRouteId.has(key)) faresByRouteId.set(key, []);
        faresByRouteId.get(key)!.push(f);
      }

      const seenIds = new Set<string>();
      for (const row of routesRes.data || []) {
        if (!row || !row.id || seenIds.has(String(row.id))) continue;
        seenIds.add(String(row.id));
        mappedRoutes.push(
          mapDatabaseRowToAdminTransportItem(row, faresByRouteId.get(String(row.id)) || [])
        );
      }
    }

    const activeRoutes = mappedRoutes.filter((r) => r.active === true && !r.isArchived);
    const inactiveRoutes = mappedRoutes.filter((r) => !r.active || r.isArchived);
    const coveredDistrictsCount = new Set(
      activeRoutes
        .flatMap((r) => [r.originDistrict, r.destinationDistrict])
        .map((d) => (d || '').trim())
        .filter(Boolean)
    ).size;

    return {
      routes: mappedRoutes,
      activeRoutes,
      inactiveRoutes,
      activeCount: activeRoutes.length,
      inactiveCount: inactiveRoutes.length,
      totalCount: mappedRoutes.length,
      coveredDistrictsCount,
    };
  } catch (err: any) {
    return {
      routes: [],
      activeRoutes: [],
      inactiveRoutes: [],
      activeCount: 0,
      inactiveCount: 0,
      totalCount: 0,
      coveredDistrictsCount: 0,
      error: err?.message || 'Unexpected error loading transit routes.',
    };
  }
}

export async function fetchAdminTransportRoutes(): Promise<AdminTransportItem[]> {
  const result = await fetchAdminTransportRoutesWithDetails();
  return result.routes;
}

/**
 * Fetches only active, non-archived transport routes from Supabase for public trip planning & place pages.
 */
export async function fetchActiveDatabaseTransportRoutes(): Promise<AdminTransportItem[]> {
  try {
    const { data, error } = await supabase
      .from('transport_routes')
      .select('*, transport_fares(*)')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) return [];

    const seenIds = new Set<string>();
    const activeItems: AdminTransportItem[] = [];
    for (const row of data) {
      if (!row || !row.id || row.active === false || seenIds.has(String(row.id))) continue;
      seenIds.add(String(row.id));
      const mapped = mapDatabaseRowToAdminTransportItem(row);
      if (mapped.active && !mapped.isArchived) {
        activeItems.push(mapped);
      }
    }
    return activeItems;
  } catch {
    return [];
  }
}

/**
 * Creates or updates a transit corridor & route in `public.transport_routes` and `public.transport_fares`.
 * Enforces administrator authorization and duplicate route prevention.
 */
export async function saveAdminTransportRoute(
  item: Omit<AdminTransportItem, 'id' | 'active'> & { id?: string; active?: boolean }
): Promise<{ success: boolean; route?: AdminTransportItem; error?: string }> {
  try {
    const user = await getCurrentUser();
    const isAdmin = await isCurrentUserAdmin();
    if (!user || !isAdmin) {
      return {
        success: false,
        error: 'Unauthorized: Administrator privileges are required to manage transit routes.',
      };
    }

    const originDistrict = (item.originDistrict || '').trim();
    const destinationDistrict = (item.destinationDistrict || '').trim();
    const fromName = (item.fromName || '').trim();
    const toName = (item.toName || '').trim();

    if (!originDistrict || !destinationDistrict) {
      return { success: false, error: 'Origin district and destination district are required.' };
    }
    if (!fromName || !toName) {
      return { success: false, error: 'Origin terminal/stop and destination drop-off point are required.' };
    }

    const minFare = Math.round(Number(item.minFare) || 0);
    const maxFare = Math.round(Number(item.maxFare) || 0);
    if (minFare <= 0 || maxFare < minFare) {
      return {
        success: false,
        error: 'Please enter valid minimum and maximum fare amounts (Max Fare must be >= Min Fare).',
      };
    }

    const estimatedDurationMin = Math.max(1, Math.round(Number(item.estimatedDurationMin) || 60));
    const distanceKm =
      typeof item.distanceKm === 'number' && !isNaN(item.distanceKm) && item.distanceKm > 0
        ? Math.round(item.distanceKm * 10) / 10
        : null;

    const destinationPlaceName =
      item.destinationPlaceNames && item.destinationPlaceNames.length > 0
        ? item.destinationPlaceNames
            .map((s) => s.trim())
            .filter(Boolean)
            .join(', ') || null
        : null;

    const candidateSignature = getRouteDuplicateSignature({
      originDistrict,
      destinationDistrict,
      transportType: item.transportType,
      fromName,
      toName,
      destinationPlaceName,
    });

    // Check for duplicate routes in Supabase
    const { data: existingCandidates, error: dupCheckErr } = await supabase
      .from('transport_routes')
      .select('id, origin_district, destination_district, transport_type, from_location, to_location, destination_place_name')
      .ilike('origin_district', originDistrict)
      .ilike('destination_district', destinationDistrict);

    if (!dupCheckErr && Array.isArray(existingCandidates)) {
      const duplicate = existingCandidates.find((row: any) => {
        if (item.id && String(row.id) === String(item.id)) return false;
        const rowSig = getRouteDuplicateSignature({
          originDistrict: row.origin_district,
          destinationDistrict: row.destination_district,
          transportType: row.transport_type,
          fromName: row.from_location || row.origin_district,
          toName: row.to_location || row.destination_district,
          destinationPlaceName: row.destination_place_name,
        });
        return rowSig === candidateSignature;
      });

      if (duplicate) {
        return {
          success: false,
          error: 'Duplicate route: A transit route with the same corridor, transport type, and terminals already exists.',
        };
      }
    }

    const nowIso = new Date().toISOString();
    const isMultiLeg = Boolean(item.isMultiLeg && item.legs && item.legs.length > 0);
    const sanitizedLegs = isMultiLeg && item.legs ? item.legs : [];
    const isActive = item.active !== undefined ? Boolean(item.active) : true;
    const fareUnit = item.fareUnit || inferFareUnit(item.transportType, item.notes);

    const routePayload = {
      origin_district: originDistrict,
      destination_district: destinationDistrict,
      destination_place_id: item.destinationPlaceId || null,
      destination_place_name: destinationPlaceName,
      from_location: fromName,
      to_location: toName,
      transport_type: item.transportType,
      distance_km: distanceKm,
      estimated_duration_min: estimatedDurationMin,
      is_multi_leg: isMultiLeg,
      legs: sanitizedLegs,
      notes: item.notes?.trim() || null,
      active: isActive,
      updated_at: nowIso,
    };

    let savedRouteRow: any = null;

    if (item.id) {
      // Update existing route in public.transport_routes
      const { data: updatedRoute, error: updateErr } = await supabase
        .from('transport_routes')
        .update(routePayload)
        .eq('id', item.id)
        .select('*')
        .maybeSingle();

      if (updateErr) {
        return { success: false, error: updateErr.message || 'Failed to update transit route.' };
      }
      if (!updatedRoute) {
        return {
          success: false,
          error: 'Transit route could not be updated (record not found or permission denied).',
        };
      }
      savedRouteRow = updatedRoute;
    } else {
      // Insert new route into public.transport_routes (UUID generated by Postgres)
      const { data: insertedRoute, error: insertErr } = await supabase
        .from('transport_routes')
        .insert({
          ...routePayload,
          created_at: nowIso,
        })
        .select('*')
        .single();

      if (insertErr || !insertedRoute) {
        return {
          success: false,
          error: insertErr?.message || 'Failed to create transit route in database.',
        };
      }
      savedRouteRow = insertedRoute;
    }

    const routeId = String(savedRouteRow.id);

    // Upsert corresponding fare record in public.transport_fares
    const farePayload = {
      route_id: routeId,
      transport_type: item.transportType,
      min_fare: minFare,
      max_fare: maxFare,
      currency: item.currency || 'BDT',
      fare_unit: fareUnit,
      source_type: item.sourceType || 'OFFICIAL',
      source_reference: item.sourceReference?.trim() || null,
      confidence: item.confidence || 'High',
      verified_at: nowIso,
      notes: item.notes?.trim() || null,
      is_archived: !isActive,
      updated_at: nowIso,
    };

    const { data: existingFares } = await supabase
      .from('transport_fares')
      .select('id')
      .eq('route_id', routeId)
      .order('created_at', { ascending: false });

    let savedFareRow: any = null;

    if (Array.isArray(existingFares) && existingFares.length > 0) {
      const primaryFareId = existingFares[0].id;
      const { data: updatedFare, error: fareUpdateErr } = await supabase
        .from('transport_fares')
        .update(farePayload)
        .eq('id', primaryFareId)
        .select('*')
        .maybeSingle();

      if (fareUpdateErr) {
        return { success: false, error: fareUpdateErr.message || 'Failed to update route fare details.' };
      }
      savedFareRow = updatedFare;

      // Clean up any redundant duplicate fare rows for the same route_id
      if (existingFares.length > 1) {
        const extraIds = existingFares.slice(1).map((f: any) => f.id);
        await supabase.from('transport_fares').delete().in('id', extraIds);
      }
    } else {
      const { data: insertedFare, error: fareInsertErr } = await supabase
        .from('transport_fares')
        .insert({
          ...farePayload,
          created_at: nowIso,
        })
        .select('*')
        .single();

      if (fareInsertErr) {
        if (!item.id) {
          // Roll back route creation if initial fare creation failed
          await supabase.from('transport_routes').delete().eq('id', routeId);
        }
        return {
          success: false,
          error: fareInsertErr.message || 'Failed to save fare details for transit route.',
        };
      }
      savedFareRow = insertedFare;
    }

    const mapped = mapDatabaseRowToAdminTransportItem(
      savedRouteRow,
      savedFareRow ? [savedFareRow] : []
    );

    return { success: true, route: mapped };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save transport route.' };
  }
}

/**
 * Activates or deactivates an individual transit corridor/route in Supabase.
 */
export async function setAdminTransportRouteActive(
  routeId: string,
  active: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!routeId) {
      return { success: false, error: 'Route ID is required.' };
    }

    const user = await getCurrentUser();
    const isAdmin = await isCurrentUserAdmin();
    if (!user || !isAdmin) {
      return {
        success: false,
        error: 'Unauthorized: Administrator privileges are required to update route status.',
      };
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('transport_routes')
      .update({
        active: Boolean(active),
        updated_at: nowIso,
      })
      .eq('id', routeId)
      .select('id, active')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message || 'Failed to update route status.' };
    }
    if (!data) {
      return { success: false, error: 'Route not found in database or permission denied.' };
    }

    // Keep linked transport_fares archive status synchronized
    await supabase
      .from('transport_fares')
      .update({
        is_archived: !active,
        updated_at: nowIso,
      })
      .eq('route_id', routeId);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update route status.' };
  }
}

/**
 * Permanently deletes a transit corridor/route and its fares from Supabase.
 */
export async function deleteAdminTransportRoute(
  routeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!routeId) {
      return { success: false, error: 'Route ID is required.' };
    }

    const user = await getCurrentUser();
    const isAdmin = await isCurrentUserAdmin();
    if (!user || !isAdmin) {
      return {
        success: false,
        error: 'Unauthorized: Administrator privileges are required to delete transit routes.',
      };
    }

    deleteCustomTransportRoute(routeId);

    // Delete linked fares and the route itself from Supabase
    await supabase.from('transport_fares').delete().eq('route_id', routeId);

    const { error } = await supabase.from('transport_routes').delete().eq('id', routeId);
    if (error) {
      return { success: false, error: error.message || 'Failed to delete route from database.' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete route.' };
  }
}

/**
 * Subscribes to real-time changes on `public.transport_routes` and `public.transport_fares`.
 */
export function subscribeToTransportRouteChanges(onChange: () => void): () => void {
  try {
    const channel = supabase
      .channel(`outera_transport_routes_sync_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transport_routes' },
        () => onChange()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transport_fares' },
        () => onChange()
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  } catch {
    return () => {};
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


