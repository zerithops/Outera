import React from 'react';
import { DivisionName, FilterState, GroupFit, VibeType } from '../types/outera';
import { BANGLADESH_DIVISIONS } from '../data/bangladeshLocations';

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

  const resetFilters = () => {
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

  const selectedDivisionObj = BANGLADESH_DIVISIONS.find(
    (d) => d.name === filters.selectedDivision
  );
  const availableDistricts = selectedDivisionObj
    ? selectedDivisionObj.districts
    : BANGLADESH_DIVISIONS.flatMap((d) => d.districts);

  return (
    <div className="w-full space-y-2">
      {/* Top Filter Chips Carousel */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {/* Division Location Filter */}
        <select
          aria-label="Filter by Division"
          value={filters.selectedDivision || 'all'}
          onChange={(e) => {
            const val = e.target.value as DivisionName | 'all';
            onChangeFilters({
              ...filters,
              selectedDivision: val,
              selectedDistrict: 'all',
            });
          }}
          className={`shrink-0 h-8 px-2.5 rounded-lg text-xs font-medium border transition-all cursor-pointer focus:outline-none ${
            filters.selectedDivision && filters.selectedDivision !== 'all'
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          <option value="all" className="bg-zinc-900 text-white">
            All Divisions
          </option>
          {BANGLADESH_DIVISIONS.map((div) => (
            <option key={div.name} value={div.name} className="bg-zinc-900 text-white">
              {div.name} Division
            </option>
          ))}
        </select>

        {/* District Location Filter */}
        <select
          aria-label="Filter by District"
          value={filters.selectedDistrict || 'all'}
          onChange={(e) => {
            const val = e.target.value;
            onChangeFilters({
              ...filters,
              selectedDistrict: val,
            });
          }}
          className={`shrink-0 h-8 px-2.5 rounded-lg text-xs font-medium border transition-all cursor-pointer focus:outline-none ${
            filters.selectedDistrict && filters.selectedDistrict !== 'all'
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          <option value="all" className="bg-zinc-900 text-white">
            All Districts
          </option>
          {availableDistricts.map((dist) => (
            <option key={dist.name} value={dist.name} className="bg-zinc-900 text-white">
              {dist.name}
            </option>
          ))}
        </select>

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

        {/* Within 5 km */}
        <button
          type="button"
          onClick={() => setDistance(5)}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.maxDistanceKm === 5
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Within 5 km
        </button>

        {/* Within 10 km */}
        <button
          type="button"
          onClick={() => setDistance(10)}
          className={`shrink-0 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
            filters.maxDistanceKm === 10
              ? 'bg-[#ccff00] text-black font-bold border-[#ccff00]'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
          }`}
        >
          Within 10 km
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
