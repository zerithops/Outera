import React, { useState, useMemo, useEffect } from 'react';
import {
  DEFAULT_LOCATION,
  requestBrowserLocation,
} from './services/location';
import {
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
import { Navbar } from './components/Navbar';
import { BottomNav, NavTab } from './components/BottomNav';
import { HeroSection } from './components/HeroSection';
import { MoodScroller } from './components/MoodScroller';
import { PlaceCard } from './components/PlaceCard';
import { PlaceDetailsModal } from './components/PlaceDetailsModal';
import { CommunityFeedbackModal } from './components/CommunityFeedbackModal';
import { SurpriseMeView } from './components/SurpriseMeView';
import { ExploreView } from './components/ExploreView';
import { SavedView } from './components/SavedView';
import { ProfileView } from './components/ProfileView';
import { LocationModal } from './components/LocationModal';
import { Sparkles, ArrowRight, Compass, ShieldCheck } from 'lucide-react';

const INITIAL_FILTERS: FilterState = {
  searchQuery: '',
  selectedCategory: 'all',
  openNowOnly: false,
  priceMax: null,
  maxDistanceKm: null,
  group: 'all',
  environment: 'all',
  vibe: 'all',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('discover');
  const [currentLocation, setCurrentLocation] = useState<UserLocation>(DEFAULT_LOCATION);
  const [places, setPlaces] = useState<Place[]>(() => getAugmentedPlaces());
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>(() => getSavedPlaceIds());
  const [collections, setCollections] = useState(() => getSavedCollections());
  const [userReports, setUserReports] = useState(() => getUserExperienceReports());
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  // Modals state
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [detailsPlace, setDetailsPlace] = useState<PlaceWithDistance | null>(null);
  const [feedbackPlace, setFeedbackPlace] = useState<PlaceWithDistance | null>(null);

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

  const handleToggleSave = (e?: React.MouseEvent, placeId?: string) => {
    if (e) e.stopPropagation();
    if (!placeId) return;
    const updated = toggleSavePlace(placeId);
    setSavedPlaceIds(updated);
  };

  const handleOpenExploreNearMe = () => {
    // Open location modal to allow detecting or picking
    setLocationModalOpen(true);
  };

  const handleCategorySelectFromHome = (category: 'all' | MoodCategory) => {
    setFilters((prev) => ({ ...prev, selectedCategory: category }));
    if (category !== 'all') {
      setActiveTab('explore');
    }
  };

  const handleFeedbackSubmit = (report: ExperienceReport) => {
    const updatedReports = addExperienceReport(report);
    setUserReports(updatedReports);
    // Refresh augmented places with new aggregated stats
    const updatedPlaces = getAugmentedPlaces();
    setPlaces(updatedPlaces);

    // If currently viewing details for this place, update its instance
    if (detailsPlace && detailsPlace.id === report.placeId) {
      const refreshedRanked = filterAndRankPlaces(
        updatedPlaces,
        currentLocation.coords,
        INITIAL_FILTERS
      );
      const updatedItem = refreshedRanked.find((p) => p.id === report.placeId);
      if (updatedItem) setDetailsPlace(updatedItem);
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0c] text-[#f4f4f5] flex flex-col antialiased selection:bg-[#ccff00] selection:text-black pb-24">
      {/* Top Navigation */}
      <Navbar
        currentLocation={currentLocation}
        onOpenLocationModal={() => setLocationModalOpen(true)}
        onOpenSearch={() => {
          setActiveTab('explore');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        activeTab={activeTab}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto">
        {/* Tab 1: Discover (Home) */}
        {activeTab === 'discover' && (
          <div className="space-y-4">
            {/* Hero Section */}
            <HeroSection
              onExploreNearMe={handleOpenExploreNearMe}
              onSurpriseMe={() => setActiveTab('surprise')}
              currentNeighborhood={currentLocation.neighborhoodName}
            />

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
                    Highest community trust within your radius
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('explore')}
                  className="text-xs font-bold text-[#ccff00] hover:underline flex items-center gap-1"
                >
                  <span>See all ({rankedPlaces.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Cards Grid */}
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
                  <p className="font-bold text-white">100% Real Community Insights</p>
                  <p className="text-zinc-400 mt-0.5">
                    No sponsored review stuffing. Verified crowd, price perception, and return rates from people who actually went.
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
          />
        )}

        {/* Tab 3: Surprise */}
        {activeTab === 'surprise' && (
          <SurpriseMeView
            places={places}
            userLocation={currentLocation}
            isSaved={Boolean(savedPlaceIds.includes(places[0]?.id))}
            onToggleSave={(id) => handleToggleSave(undefined, id)}
            onSelectPlace={(place) => setDetailsPlace(place)}
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
          />
        )}

        {/* Tab 5: Profile */}
        {activeTab === 'profile' && (
          <ProfileView
            currentLocation={currentLocation}
            onSelectLocation={setCurrentLocation}
            savedCount={savedPlaceIds.length}
            reportCount={userReports.length}
          />
        )}
      </main>

      {/* Place Details Modal View */}
      <PlaceDetailsModal
        place={detailsPlace}
        isOpen={Boolean(detailsPlace)}
        onClose={() => setDetailsPlace(null)}
        isSaved={Boolean(detailsPlace && savedPlaceIds.includes(detailsPlace.id))}
        onToggleSave={(id) => handleToggleSave(undefined, id)}
        onOpenReportModal={(place) => {
          setDetailsPlace(null);
          setFeedbackPlace(place);
        }}
      />

      {/* Community Feedback Modal */}
      <CommunityFeedbackModal
        place={feedbackPlace}
        isOpen={Boolean(feedbackPlace)}
        onClose={() => setFeedbackPlace(null)}
        onSubmit={handleFeedbackSubmit}
      />

      {/* Location Modal */}
      <LocationModal
        isOpen={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        currentLocation={currentLocation}
        onSelectLocation={(newLoc) => setCurrentLocation(newLoc)}
      />

      {/* Bottom Sticky Tab Navigation */}
      <BottomNav
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        savedCount={savedPlaceIds.length}
      />
    </div>
  );
}
