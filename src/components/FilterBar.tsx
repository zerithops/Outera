import React from 'react';
import { FilterState, GroupFit, VibeType } from '../types/outera';

interface FilterBarProps {
  filters: FilterState;
  onChangeFilters: (filters: FilterState) => void;
  totalCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChangeFilters,
  totalCount,
}) => {
  const toggleOpenNow = () => {
    onChangeFilters({ ...filters, openNowOnly: !filters.openNowOnly });
  };

  const setPrice = (val: number | null) => {
    onChangeFilters({ ...filters, priceMax: filters.priceMax === val ? null : val });
  };

  const setDistance = (km: number | null) => {
    onChangeFilters({ ...filters, maxDistanceKm: filters.maxDistanceKm === km ? null : km });
  };

  const setGroup = (g: GroupFit | 'all') => {
    onChangeFilters({ ...filters, group: filters.group === g ? 'all' : g });
  };

  const setEnvironment = (env: 'Indoor' | 'Outdoor' | 'all') => {
    onChangeFilters({ ...filters, environment: filters.environment === env ? 'all' : env });
  };

  const setVibe = (v: VibeType | 'Popular' | 'all') => {
    onChangeFilters({ ...filters, vibe: filters.vibe === v ? 'all' : v });
  };

  const hasActiveFilters =
    filters.openNowOnly ||
    filters.priceMax !== null ||
    filters.maxDistanceKm !== null ||
    filters.group !== 'all' ||
    filters.environment !== 'all' ||
    filters.vibe !== 'all';

  const resetFilters = () => {
    onChangeFilters({
      ...filters,
      openNowOnly: false,
      priceMax: null,
      maxDistanceKm: null,
      group: 'all',
      environment: 'all',
      vibe: 'all',
    });
  };

  return (
    <div className="w-full space-y-2">
      {/* Top Filter Chips Carousel */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {/* Open Now */}
        <button
          type="button"
          onClick={toggleOpenNow}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.openNowOnly
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Open Now
        </button>

        {/* Under ৳300 */}
        <button
          type="button"
          onClick={() => setPrice(300)}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.priceMax === 300
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Under ৳300
        </button>

        {/* Under ৳500 */}
        <button
          type="button"
          onClick={() => setPrice(500)}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.priceMax === 500
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Under ৳500
        </button>

        {/* Within 1 km */}
        <button
          type="button"
          onClick={() => setDistance(1)}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.maxDistanceKm === 1
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Within 1 km
        </button>

        {/* Within 3 km */}
        <button
          type="button"
          onClick={() => setDistance(3)}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.maxDistanceKm === 3
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Within 3 km
        </button>

        {/* Solo */}
        <button
          type="button"
          onClick={() => setGroup('Solo')}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.group === 'Solo'
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Solo
        </button>

        {/* Friends */}
        <button
          type="button"
          onClick={() => setGroup('Friends')}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.group === 'Friends'
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Friends
        </button>

        {/* Family */}
        <button
          type="button"
          onClick={() => setGroup('Family')}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.group === 'Family'
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Family
        </button>

        {/* Indoor */}
        <button
          type="button"
          onClick={() => setEnvironment('Indoor')}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.environment === 'Indoor'
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Indoor
        </button>

        {/* Outdoor */}
        <button
          type="button"
          onClick={() => setEnvironment('Outdoor')}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.environment === 'Outdoor'
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Outdoor
        </button>

        {/* Quiet */}
        <button
          type="button"
          onClick={() => setVibe('Quiet')}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.vibe === 'Quiet'
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Quiet
        </button>

        {/* Popular */}
        <button
          type="button"
          onClick={() => setVibe('Popular')}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.vibe === 'Popular'
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Popular
        </button>
      </div>

      {/* Meta feedback line */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1 pt-1">
        <span>
          Showing <span className="text-white font-bold font-mono">{totalCount}</span> spots
        </span>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-[#ccff00] font-semibold hover:underline"
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );
};
