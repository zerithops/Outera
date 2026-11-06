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
  isEmailVerified,
  PlacePost,
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
import { AuthModal, AuthModalMode } from './components/AuthModal';
import { PlaceSuggestionModal } from './components/PlaceSuggestionModal';
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  AuthCallbackPage,
} from './components/AuthPages';
import { OuteraLogo } from './components/OuteraLogo';
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
  const [authModalInitialMode, setAuthModalInitialMode] = useState<AuthModalMode>('signup');
  const [authContextAction, setAuthContextAction] = useState<string | undefined>(undefined);
  const [authRoute, setAuthRoute] = useState<
    'none' | 'forgot-password' | 'reset-password' | 'auth-callback'
  >('none');

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

  const navigateToAuthRoute = (
    route: 'none' | 'forgot-password' | 'reset-password' | 'auth-callback'
  ) => {
    setAuthRoute(route);
    if (typeof window !== 'undefined' && window.history?.pushState) {
      const targetPath =
        route === 'forgot-password'
          ? '/forgot-password'
          : route === 'reset-password'
          ? '/reset-password'
          : route === 'auth-callback'
          ? '/auth/callback'
          : '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Detect /forgot-password, /reset-password, /auth/callback and auth URL parameters
  useEffect(() => {
    const syncRouteFromLocation = () => {
      const path = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
      const hash = window.location.hash.toLowerCase();
      const search = window.location.search.toLowerCase();

      if (path === '/forgot-password' || hash.startsWith('#/forgot-password') || hash === '#forgot-password') {
        setAuthRoute('forgot-password');
        return;
      }
      if (
        path === '/reset-password' ||
        hash.startsWith('#/reset-password') ||
        hash === '#reset-password' ||
        hash.includes('type=recovery') ||
        search.includes('type=recovery')
      ) {
        setAuthRoute('reset-password');
        return;
      }
      if (
        path === '/auth/callback' ||
        hash.startsWith('#/auth/callback') ||
        search.includes('code=') ||
        search.includes('token_hash=') ||
        search.includes('error_code=') ||
        hash.includes('error_code=') ||
        hash.includes('access_token=')
      ) {
        setAuthRoute('auth-callback');
        return;
      }
      setAuthRoute('none');
    };

    syncRouteFromLocation();
    window.addEventListener('popstate', syncRouteFromLocation);
    window.addEventListener('hashchange', syncRouteFromLocation);
    return () => {
      window.removeEventListener('popstate', syncRouteFromLocation);
      window.removeEventListener('hashchange', syncRouteFromLocation);
    };
  }, []);

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

    const unsubscribeAuth = subscribeToAuthChanges((user, event) => {
      if (isMounted) {
        setAuthUser(user);
        if (event === 'PASSWORD_RECOVERY') {
          setAuthRoute('reset-password');
        }
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

  const requireVerifiedScout = (actionLabel: string, onVerified: () => void) => {
    if (!authUser) {
      setAuthContextAction(actionLabel);
      setAuthModalInitialMode('signup');
      setAuthModalOpen(true);
      return;
    }
    if (!isEmailVerified(authUser)) {
      setAuthContextAction(`${actionLabel} (please verify your email first)`);
      setAuthModalInitialMode('verify_pending');
      setAuthModalOpen(true);
      return;
    }
    onVerified();
  };

  const handleOpenReportFromDetails = (place: PlaceWithDistance) => {
    requireVerifiedScout('share an experience report', () => {
      setDetailsPlace(null);
      setFeedbackPlace(place);
    });
  };

  const handleTabChange = (tab: NavTab) => {
    if (authRoute !== 'none') {
      navigateToAuthRoute('none');
    }
    setShowLocationHub(false);
    if ((tab === 'saved' || tab === 'profile') && !authUser) {
      setAuthContextAction(
        tab === 'saved'
          ? 'view and manage your saved places'
          : 'access your scout profile and stats'
      );
      setAuthModalInitialMode('signin');
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
        <div className="w-full bg-[#0d0f12] border-b border-white/[0.06] px-4 sm:px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-[#ccff00] shrink-0" />
              <span className="font-semibold text-zinc-400 hidden xs:inline shrink-0">Active area:</span>
              <span className="text-zinc-200 font-medium truncate">
                {currentLocation.formattedAddress || `${currentLocation.neighborhoodName}, ${currentLocation.district}`}
              </span>
              {currentLocation.accuracyMeters && (
                <span className="text-zinc-500 font-mono hidden md:inline shrink-0">
                  (±{Math.round(currentLocation.accuracyMeters)}m)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleDetectGPS}
                disabled={isDetectingGPS}
                className="text-zinc-400 hover:text-[#ccff00] text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                title="Refresh GPS"
              >
                <Navigation className={`w-3 h-3 ${isDetectingGPS ? 'animate-spin text-[#ccff00]' : ''}`} />
                <span className="hidden sm:inline">Refresh GPS</span>
              </button>
              <span className="text-zinc-700">·</span>
              <button
                type="button"
                onClick={() => setLocationModalOpen(true)}
                className="text-zinc-300 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer"
              >
                Change Area
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto">
        {authRoute === 'forgot-password' ? (
          <ForgotPasswordPage
            onBackToSignIn={() => {
              navigateToAuthRoute('none');
              setAuthModalInitialMode('signin');
              setAuthModalOpen(true);
            }}
            onGoHome={() => navigateToAuthRoute('none')}
          />
        ) : authRoute === 'reset-password' ? (
          <ResetPasswordPage
            onBackToSignIn={() => {
              navigateToAuthRoute('none');
              setAuthModalInitialMode('signin');
              setAuthModalOpen(true);
            }}
            onGoToForgotPassword={() => navigateToAuthRoute('forgot-password')}
            onGoHome={() => navigateToAuthRoute('none')}
          />
        ) : authRoute === 'auth-callback' ? (
          <AuthCallbackPage
            onNavigateToResetPassword={() => navigateToAuthRoute('reset-password')}
            onNavigateToForgotPassword={() => navigateToAuthRoute('forgot-password')}
            onNavigateToProfile={() => {
              navigateToAuthRoute('none');
              setActiveTab('profile');
            }}
            onGoHome={() => navigateToAuthRoute('none')}
          />
        ) : showLocationHub ? (
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
                  onSuggestPlace={() =>
                    requireVerifiedScout('suggest a new place', () => setSuggestionModalOpen(true))
                  }
                  onCreatePost={() =>
                    requireVerifiedScout('create a community post', () =>
                      setCreatePostModalOpen(true)
                    )
                  }
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
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 id="curated-heading" className="text-lg sm:text-xl font-black text-white tracking-tight">
                        Worth Going To Right Now
                      </h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        High community trust & verified visits around {currentLocation.neighborhoodName}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          requireVerifiedScout('suggest a new place', () =>
                            setSuggestionModalOpen(true)
                          )
                        }
                        className="h-8 px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-bold text-[#ccff00] transition-all"
                      >
                        + Suggest a Place
                      </button>
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
                          onClick={() =>
                            requireVerifiedScout('suggest a new place', () =>
                              setSuggestionModalOpen(true)
                            )
                          }
                          className="w-full sm:w-auto h-11 px-5 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:bg-[#d8ff33] transition-all"
                        >
                          <span>+ Suggest a Place</span>
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
                onSuggestPlace={() =>
                  requireVerifiedScout('suggest a new place', () => setSuggestionModalOpen(true))
                }
                onRequestGPS={handleDetectGPS}
                isDetectingGPS={isDetectingGPS}
                onOpenCreatePost={() =>
                  requireVerifiedScout('share an experience', () => setCreatePostModalOpen(true))
                }
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
                onSuggestPlace={() =>
                  requireVerifiedScout('suggest a new place', () => setSuggestionModalOpen(true))
                }
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
                onOpenSuggestionModal={() => setSuggestionModalOpen(true)}
                onPostsChanged={refreshData}
              />
            )}
          </>
        )}
      </main>

      {/* Official OUTERA Footer */}
      <footer className="w-full border-t border-white/[0.07] bg-[#0b0d10] mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8 pb-8 border-b border-white/[0.06]">
            {/* Brand Column */}
            <div className="lg:col-span-5 space-y-3.5">
              <button
                type="button"
                onClick={() => {
                  setShowLocationHub(false);
                  handleTabChange('discover');
                }}
                className="inline-flex items-center focus:outline-none cursor-pointer"
                aria-label="OUTERA Home"
              >
                <OuteraLogo size="sm" />
              </button>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-sm leading-relaxed">
                Hyper-local discovery and peer-verified transit intelligence across all 8 divisions of Bangladesh. Real places, real Scout experiences, zero sponsored clutter.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    requireVerifiedScout('create a community post', () =>
                      setCreatePostModalOpen(true)
                    )
                  }
                  className="h-9 px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-bold text-white transition-all cursor-pointer"
                >
                  Create Community Post
                </button>
                <button
                  type="button"
                  onClick={() =>
                    requireVerifiedScout('suggest a new place', () =>
                      setSuggestionModalOpen(true)
                    )
                  }
                  className="h-9 px-3.5 rounded-xl bg-[#ccff00]/10 hover:bg-[#ccff00]/15 border border-[#ccff00]/25 text-xs font-bold text-[#ccff00] transition-all cursor-pointer"
                >
                  + Suggest a Place
                </button>
              </div>
            </div>

            {/* Navigation Column */}
            <div className="lg:col-span-3 space-y-2.5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 font-mono">
                Navigation
              </h3>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLocationHub(false);
                      handleTabChange('discover');
                    }}
                    className="hover:text-[#ccff00] transition-colors cursor-pointer"
                  >
                    Discover Feed
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLocationHub(false);
                      handleTabChange('explore');
                    }}
                    className="hover:text-[#ccff00] transition-colors cursor-pointer"
                  >
                    Explore Places & Community
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLocationHub(false);
                      handleTabChange('surprise');
                    }}
                    className="hover:text-[#ccff00] transition-colors cursor-pointer"
                  >
                    Surprise Me Generator
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLocationHub(false);
                      handleTabChange('saved');
                    }}
                    className="hover:text-[#ccff00] transition-colors cursor-pointer"
                  >
                    Saved Collections ({savedPlaceIds.length})
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLocationHub(false);
                      handleTabChange('profile');
                    }}
                    className="hover:text-[#ccff00] transition-colors cursor-pointer"
                  >
                    Scout Profile & Security
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => navigateToAuthRoute('forgot-password')}
                    className="hover:text-[#ccff00] transition-colors cursor-pointer"
                  >
                    Forgot / Reset Password
                  </button>
                </li>
              </ul>
            </div>

            {/* Divisions Directory Column */}
            <div className="lg:col-span-4 space-y-2.5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 font-mono">
                Bangladesh Divisions
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-zinc-300">
                {(
                  [
                    'Dhaka',
                    'Chattogram',
                    'Sylhet',
                    'Rajshahi',
                    'Khulna',
                    'Barishal',
                    'Rangpur',
                    'Mymensingh',
                  ] as DivisionName[]
                ).map((div) => (
                  <button
                    key={div}
                    type="button"
                    onClick={() => {
                      setActiveHubDivision(div);
                      setShowLocationHub(true);
                      window.location.hash = `#location/${div.toLowerCase()}`;
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-left hover:text-[#ccff00] transition-colors truncate cursor-pointer"
                  >
                    {div} Division
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-zinc-500">
            <p>© {new Date().getFullYear()} OUTERA · Hyper-Local Discovery & Transit Network.</p>
            <p className="font-mono text-zinc-400">
              Active area: {currentLocation.neighborhoodName}, {currentLocation.division}
            </p>
          </div>
        </div>
      </footer>

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
        allPlaces={places}
        onSelectAnotherPlace={(p) => {
          const foundRanked = rankedPlaces.find((rp) => rp.id === p.id);
          setDetailsPlace(foundRanked || (p as PlaceWithDistance));
        }}
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
          const target = rankedPlaces.find((p) => p.id === placeId) || places.find((p) => p.id === placeId);
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
        initialMode={authModalInitialMode}
        contextAction={authContextAction}
        onAuthSuccess={() => {
          setAuthModalOpen(false);
          getCurrentUser().then((u) => setAuthUser(u));
        }}
        onOpenForgotPasswordPage={() => navigateToAuthRoute('forgot-password')}
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
        existingPlaces={places}
        onSelectExistingPlace={(placeId) => {
          const found = rankedPlaces.find((p) => p.id === placeId) || places.find((p) => p.id === placeId);
          if (found) {
            setDetailsPlace(found as PlaceWithDistance);
          }
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
