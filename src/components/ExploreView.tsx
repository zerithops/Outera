import React, { useState } from 'react';
import { Search, MapPin, SlidersHorizontal, LayoutGrid, Map as MapIcon, X, Clock } from 'lucide-react';
import { FilterState, UserLocation } from '../types/outera';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { PlaceCard } from './PlaceCard';
import { FilterBar } from './FilterBar';
import { DiscoveryMap } from './DiscoveryMap';
import { formatDistance } from '../services/location';
import { useSearchHistory } from '../hooks/useSearchHistory';

interface ExploreViewProps {
  places: PlaceWithDistance[];
  currentLocation: UserLocation;
  filters: FilterState;
  onChangeFilters: (filters: FilterState) => void;
  savedPlaceIds: string[];
  onToggleSave: (e: React.MouseEvent, id: string) => void;
  onSelectPlace: (place: PlaceWithDistance) => void;
  onOpenLocationModal: () => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({
  places,
  currentLocation,
  filters,
  onChangeFilters,
  savedPlaceIds,
  onToggleSave,
  onSelectPlace,
  onOpenLocationModal,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Hook that automatically records user's searches into Supabase search_history
  const { recentSearches } = useSearchHistory(
    filters.searchQuery,
    currentLocation.neighborhoodName,
    places.length
  );

  return (
    <div className="w-full px-4 sm:px-6 py-4 space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
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
              <span>{currentLocation.neighborhoodName}</span>
            </button>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Things around you
          </h1>
        </div>

        {/* View Toggle: Grid vs Map Preview */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
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

      {/* Search Input Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onChangeFilters({ ...filters, searchQuery: e.target.value })}
            placeholder="Search by spot name, vibe, pottery, rooftop, bouldering..."
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

      {/* Filter Bar Chips */}
      <FilterBar
        filters={filters}
        onChangeFilters={onChangeFilters}
        totalCount={places.length}
      />

      {/* Content: Cards or Interactive Map Radar */}
      {viewMode === 'grid' ? (
        places.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 pt-2">
            {places.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSaved={savedPlaceIds.includes(place.id)}
                onToggleSave={onToggleSave}
                onSelect={onSelectPlace}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="py-16 px-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center max-w-md mx-auto my-6">
            <SlidersHorizontal className="w-10 h-10 text-zinc-500 mx-auto mb-3" />
            <h2 className="text-base font-bold text-white">No spots match your exact filters</h2>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
              Try loosening the budget limit or expanding your radius from {currentLocation.neighborhoodName}.
            </p>
            <button
              type="button"
              onClick={() =>
                onChangeFilters({
                  ...filters,
                  searchQuery: '',
                  selectedCategory: 'all',
                  openNowOnly: false,
                  priceMax: null,
                  maxDistanceKm: null,
                  group: 'all',
                  environment: 'all',
                  vibe: 'all',
                })
              }
              className="mt-4 px-4 py-2 rounded-xl bg-[#ccff00] text-black font-bold text-xs inline-flex items-center gap-1.5"
            >
              Reset All Filters
            </button>
          </div>
        )
      ) : (
        /* Upgraded Interactive Community Discovery Map */
        <DiscoveryMap
          places={places}
          currentLocation={currentLocation}
          selectedLayer={filters.mapLayer || 'all'}
          onChangeLayer={(layer) => onChangeFilters({ ...filters, mapLayer: layer })}
          onSelectPlace={onSelectPlace}
        />
      )}
    </div>
  );
};
