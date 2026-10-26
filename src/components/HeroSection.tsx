import React from 'react';
import { Navigation, Sparkles } from 'lucide-react';

interface HeroSectionProps {
  onExploreNearMe: () => void;
  onSurpriseMe: () => void;
  currentNeighborhood: string;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onExploreNearMe,
  onSurpriseMe,
  currentNeighborhood,
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
        <span className="text-xs text-zinc-400 font-medium">Near {currentNeighborhood}</span>
      </div>

      {/* Hero Headline */}
      <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.1] max-w-xl text-balance">
        Find something worth going out for.
      </h1>

      {/* Supporting Text */}
      <p className="text-sm sm:text-base text-zinc-300 mt-3 sm:mt-4 max-w-md leading-relaxed font-normal">
        Discover places, experiences and things to do around you. Not generic ratings — real community vibes.
      </p>

      {/* CTAs */}
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
    </section>
  );
};
