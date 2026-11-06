import React from 'react';
import { Navigation, Sparkles, Plus, MessageSquarePlus } from 'lucide-react';

interface HeroSectionProps {
  onExploreNearMe: () => void;
  onSurpriseMe: () => void;
  currentNeighborhood: string;
  onSuggestPlace?: () => void;
  onCreatePost?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onExploreNearMe,
  onSurpriseMe,
  currentNeighborhood,
  onSuggestPlace,
  onCreatePost,
}) => {
  return (
    <section className="relative px-4 sm:px-6 pt-7 pb-6 sm:pt-12 sm:pb-8 flex flex-col items-start overflow-hidden">
      {/* Subtle background atmospheric glow */}
      <div
        className="absolute -top-24 -left-20 w-72 h-72 rounded-full bg-[#ccff00]/[0.04] blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      {/* Brand Kicker with area indicator */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-black tracking-widest text-[#ccff00] uppercase font-mono">
          OUTERA
        </span>
        <span className="text-zinc-600">·</span>
        <span className="text-xs text-zinc-400 font-medium">
          {currentNeighborhood !== 'Location not set' ? `Near ${currentNeighborhood}` : 'Discover Hangouts & Vibe Checks'}
        </span>
      </div>

      {/* Hero Headline */}
      <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.1] max-w-xl text-balance">
        Find something worth going out for.
      </h1>

      {/* Supporting Text */}
      <p className="text-sm sm:text-base text-zinc-300 mt-3 sm:mt-4 max-w-md leading-relaxed font-normal">
        Discover places, experiences and things to do around you. Not generic ratings — real community vibes.
      </p>

      {/* Primary CTAs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-6 w-full sm:w-auto">
        <button
          type="button"
          onClick={onExploreNearMe}
          className="h-12 px-6 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2.5 hover:bg-[#d4ff1a] active:scale-[0.98] transition-all electric-glow shadow-lg shadow-[#ccff00]/15"
        >
          <Navigation className="w-4 h-4" />
          <span>Explore Near Me</span>
        </button>

        <button
          type="button"
          onClick={onSurpriseMe}
          className="h-12 px-6 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] active:scale-[0.98] border border-white/[0.1] text-xs font-extrabold text-white tracking-wider uppercase flex items-center justify-center gap-2.5 transition-all"
        >
          <Sparkles className="w-4 h-4 text-[#ccff00]" />
          <span>Surprise Me</span>
        </button>
      </div>

      {/* Separate Scout Contribution Actions */}
      {(onSuggestPlace || onCreatePost) && (
        <div className="flex flex-wrap items-center gap-2.5 mt-4 pt-3 border-t border-white/[0.06] w-full sm:w-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mr-1">
            Scout Actions:
          </span>
          {onCreatePost && (
            <button
              type="button"
              onClick={onCreatePost}
              className="h-8 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.1] text-zinc-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <MessageSquarePlus className="w-3.5 h-3.5 text-[#ccff00]" />
              <span>Create Community Post</span>
            </button>
          )}
          {onSuggestPlace && (
            <button
              type="button"
              onClick={onSuggestPlace}
              className="h-8 px-3 rounded-lg bg-[#ccff00]/10 hover:bg-[#ccff00]/20 border border-[#ccff00]/30 text-[#ccff00] text-xs font-extrabold flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Suggest a Place</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
};

