import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  MapPin,
  SlidersHorizontal,
  LayoutGrid,
  Map as MapIcon,
  X,
  Clock,
  Navigation,
  Plus,
  MessageSquarePlus,
  Sparkles,
  Share2,
  Star,
  CheckCircle2,
  Tag,
} from 'lucide-react';
import { FilterState, Place, UserLocation } from '../types/outera';
import {
  PlaceWithDistance,
  filterAndRankPlaces,
  filterApprovedPublicPosts,
  normalizeCategoryName,
} from '../services/discoveryEngine';
import { PlaceCard } from './PlaceCard';
import { FilterBar } from './FilterBar';
import { MoodScroller } from './MoodScroller';
import { DiscoveryMap } from './DiscoveryMap';
import { useSearchHistory } from '../hooks/useSearchHistory';
import {
  PlacePost,
  fetchPublicPlacePosts,
  subscribeToPostChanges,
} from '../services/supabase';
import { shareCommunityPost } from '../services/postUrl';

interface ExploreViewProps {
  places: PlaceWithDistance[];
  allPlaces?: Place[];
  currentLocation: UserLocation;
  filters: FilterState;
  onChangeFilters: (filters: FilterState) => void;
  savedPlaceIds: string[];
  onToggleSave: (e: React.MouseEvent, id: string) => void;
  onSelectPlace: (place: PlaceWithDistance) => void;
  onOpenLocationModal: () => void;
  onSuggestPlace?: () => void;
  onRequestGPS?: () => void;
  isDetectingGPS?: boolean;
  onOpenCreatePost?: () => void;
  onSelectPost?: (post: PlacePost) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  places,
  allPlaces,
  currentLocation,
  filters,
  onChangeFilters,
  savedPlaceIds,
  onToggleSave,
  onSelectPlace,
  onOpenLocationModal,
  onSuggestPlace,
  onRequestGPS,
  isDetectingGPS = false,
  onOpenCreatePost,
  onSelectPost,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [publicPosts, setPublicPosts] = useState<PlacePost[]>([]);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);

  const catalogPlaces = useMemo(
    () => (allPlaces && allPlaces.length > 0 ? allPlaces : places),
    [allPlaces, places]
  );

  // Filter and rank places using active category, search query, and location filters
  const filteredPlaces = useMemo(() => {
    return filterAndRankPlaces(catalogPlaces, currentLocation.coords, filters);
  }, [catalogPlaces, currentLocation.coords, filters]);

  // Filter approved public posts by active category, search query, and location filters
  const filteredPublicPosts = useMemo(() => {
    return filterApprovedPublicPosts(publicPosts, catalogPlaces, filters);
  }, [publicPosts, catalogPlaces, filters]);

  const loadApprovedPosts = useCallback(async () => {
    const posts = await fetchPublicPlacePosts();
    setPublicPosts(posts || []);
  }, []);

  useEffect(() => {
    loadApprovedPosts();
    const unsub = subscribeToPostChanges((evt) => {
      if (evt.type === 'deleted') {
        setPublicPosts((prev) => prev.filter((p) => p.id !== evt.postId));
      } else {
        loadApprovedPosts();
      }
    });
    return () => unsub();
  }, [loadApprovedPosts]);

  // Hook that automatically records user's searches into Supabase search_history
  const { recentSearches } = useSearchHistory(
    filters.searchQuery,
    currentLocation.neighborhoodName,
    filteredPlaces.length
  );

  const hasActiveFilters =
    filters.selectedCategory !== 'all' ||
    filters.searchQuery.trim().length > 0 ||
    (filters.selectedDivision && filters.selectedDivision !== 'all') ||
    (filters.selectedDistrict && filters.selectedDistrict !== 'all') ||
    filters.openNowOnly ||
    filters.priceMax !== null ||
    filters.maxDistanceKm !== null ||
    filters.group !== 'all' ||
    filters.environment !== 'all' ||
    filters.vibe !== 'all';

  const activeCategoryLabel =
    filters.selectedCategory !== 'all'
      ? normalizeCategoryName(filters.selectedCategory)
      : null;

  const handleResetFilters = () => {
    onChangeFilters({
      ...filters,
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
    });
  };

  return (
    <div className="w-full px-4 sm:px-6 py-4 space-y-5">
      {/* Location Status / Permission Banner */}
      {!currentLocation.coords && (
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                currentLocation.status === 'denied'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-[#ccff00]/10 text-[#ccff00]'
              }`}
            >
              <Navigation className={`w-3.5 h-3.5 ${isDetectingGPS ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <p className="font-bold text-white">
                {currentLocation.status === 'denied'
                  ? 'Location access is off'
                  : currentLocation.status === 'detecting'
                  ? 'Finding your location...'
                  : 'Find what is around you'}
              </p>
              <p className="text-[11px] text-zinc-400">
                {currentLocation.status === 'denied'
                  ? 'Allow location access to discover places near you.'
                  : currentLocation.status === 'detecting'
                  ? 'Pinpointing GPS coordinates and calculating distances...'
                  : 'Detect your GPS to calculate real walk/ride distances and sort by proximity.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {onRequestGPS && (
              <button
                type="button"
                onClick={onRequestGPS}
                disabled={isDetectingGPS}
                className="h-8 px-3 rounded-lg bg-[#ccff00] text-black font-extrabold text-[11px] uppercase tracking-wider hover:bg-[#d8ff33] transition-all disabled:opacity-50"
              >
                {isDetectingGPS
                  ? 'Locating...'
                  : currentLocation.status === 'denied'
                  ? 'Try Again'
                  : 'Use My Location'}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenLocationModal}
              className="h-8 px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white text-[11px] font-semibold border border-white/[0.08] transition-all"
            >
              Choose Area
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[#ccff00]">
              Discover Feed
            </span>
            <span className="text-zinc-600">·</span>
            <button
              type="button"
              onClick={onOpenLocationModal}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              <MapPin className="w-3.5 h-3.5 text-[#ccff00]" />
              <span>
                {currentLocation.neighborhoodName !== 'Location not set'
                  ? currentLocation.neighborhoodName
                  : 'Set Location'}
              </span>
            </button>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {activeCategoryLabel ? `${activeCategoryLabel} Spots` : 'Things around you'}
          </h1>
        </div>

        {/* Controls: Two Separate Scout Actions + View Toggle */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {onOpenCreatePost && (
            <button
              type="button"
              onClick={onOpenCreatePost}
              className="h-9 px-3 sm:px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all flex-1 sm:flex-initial whitespace-nowrap"
              title="Write a review or share an experience for an existing place"
            >
              <MessageSquarePlus className="w-3.5 h-3.5 text-[#ccff00] shrink-0" />
              <span>Create Community Post</span>
            </button>
          )}

          {onSuggestPlace && (
            <button
              type="button"
              onClick={onSuggestPlace}
              className="h-9 px-3 sm:px-3.5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-[#ccff00]/10 active:scale-95 transition-all flex-1 sm:flex-initial whitespace-nowrap"
              title="Propose a brand new place to OUTERA"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>+ Suggest a Place</span>
            </button>
          )}

          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] w-full sm:w-auto justify-center">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'grid'
                  ? 'bg-[#ccff00] text-black font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'map'
                  ? 'bg-[#ccff00] text-black font-bold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map Radar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onChangeFilters({ ...filters, searchQuery: e.target.value })}
            placeholder="Search by spot name, category, neighborhood, or district..."
            className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] transition-colors"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => onChangeFilters({ ...filters, searchQuery: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Supabase Recent Searches */}
        {!filters.searchQuery && recentSearches.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3 text-[#ccff00]" /> Recent:
            </span>
            {recentSearches.slice(0, 4).map((query) => (
              <button
                key={query}
                type="button"
                onClick={() => onChangeFilters({ ...filters, searchQuery: query })}
                className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] text-xs text-zinc-300 hover:text-white transition-colors shrink-0"
              >
                {query}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Responsive Category Bar */}
      <div className="-mx-4 sm:-mx-6">
        <MoodScroller
          selectedCategory={filters.selectedCategory}
          onSelectCategory={(cat) => onChangeFilters({ ...filters, selectedCategory: cat })}
          places={catalogPlaces}
          posts={publicPosts}
          compact
        />
      </div>

      {/* Filter Bar Chips */}
      <FilterBar
        filters={filters}
        onChangeFilters={onChangeFilters}
        totalCount={filteredPlaces.length}
      />

      {/* Content: Cards or Interactive Map Radar */}
      {viewMode === 'grid' ? (
        filteredPlaces.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 pt-2">
            {filteredPlaces.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSaved={savedPlaceIds.includes(place.id)}
                onToggleSave={onToggleSave}
                onSelect={onSelectPlace}
              />
            ))}
          </div>
        ) : hasActiveFilters ? (
          <div className="py-14 px-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center max-w-md mx-auto my-6 space-y-3">
            <SlidersHorizontal className="w-10 h-10 text-zinc-500 mx-auto" />
            <div className="space-y-1">
              <h2 className="text-base font-bold text-white">
                {activeCategoryLabel
                  ? `No places found in "${activeCategoryLabel}"`
                  : 'No spots match your exact filters'}
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {activeCategoryLabel
                  ? `No approved places match the "${activeCategoryLabel}" category${
                      filters.searchQuery ? ` and search "${filters.searchQuery}"` : ''
                    }${
                      filters.selectedDivision && filters.selectedDivision !== 'all'
                        ? ` in ${
                            filters.selectedDistrict && filters.selectedDistrict !== 'all'
                              ? filters.selectedDistrict
                              : filters.selectedDivision
                          }`
                        : ''
                    } yet.`
                  : `Try clearing your search query or expanding your area from ${currentLocation.neighborhoodName}.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2.5 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs inline-flex items-center gap-1.5 hover:bg-[#d8ff33] transition-all cursor-pointer"
              >
                Reset Category & Filters
              </button>
              {onSuggestPlace && (
                <button
                  type="button"
                  onClick={onSuggestPlace}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white font-bold text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#ccff00]" />
                  <span>Suggest a Place</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="py-16 px-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center max-w-md mx-auto my-6 space-y-3">
            <MapPin className="w-10 h-10 text-zinc-500 mx-auto mb-2" />
            <h2 className="text-base font-bold text-white">Nothing around you yet</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              OUTERA is still growing here. Be the first to add a place in {currentLocation.neighborhoodName}.
            </p>
            {onSuggestPlace && (
              <button
                type="button"
                onClick={onSuggestPlace}
                className="mt-2 px-5 py-2.5 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 hover:bg-[#d8ff33] transition-all"
              >
                <span>Suggest a place</span>
              </button>
            )}
          </div>
        )
      ) : (
        /* Upgraded Interactive Community Discovery Map */
        <DiscoveryMap
          places={filteredPlaces}
          currentLocation={currentLocation}
          selectedLayer={filters.mapLayer || 'all'}
          onChangeLayer={(layer) => onChangeFilters({ ...filters, mapLayer: layer })}
          onSelectPlace={onSelectPlace}
          onRequestGPS={onRequestGPS}
          isDetectingGPS={isDetectingGPS}
        />
      )}

      {/* Approved Community Posts Feed Section (Filtered by Category, Search & Location) */}
      {(publicPosts.length > 0 || activeCategoryLabel) && (
        <section className="pt-6 border-t border-white/[0.06] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#ccff00]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {activeCategoryLabel
                    ? `Approved Community Posts · ${activeCategoryLabel}`
                    : 'Approved Community Posts'}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5">
                {activeCategoryLabel
                  ? `Scout Experiences in ${activeCategoryLabel} (${filteredPublicPosts.length})`
                  : `Recent Scout Experiences & Reviews (${filteredPublicPosts.length})`}
              </h2>
            </div>

            {activeCategoryLabel && (
              <button
                type="button"
                onClick={() => onChangeFilters({ ...filters, selectedCategory: 'all' })}
                className="text-xs font-bold text-[#ccff00] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Show all categories</span>
              </button>
            )}
          </div>

          {filteredPublicPosts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPublicPosts.slice(0, 12).map((post) => {
                const postCategory = normalizeCategoryName(post.place_category || 'Chill');
                return (
                  <div
                    key={post.id}
                    onClick={() => onSelectPost && onSelectPost(post)}
                    className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] hover:border-[#ccff00]/40 transition-all cursor-pointer flex flex-col justify-between gap-3 group"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-white truncate">
                            {post.author_name || 'OUTERA Scout'}
                          </span>
                          <span className="text-zinc-500 font-mono text-[11px] truncate">
                            {post.author_username || '@scout'}
                          </span>
                          {post.is_visited && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Visited</span>
                            </span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-xs font-mono font-bold text-[#ccff00] shrink-0">
                          <Star className="w-3.5 h-3.5 fill-[#ccff00]" />
                          <span>{post.rating}/5</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {post.place_name && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[11px] font-bold text-[#ccff00]">
                            <MapPin className="w-3 h-3" />
                            <span>{post.place_name}</span>
                          </div>
                        )}
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#ccff00]/10 border border-[#ccff00]/25 text-[10px] font-bold text-[#ccff00]">
                          <Tag className="w-2.5 h-2.5" />
                          <span>{postCategory}</span>
                        </div>
                      </div>

                      <h3 className="text-sm font-extrabold text-white group-hover:text-[#ccff00] transition-colors">
                        {post.title}
                      </h3>
                      <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">
                        {post.content}
                      </p>

                      {post.images && post.images.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          {post.images.slice(0, 2).map((imgUrl, idx) => (
                            <img
                              key={idx}
                              src={imgUrl}
                              alt={`${post.title} photo ${idx + 1}`}
                              className="w-full h-28 rounded-xl object-cover border border-white/[0.08]"
                              loading="lazy"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2.5 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-zinc-400">
                      <span className="font-mono text-[10px] text-zinc-500 truncate max-w-[60%]">
                        /p/{post.slug}
                      </span>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await shareCommunityPost(post);
                          setCopiedPostId(post.id);
                          setTimeout(
                            () => setCopiedPostId((prev) => (prev === post.id ? null : prev)),
                            2500
                          );
                        }}
                        className="h-7 px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-bold text-white hover:text-[#ccff00] flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                        title="Share unique post link"
                      >
                        <Share2 className="w-3 h-3 text-[#ccff00]" />
                        <span>{copiedPostId === post.id ? 'Link Copied!' : 'Share'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center max-w-md mx-auto space-y-3">
              <MessageSquarePlus className="w-8 h-8 text-zinc-500 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">
                  {activeCategoryLabel
                    ? `No approved community posts in "${activeCategoryLabel}" yet`
                    : 'No matching community posts found'}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {activeCategoryLabel
                    ? `Visited a spot in ${activeCategoryLabel}? Share your honest experience with the community.`
                    : 'Try adjusting your search or location filters to see more community reviews.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {activeCategoryLabel && (
                  <button
                    type="button"
                    onClick={() => onChangeFilters({ ...filters, selectedCategory: 'all' })}
                    className="h-8 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white transition-all cursor-pointer"
                  >
                    View All Categories
                  </button>
                )}
                {onOpenCreatePost && (
                  <button
                    type="button"
                    onClick={onOpenCreatePost}
                    className="h-8 px-3.5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black text-xs font-extrabold transition-all cursor-pointer"
                  >
                    + Share Experience
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
