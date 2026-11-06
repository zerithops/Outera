import React, { useState, useEffect, useCallback } from 'react';
import {
  Navigation,
  MapPin,
  Clock,
  Coins,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  ArrowRight,
  RefreshCw,
  Users,
  Phone,
  MessageCircle,
  Hotel,
  Utensils,
  Compass,
  Car,
  ExternalLink,
  Check,
  X,
} from 'lucide-react';
import {
  Place,
  TransportOption,
  TransportType,
  UserLocation,
  LocalTransportContact,
  NearbyServiceItem,
} from '../types/outera';
import { BANGLADESH_DIVISIONS } from '../data/bangladeshLocations';
import {
  getTransportOptionsForPlace,
  fetchLocalTransportContactsForPlace,
  submitLocalTransportContact,
  fetchPlaceNearbyServices,
  submitNearbyService,
  getWhileYouAreHerePlaces,
} from '../services/transport';
import { ReportFareModal } from './ReportFareModal';

interface HowToGetThereSectionProps {
  place: Place;
  userLocation?: UserLocation;
  allPlaces?: Place[];
  onSelectPlace?: (place: Place) => void;
  onOpenReportFareModal?: () => void;
}

export const HowToGetThereSection: React.FC<HowToGetThereSectionProps> = ({
  place,
  userLocation,
  allPlaces = [],
  onSelectPlace,
}) => {
  // Origin State: default to user's real detected district, or Dhaka
  const initialDistrict =
    userLocation?.district &&
    userLocation.district !== 'Select Location' &&
    userLocation.district !== 'Detected Area'
      ? userLocation.district
      : 'Dhaka';

  const [originDistrict, setOriginDistrict] = useState<string>(initialDistrict);
  const [originName, setOriginName] = useState<string>(
    userLocation?.neighborhoodName && userLocation.neighborhoodName !== 'Location not set'
      ? userLocation.neighborhoodName
      : `${initialDistrict} City`
  );
  const [useGpsCoords, setUseGpsCoords] = useState<boolean>(Boolean(userLocation?.coords));

  const [options, setOptions] = useState<TransportOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedMultiLegId, setExpandedMultiLegId] = useState<string | null>(null);
  const [showOriginSelector, setShowOriginSelector] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);

  // Active Tourist Section Tab
  const [activeSubTab, setActiveSubTab] = useState<
    'getting_there' | 'local_transport' | 'stay_nearby' | 'eat_nearby' | 'while_here'
  >('getting_there');

  // Local Transport Contacts
  const [localContacts, setLocalContacts] = useState<LocalTransportContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(false);
  const [showAddContactForm, setShowAddContactForm] = useState<boolean>(false);
  const [contactVehicleType, setContactVehicleType] =
    useState<LocalTransportContact['vehicleType']>('CNG/Auto');
  const [contactName, setContactName] = useState<string>('');
  const [contactServiceArea, setContactServiceArea] = useState<string>(place.neighborhood || place.district);
  const [contactPhone, setContactPhone] = useState<string>('');
  const [contactWhatsapp, setContactWhatsapp] = useState<string>('');
  const [contactPermission, setContactPermission] = useState<boolean>(false);
  const [contactRateNote, setContactRateNote] = useState<string>('');
  const [contactSubmitMsg, setContactSubmitMsg] = useState<string | null>(null);
  const [submittingContact, setSubmittingContact] = useState<boolean>(false);

  // Stay Nearby & Eat Nearby
  const [stayServices, setStayServices] = useState<NearbyServiceItem[]>([]);
  const [eatServices, setEatServices] = useState<NearbyServiceItem[]>([]);
  const [loadingNearby, setLoadingNearby] = useState<boolean>(false);
  const [showAddNearbyForm, setShowAddNearbyForm] = useState<'stay' | 'eat' | null>(null);
  const [nearbyCategory, setNearbyCategory] = useState<NearbyServiceItem['category']>('Hotel');
  const [nearbyName, setNearbyName] = useState<string>('');
  const [nearbyAddress, setNearbyAddress] = useState<string>('');
  const [nearbyDistanceKm, setNearbyDistanceKm] = useState<string>('');
  const [nearbyPriceRange, setNearbyPriceRange] = useState<string>('');
  const [nearbyFoodType, setNearbyFoodType] = useState<string>('');
  const [nearbyContactPhone, setNearbyContactPhone] = useState<string>('');
  const [nearbyContactPerm, setNearbyContactPerm] = useState<boolean>(false);
  const [nearbyDirections, setNearbyDirections] = useState<string>('');
  const [nearbySubmitMsg, setNearbySubmitMsg] = useState<string | null>(null);
  const [submittingNearby, setSubmittingNearby] = useState<boolean>(false);

  // Selected Division for origin picker
  const [selectedDivision, setSelectedDivision] = useState<string>('Dhaka');

  // Load transport options dynamically
  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const originCoords = useGpsCoords && userLocation?.coords ? userLocation.coords : null;
      const opts = await getTransportOptionsForPlace(
        {
          name: originName,
          district: originDistrict,
          coords: originCoords,
        },
        place
      );
      setOptions(opts);
    } catch (err) {
      console.warn('Failed to load transport options:', err);
    } finally {
      setLoading(false);
    }
  }, [originName, originDistrict, useGpsCoords, userLocation?.coords, place]);

  const loadTouristExtras = useCallback(async () => {
    setLoadingContacts(true);
    setLoadingNearby(true);
    try {
      const [contacts, stays, eats] = await Promise.all([
        fetchLocalTransportContactsForPlace(place.id, place.district, place.upazila),
        fetchPlaceNearbyServices(place, allPlaces, 'stay'),
        fetchPlaceNearbyServices(place, allPlaces, 'eat'),
      ]);
      setLocalContacts(contacts);
      setStayServices(stays);
      setEatServices(eats);
    } catch (err) {
      console.warn('Failed to load tourist extras:', err);
    } finally {
      setLoadingContacts(false);
      setLoadingNearby(false);
    }
  }, [place, allPlaces]);

  useEffect(() => {
    loadOptions();
    loadTouristExtras();
  }, [loadOptions, loadTouristExtras]);

  const whileHereItems = React.useMemo(
    () => getWhileYouAreHerePlaces(place, allPlaces),
    [place, allPlaces]
  );

  // Format duration into hours and minutes
  const formatDuration = (totalMinutes: number): string => {
    if (!totalMinutes || totalMinutes <= 0) return '~30m';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours === 0) return `~${mins} min`;
    if (mins === 0) return `~${hours}h`;
    return `~${hours}h ${mins}m`;
  };

  const getTransportEmoji = (type: TransportType): string => {
    switch (type) {
      case 'Bus':
        return '🚌';
      case 'Train':
        return '🚆';
      case 'CNG / Auto':
        return '🛺';
      case 'Rickshaw':
        return '🚲';
      case 'Easy Bike / E-bike':
        return '🛵';
      case 'Launch / Boat':
        return '🚢';
      case 'Private Car':
        return '🚗';
      default:
        return '🧭';
    }
  };

  const getSourceBadgeStyle = (sourceType: TransportOption['sourceType']) => {
    switch (sourceType) {
      case 'OFFICIAL':
        return {
          label: 'Official reference fare',
          className: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
        };
      case 'OPERATOR':
        return {
          label: 'Operator schedule',
          className: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        };
      case 'COMMUNITY':
        return {
          label: 'Community reported range',
          className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        };
      case 'ESTIMATED':
      default:
        return {
          label: 'Distance-based estimate',
          className: 'bg-zinc-800 text-zinc-300 border-white/10',
        };
    }
  };

  const getConfidenceBadge = (confidence: TransportOption['confidence']) => {
    switch (confidence) {
      case 'High':
        return <span className="text-[10px] text-emerald-400 font-bold">Confidence: High</span>;
      case 'Medium':
        return <span className="text-[10px] text-amber-400 font-bold">Confidence: Medium</span>;
      case 'Low':
      default:
        return <span className="text-[10px] text-zinc-400 font-bold">Confidence: Low</span>;
    }
  };

  const handleSelectDistrictOrigin = (distName: string) => {
    setOriginDistrict(distName);
    setOriginName(`${distName} Center`);
    setUseGpsCoords(false);
    setShowOriginSelector(false);
  };

  const handleUseCurrentLocation = () => {
    if (userLocation?.coords) {
      setUseGpsCoords(true);
      setOriginDistrict(userLocation.district || 'Dhaka');
      setOriginName(userLocation.neighborhoodName || 'Current Location');
      setShowOriginSelector(false);
    }
  };

  const handleSubmitLocalContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactServiceArea.trim()) return;
    setSubmittingContact(true);
    setContactSubmitMsg(null);
    const res = await submitLocalTransportContact({
      placeId: place.id,
      division: place.division,
      district: place.district,
      upazila: place.upazila,
      vehicleType: contactVehicleType,
      name: contactName.trim(),
      serviceArea: contactServiceArea.trim(),
      phone: contactPhone.trim() || undefined,
      whatsapp: contactWhatsapp.trim() || undefined,
      phonePublicPermission: contactPermission,
      rateNote: contactRateNote.trim() || undefined,
    });
    setSubmittingContact(false);
    if (res.success) {
      setContactSubmitMsg('Submitted for admin moderation! Once verified, it will appear publicly.');
      setContactName('');
      setContactPhone('');
      setContactWhatsapp('');
      setContactRateNote('');
      setTimeout(() => {
        setShowAddContactForm(false);
        setContactSubmitMsg(null);
      }, 2200);
    } else {
      setContactSubmitMsg(res.error || 'Could not submit contact.');
    }
  };

  const handleSubmitNearbyService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddNearbyForm || !nearbyName.trim()) return;
    setSubmittingNearby(true);
    setNearbySubmitMsg(null);
    const res = await submitNearbyService({
      placeId: place.id,
      serviceGroup: showAddNearbyForm,
      category: nearbyCategory,
      name: nearbyName.trim(),
      division: place.division,
      district: place.district,
      upazila: place.upazila,
      address: nearbyAddress.trim() || undefined,
      distanceKm: nearbyDistanceKm ? Number(nearbyDistanceKm) : undefined,
      priceRange: nearbyPriceRange.trim() || undefined,
      foodType: showAddNearbyForm === 'eat' ? nearbyFoodType.trim() || undefined : undefined,
      contactPhone: nearbyContactPhone.trim() || undefined,
      contactPermission: nearbyContactPerm,
      directionsNote: nearbyDirections.trim() || undefined,
    });
    setSubmittingNearby(false);
    if (res.success) {
      setNearbySubmitMsg('Submitted for admin review! Approved listings will appear publicly.');
      setNearbyName('');
      setNearbyAddress('');
      setNearbyDistanceKm('');
      setNearbyPriceRange('');
      setNearbyFoodType('');
      setNearbyContactPhone('');
      setNearbyDirections('');
      setTimeout(() => {
        setShowAddNearbyForm(null);
        setNearbySubmitMsg(null);
      }, 2200);
    } else {
      setNearbySubmitMsg(res.error || 'Could not submit nearby listing.');
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-[#12151b] border border-white/[0.08] space-y-5 animate-in fade-in duration-150">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#ccff00] font-mono mb-1">
            Tourist & Transit Intelligence
          </p>
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
            Tourist Guide & Getting There
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real transit modes, local transport contacts, nearby stays, food spots, and things to do around{' '}
            <span className="text-white font-semibold">{place.name}</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsReportModalOpen(true)}
          className="h-8 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 hover:text-white text-[11px] font-bold border border-white/[0.08] flex items-center gap-1.5 transition-all self-start sm:self-auto cursor-pointer"
        >
          <PlusCircle className="w-3.5 h-3.5 text-[#ccff00]" />
          <span>Report Fare</span>
        </button>
      </div>

      {/* 5 Tourist Sub-Navigation Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('getting_there')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 border transition-all cursor-pointer ${
            activeSubTab === 'getting_there'
              ? 'bg-[#ccff00] text-black border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.06] hover:bg-white/[0.08]'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>A. Getting There</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('local_transport')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 border transition-all cursor-pointer ${
            activeSubTab === 'local_transport'
              ? 'bg-[#ccff00] text-black border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.06] hover:bg-white/[0.08]'
          }`}
        >
          <Car className="w-3.5 h-3.5" />
          <span>B. Local Transport ({localContacts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('stay_nearby')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 border transition-all cursor-pointer ${
            activeSubTab === 'stay_nearby'
              ? 'bg-[#ccff00] text-black border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.06] hover:bg-white/[0.08]'
          }`}
        >
          <Hotel className="w-3.5 h-3.5" />
          <span>C. Stay Nearby ({stayServices.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('eat_nearby')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 border transition-all cursor-pointer ${
            activeSubTab === 'eat_nearby'
              ? 'bg-[#ccff00] text-black border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.06] hover:bg-white/[0.08]'
          }`}
        >
          <Utensils className="w-3.5 h-3.5" />
          <span>D. Eat Nearby ({eatServices.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('while_here')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 border transition-all cursor-pointer ${
            activeSubTab === 'while_here'
              ? 'bg-[#ccff00] text-black border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.06] hover:bg-white/[0.08]'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>E. While You're Here ({whileHereItems.length})</span>
        </button>
      </div>

      {/* SECTION A: GETTING THERE */}
      {activeSubTab === 'getting_there' && (
        <div className="space-y-4">
          {/* Origin Selector Ribbon */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-[#ccff00]/10 border border-[#ccff00]/20 flex items-center justify-center shrink-0 text-[#ccff00]">
                <Navigation className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
                  <span>Origin:</span>
                  <span className="font-bold text-white truncate">{originName}</span>
                  {useGpsCoords && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#ccff00]/15 text-[#ccff00] font-mono font-bold">
                      GPS
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-zinc-500 truncate">
                  <span>Destination:</span>
                  <span className="text-zinc-300 font-semibold truncate">{place.name}</span>
                  <span>({place.district || place.neighborhood})</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              {userLocation?.coords && !useGpsCoords && (
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="h-7 px-2.5 rounded-lg bg-[#ccff00] text-black font-extrabold text-[10px] flex items-center gap-1 hover:bg-[#d8ff33] transition-all cursor-pointer"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Use GPS</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowOriginSelector(!showOriginSelector)}
                className="h-7 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 text-[10px] font-semibold border border-white/[0.08] flex items-center gap-1 transition-all cursor-pointer"
              >
                <MapPin className="w-3 h-3 text-[#ccff00]" />
                <span>Change Origin</span>
                {showOriginSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* 64-District Origin Dropdown Picker */}
          {showOriginSelector && (
            <div className="p-4 rounded-xl bg-black/60 border border-white/[0.08] space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white">Select starting district:</span>
                <span className="text-[10px] text-zinc-500 font-mono">64 Bangladesh Districts</span>
              </div>

              <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                {BANGLADESH_DIVISIONS.map((div) => (
                  <button
                    key={div.name}
                    type="button"
                    onClick={() => setSelectedDivision(div.name)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all cursor-pointer ${
                      selectedDivision === div.name
                        ? 'bg-[#ccff00] text-black font-extrabold'
                        : 'bg-white/[0.04] text-zinc-400 hover:text-white'
                    }`}
                  >
                    {div.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                {BANGLADESH_DIVISIONS.find((d) => d.name === selectedDivision)?.districts.map((dist) => (
                  <button
                    key={dist.name}
                    type="button"
                    onClick={() => handleSelectDistrictOrigin(dist.name)}
                    className={`h-7 px-2 rounded-lg text-[11px] font-medium transition-all text-left truncate border cursor-pointer ${
                      originDistrict === dist.name
                        ? 'bg-[#ccff00]/15 text-[#ccff00] border-[#ccff00]/40 font-bold'
                        : 'bg-white/[0.02] text-zinc-300 border-white/[0.04] hover:bg-white/[0.08]'
                    }`}
                  >
                    {dist.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transport Options Cards List */}
          <div className="space-y-3">
            {loading ? (
              <div className="py-8 text-center space-y-2 bg-white/[0.01] rounded-xl border border-white/[0.04]">
                <RefreshCw className="w-5 h-5 text-[#ccff00] animate-spin mx-auto" />
                <p className="text-xs text-zinc-400 font-mono">Computing transit routes & fare ranges...</p>
              </div>
            ) : options.length === 0 ? (
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center space-y-2">
                <Coins className="w-7 h-7 text-zinc-500 mx-auto" />
                <h4 className="text-xs font-bold text-white">Fare information unavailable</h4>
                <p className="text-[11px] text-zinc-400 max-w-sm mx-auto leading-relaxed">
                  No transit data recorded yet between <span className="text-zinc-200">{originDistrict}</span> and{' '}
                  <span className="text-zinc-200">{place.name}</span>. Be the first to report your travel fare!
                </p>
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(true)}
                  className="h-8 px-4 rounded-xl bg-[#ccff00] text-black font-extrabold text-[11px] inline-flex items-center gap-1.5 hover:bg-[#d8ff33] transition-all cursor-pointer mt-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Contribute Fare Report</span>
                </button>
              </div>
            ) : (
              options.map((opt) => {
                const sourceBadge = getSourceBadgeStyle(opt.sourceType);
                const isMultiLegExpanded = expandedMultiLegId === opt.id;

                return (
                  <div
                    key={opt.id}
                    className="p-4 sm:p-4.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] transition-all space-y-3"
                  >
                    {/* Top Row: Transport Name & Fare Range + Unit */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-2xl shrink-0" role="img" aria-label={opt.transportType}>
                          {getTransportEmoji(opt.transportType)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-white truncate">{opt.transportType}</h3>
                            {opt.isMultiLeg && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-[#ccff00]/15 text-[#ccff00]">
                                Multi-Leg Route
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                            <span className="text-zinc-300 font-medium">
                              {opt.origin} → {opt.destination}
                            </span>
                            <span className="text-zinc-600">·</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#ccff00]" />
                              <span>{formatDuration(opt.estimatedDurationMin)}</span>
                            </span>
                            {opt.distanceKm && (
                              <>
                                <span className="text-zinc-600">·</span>
                                <span>{opt.distanceKm} km</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Fare Range + Fare Unit Display */}
                      <div className="text-right shrink-0">
                        <div className="text-sm sm:text-base font-black text-[#ccff00] font-mono">
                          ৳{opt.minFare.toLocaleString()}–{opt.maxFare.toLocaleString()}
                        </div>
                        <span className="text-[10px] text-zinc-400 block -mt-0.5 font-mono uppercase">
                          {opt.fareUnit || 'per person'} (Est. Range)
                        </span>
                      </div>
                    </div>

                    {/* Badges Strip */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/[0.04]">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sourceBadge.className}`}
                      >
                        {sourceBadge.label}
                      </span>

                      {getConfidenceBadge(opt.confidence)}

                      <span className="text-[10px] text-zinc-500 font-mono">
                        Updated{' '}
                        {new Date(opt.lastUpdated).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>

                      {opt.isOutdated && (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>May be outdated</span>
                        </span>
                      )}

                      {opt.communityReportsCount && opt.communityReportsCount > 0 && (
                        <span className="text-[10px] text-zinc-400 flex items-center gap-1 ml-auto">
                          <Users className="w-3 h-3 text-[#ccff00]" />
                          <span>{opt.communityReportsCount} community reports</span>
                        </span>
                      )}
                    </div>

                    {/* Route Notes if present */}
                    {opt.notes && (
                      <p className="text-[11px] text-zinc-300 bg-black/30 p-2.5 rounded-xl border border-white/[0.04] leading-relaxed">
                        <strong className="text-zinc-400">Route:</strong> {opt.notes}
                      </p>
                    )}

                    {/* Multi-Leg Accordion Breakdown */}
                    {opt.isMultiLeg && opt.legs && opt.legs.length > 0 && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setExpandedMultiLegId(isMultiLegExpanded ? null : opt.id)}
                          className="text-[11px] font-bold text-[#ccff00] flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <span>{isMultiLegExpanded ? 'Hide Route Breakdown' : 'View Step-by-Step Route Breakdown'}</span>
                          {isMultiLegExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        {isMultiLegExpanded && (
                          <div className="mt-2.5 p-3 rounded-xl bg-black/50 border border-white/[0.08] space-y-3 animate-in fade-in duration-150">
                            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                              Step-by-Step Route
                            </div>

                            <div className="space-y-2.5 relative pl-3 border-l-2 border-[#ccff00]/30 ml-2">
                              {opt.legs.map((leg, idx) => (
                                <div key={idx} className="relative space-y-1">
                                  <span className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-[#ccff00] border-2 border-black" />
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold text-white flex items-center gap-1">
                                      <span>{getTransportEmoji(leg.transportType)}</span>
                                      <span>
                                        Step {idx + 1}: {leg.transportType}
                                      </span>
                                    </span>
                                    <span className="text-[#ccff00] font-mono font-bold">
                                      ৳{leg.minFare}–{leg.maxFare} ({leg.fareUnit || 'per person'})
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-zinc-400">
                                    {leg.fromLocation} → {leg.toLocation} ({formatDuration(leg.estimatedDurationMin)})
                                  </p>
                                  {leg.notes && <p className="text-[10px] text-zinc-500 italic">{leg.notes}</p>}
                                </div>
                              ))}
                            </div>

                            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                              <span className="text-zinc-400 font-semibold">Total Estimated Range:</span>
                              <span className="text-white font-mono font-bold">
                                ৳{opt.minFare}–{opt.maxFare} · {formatDuration(opt.estimatedDurationMin)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Transparency Disclaimer Footer */}
          <div className="text-[10px] text-zinc-500 space-y-1 border-t border-white/[0.04] pt-3">
            <p className="leading-snug">
              ⚠️ <strong className="text-zinc-400">Variable Fare Notice:</strong> Community and operator fares shown above are estimated ranges, never guaranteed exact prices. Actual fares vary by season, vehicle class, bargaining, and fuel rates.
            </p>
          </div>
        </div>
      )}

      {/* SECTION B: LOCAL TRANSPORT CONTACTS */}
      {activeSubTab === 'local_transport' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white">Approved Local Transport Contacts</h3>
              <p className="text-[11px] text-zinc-400">
                CNG/Auto, Rickshaw, Easy Bike, Car & Boat contacts moderated by OUTERA and community reports.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddContactForm(!showAddContactForm)}
              className="h-8 px-3 rounded-xl bg-[#ccff00]/15 hover:bg-[#ccff00]/25 text-[#ccff00] text-[11px] font-bold border border-[#ccff00]/30 flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Suggest Contact</span>
            </button>
          </div>

          {showAddContactForm && (
            <form
              onSubmit={handleSubmitLocalContact}
              className="p-4 rounded-2xl bg-black/50 border border-white/[0.1] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#ccff00]">Submit Local Transport Contact (Moderation Required)</span>
                <button
                  type="button"
                  onClick={() => setShowAddContactForm(false)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {contactSubmitMsg && (
                <div className="p-2.5 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/30 text-[#ccff00] text-xs font-semibold">
                  {contactSubmitMsg}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Vehicle Type *</label>
                  <select
                    value={contactVehicleType}
                    onChange={(e) =>
                      setContactVehicleType(e.target.value as LocalTransportContact['vehicleType'])
                    }
                    className="w-full h-9 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white"
                  >
                    <option value="CNG/Auto">CNG/Auto</option>
                    <option value="Rickshaw">Rickshaw</option>
                    <option value="Easy Bike/E-Rickshaw">Easy Bike/E-Rickshaw</option>
                    <option value="Car">Car</option>
                    <option value="Boat/Launch">Boat/Launch</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Driver / Operator Name *</label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Kamal Mia / Ghat Boat Syndicate"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Service Area *</label>
                  <input
                    type="text"
                    required
                    value={contactServiceArea}
                    onChange={(e) => setContactServiceArea(e.target.value)}
                    placeholder="e.g. Srimangal Station to Lawachara"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="017XXXXXXXX"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">WhatsApp (Optional)</label>
                  <input
                    type="text"
                    value={contactWhatsapp}
                    onChange={(e) => setContactWhatsapp(e.target.value)}
                    placeholder="017XXXXXXXX"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Typical Rate Note</label>
                  <input
                    type="text"
                    value={contactRateNote}
                    onChange={(e) => setContactRateNote(e.target.value)}
                    placeholder="e.g. ৳400–600 half-day reserve"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={contactPermission}
                  onChange={(e) => setContactPermission(e.target.checked)}
                  className="rounded border-white/20 bg-black"
                />
                <span>Driver/Operator gave permission to display their phone/WhatsApp publicly once approved</span>
              </label>

              <button
                type="submit"
                disabled={submittingContact}
                className="h-9 px-4 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs cursor-pointer"
              >
                {submittingContact ? 'Submitting...' : 'Submit for Moderation'}
              </button>
            </form>
          )}

          {loadingContacts ? (
            <div className="py-6 text-center text-xs text-zinc-400 font-mono">Loading approved local transport contacts...</div>
          ) : localContacts.length === 0 ? (
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center space-y-1.5">
              <Car className="w-6 h-6 text-zinc-500 mx-auto" />
              <h4 className="text-xs font-bold text-white">No Approved Local Transport Contacts Yet</h4>
              <p className="text-[11px] text-zinc-400 max-w-md mx-auto">
                OUTERA only displays verified, approved local transport contacts with explicit contact permission. Know a reliable local CNG, Easy Bike, or Boat operator here? Suggest one above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {localContacts.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#ccff00]/15 text-[#ccff00] font-bold">
                        {c.vehicleType}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-1">{c.name}</h4>
                      <p className="text-[11px] text-zinc-400">Service Area: {c.serviceArea}</p>
                    </div>
                  </div>

                  {c.rateNote && (
                    <p className="text-[11px] text-zinc-300 bg-black/30 p-2 rounded-lg border border-white/[0.05]">
                      Rate Note: {c.rateNote}
                    </p>
                  )}

                  {/* Verification Badges based strictly on moderation data */}
                  <div className="flex flex-wrap gap-1.5">
                    {c.contactVerified && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                        ✓ Contact Verified
                      </span>
                    )}
                    {c.outeraVerified && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ccff00]/15 text-[#ccff00] border border-[#ccff00]/30">
                        ✓ OUTERA Verified
                      </span>
                    )}
                    {c.communityRecommended && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        ★ Community Recommended ({c.helpfulReportsCount})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-[10px] text-zinc-400">
                    <span>
                      {c.lastVerified
                        ? `Last verified: ${new Date(c.lastVerified).toLocaleDateString()}`
                        : 'Moderation approved'}
                    </span>
                    <div className="flex items-center gap-2">
                      {c.phonePublicPermission && c.phone && (
                        <a
                          href={`tel:${c.phone}`}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white font-bold flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3 text-[#ccff00]" />
                          <span>{c.phone}</span>
                        </a>
                      )}
                      {c.phonePublicPermission && c.whatsapp && (
                        <a
                          href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold flex items-center gap-1"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-zinc-500">
            ⚠️ Verification reflects number confirmation and community moderation logs. Always agree on the fare and route before starting your trip.
          </p>
        </div>
      )}

      {/* SECTION C: STAY NEARBY */}
      {activeSubTab === 'stay_nearby' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white">Stay Nearby</h3>
              <p className="text-[11px] text-zinc-400">
                Approved Hotels, Resorts, Guest Houses, Hostels & Homestays near {place.name}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNearbyCategory('Hotel');
                setShowAddNearbyForm(showAddNearbyForm === 'stay' ? null : 'stay');
              }}
              className="h-8 px-3 rounded-xl bg-[#ccff00]/15 hover:bg-[#ccff00]/25 text-[#ccff00] text-[11px] font-bold border border-[#ccff00]/30 flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Suggest Stay</span>
            </button>
          </div>

          {showAddNearbyForm === 'stay' && (
            <form
              onSubmit={handleSubmitNearbyService}
              className="p-4 rounded-2xl bg-black/50 border border-white/[0.1] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#ccff00]">Suggest Nearby Stay (Moderation Required)</span>
                <button
                  type="button"
                  onClick={() => setShowAddNearbyForm(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {nearbySubmitMsg && (
                <div className="p-2.5 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/30 text-[#ccff00] text-xs font-semibold">
                  {nearbySubmitMsg}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Stay Type *</label>
                  <select
                    value={nearbyCategory}
                    onChange={(e) => setNearbyCategory(e.target.value as NearbyServiceItem['category'])}
                    className="w-full h-9 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white"
                  >
                    <option value="Hotel">Hotel</option>
                    <option value="Resort">Resort</option>
                    <option value="Guest House">Guest House</option>
                    <option value="Hostel">Hostel</option>
                    <option value="Homestay">Homestay</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Property Name *</label>
                  <input
                    type="text"
                    required
                    value={nearbyName}
                    onChange={(e) => setNearbyName(e.target.value)}
                    placeholder="e.g. Hillside Eco Resort"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Price Range (৳/Night)</label>
                  <input
                    type="text"
                    value={nearbyPriceRange}
                    onChange={(e) => setNearbyPriceRange(e.target.value)}
                    placeholder="e.g. ৳1,500 – ৳3,500"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={nearbyDistanceKm}
                    onChange={(e) => setNearbyDistanceKm(e.target.value)}
                    placeholder="e.g. 1.2"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={nearbyContactPhone}
                    onChange={(e) => setNearbyContactPhone(e.target.value)}
                    placeholder="Optional phone"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Directions / Address</label>
                  <input
                    type="text"
                    value={nearbyDirections}
                    onChange={(e) => setNearbyDirections(e.target.value)}
                    placeholder="e.g. 5 min walk from main gate"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={nearbyContactPerm}
                  onChange={(e) => setNearbyContactPerm(e.target.checked)}
                />
                <span>Public business contact number verified for listing</span>
              </label>
              <button
                type="submit"
                disabled={submittingNearby}
                className="h-9 px-4 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs cursor-pointer"
              >
                {submittingNearby ? 'Submitting...' : 'Submit Stay for Review'}
              </button>
            </form>
          )}

          {loadingNearby ? (
            <div className="py-6 text-center text-xs text-zinc-400 font-mono">Checking approved stays nearby...</div>
          ) : stayServices.length === 0 ? (
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center space-y-1.5">
              <Hotel className="w-6 h-6 text-zinc-500 mx-auto" />
              <h4 className="text-xs font-bold text-white">No Approved Stays Listed Nearby Yet</h4>
              <p className="text-[11px] text-zinc-400 max-w-md mx-auto">
                We never invent hotels or fake prices. Suggest a real hotel, resort, guest house, or homestay near {place.name} above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stayServices.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/[0.06] text-[#ccff00] font-bold">
                        {item.category}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-1">{item.name}</h4>
                    </div>
                    {typeof item.distanceKm === 'number' && (
                      <span className="text-xs font-mono font-bold text-[#ccff00] shrink-0">
                        {item.distanceKm} km
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] text-zinc-300">
                    {item.priceRange && <span>Price: {item.priceRange}</span>}
                    <span>· Confidence: {item.communityConfidence}</span>
                    <span>· {item.visitorReportsCount} reports</span>
                  </div>

                  {item.directionsNote && (
                    <p className="text-[11px] text-zinc-400">Directions: {item.directionsNote}</p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-[10px]">
                    <div className="flex gap-1.5">
                      {item.outeraVerified && (
                        <span className="px-2 py-0.5 rounded bg-[#ccff00]/15 text-[#ccff00] font-bold">
                          ✓ OUTERA Verified
                        </span>
                      )}
                      {item.contactVerified && (
                        <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-bold">
                          ✓ Contact Verified
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.contactPhone && (
                        <a
                          href={`tel:${item.contactPhone}`}
                          className="text-white hover:text-[#ccff00] font-mono font-bold"
                        >
                          {item.contactPhone}
                        </a>
                      )}
                      {item.latitude && item.longitude && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#ccff00] hover:underline font-bold flex items-center gap-0.5"
                        >
                          <span>Directions</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION D: EAT NEARBY */}
      {activeSubTab === 'eat_nearby' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-white">Eat Nearby</h3>
              <p className="text-[11px] text-zinc-400">
                Prioritized by: 1. Verified · 2. Community Confidence · 3. Recent Reports · 4. Distance.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNearbyCategory('Restaurant');
                setShowAddNearbyForm(showAddNearbyForm === 'eat' ? null : 'eat');
              }}
              className="h-8 px-3 rounded-xl bg-[#ccff00]/15 hover:bg-[#ccff00]/25 text-[#ccff00] text-[11px] font-bold border border-[#ccff00]/30 flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Suggest Food Spot</span>
            </button>
          </div>

          {showAddNearbyForm === 'eat' && (
            <form
              onSubmit={handleSubmitNearbyService}
              className="p-4 rounded-2xl bg-black/50 border border-white/[0.1] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#ccff00]">Suggest Nearby Eat Spot (Moderation Required)</span>
                <button
                  type="button"
                  onClick={() => setShowAddNearbyForm(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {nearbySubmitMsg && (
                <div className="p-2.5 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/30 text-[#ccff00] text-xs font-semibold">
                  {nearbySubmitMsg}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Category *</label>
                  <select
                    value={nearbyCategory}
                    onChange={(e) => setNearbyCategory(e.target.value as NearbyServiceItem['category'])}
                    className="w-full h-9 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white"
                  >
                    <option value="Restaurant">Restaurant</option>
                    <option value="Cafe">Cafe</option>
                    <option value="Street Food">Street Food</option>
                    <option value="Family Restaurant">Family Restaurant</option>
                    <option value="Local Food">Local Food</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Spot Name *</label>
                  <input
                    type="text"
                    required
                    value={nearbyName}
                    onChange={(e) => setNearbyName(e.target.value)}
                    placeholder="e.g. Panshi / Kutumbari / Local Chaa Stall"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Food Type / Specialty</label>
                  <input
                    type="text"
                    value={nearbyFoodType}
                    onChange={(e) => setNearbyFoodType(e.target.value)}
                    placeholder="e.g. Traditional Bangla, Kala Bhuna, Coffee"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Price Range</label>
                  <input
                    type="text"
                    value={nearbyPriceRange}
                    onChange={(e) => setNearbyPriceRange(e.target.value)}
                    placeholder="e.g. ৳150 – ৳400"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={nearbyDistanceKm}
                    onChange={(e) => setNearbyDistanceKm(e.target.value)}
                    placeholder="e.g. 0.5"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-400 mb-1">Directions</label>
                  <input
                    type="text"
                    value={nearbyDirections}
                    onChange={(e) => setNearbyDirections(e.target.value)}
                    placeholder="Opposite main road"
                    className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submittingNearby}
                className="h-9 px-4 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs cursor-pointer"
              >
                {submittingNearby ? 'Submitting...' : 'Submit Eat Spot for Review'}
              </button>
            </form>
          )}

          {loadingNearby ? (
            <div className="py-6 text-center text-xs text-zinc-400 font-mono">Loading approved dining spots nearby...</div>
          ) : eatServices.length === 0 ? (
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center space-y-1.5">
              <Utensils className="w-6 h-6 text-zinc-500 mx-auto" />
              <h4 className="text-xs font-bold text-white">No Approved Eat Spots Listed Nearby Yet</h4>
              <p className="text-[11px] text-zinc-400 max-w-md mx-auto">
                Have a favorite restaurant, cafe, or local street food spot near {place.name}? Suggest it above for community verification.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {eatServices.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/[0.06] text-[#ccff00] font-bold">
                        {item.category}
                      </span>
                      <h4 className="text-sm font-bold text-white mt-1">{item.name}</h4>
                      {item.foodType && (
                        <p className="text-[11px] text-zinc-400">Food Type: {item.foodType}</p>
                      )}
                    </div>
                    {typeof item.distanceKm === 'number' && (
                      <span className="text-xs font-mono font-bold text-[#ccff00] shrink-0">
                        {item.distanceKm} km
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] text-zinc-300">
                    {item.priceRange && <span>Price: {item.priceRange}</span>}
                    <span>· Confidence: {item.communityConfidence}</span>
                    <span>· {item.visitorReportsCount} visitor reports</span>
                  </div>

                  {item.directionsNote && (
                    <p className="text-[11px] text-zinc-400">Directions: {item.directionsNote}</p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-[10px]">
                    <div className="flex gap-1.5">
                      {item.outeraVerified && (
                        <span className="px-2 py-0.5 rounded bg-[#ccff00]/15 text-[#ccff00] font-bold">
                          ✓ Verified
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.contactPhone && (
                        <a
                          href={`tel:${item.contactPhone}`}
                          className="text-white hover:text-[#ccff00] font-mono font-bold"
                        >
                          {item.contactPhone}
                        </a>
                      )}
                      {item.latitude && item.longitude && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#ccff00] hover:underline font-bold flex items-center gap-0.5"
                        >
                          <span>Directions</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION E: WHILE YOU'RE HERE */}
      {activeSubTab === 'while_here' && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-black text-white">While You're Here</h3>
            <p className="text-[11px] text-zinc-400">
              Nearby tourist places, restaurants, cafes, activities, and local spots from actual OUTERA database locations.
            </p>
          </div>

          {whileHereItems.length === 0 ? (
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center space-y-1.5">
              <Compass className="w-6 h-6 text-zinc-500 mx-auto" />
              <h4 className="text-xs font-bold text-white">No Other Verified Spots in Immediate Radius Yet</h4>
              <p className="text-[11px] text-zinc-400 max-w-md mx-auto">
                Know another great place in {place.district}? Use "+ Suggest a Place" to add it to the map!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {whileHereItems.map(({ place: p, distanceKm, label }) => (
                <div
                  key={p.id}
                  onClick={() => onSelectPlace && onSelectPlace(p)}
                  className={`p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-[#ccff00]/40 transition-all flex items-center gap-3 ${
                    onSelectPlace ? 'cursor-pointer' : ''
                  }`}
                >
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-14 h-14 rounded-xl object-cover shrink-0 border border-white/10"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-white/[0.05] flex items-center justify-center shrink-0 text-[#ccff00]">
                      <MapPin className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#ccff00]/15 text-[#ccff00] font-bold">
                        {label}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-zinc-300">{distanceKm} km</span>
                    </div>
                    <h4 className="text-xs font-bold text-white truncate mt-1">{p.name}</h4>
                    <p className="text-[10px] text-zinc-400 truncate">
                      {p.neighborhood || p.district} · {p.priceLabel || p.priceTier}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Community Fare Reporting Modal */}
      <ReportFareModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        place={place}
        defaultOrigin={originDistrict}
        onFareReported={loadOptions}
      />
    </div>
  );
};
