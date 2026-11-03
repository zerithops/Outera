import React, { useState, useMemo, useEffect } from 'react';
import {
  DEFAULT_LOCATION,
  isLocationChosen,
} from './services/location';
import { useUserLocation } from './hooks/useUserLocation';
import {
  DivisionName,
  FilterState,
  MoodCategory,
  Place,
  UserLocation,
  ExperienceReport,
} from './types/outera';
import {
  filterAndRankPlaces,
  PlaceWithDistance,
} from './services/discoveryEngine';
import {
  getAugmentedPlaces,
  getSavedCollections,
  getSavedPlaceIds,
  getUserExperienceReports,
  toggleSavePlace,
  addExperienceReport,
} from './services/storage';
import {
  fetchPlacesFromSupabase,
  fetchUserSavedPlaces,
  fetchUserVisits,
  getCurrentUser,
  subscribeToAuthChanges,
} from './services/supabase';
import { Navbar } from './components/Navbar';
import { BottomNav, NavTab } from './components/BottomNav';
import { HeroSection } from './components/HeroSection';
import { MoodScroller } from './components/MoodScroller';
import { PlaceCard } from './components/PlaceCard';
import { PlaceDetailsModal } from './components/PlaceDetailsModal';
import { PostDetailsModal } from './components/PostDetailsModal';
import { CreatePostModal } from './components/CreatePostModal';
import { CommunityFeedbackModal } from './components/CommunityFeedbackModal';
import { SurpriseMeView } from './components/SurpriseMeView';
import { ExploreView } from './components/ExploreView';
import { SavedView } from './components/SavedView';
import { ProfileView } from './components/ProfileView';
import { LocationHierarchyModal } from './components/LocationHierarchyModal';
import { LocationHubView } from './components/LocationHubView';
import { AuthModal } from './components/AuthModal';
import { PlaceSuggestionModal } from './components/PlaceSuggestionModal';
import { PlacePost } from './services/supabase';
import { Sparkles, ArrowRight, Compass, ShieldCheck, Globe2, MapPin, Navigation } from 'lucide-react';

const INITIAL_FILTERS: FilterState = {
  searchQuery: '',
  selectedCategory: 'all',
  selectedDivision: 'all',
  selectedDistrict: 'all',
  openNowOnly: false,
  priceMax: null,
  maxDistanceKm: null,
  group: 'all',
  environment: 'all',
  vibe: 'all',
  mapLayer: 'all',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('discover');
  const {
    currentLocation,
    detecting: isDetectingGPS,
    detectLocation: handleDetectGPS,
    setManualLocation,
    setCurrentLocation,
  } = useUserLocation();
  const [places, setPlaces] = useState<Place[]>([]);
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>(() => getSavedPlaceIds());
  const [collections, setCollections] = useState(() => getSavedCollections());
  const [userReports, setUserReports] = useState(() => getUserExperienceReports());
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  // Auth state
  const [authUser, setAuthUser] = useState<any>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authContextAction, setAuthContextAction] = useState<string | undefined>(undefined);

  // Modals state
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false);
  const [detailsPlace, setDetailsPlace] = useState<PlaceWithDistance | null>(null);
  const [feedbackPlace, setFeedbackPlace] = useState<PlaceWithDistance | null>(null);

  // Active division view for Location Hub
  const [activeHubDivision, setActiveHubDivision] = useState<'all' | DivisionName>('all');
  const [showLocationHub, setShowLocationHub] = useState(false);

  // Community Post Details & Creation state
  const [selectedPost, setSelectedPost] = useState<PlacePost | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [createPostModalOpen, setCreatePostModalOpen] = useState(false);

  // Listen for #post/<id> in URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const match = hash.match(/^#post\/([a-zA-Z0-9_-]+)$/);
      if (match && match[1]) {
        setSelectedPostId(match[1]);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleOpenPostDetails = (post: PlacePost) => {
    setSelectedPost(post);
    setSelectedPostId(post.id);
    window.location.hash = `post/${post.id}`;
  };

  const handleClosePostDetails = () => {
    setSelectedPost(null);
    setSelectedPostId(null);
    if (window.location.hash.startsWith('#post/')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  // Sync Supabase places and authenticated user data
  useEffect(() => {
    let isMounted = true;

    // Load places strictly from Supabase places table
    fetchPlacesFromSupabase().then((supabasePlaces) => {
      if (isMounted) {
        setPlaces(getAugmentedPlaces(supabasePlaces || []));
      }
    });

    // Check auth status
    getCurrentUser().then((user) => {
      if (isMounted) setAuthUser(user);
    });

    const unsubscribeAuth = subscribeToAuthChanges((user) => {
      if (isMounted) {
        setAuthUser(user);
        if (user) {
          fetchUserSavedPlaces().then((supabaseSaved) => {
            if (isMounted && supabaseSaved) {
              setSavedPlaceIds(Array.from(new Set(supabaseSaved)));
            }
          });
        } else {
          setSavedPlaceIds([]);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribeAuth();
    };
  }, []);

  // Handle URL hashtag routes for /bangladesh, /dhaka, etc.
  useEffect(() => {
    const handleHashRoute = () => {
      const hash = window.location.hash.toLowerCase().replace('#', '').replace(/^\//, '');
      if (hash === 'bangladesh') {
        setActiveHubDivision('all');
        setShowLocationHub(true);
      } else if (hash === 'dhaka' || hash === 'location/dhaka') {
        setActiveHubDivision('Dhaka');
        setShowLocationHub(true);
      } else if (hash === 'chattogram' || hash === 'location/chattogram') {
        setActiveHubDivision('Chattogram');
        setShowLocationHub(true);
      } else if (hash === 'sylhet' || hash === 'location/sylhet') {
        setActiveHubDivision('Sylhet');
        setShowLocationHub(true);
      } else if (hash === 'rajshahi' || hash === 'location/rajshahi') {
        setActiveHubDivision('Rajshahi');
        setShowLocationHub(true);
      } else if (hash === 'khulna' || hash === 'location/khulna') {
        setActiveHubDivision('Khulna');
        setShowLocationHub(true);
      } else if (hash === 'barishal' || hash === 'location/barishal') {
        setActiveHubDivision('Barishal');
        setShowLocationHub(true);
      } else if (hash === 'rangpur' || hash === 'location/rangpur') {
        setActiveHubDivision('Rangpur');
        setShowLocationHub(true);
      } else if (hash === 'mymensingh' || hash === 'location/mymensingh') {
        setActiveHubDivision('Mymensingh');
        setShowLocationHub(true);
      }
    };

    handleHashRoute();
    window.addEventListener('hashchange', handleHashRoute);
    return () => window.removeEventListener('hashchange', handleHashRoute);
  }, []);

  // Filtered and ranked places list
  const rankedPlaces = useMemo(() => {
    return filterAndRankPlaces(places, currentLocation.coords, filters);
  }, [places, currentLocation.coords, filters]);

  // Saved places mapped with distance
  const savedPlacesWithDistance = useMemo(() => {
    return filterAndRankPlaces(
      places.filter((p) => savedPlaceIds.includes(p.id)),
      currentLocation.coords,
      INITIAL_FILTERS
    );
  }, [places, savedPlaceIds, currentLocation.coords]);

  // Auth-gated save action
  const handleToggleSave = (e?: React.MouseEvent, placeId?: string) => {
    if (e) e.stopPropagation();
    if (!placeId) return;

    if (!authUser) {
      setAuthContextAction('save places to your scout vault');
      setAuthModalOpen(true);
      return;
    }

    const updated = toggleSavePlace(placeId);
    setSavedPlaceIds(updated);
  };

  const handleOpenExploreNearMe = () => {
    setLocationModalOpen(true);
  };

  const handleCategorySelectFromHome = (category: 'all' | MoodCategory) => {
    setFilters((prev) => ({ ...prev, selectedCategory: category }));
    if (category !== 'all') {
      setShowLocationHub(false);
      setActiveTab('explore');
    }
  };

  const refreshData = () => {
    fetchPlacesFromSupabase().then((supabasePlaces) => {
      const updated = getAugmentedPlaces(supabasePlaces || []);
      setPlaces(updated);
      if (detailsPlace) {
        const refreshedRanked = filterAndRankPlaces(
          updated,
          currentLocation.coords,
          INITIAL_FILTERS
        );
        const updatedItem = refreshedRanked.find((p) => p.id === detailsPlace.id);
        if (updatedItem) setDetailsPlace(updatedItem);
      }
    });
  };

  const handleFeedbackSubmit = (report: ExperienceReport) => {
    const updatedReports = addExperienceReport(report);
    setUserReports(updatedReports);
    refreshData();
  };

  const handleOpenReportFromDetails = (place: PlaceWithDistance) => {
    if (!authUser) {
      setAuthContextAction('share an experience report');
      setAuthModalOpen(true);
      return;
    }
    setDetailsPlace(null);
    setFeedbackPlace(place);
  };

  const handleTabChange = (tab: NavTab) => {
    setShowLocationHub(false);
    if ((tab === 'saved' || tab === 'profile') && !authUser) {
      setAuthContextAction(
        tab === 'saved'
          ? 'view and manage your saved places'
          : 'access your scout profile and stats'
      );
      setAuthModalOpen(true);
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#090a0c] text-[#f4f4f5] flex flex-col antialiased selection:bg-[#ccff00] selection:text-black pb-24 md:pb-8 overflow-x-hidden">
      {/* Top Navigation */}
      <Navbar
        currentLocation={currentLocation}
        onOpenLocationModal={() => setLocationModalOpen(true)}
        onOpenSearch={() => {
          setShowLocationHub(false);
          setActiveTab('explore');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        savedCount={savedPlaceIds.length}
      />

      {/* Dynamic Location Banner */}
      {!isLocationChosen(currentLocation) ? (
        currentLocation.status === 'detecting' || isDetectingGPS ? (
          <aside
            aria-label="Location detecting"
            className="w-full bg-gradient-to-r from-[#14181f] to-[#1a1f26] border-b border-white/[0.08] px-4 sm:px-6 py-3"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Navigation className="w-4 h-4 text-[#ccff00] animate-spin shrink-0" />
                <p className="text-zinc-200">
                  <span className="font-bold text-white">Finding your location...</span> Pinpointing GPS coordinates and looking up address.
                </p>
              </div>
            </div>
          </aside>
        ) : currentLocation.status === 'denied' ? (
          <aside
            aria-label="Location permission denied"
            className="w-full bg-gradient-to-r from-amber-950/40 via-[#181313] to-[#1a1414] border-b border-amber-500/20 px-4 sm:px-6 py-3"
          >
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-zinc-200">
                  <span className="font-bold text-amber-300">Location access is off:</span> Allow location access to discover places near you.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDetectGPS}
                  className="h-8 px-3 rounded-lg bg-[#ccff00] text-black font-extrabold text-[11px] uppercase tracking-wider hover:bg-[#d8ff33] active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Try Again</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLocationModalOpen(true)}
                  className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold border border-white/[0.08] transition-all"
                >
                  Choose Area
                </button>
              </div>
            </div>
          </aside>
        ) : currentLocation.status === 'unavailable' || currentLocation.status === 'timeout' ? (
          <aside
            aria-label="Location unavailable"
            className="w-full bg-gradient-to-r from-zinc-900 to-zinc-950 border-b border-white/[0.08] px-4 sm:px-6 py-3"
          >
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
                <p className="text-zinc-300">
                  <span className="font-bold text-white">Location access unavailable:</span> {currentLocation.errorMessage || 'Could not acquire GPS coordinates. Ensure device location is turned on.'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDetectGPS}
                  className="h-8 px-3 rounded-lg bg-[#ccff00] text-black font-extrabold text-[11px] uppercase tracking-wider hover:bg-[#d8ff33] active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Try Again</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLocationModalOpen(true)}
                  className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold border border-white/[0.08] transition-all"
                >
                  Choose Area
                </button>
              </div>
            </div>
          </aside>
        ) : (
          <aside
            aria-label="Location preference prompt"
            className="w-full bg-gradient-to-r from-[#14181f] to-[#1a1f26] border-b border-white/[0.08] px-4 sm:px-6 py-3"
          >
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#ccff00] shrink-0" />
                <p className="text-zinc-200">
                  <span className="font-bold text-white">Find what's around you:</span> Detect your real location to explore nearby hangout spots.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDetectGPS}
                  disabled={isDetectingGPS}
                  className="h-8 px-3 rounded-lg bg-[#ccff00] text-black font-extrabold text-[11px] uppercase tracking-wider hover:bg-[#d8ff33] active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Navigation className="w-3 h-3" />
                  <span>Use My Location</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLocationModalOpen(true)}
                  className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold border border-white/[0.08] transition-all"
                >
                  Choose Area
                </button>
              </div>
            </div>
          </aside>
        )
      ) : (
        <div className="w-full bg-[#0d0f12] border-b border-white/[0.05] px-4 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-[#ccff00] animate-pulse shrink-0" />
              <span className="font-bold text-white shrink-0">Location detected:</span>
              <span className="text-zinc-300 truncate">
                {currentLocation.formattedAddress || `${currentLocation.neighborhoodName}, ${currentLocation.district}`}
              </span>
              {currentLocation.accuracyMeters && (
                <span className="text-zinc-500 font-mono hidden md:inline shrink-0">
                  (±{Math.round(currentLocation.accuracyMeters)}m)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDetectGPS}
                disabled={isDetectingGPS}
                className="text-zinc-400 hover:text-[#ccff00] text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                title="Refresh GPS"
              >
                <Navigation className={`w-3 h-3 ${isDetectingGPS ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh GPS</span>
              </button>
              <span className="text-zinc-700">·</span>
              <button
                type="button"
                onClick={() => setLocationModalOpen(true)}
                className="text-zinc-400 hover:text-white text-[11px] font-semibold transition-colors"
              >
                Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto">
        {/* Conditional Bangladesh Location Hub View */}
        {showLocationHub ? (
          <div className="space-y-4">
            <div className="px-4 sm:px-6 pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowLocationHub(false)}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 font-semibold"
              >
                ← Back to Discover Feed
              </button>
            </div>
            <LocationHubView
              places={rankedPlaces}
              currentLocation={currentLocation}
              selectedDivision={activeHubDivision}
              onSelectDivision={(div) => {
                setActiveHubDivision(div);
                window.location.hash = div === 'all' ? '#bangladesh' : `#location/${div.toLowerCase()}`;
              }}
              savedPlaceIds={savedPlaceIds}
              onToggleSave={(e, id) => handleToggleSave(e, id)}
              onSelectPlace={(place) => setDetailsPlace(place)}
              onOpenHierarchyModal={() => setLocationModalOpen(true)}
            />
          </div>
        ) : (
          <>
            {/* Tab 1: Discover (Home) */}
            {activeTab === 'discover' && (
              <div className="space-y-4">
                {/* Hero Section */}
                <HeroSection
                  onExploreNearMe={handleOpenExploreNearMe}
                  onSurpriseMe={() => setActiveTab('surprise')}
                  currentNeighborhood={currentLocation.neighborhoodName}
                />

                {/* Nationwide Bangladesh Gateway Strip */}
                <section className="px-4 sm:px-6">
                  <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#ccff00]/10 flex items-center justify-center shrink-0">
                        <Globe2 className="w-4 h-4 text-[#ccff00]" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-white">
                          Bangladesh Discovery Directory
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          Currently viewing: {currentLocation.neighborhoodName} ({currentLocation.division} Division)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveHubDivision('all');
                          setShowLocationHub(true);
                          window.location.hash = '#bangladesh';
                        }}
                        className="h-8 px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-white border border-white/[0.1] transition-all"
                      >
                        All 8 Divisions
                      </button>

                      <button
                        type="button"
                        onClick={() => setLocationModalOpen(true)}
                        className="h-8 px-3 rounded-lg bg-[#ccff00] text-black font-extrabold text-[11px] uppercase tracking-wider hover:bg-[#d4ff1a] transition-all"
                      >
                        Pick Location
                      </button>
                    </div>
                  </div>
                </section>

                {/* Mood Categories Carousel */}
                <MoodScroller
                  selectedCategory={filters.selectedCategory}
                  onSelectCategory={handleCategorySelectFromHome}
                />

                {/* Curated Drop: Trending / Closest Spots */}
                <section className="px-4 sm:px-6 py-2" aria-labelledby="curated-heading">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 id="curated-heading" className="text-lg sm:text-xl font-black text-white tracking-tight">
                        Worth Going To Right Now
                      </h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        High community trust & verified visits around {currentLocation.neighborhoodName}
                      </p>
                    </div>

                    {rankedPlaces.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('explore')}
                        className="text-xs font-bold text-[#ccff00] hover:underline flex items-center gap-1"
                      >
                        <span>See all ({rankedPlaces.length})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Cards Grid OR Clean Empty State */}
                  {rankedPlaces.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      {rankedPlaces.slice(0, 6).map((place) => (
                        <PlaceCard
                          key={place.id}
                          place={place}
                          isSaved={savedPlaceIds.includes(place.id)}
                          onToggleSave={(e) => handleToggleSave(e, place.id)}
                          onSelect={(p) => setDetailsPlace(p)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="py-16 px-6 rounded-3xl bg-white/[0.02] border border-white/[0.06] text-center max-w-md mx-auto space-y-4 my-2">
                      <MapPin className="w-10 h-10 text-zinc-500 mx-auto" />
                      <div className="space-y-1">
                        <h3 className="text-lg font-black text-white tracking-tight">
                          Nothing around you yet
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          OUTERA is still growing here. Be the first to add a spot in {currentLocation.neighborhoodName}!
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() => setSuggestionModalOpen(true)}
                          className="w-full sm:w-auto h-11 px-5 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:bg-[#d8ff33] transition-all"
                        >
                          <span>Suggest a place</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setLocationModalOpen(true)}
                          className="w-full sm:w-auto h-11 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white text-xs font-bold border border-white/[0.08] transition-all"
                        >
                          Choose your area
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* Signature Feature Banner: Surprise Me */}
                <section className="px-4 sm:px-6 py-6">
                  <div className="p-6 rounded-3xl bg-gradient-to-r from-[#12151a] to-[#181d24] border border-white/[0.08] relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div
                      className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-[#ccff00]/10 blur-2xl pointer-events-none"
                      aria-hidden="true"
                    />

                    <div className="relative z-10 max-w-md">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#ccff00] mb-2 uppercase tracking-wider">
                        <Sparkles className="w-4 h-4" />
                        <span>Signature Discovery Mode</span>
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                        Tired of deciding where to go?
                      </h3>
                      <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                        Tap Surprise Me to generate one tailored spot that fits your budget and distance. No doom-scrolling menus.
                      </p>
                    </div>

                    <div className="relative z-10 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveTab('surprise')}
                        className="h-12 px-6 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 hover:bg-[#d4ff1a] active:scale-[0.98] transition-all electric-glow-sm"
                      >
                        <span>Try Surprise Me</span>
                        <Sparkles className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </section>

                {/* Trust & Community Guarantee */}
                <section className="px-4 sm:px-6 py-4">
                  <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-4">
                    <ShieldCheck className="w-8 h-8 text-[#ccff00] shrink-0" />
                    <div className="text-xs">
                      <p className="font-bold text-white">100% Peer-Verified Community Insights</p>
                      <p className="text-zinc-400 mt-0.5">
                        No bots or sponsored review stuffing. Verified crowd levels, price perceptions, and agreement ratios from people who actually visited.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* Tab 2: Explore */}
            {activeTab === 'explore' && (
              <ExploreView
                places={rankedPlaces}
                currentLocation={currentLocation}
                filters={filters}
                onChangeFilters={setFilters}
                savedPlaceIds={savedPlaceIds}
                onToggleSave={(e, id) => handleToggleSave(e, id)}
                onSelectPlace={(place) => setDetailsPlace(place)}
                onOpenLocationModal={() => setLocationModalOpen(true)}
                onSuggestPlace={() => setSuggestionModalOpen(true)}
                onRequestGPS={handleDetectGPS}
                isDetectingGPS={isDetectingGPS}
                onOpenCreatePost={() => {
                  if (!authUser) {
                    setAuthContextAction('share an experience');
                    setAuthModalOpen(true);
                  } else {
                    setCreatePostModalOpen(true);
                  }
                }}
                onSelectPost={handleOpenPostDetails}
              />
            )}

            {/* Tab 3: Surprise */}
            {activeTab === 'surprise' && (
              <SurpriseMeView
                places={places}
                userLocation={currentLocation}
                isSaved={Boolean(places[0] && savedPlaceIds.includes(places[0].id))}
                onToggleSave={(id) => handleToggleSave(undefined, id)}
                onSelectPlace={(place) => setDetailsPlace(place)}
                onSuggestPlace={() => setSuggestionModalOpen(true)}
              />
            )}

            {/* Tab 4: Saved */}
            {activeTab === 'saved' && (
              <SavedView
                savedPlaces={savedPlacesWithDistance}
                collections={collections}
                onToggleSave={(e, id) => handleToggleSave(e, id)}
                onSelectPlace={(place) => setDetailsPlace(place)}
                onGoToDiscover={() => setActiveTab('discover')}
                onRefreshCollections={() => setCollections(getSavedCollections())}
                isAuthenticated={Boolean(authUser)}
                onOpenAuthModal={() => {
                  setAuthContextAction('save and organize favorite places');
                  setAuthModalOpen(true);
                }}
              />
            )}

            {/* Tab 5: Profile */}
            {activeTab === 'profile' && (
              <ProfileView
                currentLocation={currentLocation}
                onSelectLocation={setCurrentLocation}
                savedCount={savedPlaceIds.length}
                reportCount={userReports.length}
                onOpenAuthModal={() => {
                  setAuthContextAction('access your scout profile');
                  setAuthModalOpen(true);
                }}
                onSelectPost={handleOpenPostDetails}
              />
            )}
          </>
        )}
      </main>

      {/* Place Details Modal View */}
      <PlaceDetailsModal
        place={detailsPlace}
        isOpen={Boolean(detailsPlace)}
        onClose={() => setDetailsPlace(null)}
        isSaved={Boolean(detailsPlace && savedPlaceIds.includes(detailsPlace.id))}
        onToggleSave={(id) => handleToggleSave(undefined, id)}
        onOpenReportModal={handleOpenReportFromDetails}
        onPlaceUpdated={refreshData}
        isAuthenticated={Boolean(authUser)}
        onRequireAuth={(action) => {
          setAuthContextAction(action);
          setAuthModalOpen(true);
        }}
        userLocation={currentLocation}
        onSelectPost={handleOpenPostDetails}
        currentUserId={authUser?.id}
        isAdmin={authUser?.role === 'admin'}
      />

      {/* Community Post Details Modal View */}
      <PostDetailsModal
        postId={selectedPostId}
        post={selectedPost}
        isOpen={Boolean(selectedPostId || selectedPost)}
        onClose={handleClosePostDetails}
        onPostDeleted={() => {
          handleClosePostDetails();
          refreshData();
        }}
        onSelectPlace={(placeId) => {
          handleClosePostDetails();
          const target = places.find((p) => p.id === placeId);
          if (target) {
            setDetailsPlace(target as PlaceWithDistance);
          }
        }}
        currentUserId={authUser?.id}
        isAdmin={authUser?.role === 'admin'}
        onRequireAuth={(action) => {
          setAuthContextAction(action);
          setAuthModalOpen(true);
        }}
      />

      {/* General Community Post Creation Modal */}
      <CreatePostModal
        isOpen={createPostModalOpen}
        onClose={() => setCreatePostModalOpen(false)}
        onPostSubmitted={() => {
          refreshData();
        }}
        onRequireAuth={(action) => {
          setAuthContextAction(action);
          setAuthModalOpen(true);
        }}
      />

      {/* Community Feedback Modal */}
      <CommunityFeedbackModal
        place={feedbackPlace}
        isOpen={Boolean(feedbackPlace)}
        onClose={() => setFeedbackPlace(null)}
        onSubmit={handleFeedbackSubmit}
      />

      {/* Hierarchical Bangladesh Location Modal */}
      <LocationHierarchyModal
        isOpen={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        currentLocation={currentLocation}
        onSelectLocation={(newLoc) => setManualLocation(newLoc)}
      />

      {/* Unified OUTERA Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        contextAction={authContextAction}
        onAuthSuccess={() => {
          setAuthModalOpen(false);
          getCurrentUser().then((u) => setAuthUser(u));
        }}
      />

      {/* Place Suggestion Modal */}
      <PlaceSuggestionModal
        isOpen={suggestionModalOpen}
        onClose={() => setSuggestionModalOpen(false)}
        defaultDivision={currentLocation.division || 'Dhaka'}
        defaultDistrict={currentLocation.district !== 'Select Location' ? currentLocation.district : 'Dhaka'}
        onOpenAuthModal={() => {
          setAuthContextAction('suggest a new place');
          setAuthModalOpen(true);
        }}
      />

      {/* Bottom Sticky Tab Navigation - Visible on Mobile, Replaced by Top Navbar on Desktop */}
      <div className="md:hidden">
        <BottomNav
          activeTab={activeTab}
          onChangeTab={handleTabChange}
          savedCount={savedPlaceIds.length}
        />
      </div>
    </div>
  );
}
