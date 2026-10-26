import React, { useState } from 'react';
import { Search, MapPin, SlidersHorizontal, LayoutGrid, Map as MapIcon, X } from 'lucide-react';
import { FilterState, UserLocation } from '../types/outera';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { PlaceCard } from './PlaceCard';
import { FilterBar } from './FilterBar';
import { formatDistance } from '../services/location';

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
        /* Map Radar View */
        <div className="w-full rounded-2xl bg-[#111317] border border-white/[0.08] p-5 sm:p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white">Interactive Radar Map</h2>
              <p className="text-xs text-zinc-400">
                Pointers around {currentLocation.neighborhoodName}
              </p>
            </div>
            <span className="text-xs font-mono text-[#ccff00] font-bold">
              {places.length} Active Pins
            </span>
          </div>

          {/* Stylized Dark Radar Map Simulation */}
          <div className="relative aspect-[4/3] sm:aspect-[16/8] w-full rounded-xl bg-zinc-950 border border-white/[0.08] flex items-center justify-center overflow-hidden">
            {/* Grid radar rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-24 h-24 sm:w-40 sm:h-40 rounded-full border border-white/[0.08]" />
              <div className="w-48 h-48 sm:w-80 sm:h-80 rounded-full border border-white/[0.05]" />
              <div className="w-72 h-72 sm:w-[480px] sm:h-[480px] rounded-full border border-white/[0.03]" />
              <div className="absolute w-full h-[1px] bg-white/[0.04]" />
              <div className="absolute h-full w-[1px] bg-white/[0.04]" />
            </div>

            {/* Center User Location Pin */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-4 h-4 rounded-full bg-[#ccff00] border-2 border-black animate-pulse shadow-lg shadow-[#ccff00]/40" />
              <span className="mt-1 text-[10px] font-bold text-[#ccff00] bg-black/80 px-2 py-0.5 rounded-full border border-[#ccff00]/30">
                You ({currentLocation.neighborhoodName})
              </span>
            </div>

            {/* Distributed place pins on radar */}
            {places.slice(0, 8).map((place, idx) => {
              // Calculate semi-circular coordinates offset
              const angle = (idx / 8) * Math.PI * 2 + 0.4;
              const radius = Math.min(140, Math.max(45, place.distanceKm * 28));
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;

              return (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => onSelectPlace(place)}
                  style={{
                    transform: `translate(${x}px, ${y}px)`,
                  }}
                  className="absolute z-10 group/pin p-1.5 rounded-full bg-[#181b20] hover:bg-[#ccff00] border border-white/20 hover:border-[#ccff00] text-white hover:text-black transition-all shadow-md active:scale-95"
                  title={`${place.name} · ${formatDistance(place.distanceKm)}`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="sr-only">{place.name}</span>
                </button>
              );
            })}
          </div>

          {/* Quick list below radar */}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tap A Pin Or Spot Below</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {places.slice(0, 4).map((place) => (
                <div
                  key={place.id}
                  onClick={() => onSelectPlace(place)}
                  className="p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.05] cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div className="truncate pr-2">
                    <p className="text-xs font-bold text-white truncate">{place.name}</p>
                    <p className="text-[11px] text-zinc-400">{place.category} · {place.priceLevel.label}</p>
                  </div>
                  <span className="text-xs font-mono text-[#ccff00] font-semibold shrink-0">
                    {formatDistance(place.distanceKm)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
