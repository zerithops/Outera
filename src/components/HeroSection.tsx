import React from 'react';
import { Navigation, Sparkles, Plus, MessageSquarePlus, MapPin } from 'lucide-react';
import { OuteraLogo } from './OuteraLogo';

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
    <section className="relative px-4 sm:px-6 pt-6 pb-5 sm:pt-10 sm:pb-8 overflow-hidden">
      <div className="relative rounded-2xl sm:rounded-3xl bg-[#111317] border border-white/[0.08] p-5 sm:p-8 lg:p-10 overflow-hidden">
        {/* Subtle atmospheric lighting */}
        <div
          className="absolute -top-28 -right-24 w-80 h-80 rounded-full bg-[#ccff00]/[0.05] blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6 lg:gap-10">
          <div className="max-w-2xl">
            {/* Official Brand Kicker & Active Area */}
            <div className="flex flex-wrap items-center gap-2.5 mb-4">
              <OuteraLogo size="xs" />
              <span className="text-zinc-600" aria-hidden="true">
                /
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-zinc-300 font-medium">
                <MapPin className="w-3.5 h-3.5 text-[#ccff00] shrink-0" />
                <span>
                  {currentNeighborhood !== 'Location not set'
                    ? `Near ${currentNeighborhood}`
                    : 'Bangladesh Community Discovery'}
                </span>
              </span>
            </div>

            {/* Hero Display Headline */}
            <h1 className="text-2xl sm:text-4xl lg:text-[44px] font-extrabold text-white tracking-tight leading-[1.12] text-balance">
              Find something worth going out for.
            </h1>

            {/* Supporting Editorial Copy */}
            <p className="text-xs sm:text-sm lg:text-base text-zinc-300 mt-3 max-w-xl leading-relaxed">
              Curated spots, rooftop hangouts, nature escapes, and real transit guides across Bangladesh — powered by peer-verified community scouts.
            </p>

            {/* Primary CTAs */}
            <div className="flex flex-col xs:flex-row sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 mt-6">
              <button
                type="button"
                onClick={onExploreNearMe}
                className="h-11 sm:h-12 px-5 sm:px-6 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] active:scale-[0.98] text-black font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all electric-glow whitespace-nowrap cursor-pointer"
              >
                <Navigation className="w-4 h-4 shrink-0" />
                <span>Explore Near Me</span>
              </button>

              <button
                type="button"
                onClick={onSurpriseMe}
                className="h-11 sm:h-12 px-5 sm:px-6 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] active:scale-[0.98] border border-white/[0.1] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#ccff00] shrink-0" />
                <span>Surprise Me</span>
              </button>
            </div>
          </div>

          {/* Two Distinct Scout Actions Panel */}
          {(onSuggestPlace || onCreatePost) && (
            <div className="lg:w-72 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-white/[0.07] lg:pl-8 flex flex-col justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-white tracking-tight">
                  Contribute as a Scout
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  Share an honest review of an existing spot or propose a brand-new place to the directory.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row lg:flex-col gap-2">
                {onCreatePost && (
                  <button
                    type="button"
                    onClick={onCreatePost}
                    className="h-10 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.1] text-zinc-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5 text-[#ccff00] shrink-0" />
                    <span>Create Community Post</span>
                  </button>
                )}
                {onSuggestPlace && (
                  <button
                    type="button"
                    onClick={onSuggestPlace}
                    className="h-10 px-3.5 rounded-xl bg-[#ccff00]/12 hover:bg-[#ccff00]/20 border border-[#ccff00]/35 text-[#ccff00] text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>+ Suggest a Place</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
