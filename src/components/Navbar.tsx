import React from 'react';
import { MapPin, Search } from 'lucide-react';
import { UserLocation } from '../types/outera';

interface NavbarProps {
  currentLocation: UserLocation;
  onOpenLocationModal: () => void;
  onOpenSearch: () => void;
  activeTab: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentLocation,
  onOpenLocationModal,
  onOpenSearch,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full bg-[#090a0c]/85 backdrop-blur-md border-b border-white/[0.07] px-4 sm:px-6 h-14 flex items-center justify-between transition-colors">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-2">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="text-lg font-black tracking-tight text-white hover:opacity-90 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]"
        >
          <span className="font-extrabold tracking-tighter text-xl">OUTERA</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00]" aria-hidden="true" />
        </a>
      </div>

      {/* Zone 2: Location selector pill-free interactive trigger */}
      <button
        type="button"
        onClick={onOpenLocationModal}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] border border-white/[0.06] text-xs text-zinc-300 max-w-[230px] truncate transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ccff00]"
        title="Tap to browse any division, district or detect GPS"
        aria-label="Current location"
      >
        <MapPin className="w-3.5 h-3.5 text-[#ccff00] shrink-0" />
        <span className="truncate font-medium">
          {currentLocation.neighborhoodName} · {currentLocation.district}
        </span>
      </button>

      {/* Zone 3: Search affordance */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="w-9 h-9 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 flex items-center justify-center text-zinc-300 hover:text-white transition-all border border-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ccff00]"
          aria-label="Search places and activities"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
