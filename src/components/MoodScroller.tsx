import React from 'react';
import { MoodCategory } from '../types/outera';
import { MOOD_CATEGORIES } from '../services/discoveryEngine';

interface MoodScrollerProps {
  selectedCategory: 'all' | MoodCategory;
  onSelectCategory: (cat: 'all' | MoodCategory) => void;
}

export const MoodScroller: React.FC<MoodScrollerProps> = ({
  selectedCategory,
  onSelectCategory,
}) => {
  return (
    <section className="w-full my-6" aria-labelledby="mood-heading">
      <div className="flex items-center justify-between mb-3 px-4 sm:px-6">
        <div>
          <h2 id="mood-heading" className="text-base sm:text-lg font-black text-white tracking-tight">
            What are you in the mood for?
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">Filter by the current energy you want</p>
        </div>

        {selectedCategory !== 'all' && (
          <button
            type="button"
            onClick={() => onSelectCategory('all')}
            className="text-xs font-semibold text-[#ccff00] hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Horizontally scrollable row with clean touch ergonomics */}
      <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar px-4 sm:px-6 pb-2">
        {/* "All" button */}
        <button
          type="button"
          onClick={() => onSelectCategory('all')}
          className={`shrink-0 h-10 px-4 rounded-xl text-xs font-bold transition-all border ${
            selectedCategory === 'all'
              ? 'bg-[#ccff00] text-black border-[#ccff00] shadow-sm'
              : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          All Vibes
        </button>

        {MOOD_CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(isSelected ? 'all' : cat.id)}
              className={`shrink-0 h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border ${
                isSelected
                  ? 'bg-[#ccff00] text-black border-[#ccff00] shadow-sm font-bold'
                  : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
