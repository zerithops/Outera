import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Compass,
  MapPin,
  Navigation,
  Plus,
  Trash2,
  Share2,
  Check,
  ArrowUp,
  ArrowDown,
  Wallet,
  Users,
  CheckSquare,
  Square,
  ShieldAlert,
  Phone,
  Route,
  Bus,
  Hotel,
  Utensils,
  Sparkles,
  Copy,
  Save,
  FolderOpen,
  ExternalLink,
  Clock,
  Info,
  RefreshCw,
} from 'lucide-react';
import {
  Coordinates,
  NearbyServiceItem,
  Place,
  RouteLegGeometry,
  TouristEmergencyContact,
  TransportOption,
  TripChecklistItem,
  TripDayStop,
  TripExpenseCategory,
  TripExpenseContribution,
  TripMember,
  TripPlan,
  TripPreferenceTag,
  TripTimeSlot,
  UserLocation,
} from '../types/outera';
import { BANGLADESH_DIVISIONS } from '../data/bangladeshLocations';
import {
  calculateSmartTripBudget,
  calculateTripRouteGeometry,
  deleteTripPlanFromSupabase,
  extractPlaceDatabaseSpendRange,
  fetchTouristEmergencyContacts,
  fetchTripByShareTokenOrId,
  fetchUserTripPlans,
  findDistrictInfo,
  generateSmartChecklist,
  generateSmartItineraryStops,
  generateUuid,
  getTripDestinationServices,
  getTripTransportOptions,
  normalizeStopsOrdering,
  optimizeTripStopsOrder,
  saveTripPlanToSupabase,
} from '../services/tripPlanner';
import { TripRouteMap } from './TripRouteMap';

interface TripPlannerViewProps {
  allPlaces: Place[];
  currentLocation: UserLocation;
  authUser: any;
  initialSharedTripToken?: string | null;
  preselectedPlace?: Place | null;
  onClearPreselectedPlace?: () => void;
  onSelectPlaceDetails?: (place: Place) => void;
  onRequireAuth?: (action: string) => void;
}

const PREFERENCE_OPTIONS: TripPreferenceTag[] = [
  'Outdoors & Nature',
  'Food & Cafes',
  'Chill & Scenic',
  'Fun & Activities',
  'Heritage & Culture',
  'Budget-Friendly',
  'Family & Group',
];

const EXPENSE_CATEGORIES: TripExpenseCategory[] = [
  'Transport',
  'Hotel/Resort',
  'Food',
  'Entry Tickets',
  'Local Transport',
  'Other',
];

const ALL_DISTRICTS: { name: string; division: string; coords: Coordinates }[] =
  BANGLADESH_DIVISIONS.flatMap((div) =>
    div.districts.map((d) => ({
      name: d.name,
      division: div.name,
      coords: d.coords,
    }))
  );

function createDefaultTrip(
  allPlaces: Place[],
  currentLocation: UserLocation,
  authUser: any,
  preselectedPlace?: Place | null
): TripPlan {
  const tripId = generateUuid();
  const shareToken = tripId.replace(/-/g, '').slice(0, 12);

  // Pick destination based on preselectedPlace or popular district with approved places
  const defaultDestDistrict =
    preselectedPlace?.district ||
    (allPlaces.some((p) => p.district?.toLowerCase() === "cox's bazar")
      ? "Cox's Bazar"
      : allPlaces[0]?.district || "Cox's Bazar");

  const destInfo = findDistrictInfo(defaultDestDistrict);
  const originDistrict =
    currentLocation.district && currentLocation.district !== 'Nearby Area'
      ? currentLocation.district
      : 'Dhaka';
  const originName =
    currentLocation.neighborhoodName && currentLocation.neighborhoodName !== 'Location not set'
      ? `${currentLocation.neighborhoodName}, ${originDistrict}`
      : originDistrict;

  const durationDays = 3;
  const preferences: TripPreferenceTag[] = ['Outdoors & Nature', 'Food & Cafes', 'Chill & Scenic'];
  const explicitIds = preselectedPlace ? [preselectedPlace.id] : [];

  const stops = generateSmartItineraryStops({
    tripId,
    allApprovedPlaces: allPlaces,
    destinationDivision: destInfo.division,
    destinationDistrict: destInfo.district,
    durationDays,
    preferences,
    explicitSelectedPlaceIds: explicitIds,
  });

  const checklist = generateSmartChecklist({
    tripId,
    destinationDivision: destInfo.division,
    destinationDistrict: destInfo.district,
    durationDays,
  });

  const organizerName =
    authUser?.user_metadata?.display_name ||
    authUser?.email?.split('@')[0] ||
    'Lead Scout';

  const defaultMembers: TripMember[] = [
    {
      id: `mem-${tripId}-1`,
      tripId,
      userId: authUser?.id || null,
      name: organizerName,
      handleOrContact: authUser?.email || '@organizer',
      role: 'Organizer',
    },
  ];

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return {
    id: tripId,
    userId: authUser?.id || null,
    ownerName: organizerName,
    title: `${destInfo.district} ${durationDays}-Day Scout Expedition`,
    originName,
    originDistrict,
    originCoords: currentLocation.coords || { lat: 23.8103, lng: 90.4125 },
    destinationDivision: destInfo.division,
    destinationDistrict: destInfo.district,
    startDate: tomorrow,
    durationDays,
    travelersCount: 2,
    totalBudgetBdt: 15000,
    preferences,
    selectedTransportId: null,
    selectedStayId: null,
    roundTripTransport: true,
    customBudgetOverrides: {},
    stops,
    checklist,
    members: defaultMembers,
    expenses: [],
    isPublicShared: true,
    shareToken,
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const TripPlannerView: React.FC<TripPlannerViewProps> = ({
  allPlaces,
  currentLocation,
  authUser,
  initialSharedTripToken,
  preselectedPlace,
  onClearPreselectedPlace,
  onSelectPlaceDetails,
  onRequireAuth,
}) => {
  const [trip, setTrip] = useState<TripPlan>(() =>
    createDefaultTrip(allPlaces, currentLocation, authUser, preselectedPlace)
  );
  const [savedTrips, setSavedTrips] = useState<TripPlan[]>([]);
  const [activeSection, setActiveSection] = useState<
    'itinerary' | 'route' | 'budget' | 'checklist' | 'emergency'
  >('itinerary');
  const [isReadOnlyShared, setIsReadOnlyShared] = useState(false);

  // Place Picker & Search State
  const [placeSearchQuery, setPlaceSearchQuery] = useState('');
  const [showAllBangladeshPlaces, setShowAllBangladeshPlaces] = useState(false);
  const [targetDayForAdding, setTargetDayForAdding] = useState<number>(1);

  // Route & Transport Data State
  const [routeLegs, setRouteLegs] = useState<RouteLegGeometry[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [totalRouteDistanceKm, setTotalRouteDistanceKm] = useState(0);
  const [totalRouteDurationMin, setTotalRouteDurationMin] = useState(0);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [mapDayFilter, setMapDayFilter] = useState<number | 'all'>('all');

  // Available DB Transport, Stays & Emergency Contacts
  const [transportOptions, setTransportOptions] = useState<TransportOption[]>([]);
  const [availableStays, setAvailableStays] = useState<NearbyServiceItem[]>([]);
  const [availableEateries, setAvailableEateries] = useState<NearbyServiceItem[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<TouristEmergencyContact[]>([]);

  // Checklist custom item input
  const [newChecklistLabel, setNewChecklistLabel] = useState('');
  const [newChecklistCategory, setNewChecklistCategory] = useState('Essentials & ID');

  // Group Members & Expense Contribution inputs
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberContact, setNewMemberContact] = useState('');
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<TripExpenseCategory>('Transport');
  const [expensePaidBy, setExpensePaidBy] = useState('');

  // Status & Feedback Toasts
  const [savingTrip, setSavingTrip] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [confirmDeleteTripId, setConfirmDeleteTripId] = useState<string | null>(null);
  const [showSavedTripsDrawer, setShowSavedTripsDrawer] = useState(false);

  const notifyStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Load user's saved trips
  const refreshSavedTrips = useCallback(async () => {
    const list = await fetchUserTripPlans();
    setSavedTrips(list);
  }, []);

  useEffect(() => {
    refreshSavedTrips();
  }, [refreshSavedTrips, authUser]);

  // If allPlaces finishes loading and current trip has 0 stops, populate initial stops
  useEffect(() => {
    if (allPlaces.length > 0 && trip.stops.length === 0 && !initialSharedTripToken) {
      const generated = generateSmartItineraryStops({
        tripId: trip.id,
        allApprovedPlaces: allPlaces,
        destinationDivision: trip.destinationDivision,
        destinationDistrict: trip.destinationDistrict,
        durationDays: trip.durationDays,
        preferences: trip.preferences,
        explicitSelectedPlaceIds: preselectedPlace ? [preselectedPlace.id] : [],
      });
      if (generated.length > 0) {
        setTrip((prev) => ({ ...prev, stops: generated }));
      }
    }
  }, [allPlaces]);

  // Handle preselectedPlace ("Add to Trip Plan" from PlaceDetailsModal)
  useEffect(() => {
    if (!preselectedPlace) return;
    setTrip((prev) => {
      const alreadyExists = prev.stops.some((s) => s.placeId === preselectedPlace.id);
      if (alreadyExists) return prev;

      const spend = extractPlaceDatabaseSpendRange(preselectedPlace);
      const newStop: TripDayStop = {
        id: `stop-${prev.id}-${preselectedPlace.id}-${Date.now()}`,
        tripId: prev.id,
        placeId: preselectedPlace.id,
        placeName: preselectedPlace.name,
        placeCategory: preselectedPlace.category,
        placeDistrict: preselectedPlace.district,
        placeNeighborhood: preselectedPlace.neighborhood || preselectedPlace.address,
        coordinates: preselectedPlace.coordinates || null,
        dayNumber: 1,
        stopOrder: prev.stops.filter((s) => s.dayNumber === 1).length,
        timeSlot: 'Afternoon',
        estimatedSpendMin: spend.min,
        estimatedSpendMax: spend.max,
        priceSourceLabel: spend.sourceLabel,
        bestTimeHint: preselectedPlace.bestTimeToVisit,
        image: preselectedPlace.image || preselectedPlace.images?.[0],
      };

      return {
        ...prev,
        destinationDistrict: preselectedPlace.district || prev.destinationDistrict,
        destinationDivision: preselectedPlace.division || prev.destinationDivision,
        stops: normalizeStopsOrdering([...prev.stops, newStop]),
      };
    });
    notifyStatus(`Added "${preselectedPlace.name}" to your trip itinerary.`);
    if (onClearPreselectedPlace) onClearPreselectedPlace();
  }, [preselectedPlace, onClearPreselectedPlace]);

  // Handle shared trip token from URL (#trip/<token>)
  useEffect(() => {
    if (!initialSharedTripToken) return;
    let active = true;
    fetchTripByShareTokenOrId(initialSharedTripToken).then((found) => {
      if (active && found) {
        setTrip(found);
        const isOwner = Boolean(authUser && found.userId && authUser.id === found.userId);
        setIsReadOnlyShared(!isOwner);
      }
    });
    return () => {
      active = false;
    };
  }, [initialSharedTripToken, authUser]);

  // Load destination transport options, nearby stays/eateries, and emergency info
  useEffect(() => {
    let active = true;
    const representativePlace =
      allPlaces.find(
        (p) => p.district?.toLowerCase() === trip.destinationDistrict.toLowerCase()
      ) || null;

    Promise.all([
      getTripTransportOptions({
        originName: trip.originName,
        originDistrict: trip.originDistrict,
        originCoords: trip.originCoords,
        destinationDistrict: trip.destinationDistrict,
        representativePlace,
      }),
      getTripDestinationServices(trip.destinationDistrict, allPlaces),
      fetchTouristEmergencyContacts(trip.destinationDistrict, String(trip.destinationDivision)),
    ]).then(([transOpts, services, emgList]) => {
      if (!active) return;
      setTransportOptions(transOpts);
      setAvailableStays(services.stays);
      setAvailableEateries(services.eateries);
      setEmergencyContacts(emgList);

      // Auto-select first verified transport option if none selected
      setTrip((prev) => ({
        ...prev,
        selectedTransportId:
          prev.selectedTransportId && transOpts.some((t) => t.id === prev.selectedTransportId)
            ? prev.selectedTransportId
            : transOpts[0]?.id || null,
      }));
    });

    return () => {
      active = false;
    };
  }, [
    trip.originDistrict,
    trip.originName,
    trip.destinationDistrict,
    trip.destinationDivision,
    allPlaces,
  ]);

  // Calculate OSRM route geometry & distances whenever itinerary stops change
  useEffect(() => {
    let active = true;
    setLoadingRoute(true);
    calculateTripRouteGeometry(trip.stops)
      .then((res) => {
        if (!active) return;
        setRouteLegs(res.legs);
        setRouteCoordinates(res.allCoordinates);
        setTotalRouteDistanceKm(res.totalDistanceKm);
        setTotalRouteDurationMin(res.totalDurationMin);
      })
      .finally(() => {
        if (active) setLoadingRoute(false);
      });

    return () => {
      active = false;
    };
  }, [trip.stops]);

  // Compute Smart Budget Breakdown
  const budgetBreakdown = useMemo(() => {
    return calculateSmartTripBudget({
      trip,
      availableTransportOptions: transportOptions,
      availableStays,
      intraCityDistanceKm: totalRouteDistanceKm,
    });
  }, [trip, transportOptions, availableStays, totalRouteDistanceKm]);

  // Destination coordinates for map fallback
  const destinationInfo = useMemo(
    () => findDistrictInfo(trip.destinationDistrict),
    [trip.destinationDistrict]
  );

  // Filter candidate OUTERA places for adding to itinerary
  const candidatePlaces = useMemo(() => {
    const query = placeSearchQuery.trim().toLowerCase();
    return allPlaces.filter((p) => {
      const inDest =
        showAllBangladeshPlaces ||
        p.district?.toLowerCase() === trip.destinationDistrict.toLowerCase() ||
        p.division?.toLowerCase() === String(trip.destinationDivision).toLowerCase();
      if (!inDest) return false;
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        p.neighborhood?.toLowerCase().includes(query) ||
        p.district?.toLowerCase().includes(query)
      );
    });
  }, [allPlaces, trip.destinationDistrict, trip.destinationDivision, placeSearchQuery, showAllBangladeshPlaces]);

  // Handlers
  const handleDestinationDistrictChange = (newDistrict: string) => {
    if (isReadOnlyShared) return;
    const info = findDistrictInfo(newDistrict);
    const updatedStops = generateSmartItineraryStops({
      tripId: trip.id,
      allApprovedPlaces: allPlaces,
      destinationDivision: info.division,
      destinationDistrict: info.district,
      durationDays: trip.durationDays,
      preferences: trip.preferences,
      explicitSelectedPlaceIds: [],
    });
    const updatedChecklist = generateSmartChecklist({
      tripId: trip.id,
      destinationDivision: info.division,
      destinationDistrict: info.district,
      durationDays: trip.durationDays,
    });

    setTrip((prev) => ({
      ...prev,
      title: `${info.district} ${prev.durationDays}-Day Scout Expedition`,
      destinationDivision: info.division,
      destinationDistrict: info.district,
      selectedTransportId: null,
      selectedStayId: null,
      stops: updatedStops,
      checklist: updatedChecklist,
    }));
  };

  const handleOriginDistrictChange = (newOriginDistrict: string) => {
    if (isReadOnlyShared) return;
    const info = findDistrictInfo(newOriginDistrict);
    setTrip((prev) => ({
      ...prev,
      originDistrict: info.district,
      originName: info.district,
      originCoords: info.coords,
      selectedTransportId: null,
    }));
  };

  const handleRegenerateItinerary = () => {
    if (isReadOnlyShared) return;
    const generatedStops = generateSmartItineraryStops({
      tripId: trip.id,
      allApprovedPlaces: allPlaces,
      destinationDivision: String(trip.destinationDivision),
      destinationDistrict: trip.destinationDistrict,
      durationDays: trip.durationDays,
      preferences: trip.preferences,
      explicitSelectedPlaceIds: [],
    });
    const generatedChecklist = generateSmartChecklist({
      tripId: trip.id,
      destinationDivision: String(trip.destinationDivision),
      destinationDistrict: trip.destinationDistrict,
      durationDays: trip.durationDays,
    });
    setTrip((prev) => ({
      ...prev,
      stops: generatedStops,
      checklist: generatedChecklist,
    }));
    notifyStatus(
      `Generated ${generatedStops.length} approved OUTERA stops across ${trip.durationDays} day(s) in ${trip.destinationDistrict}.`
    );
  };

  const handleTogglePreference = (pref: TripPreferenceTag) => {
    if (isReadOnlyShared) return;
    setTrip((prev) => {
      const exists = prev.preferences.includes(pref);
      const nextPrefs = exists
        ? prev.preferences.filter((p) => p !== pref)
        : [...prev.preferences, pref];
      return { ...prev, preferences: nextPrefs };
    });
  };

  const handleTogglePlaceInTrip = (place: Place, dayNum = targetDayForAdding) => {
    if (isReadOnlyShared) return;
    setTrip((prev) => {
      const existing = prev.stops.find((s) => s.placeId === place.id);
      if (existing) {
        return {
          ...prev,
          stops: normalizeStopsOrdering(prev.stops.filter((s) => s.placeId !== place.id)),
        };
      }

      const safeDay = Math.min(Math.max(1, dayNum), prev.durationDays);
      const dayStopsCount = prev.stops.filter((s) => s.dayNumber === safeDay).length;
      const spend = extractPlaceDatabaseSpendRange(place);
      const newStop: TripDayStop = {
        id: `stop-${prev.id}-${place.id}-${Date.now()}`,
        tripId: prev.id,
        placeId: place.id,
        placeName: place.name,
        placeCategory: place.category,
        placeDistrict: place.district,
        placeNeighborhood: place.neighborhood || place.address,
        coordinates: place.coordinates || null,
        dayNumber: safeDay,
        stopOrder: dayStopsCount,
        timeSlot: dayStopsCount === 0 ? 'Morning' : dayStopsCount === 1 ? 'Afternoon' : 'Evening',
        estimatedSpendMin: spend.min,
        estimatedSpendMax: spend.max,
        priceSourceLabel: spend.sourceLabel,
        bestTimeHint: place.bestTimeToVisit,
        image: place.image || place.images?.[0],
      };

      return {
        ...prev,
        stops: normalizeStopsOrdering([...prev.stops, newStop]),
      };
    });
  };

  const handleMoveStopOrder = (stopId: string, direction: 'up' | 'down') => {
    if (isReadOnlyShared) return;
    setTrip((prev) => {
      const target = prev.stops.find((s) => s.id === stopId);
      if (!target) return prev;

      const sameDayStops = prev.stops
        .filter((s) => s.dayNumber === target.dayNumber)
        .sort((a, b) => a.stopOrder - b.stopOrder);
      const idx = sameDayStops.findIndex((s) => s.id === stopId);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sameDayStops.length) return prev;

      const reorderedDay = [...sameDayStops];
      const [moved] = reorderedDay.splice(idx, 1);
      reorderedDay.splice(swapIdx, 0, moved);

      const slots: TripTimeSlot[] = ['Morning', 'Afternoon', 'Evening'];
      const updatedSameDay = reorderedDay.map((s, i) => ({
        ...s,
        stopOrder: i,
        timeSlot: slots[Math.min(i, slots.length - 1)],
      }));

      const otherStops = prev.stops.filter((s) => s.dayNumber !== target.dayNumber);
      return {
        ...prev,
        stops: normalizeStopsOrdering([...otherStops, ...updatedSameDay]),
      };
    });
  };

  const handleChangeStopDay = (stopId: string, newDay: number) => {
    if (isReadOnlyShared) return;
    setTrip((prev) => {
      const updated = prev.stops.map((s) =>
        s.id === stopId
          ? {
              ...s,
              dayNumber: newDay,
              stopOrder: prev.stops.filter((x) => x.dayNumber === newDay).length,
            }
          : s
      );
      return { ...prev, stops: normalizeStopsOrdering(updated) };
    });
  };

  const handleChangeStopSlot = (stopId: string, slot: TripTimeSlot) => {
    if (isReadOnlyShared) return;
    setTrip((prev) => ({
      ...prev,
      stops: prev.stops.map((s) => (s.id === stopId ? { ...s, timeSlot: slot } : s)),
    }));
  };

  const handleOptimizeRouteOrder = () => {
    if (isReadOnlyShared) return;
    setTrip((prev) => ({
      ...prev,
      stops: optimizeTripStopsOrder(prev.stops, prev.durationDays, prev.originCoords),
    }));
    notifyStatus('Optimized visiting order by geographic proximity and time-of-day.');
  };

  const handleSaveTrip = async () => {
    setSavingTrip(true);
    const res = await saveTripPlanToSupabase(trip);
    setSavingTrip(false);
    setTrip(res.trip);
    await refreshSavedTrips();

    if (res.syncedToCloud) {
      notifyStatus('Trip plan saved to your OUTERA Scout Profile and cloud database.');
    } else if (!authUser) {
      notifyStatus('Trip plan saved on this device. Sign in to sync across all devices.');
    } else {
      notifyStatus('Trip plan saved locally.');
    }
  };

  const handleShareTrip = async () => {
    const res = await saveTripPlanToSupabase(trip);
    setTrip(res.trip);
    await refreshSavedTrips();

    const shareUrl = `${window.location.origin}${window.location.pathname}#trip/${res.trip.shareToken || res.trip.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 3000);
      notifyStatus('Read-only shareable trip link copied to clipboard.');
    } catch {
      notifyStatus(`Share link: ${shareUrl}`);
    }
  };

  const handleCloneSharedTrip = async () => {
    const newId = generateUuid();
    const cloned: TripPlan = {
      ...trip,
      id: newId,
      userId: authUser?.id || null,
      title: `${trip.title} (My Copy)`,
      shareToken: newId.replace(/-/g, '').slice(0, 12),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setIsReadOnlyShared(false);
    const saved = await saveTripPlanToSupabase(cloned);
    setTrip(saved.trip);
    await refreshSavedTrips();
    notifyStatus('Cloned trip to your saved plans. You can now customize every detail.');
  };

  const handleDeleteTrip = async (tripId: string) => {
    await deleteTripPlanFromSupabase(tripId);
    setConfirmDeleteTripId(null);
    const remaining = await fetchUserTripPlans();
    setSavedTrips(remaining);
    if (trip.id === tripId) {
      if (remaining.length > 0) {
        setTrip(remaining[0]);
      } else {
        setTrip(createDefaultTrip(allPlaces, currentLocation, authUser));
      }
    }
    notifyStatus('Deleted saved trip plan.');
  };

  // Checklist actions
  const handleToggleChecklistItem = (itemId: string) => {
    if (isReadOnlyShared) return;
    setTrip((prev) => ({
      ...prev,
      checklist: prev.checklist.map((c) =>
        c.id === itemId ? { ...c, isCompleted: !c.isCompleted } : c
      ),
    }));
  };

  const handleAddChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnlyShared || !newChecklistLabel.trim()) return;
    const newItem: TripChecklistItem = {
      id: `chk-${trip.id}-${Date.now()}`,
      tripId: trip.id,
      category: newChecklistCategory,
      label: newChecklistLabel.trim(),
      isCompleted: false,
      sortOrder: trip.checklist.length,
    };
    setTrip((prev) => ({
      ...prev,
      checklist: [...prev.checklist, newItem],
    }));
    setNewChecklistLabel('');
  };

  const handleRemoveChecklistItem = (itemId: string) => {
    if (isReadOnlyShared) return;
    setTrip((prev) => ({
      ...prev,
      checklist: prev.checklist.filter((c) => c.id !== itemId),
    }));
  };

  // Group Member & Expense Contribution actions
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    const newMember: TripMember = {
      id: `mem-${trip.id}-${Date.now()}`,
      tripId: trip.id,
      name: newMemberName.trim(),
      handleOrContact: newMemberContact.trim() || undefined,
      role: 'Member',
    };
    setTrip((prev) => ({
      ...prev,
      members: [...prev.members, newMember],
      travelersCount: Math.max(prev.travelersCount, prev.members.length + 1),
    }));
    setNewMemberName('');
    setNewMemberContact('');
  };

  const handleRemoveMember = (memberId: string) => {
    setTrip((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.id !== memberId),
    }));
  };

  const handleAddExpenseContribution = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(expenseAmount);
    if (!expenseTitle.trim() || isNaN(amt) || amt <= 0) return;
    const payerName =
      expensePaidBy.trim() ||
      trip.members[0]?.name ||
      authUser?.user_metadata?.display_name ||
      'Scout';

    const newExp: TripExpenseContribution = {
      id: `exp-${trip.id}-${Date.now()}`,
      tripId: trip.id,
      paidByName: payerName,
      category: expenseCategory,
      title: expenseTitle.trim(),
      amountBdt: amt,
      expenseDate: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };

    setTrip((prev) => ({
      ...prev,
      expenses: [newExp, ...(prev.expenses || [])],
    }));
    setExpenseTitle('');
    setExpenseAmount('');
    notifyStatus(`Logged ৳${amt.toLocaleString()} expense paid by ${payerName}.`);
  };

  const handleRemoveExpense = (expenseId: string) => {
    setTrip((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== expenseId),
    }));
  };

  const completedChecklistCount = trip.checklist.filter((c) => c.isCompleted).length;
  const checklistPct =
    trip.checklist.length > 0
      ? Math.round((completedChecklistCount / trip.checklist.length) * 100)
      : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-16 space-y-6">
      {/* Top Action & Saved Trips Bar */}
      <div className="rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mb-1.5">
              <span className="text-[#ccff00] font-semibold">Smart Travel Planning System</span>
              <span aria-hidden="true">·</span>
              <span>Real Approved Places & Verified Transit Data</span>
              <span aria-hidden="true">·</span>
              <span>Planning Tool Only (No Bookings)</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={trip.title}
                disabled={isReadOnlyShared}
                onChange={(e) => setTrip((prev) => ({ ...prev, title: e.target.value }))}
                className="text-xl sm:text-2xl font-extrabold text-white bg-transparent border-b border-transparent hover:border-white/20 focus:border-[#ccff00] focus:outline-none tracking-tight min-w-[240px] sm:min-w-[360px]"
                aria-label="Trip Plan Title"
              />
            </div>
          </div>

          {/* Primary Actions: Saved Trips, New Trip, Save, Share */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSavedTripsDrawer((prev) => !prev)}
              className="h-9 px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#ccff00]" />
              <span>Saved Trips ({savedTrips.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsReadOnlyShared(false);
                setTrip(createDefaultTrip(allPlaces, currentLocation, authUser));
                if (window.location.hash.startsWith('#trip/')) {
                  window.history.replaceState(null, '', window.location.pathname);
                }
              }}
              className="h-9 px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-[#ccff00]" />
              <span>New Trip</span>
            </button>

            {isReadOnlyShared ? (
              <button
                type="button"
                onClick={handleCloneSharedTrip}
                className="h-9 px-4 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Clone to My Trips</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={savingTrip}
                onClick={handleSaveTrip}
                className="h-9 px-4 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingTrip ? 'Saving...' : 'Save Trip'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleShareTrip}
              className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedShareLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#ccff00]" />
                  <span className="text-[#ccff00]">Link Copied</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-[#ccff00]" />
                  <span>Share Link</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Feedback Toast */}
        {statusMessage && (
          <div className="mt-4 p-3 rounded-xl bg-[#ccff00]/12 border border-[#ccff00]/30 text-xs font-medium text-[#ccff00] flex items-center justify-between">
            <span>{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-[11px] underline ml-3 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Read-only Shared Trip Banner */}
        {isReadOnlyShared && (
          <div className="mt-4 p-3.5 rounded-xl bg-white/[0.04] border border-white/[0.1] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-zinc-200">
              <strong className="text-white">Viewing Shared Trip Plan</strong> by{' '}
              <span className="text-[#ccff00] font-semibold">{trip.ownerName || 'OUTERA Scout'}</span>.
              Clone this trip to customize stops, budget, or checklist items.
            </div>
            <button
              type="button"
              onClick={handleCloneSharedTrip}
              className="h-8 px-3.5 rounded-lg bg-[#ccff00] text-black font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              Clone & Customize
            </button>
          </div>
        )}

        {/* Saved Trips Drawer */}
        {showSavedTripsDrawer && (
          <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-zinc-300">
                Your Saved Trip Plans ({savedTrips.length})
              </h3>
              {!authUser && onRequireAuth && (
                <button
                  type="button"
                  onClick={() => onRequireAuth('sync your saved trips across devices')}
                  className="text-xs text-[#ccff00] hover:underline cursor-pointer"
                >
                  Sign in to sync to cloud →
                </button>
              )}
            </div>

            {savedTrips.length === 0 ? (
              <p className="text-xs text-zinc-500 py-2">
                No saved trips yet. Click "Save Trip" above to store your current itinerary.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {savedTrips.map((st) => (
                  <div
                    key={st.id}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                      st.id === trip.id
                        ? 'bg-white/[0.07] border-[#ccff00]/50'
                        : 'bg-white/[0.02] border-white/[0.07] hover:bg-white/[0.05]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIsReadOnlyShared(false);
                        setTrip(st);
                        setShowSavedTripsDrawer(false);
                      }}
                      className="text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <p className="text-xs font-bold text-white truncate">{st.title}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-mono tabular-nums">
                        {st.originDistrict} → {st.destinationDistrict} · {st.durationDays}d ·{' '}
                        {st.stops.length} stops
                      </p>
                    </button>

                    {confirmDeleteTripId === st.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDeleteTrip(st.id)}
                          className="px-2 py-1 rounded bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTripId(null)}
                          className="px-2 py-1 rounded bg-white/10 text-zinc-300 text-[10px] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTripId(st.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-white/[0.05] cursor-pointer"
                        title="Delete saved trip"
                        aria-label="Delete saved trip"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trip Parameters Configuration Grid */}
      <div className="rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">
              01. Trip Parameters & Preferences
            </h2>
            <p className="text-xs text-zinc-400">
              Configure your origin, destination, dates, group size, and total budget to calculate real routes and costs.
            </p>
          </div>
          {!isReadOnlyShared && (
            <button
              type="button"
              onClick={handleRegenerateItinerary}
              className="h-9 px-3.5 rounded-xl bg-[#ccff00]/15 hover:bg-[#ccff00]/25 border border-[#ccff00]/35 text-[#ccff00] text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Auto-Generate Itinerary</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Starting Location */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 block">
              Starting Location
            </label>
            <select
              disabled={isReadOnlyShared}
              value={trip.originDistrict}
              onChange={(e) => handleOriginDistrictChange(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-[#090a0c] border border-white/[0.1] text-xs font-semibold text-white focus:border-[#ccff00] focus:outline-none"
            >
              {ALL_DISTRICTS.map((d) => (
                <option key={`orig-${d.name}`} value={d.name}>
                  {d.name} ({d.division})
                </option>
              ))}
            </select>
          </div>

          {/* Destination District */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 block">
              Destination District
            </label>
            <select
              disabled={isReadOnlyShared}
              value={trip.destinationDistrict}
              onChange={(e) => handleDestinationDistrictChange(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-[#090a0c] border border-white/[0.1] text-xs font-semibold text-white focus:border-[#ccff00] focus:outline-none"
            >
              {ALL_DISTRICTS.map((d) => (
                <option key={`dest-${d.name}`} value={d.name}>
                  {d.name} ({d.division})
                </option>
              ))}
            </select>
          </div>

          {/* Travel Date */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 block">
              Travel Start Date
            </label>
            <input
              type="date"
              disabled={isReadOnlyShared}
              value={trip.startDate}
              onChange={(e) => setTrip((prev) => ({ ...prev, startDate: e.target.value }))}
              className="w-full h-10 px-3 rounded-xl bg-[#090a0c] border border-white/[0.1] text-xs font-mono tabular-nums text-white focus:border-[#ccff00] focus:outline-none"
            />
          </div>

          {/* Trip Duration */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 block">
              Duration (Days)
            </label>
            <select
              disabled={isReadOnlyShared}
              value={trip.durationDays}
              onChange={(e) => {
                const nextDays = Math.max(1, Math.min(14, Number(e.target.value) || 1));
                setTrip((prev) => ({
                  ...prev,
                  durationDays: nextDays,
                  stops: prev.stops.map((s) => ({
                    ...s,
                    dayNumber: Math.min(s.dayNumber, nextDays),
                  })),
                }));
              }}
              className="w-full h-10 px-3 rounded-xl bg-[#090a0c] border border-white/[0.1] text-xs font-mono tabular-nums font-semibold text-white focus:border-[#ccff00] focus:outline-none"
            >
              {[1, 2, 3, 4, 5, 6, 7, 10, 14].map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? 'Day (Day Trip)' : `Days (${d - 1} Nights)`}
                </option>
              ))}
            </select>
          </div>

          {/* Number of People */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 block">
              Number of People
            </label>
            <input
              type="number"
              min={1}
              max={50}
              disabled={isReadOnlyShared}
              value={trip.travelersCount}
              onChange={(e) =>
                setTrip((prev) => ({
                  ...prev,
                  travelersCount: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                }))
              }
              className="w-full h-10 px-3 rounded-xl bg-[#090a0c] border border-white/[0.1] text-xs font-mono tabular-nums font-semibold text-white focus:border-[#ccff00] focus:outline-none"
            />
          </div>

          {/* Total Group Budget (BDT) */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-zinc-400 block">
              Total Group Budget (৳)
            </label>
            <input
              type="number"
              min={0}
              step={500}
              disabled={isReadOnlyShared}
              value={trip.totalBudgetBdt}
              onChange={(e) =>
                setTrip((prev) => ({
                  ...prev,
                  totalBudgetBdt: Math.max(0, Number(e.target.value) || 0),
                }))
              }
              className="w-full h-10 px-3 rounded-xl bg-[#090a0c] border border-white/[0.1] text-xs font-mono tabular-nums font-bold text-[#ccff00] focus:border-[#ccff00] focus:outline-none"
            />
          </div>
        </div>

        {/* Travel Preferences Selector */}
        <div className="pt-1">
          <span className="text-[11px] font-semibold text-zinc-400 block mb-2">
            Travel Preferences (Click to filter & rank itinerary recommendations)
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {PREFERENCE_OPTIONS.map((pref) => {
              const active = trip.preferences.includes(pref);
              return (
                <button
                  key={pref}
                  type="button"
                  disabled={isReadOnlyShared}
                  onClick={() => handleTogglePreference(pref)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                    active
                      ? 'bg-[#ccff00] text-black border-[#ccff00]'
                      : 'bg-[#090a0c] text-zinc-300 border-white/[0.08] hover:text-white hover:border-white/20'
                  }`}
                >
                  {pref}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08]">
          <span className="text-xs text-zinc-400 block">Per-Person Estimated Cost</span>
          <p className="text-lg sm:text-xl font-extrabold text-white font-mono tabular-nums mt-1">
            ৳{budgetBreakdown.perPersonEstimated.toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
            Range: ৳{budgetBreakdown.perPersonMin.toLocaleString()}–৳
            {budgetBreakdown.perPersonMax.toLocaleString()}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08]">
          <span className="text-xs text-zinc-400 block">
            Group Estimated Cost ({trip.travelersCount} {trip.travelersCount === 1 ? 'Person' : 'People'})
          </span>
          <p className="text-lg sm:text-xl font-extrabold text-white font-mono tabular-nums mt-1">
            ৳{budgetBreakdown.totalGroupEstimated.toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
            Range: ৳{budgetBreakdown.totalGroupMin.toLocaleString()}–৳
            {budgetBreakdown.totalGroupMax.toLocaleString()}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08]">
          <span className="text-xs text-zinc-400 block">Budget Remaining</span>
          <p
            className={`text-lg sm:text-xl font-extrabold font-mono tabular-nums mt-1 ${
              budgetBreakdown.isOverBudget ? 'text-rose-400' : 'text-[#ccff00]'
            }`}
          >
            {budgetBreakdown.isOverBudget ? '-' : ''}৳
            {Math.abs(budgetBreakdown.budgetRemainingBdt).toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
            Total Budget: ৳{budgetBreakdown.totalBudgetBdt.toLocaleString()}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08]">
          <span className="text-xs text-zinc-400 block">Route & Itinerary</span>
          <p className="text-lg sm:text-xl font-extrabold text-white font-mono tabular-nums mt-1">
            {trip.stops.length} Stops · {totalRouteDistanceKm} km
          </p>
          <p className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
            Est. Drive Time: {totalRouteDurationMin} min · {checklistPct}% Packed
          </p>
        </div>
      </div>

      {/* Section Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-[#111317] border border-white/[0.08] overflow-x-auto no-scrollbar">
        {[
          { id: 'itinerary', label: `Day-by-Day Itinerary (${trip.stops.length})`, icon: Calendar },
          { id: 'route', label: 'Smart Route & Transit Map', icon: Route },
          { id: 'budget', label: 'Smart Budget & Group Split', icon: Wallet },
          {
            id: 'checklist',
            label: `Travel Checklist (${completedChecklistCount}/${trip.checklist.length})`,
            icon: CheckSquare,
          },
          { id: 'emergency', label: 'Tourist Help & Emergency', icon: ShieldAlert },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id as any)}
              className={`h-9 px-3.5 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                active
                  ? 'bg-[#ccff00] text-black'
                  : 'text-zinc-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: DAY-BY-DAY ITINERARY & APPROVED PLACE SELECTOR */}
      {activeSection === 'itinerary' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Cols: Day-by-Day Customizable Schedule */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  02. Day-by-Day Itinerary ({trip.durationDays}{' '}
                  {trip.durationDays === 1 ? 'Day' : 'Days'})
                </h3>
                <p className="text-xs text-zinc-400">
                  Built strictly from approved OUTERA places. Reorder stops, switch days, or inspect place details.
                </p>
              </div>
              {!isReadOnlyShared && trip.stops.length >= 2 && (
                <button
                  type="button"
                  onClick={handleOptimizeRouteOrder}
                  className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-[#ccff00] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Optimize Visiting Order</span>
                </button>
              )}
            </div>

            {Array.from({ length: trip.durationDays }, (_, i) => i + 1).map((dayNum) => {
              const dayStops = trip.stops
                .filter((s) => s.dayNumber === dayNum)
                .sort((a, b) => a.stopOrder - b.stopOrder);

              const dayDate = new Date(
                new Date(trip.startDate).getTime() + (dayNum - 1) * 86400000
              );
              const dateFormatted = !isNaN(dayDate.getTime())
                ? dayDate.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                : `Day ${dayNum}`;

              return (
                <div
                  key={dayNum}
                  className="rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-5 space-y-3.5"
                >
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-[#ccff00] font-mono tabular-nums">
                        Day {dayNum}
                      </span>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="text-xs font-semibold text-zinc-300">{dateFormatted}</span>
                      <span aria-hidden="true" className="text-zinc-600">·</span>
                      <span className="text-xs text-zinc-400 font-mono tabular-nums">
                        {dayStops.length} {dayStops.length === 1 ? 'stop' : 'stops'}
                      </span>
                    </div>

                    {!isReadOnlyShared && (
                      <button
                        type="button"
                        onClick={() => setTargetDayForAdding(dayNum)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                          targetDayForAdding === dayNum
                            ? 'bg-[#ccff00]/20 text-[#ccff00] border border-[#ccff00]/40'
                            : 'text-zinc-400 hover:text-white bg-white/[0.04]'
                        }`}
                      >
                        {targetDayForAdding === dayNum ? 'Adding to Day ' + dayNum : '+ Add Here'}
                      </button>
                    )}
                  </div>

                  {dayStops.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-400">
                      No stops assigned to Day {dayNum} yet. Select approved places from the directory on the right to add them to Day {dayNum}.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dayStops.map((stop, idx) => {
                        const matchedPlace = allPlaces.find((p) => p.id === stop.placeId);
                        return (
                          <div
                            key={stop.id}
                            className="p-3.5 rounded-xl bg-[#090a0c] border border-white/[0.07] hover:border-white/[0.15] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="w-6 h-6 rounded-full bg-[#ccff00] text-black font-mono tabular-nums font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                                {idx + 1}
                              </span>

                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      matchedPlace &&
                                      onSelectPlaceDetails &&
                                      onSelectPlaceDetails(matchedPlace)
                                    }
                                    className="font-bold text-white hover:text-[#ccff00] transition-colors text-left cursor-pointer"
                                  >
                                    {stop.placeName}
                                  </button>
                                  <span aria-hidden="true" className="text-zinc-600">·</span>
                                  <span className="text-zinc-400">{stop.placeCategory}</span>
                                  <span aria-hidden="true" className="text-zinc-600">·</span>
                                  <span className="text-zinc-400 truncate">
                                    {stop.placeNeighborhood}, {stop.placeDistrict}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 font-mono tabular-nums">
                                  <span className="text-[#ccff00]">{stop.priceSourceLabel}</span>
                                  {stop.bestTimeHint && (
                                    <>
                                      <span aria-hidden="true" className="text-zinc-600">·</span>
                                      <span>Best: {stop.bestTimeHint}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Stop Controls: Time Slot, Day Switcher, Move Up/Down, Remove */}
                            {!isReadOnlyShared && (
                              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                <select
                                  value={stop.timeSlot}
                                  onChange={(e) =>
                                    handleChangeStopSlot(stop.id, e.target.value as TripTimeSlot)
                                  }
                                  className="h-7 px-2 rounded-lg bg-[#111317] border border-white/10 text-[11px] text-zinc-200 focus:outline-none"
                                  aria-label="Time slot"
                                >
                                  <option value="Morning">Morning</option>
                                  <option value="Afternoon">Afternoon</option>
                                  <option value="Evening">Evening</option>
                                </select>

                                {trip.durationDays > 1 && (
                                  <select
                                    value={stop.dayNumber}
                                    onChange={(e) =>
                                      handleChangeStopDay(stop.id, Number(e.target.value))
                                    }
                                    className="h-7 px-2 rounded-lg bg-[#111317] border border-white/10 text-[11px] font-mono text-zinc-200 focus:outline-none"
                                    aria-label="Assign day"
                                  >
                                    {Array.from({ length: trip.durationDays }, (_, d) => d + 1).map(
                                      (d) => (
                                        <option key={d} value={d}>
                                          Day {d}
                                        </option>
                                      )
                                    )}
                                  </select>
                                )}

                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveStopOrder(stop.id, 'up')}
                                  className="w-7 h-7 rounded-lg bg-[#111317] hover:bg-white/10 disabled:opacity-30 border border-white/10 flex items-center justify-center text-zinc-300 cursor-pointer"
                                  title="Move stop earlier"
                                  aria-label="Move stop earlier"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  disabled={idx === dayStops.length - 1}
                                  onClick={() => handleMoveStopOrder(stop.id, 'down')}
                                  className="w-7 h-7 rounded-lg bg-[#111317] hover:bg-white/10 disabled:opacity-30 border border-white/10 flex items-center justify-center text-zinc-300 cursor-pointer"
                                  title="Move stop later"
                                  aria-label="Move stop later"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setTrip((prev) => ({
                                      ...prev,
                                      stops: normalizeStopsOrdering(
                                        prev.stops.filter((s) => s.id !== stop.id)
                                      ),
                                    }))
                                  }
                                  className="w-7 h-7 rounded-lg bg-[#111317] hover:bg-rose-500/20 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-rose-400 cursor-pointer"
                                  title="Remove stop"
                                  aria-label="Remove stop"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right 5 Cols: Approved OUTERA Places Directory Picker */}
          <div className="lg:col-span-5 rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Approved OUTERA Places ({candidatePlaces.length})
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Select places to add to{' '}
                  <strong className="text-[#ccff00]">Day {targetDayForAdding}</strong> or remove from your trip.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAllBangladeshPlaces((prev) => !prev)}
                className="text-[11px] font-semibold text-[#ccff00] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                {showAllBangladeshPlaces
                  ? `Show ${trip.destinationDistrict} Only`
                  : 'Browse All Bangladesh'}
              </button>
            </div>

            <input
              type="search"
              placeholder={`Search places in ${
                showAllBangladeshPlaces ? 'Bangladesh' : trip.destinationDistrict
              }...`}
              value={placeSearchQuery}
              onChange={(e) => setPlaceSearchQuery(e.target.value)}
              className="w-full h-9 px-3 rounded-xl bg-[#090a0c] border border-white/[0.1] text-xs text-white placeholder:text-zinc-500 focus:border-[#ccff00] focus:outline-none"
            />

            <div className="max-h-[540px] overflow-y-auto space-y-2 pr-1">
              {candidatePlaces.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-400 space-y-2">
                  <p>
                    No approved places matched in {trip.destinationDistrict} for that search.
                  </p>
                  {!showAllBangladeshPlaces && (
                    <button
                      type="button"
                      onClick={() => setShowAllBangladeshPlaces(true)}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-white font-semibold cursor-pointer"
                    >
                      Show All Approved Places in Bangladesh
                    </button>
                  )}
                </div>
              ) : (
                candidatePlaces.slice(0, 40).map((place) => {
                  const inTripStop = trip.stops.find((s) => s.placeId === place.id);
                  const spend = extractPlaceDatabaseSpendRange(place);
                  return (
                    <div
                      key={place.id}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        inTripStop
                          ? 'bg-[#ccff00]/[0.07] border-[#ccff00]/40'
                          : 'bg-[#090a0c] border-white/[0.06] hover:border-white/[0.14]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={() => onSelectPlaceDetails && onSelectPlaceDetails(place)}
                            className="font-bold text-white hover:text-[#ccff00] truncate text-left cursor-pointer"
                          >
                            {place.name}
                          </button>
                          <span aria-hidden="true" className="text-zinc-600">·</span>
                          <span className="text-zinc-400 shrink-0">{place.category}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {place.neighborhood}, {place.district} ·{' '}
                          <span className="font-mono tabular-nums text-zinc-300">
                            {spend.sourceLabel}
                          </span>
                        </p>
                      </div>

                      {!isReadOnlyShared && (
                        <button
                          type="button"
                          onClick={() => handleTogglePlaceInTrip(place, targetDayForAdding)}
                          className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            inTripStop
                              ? 'bg-white/10 text-[#ccff00] hover:bg-rose-500/20 hover:text-rose-300'
                              : 'bg-[#ccff00] text-black hover:bg-[#d8ff33]'
                          }`}
                        >
                          {inTripStop ? `Day ${inTripStop.dayNumber} ✓` : `+ Day ${targetDayForAdding}`}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: SMART ROUTE PLANNER & INTERACTIVE MAP */}
      {activeSection === 'route' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  02. Interactive Route Map & Stop Sequence
                </h3>
                <p className="text-xs text-zinc-400">
                  Road distances and driving durations computed via OSRM Road Routing across your ordered stops.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono tabular-nums text-zinc-300 px-3 py-1.5 rounded-lg bg-[#090a0c] border border-white/10">
                  Total Route: <strong className="text-[#ccff00]">{totalRouteDistanceKm} km</strong> ·{' '}
                  <strong>{totalRouteDurationMin} min</strong>
                  {loadingRoute ? ' (Calculating...)' : ''}
                </span>
                {!isReadOnlyShared && trip.stops.length >= 2 && (
                  <button
                    type="button"
                    onClick={handleOptimizeRouteOrder}
                    className="h-8 px-3.5 rounded-lg bg-[#ccff00] text-black font-extrabold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Optimize Route Order</span>
                  </button>
                )}
              </div>
            </div>

            <TripRouteMap
              stops={trip.stops}
              routeCoordinates={routeCoordinates}
              destinationCenter={destinationInfo.coords}
              selectedDayFilter={mapDayFilter}
              onSelectDayFilter={setMapDayFilter}
              durationDays={trip.durationDays}
              onSelectStop={(stop) => {
                const found = allPlaces.find((p) => p.id === stop.placeId);
                if (found && onSelectPlaceDetails) onSelectPlaceDetails(found);
              }}
            />

            {/* Stop-to-Stop Road Legs Breakdown */}
            {routeLegs.length > 0 && (
              <div className="pt-2 space-y-2">
                <h4 className="text-xs font-bold text-zinc-300">
                  Stop-to-Stop Distance & Travel Time Breakdown
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {routeLegs.map((leg, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-[#090a0c] border border-white/[0.07] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">
                          {i + 1}. {leg.fromStopName} → {leg.toStopName}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{leg.provider}</p>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <p className="font-bold text-[#ccff00]">{leg.distanceKm} km</p>
                        <p className="text-[11px] text-zinc-400">~{leg.durationMin} min</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Inter-District Transport Options & Fares */}
          <div className="rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white">
                  Available Inter-District & Corridor Transport ({trip.originDistrict} →{' '}
                  {trip.destinationDistrict})
                </h3>
                <p className="text-xs text-zinc-400">
                  Select a transport option below to link its real fare range directly into your Smart Budget Calculator.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isReadOnlyShared}
                  checked={trip.roundTripTransport}
                  onChange={(e) =>
                    setTrip((prev) => ({ ...prev, roundTripTransport: e.target.checked }))
                  }
                  className="accent-[#ccff00]"
                />
                <span>Include Return / Round-Trip Fare (×2)</span>
              </label>
            </div>

            {transportOptions.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#090a0c] border border-white/[0.07] text-xs text-zinc-400">
                No direct inter-district route record in the database between{' '}
                <strong className="text-white">{trip.originDistrict}</strong> and{' '}
                <strong className="text-white">{trip.destinationDistrict}</strong>. We never invent fake bus or train fares — you can log your actual transport cost in the Group Expenses tab.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {transportOptions.map((opt) => {
                  const selected = trip.selectedTransportId === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() =>
                        !isReadOnlyShared &&
                        setTrip((prev) => ({ ...prev, selectedTransportId: opt.id }))
                      }
                      className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 ${
                        selected
                          ? 'bg-[#ccff00]/[0.08] border-[#ccff00]'
                          : 'bg-[#090a0c] border-white/[0.08] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                          <Bus className="w-3.5 h-3.5 text-[#ccff00]" />
                          <span>{opt.transportType}</span>
                        </span>
                        <span className="text-xs font-mono tabular-nums font-bold text-[#ccff00]">
                          ৳{opt.minFare}–৳{opt.maxFare} ({opt.fareUnit || 'per person'})
                        </span>
                      </div>

                      <p className="text-xs text-zinc-300 font-medium">
                        {opt.fromName} → {opt.toName}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 font-mono tabular-nums">
                        <span>Source: {opt.sourceType}</span>
                        <span aria-hidden="true">·</span>
                        <span>Confidence: {opt.confidence}</span>
                        {opt.distanceKm && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{opt.distanceKm} km</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>~{Math.round(opt.estimatedDurationMin / 60)}h</span>
                      </div>

                      {opt.notes && <p className="text-[11px] text-zinc-400">{opt.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: SMART BUDGET CALCULATOR & GROUP EXPENSE CONTRIBUTIONS */}
      {activeSection === 'budget' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Cols: 6-Category Smart Budget Table & Overrides */}
          <div className="lg:col-span-7 space-y-5">
            <div className="rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  Smart Budget Breakdown (BDT ৳)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Calculated using database route fares, nearby stay rates, and selected OUTERA place prices. Missing or user-estimated items are clearly labeled.
                </p>
              </div>

              <div className="divide-y divide-white/[0.06] border-t border-b border-white/[0.06]">
                {budgetBreakdown.lines.map((line) => (
                  <div
                    key={line.category}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 max-w-md">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-white">{line.category}</span>
                        <span aria-hidden="true" className="text-zinc-600">·</span>
                        <span
                          className={`text-[11px] font-medium ${
                            line.sourceType === 'MISSING'
                              ? 'text-amber-300'
                              : line.sourceType === 'USER_ESTIMATE'
                              ? 'text-sky-300'
                              : 'text-[#ccff00]'
                          }`}
                        >
                          {line.sourceLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400">{line.details}</p>
                    </div>

                    <div className="text-left sm:text-right font-mono tabular-nums shrink-0">
                      <p className="text-sm font-extrabold text-white">
                        ৳{line.estimatedGroupCost.toLocaleString()}{' '}
                        <span className="text-[11px] font-normal text-zinc-400">group</span>
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        ৳{line.perPersonCost.toLocaleString()}/person
                        {line.minGroupCost !== line.maxGroupCost &&
                          ` (Range: ৳${line.minGroupCost.toLocaleString()}–৳${line.maxGroupCost.toLocaleString()})`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Optional Database Stay Selector or Custom Rate Overrides */}
              {!isReadOnlyShared && (
                <div className="pt-2 space-y-4">
                  <h4 className="text-xs font-bold text-zinc-300">
                    Select Database Hotel/Resort or Customize Unlisted Estimates
                  </h4>

                  {availableStays.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-zinc-400 block">
                        Database Approved Stays in {trip.destinationDistrict}
                      </label>
                      <select
                        value={trip.selectedStayId || ''}
                        onChange={(e) =>
                          setTrip((prev) => ({
                            ...prev,
                            selectedStayId: e.target.value || null,
                          }))
                        }
                        className="w-full h-9 px-3 rounded-xl bg-[#090a0c] border border-white/10 text-xs text-white focus:border-[#ccff00] focus:outline-none"
                      >
                        <option value="">-- Select a verified stay from database --</option>
                        {availableStays.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.service_type || s.serviceType || 'Stay'}) — ৳
                            {s.price_min ?? s.priceMin ?? 0}–৳{s.price_max ?? s.priceMax ?? 0}/night
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400 block">
                        Custom Hotel Rate / Night / Room (৳)
                      </label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Leave blank to use DB stay"
                        value={trip.customBudgetOverrides?.hotelPerNightBdt ?? ''}
                        onChange={(e) =>
                          setTrip((prev) => ({
                            ...prev,
                            customBudgetOverrides: {
                              ...prev.customBudgetOverrides,
                              hotelPerNightBdt:
                                e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                            },
                          }))
                        }
                        className="w-full h-9 px-3 rounded-xl bg-[#090a0c] border border-white/10 text-xs font-mono tabular-nums text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400 block">
                        Custom Food / Person / Day (৳)
                      </label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Leave blank to use Food stops"
                        value={trip.customBudgetOverrides?.foodPerPersonPerDayBdt ?? ''}
                        onChange={(e) =>
                          setTrip((prev) => ({
                            ...prev,
                            customBudgetOverrides: {
                              ...prev.customBudgetOverrides,
                              foodPerPersonPerDayBdt:
                                e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                            },
                          }))
                        }
                        className="w-full h-9 px-3 rounded-xl bg-[#090a0c] border border-white/10 text-xs font-mono tabular-nums text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400 block">
                        Custom Local Transport / Day (৳)
                      </label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Leave blank for route formula"
                        value={trip.customBudgetOverrides?.localTransportPerDayBdt ?? ''}
                        onChange={(e) =>
                          setTrip((prev) => ({
                            ...prev,
                            customBudgetOverrides: {
                              ...prev.customBudgetOverrides,
                              localTransportPerDayBdt:
                                e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                            },
                          }))
                        }
                        className="w-full h-9 px-3 rounded-xl bg-[#090a0c] border border-white/10 text-xs font-mono tabular-nums text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-400 block">
                        Other Group Buffer (৳)
                      </label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Optional emergency/misc buffer"
                        value={trip.customBudgetOverrides?.otherGroupExpenseBdt ?? ''}
                        onChange={(e) =>
                          setTrip((prev) => ({
                            ...prev,
                            customBudgetOverrides: {
                              ...prev.customBudgetOverrides,
                              otherGroupExpenseBdt:
                                e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                            },
                          }))
                        }
                        className="w-full h-9 px-3 rounded-xl bg-[#090a0c] border border-white/10 text-xs font-mono tabular-nums text-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right 5 Cols: Group Trip Planning & Member Expense Contributions */}
          <div className="lg:col-span-5 space-y-5">
            {/* Group Members */}
            <div className="rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#ccff00]" />
                  <span>Group Trip Members ({trip.members.length})</span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Add fellow travelers to coordinate group expenses and split shared costs.
                </p>
              </div>

              <div className="space-y-2">
                {trip.members.map((m) => {
                  const memberPaid = (trip.expenses || [])
                    .filter((e) => e.paidByName.toLowerCase() === m.name.toLowerCase())
                    .reduce((sum, e) => sum + e.amountBdt, 0);
                  return (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-xl bg-[#090a0c] border border-white/[0.07] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-white">{m.name}</span>
                        <span aria-hidden="true" className="text-zinc-600 mx-1.5">·</span>
                        <span className="text-zinc-400">{m.role}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono tabular-nums text-[#ccff00] font-semibold">
                          Paid: ৳{memberPaid.toLocaleString()}
                        </span>
                        {m.role !== 'Organizer' && !isReadOnlyShared && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.id)}
                            className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                            aria-label="Remove member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleAddMember} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Member name..."
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="flex-1 h-9 px-3 rounded-xl bg-[#090a0c] border border-white/10 text-xs text-white focus:border-[#ccff00] focus:outline-none"
                />
                <button
                  type="submit"
                  className="h-9 px-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  + Add Member
                </button>
              </form>
            </div>

            {/* Member Expense Contributions */}
            <div className="rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Group Expense Contributions
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Log shared expenses paid by group members.
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-[#ccff00]">
                  Total Paid: ৳{budgetBreakdown.contributedExpensesTotal.toLocaleString()}
                </span>
              </div>

              <form onSubmit={handleAddExpenseContribution} className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Expense item (e.g. Bus tickets)"
                    value={expenseTitle}
                    onChange={(e) => setExpenseTitle(e.target.value)}
                    className="h-9 px-3 rounded-xl bg-[#090a0c] border border-white/10 text-xs text-white focus:border-[#ccff00] focus:outline-none"
                  />
                  <input
                    type="number"
                    min={1}
                    placeholder="Amount in ৳"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    className="h-9 px-3 rounded-xl bg-[#090a0c] border border-white/10 text-xs font-mono tabular-nums text-white focus:border-[#ccff00] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value as TripExpenseCategory)}
                    className="h-9 px-2.5 rounded-xl bg-[#090a0c] border border-white/10 text-xs text-white focus:outline-none"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={expensePaidBy}
                    onChange={(e) => setExpensePaidBy(e.target.value)}
                    className="h-9 px-2.5 rounded-xl bg-[#090a0c] border border-white/10 text-xs text-white focus:outline-none"
                  >
                    <option value="">Paid by: {trip.members[0]?.name || 'Organizer'}</option>
                    {trip.members.map((m) => (
                      <option key={m.id} value={m.name}>
                        Paid by: {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full h-9 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs cursor-pointer"
                >
                  + Contribute Expense
                </button>
              </form>

              {trip.expenses.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto pt-2 border-t border-white/[0.06]">
                  {trip.expenses.map((exp) => (
                    <div
                      key={exp.id}
                      className="p-2.5 rounded-xl bg-[#090a0c] border border-white/[0.06] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{exp.title}</p>
                        <p className="text-[11px] text-zinc-400">
                          {exp.category} · Paid by <strong className="text-zinc-200">{exp.paidByName}</strong>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono tabular-nums font-bold text-[#ccff00]">
                          ৳{exp.amountBdt.toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveExpense(exp.id)}
                          className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                          aria-label="Delete expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: TRAVEL CHECKLIST */}
      {activeSection === 'checklist' && (
        <div className="rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white">
                Destination & Duration-Aware Travel Checklist ({trip.destinationDistrict})
              </h3>
              <p className="text-xs text-zinc-400">
                Customized for a {trip.durationDays}-day trip to {trip.destinationDistrict}. Mark items as completed or add your own gear.
              </p>
            </div>
            <div className="text-right font-mono tabular-nums">
              <span className="text-sm font-extrabold text-[#ccff00]">
                {completedChecklistCount} / {trip.checklist.length} Completed ({checklistPct}%)
              </span>
            </div>
          </div>

          {!isReadOnlyShared && (
            <form onSubmit={handleAddChecklistItem} className="flex flex-col sm:flex-row gap-2">
              <select
                value={newChecklistCategory}
                onChange={(e) => setNewChecklistCategory(e.target.value)}
                className="h-10 px-3 rounded-xl bg-[#090a0c] border border-white/10 text-xs text-white focus:outline-none"
              >
                <option value="Essentials & ID">Essentials & ID</option>
                <option value="Clothing & Weather">Clothing & Weather</option>
                <option value="Tech & Power">Tech & Power</option>
                <option value="Health & Safety">Health & Safety</option>
                <option value="Destination Specific">Destination Specific</option>
              </select>
              <input
                type="text"
                placeholder="Add custom packing or preparation item..."
                value={newChecklistLabel}
                onChange={(e) => setNewChecklistLabel(e.target.value)}
                className="flex-1 h-10 px-3.5 rounded-xl bg-[#090a0c] border border-white/10 text-xs text-white focus:border-[#ccff00] focus:outline-none"
              />
              <button
                type="submit"
                className="h-10 px-4 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs whitespace-nowrap shrink-0 cursor-pointer"
              >
                + Add Item
              </button>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {trip.checklist.map((item) => (
              <div
                key={item.id}
                onClick={() => handleToggleChecklistItem(item.id)}
                className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                  item.isCompleted
                    ? 'bg-white/[0.02] border-white/[0.05] text-zinc-500'
                    : 'bg-[#090a0c] border-white/[0.08] hover:border-white/20 text-white'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {item.isCompleted ? (
                    <CheckSquare className="w-4 h-4 text-[#ccff00] shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-medium ${
                        item.isCompleted ? 'line-through text-zinc-500' : 'text-zinc-100'
                      }`}
                    >
                      {item.label}
                    </p>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">
                      {item.category}
                    </span>
                  </div>
                </div>

                {!isReadOnlyShared && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveChecklistItem(item.id);
                    }}
                    className="text-zinc-500 hover:text-rose-400 shrink-0 cursor-pointer"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 5: TOURIST HELP & VERIFIED EMERGENCY INFORMATION */}
      {activeSection === 'emergency' && (
        <div className="rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-6 space-y-5">
          <div>
            <h3 className="text-base font-bold text-white">
              Verified Tourist Help & Emergency Directory ({trip.destinationDistrict},{' '}
              {trip.destinationDivision})
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Official emergency hotlines, Tourist Police control rooms, government medical college hospitals, and police stations with source & last-updated verification.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {emergencyContacts.map((contact) => (
              <div
                key={contact.id}
                className="p-4 rounded-xl bg-[#090a0c] border border-white/[0.08] flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span className="text-[#ccff00] font-bold">{contact.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{contact.district === 'All' ? 'Nationwide' : contact.district}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">Updated: {contact.lastUpdated}</span>
                  </div>

                  <h4 className="text-sm font-bold text-white">{contact.name}</h4>
                  <p className="text-xs text-zinc-300">{contact.address}</p>
                  {contact.notes && (
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{contact.notes}</p>
                  )}
                </div>

                <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[11px] text-zinc-500">
                    Source: {contact.sourceName}
                  </span>

                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${contact.phone}`}
                      className="h-8 px-3 rounded-lg bg-[#ccff00] text-black font-mono tabular-nums font-extrabold text-xs inline-flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{contact.phone}</span>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
