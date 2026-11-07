import React, { useMemo, useState } from 'react';
import {
  Palette,
  Utensils,
  Coffee,
  Trees,
  Trophy,
  Gamepad2,
  Moon,
  Compass,
  Building2,
  BookOpen,
  ShoppingBag,
  Calendar,
  Sparkles,
  LayoutGrid,
  X,
} from 'lucide-react';
import { MoodCategory, Place } from '../types/outera';
import {
  doesCategoryMatch,
  getAvailableCategories,
  normalizeCategoryName,
} from '../services/discoveryEngine';

interface MoodScrollerProps {
  selectedCategory: 'all' | MoodCategory;
  onSelectCategory: (cat: 'all' | MoodCategory) => void;
  places?: Place[];
  posts?: { place_id?: string; place_category?: string; status?: string }[];
  compact?: boolean;
}

const renderCategoryIcon = (iconKey: string, isSelected: boolean) => {
  const cls = `w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-black' : 'text-[#ccff00]'}`;
  switch (iconKey) {
    case 'Palette':
      return <Palette className={cls} />;
    case 'Utensils':
      return <Utensils className={cls} />;
    case 'Coffee':
      return <Coffee className={cls} />;
    case 'Trees':
      return <Trees className={cls} />;
    case 'Trophy':
      return <Trophy className={cls} />;
    case 'Gamepad2':
      return <Gamepad2 className={cls} />;
    case 'Moon':
      return <Moon className={cls} />;
    case 'Compass':
      return <Compass className={cls} />;
    case 'Building2':
      return <Building2 className={cls} />;
    case 'BookOpen':
      return <BookOpen className={cls} />;
    case 'ShoppingBag':
      return <ShoppingBag className={cls} />;
    case 'Calendar':
      return <Calendar className={cls} />;
    default:
      return <Sparkles className={cls} />;
  }
};

export const MoodScroller: React.FC<MoodScrollerProps> = ({
  selectedCategory,
  onSelectCategory,
  places = [],
  posts = [],
  compact = false,
}) => {
  const [expandedGrid, setExpandedGrid] = useState(false);

  const categories = useMemo(
    () => getAvailableCategories(places, posts),
    [places, posts]
  );

  const totalPlacesCount = places.length;
  const normalizedSelected =
    selectedCategory === 'all' ? 'all' : normalizeCategoryName(selectedCategory);

  return (
    <section
      className={`w-full ${compact ? 'my-2' : 'my-5'}`}
      aria-labelledby="mood-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-4 sm:px-6">
        <div>
          <h2
            id="mood-heading"
            className={`${
              compact ? 'text-sm sm:text-base' : 'text-base sm:text-lg'
            } font-black text-white tracking-tight`}
          >
            {compact ? 'Browse by Category' : 'What are you in the mood for?'}
          </h2>
          {!compact && (
            <p className="text-xs text-zinc-400 mt-0.5">
              Select a category to filter verified places and approved community posts
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedCategory !== 'all' && (
            <button
              type="button"
              onClick={() => onSelectCategory('all')}
              className="h-7 px-2.5 rounded-lg bg-[#ccff00]/15 border border-[#ccff00]/30 text-[11px] font-bold text-[#ccff00] hover:bg-[#ccff00]/25 transition-all flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Clear ({normalizedSelected})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpandedGrid((prev) => !prev)}
            className="h-7 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] font-semibold text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
            aria-expanded={expandedGrid}
          >
            <LayoutGrid className="w-3 h-3 text-zinc-400" />
            <span>{expandedGrid ? 'Scroll View' : `All Categories (${categories.length})`}</span>
          </button>
        </div>
      </div>

      {/* Category buttons: responsive horizontal scroll on mobile OR wrapped grid when expanded */}
      <div
        className={
          expandedGrid
            ? 'flex flex-wrap items-center gap-2 px-4 sm:px-6 pb-2'
            : 'flex items-center gap-2 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-2 snap-x'
        }
        role="tablist"
        aria-label="Place and post categories"
      >
        {/* "All" button */}
        <button
          type="button"
          role="tab"
          aria-selected={selectedCategory === 'all'}
          onClick={() => onSelectCategory('all')}
          className={`shrink-0 snap-start h-10 px-4 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer ${
            selectedCategory === 'all'
              ? 'bg-[#ccff00] text-black border-[#ccff00] shadow-sm'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.07] hover:text-white'
          }`}
        >
          <span>All Categories</span>
          {totalPlacesCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-extrabold ${
                selectedCategory === 'all'
                  ? 'bg-black/15 text-black'
                  : 'bg-white/[0.07] text-zinc-400'
              }`}
            >
              {totalPlacesCount}
            </span>
          )}
        </button>

        {categories.map((cat) => {
          const isSelected =
            selectedCategory !== 'all' && doesCategoryMatch(cat.id, selectedCategory);
          const activeCount = cat.placeCount;

          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectCategory(isSelected ? 'all' : cat.id)}
              className={`shrink-0 snap-start h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border cursor-pointer ${
                isSelected
                  ? 'bg-[#ccff00] text-black border-[#ccff00] shadow-sm font-extrabold'
                  : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              {renderCategoryIcon(cat.iconKey, isSelected)}
              <span className="whitespace-nowrap">{cat.label}</span>
              {activeCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-extrabold ${
                    isSelected
                      ? 'bg-black/15 text-black'
                      : 'bg-[#ccff00]/15 text-[#ccff00]'
                  }`}
                >
                  {activeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};
