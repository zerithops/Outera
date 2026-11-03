import React from 'react';
import { MapPin, Search, Flame, Compass, Sparkles, Bookmark, User } from 'lucide-react';
import { UserLocation } from '../types/outera';
import { NavTab } from './BottomNav';

interface NavbarProps {
  currentLocation: UserLocation;
  onOpenLocationModal: () => void;
  onOpenSearch: () => void;
  activeTab: string;
  onChangeTab?: (tab: NavTab) => void;
  savedCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentLocation,
  onOpenLocationModal,
  onOpenSearch,
  activeTab,
  onChangeTab,
  savedCount = 0,
}) => {
  const desktopNavItems: { id: NavTab; label: string; icon: any; badge?: number }[] = [
    { id: 'discover', label: 'Discover', icon: Flame },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'surprise', label: 'Surprise', icon: Sparkles },
    { id: 'saved', label: 'Saved', icon: Bookmark, badge: savedCount > 0 ? savedCount : undefined },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <header className="sticky top-0 z-30 w-full bg-[#090a0c]/90 backdrop-blur-md border-b border-white/[0.07] px-4 sm:px-6 h-14 transition-colors">
      <div className="max-w-7xl mx-auto w-full h-full flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-6">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (onChangeTab) onChangeTab('discover');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-lg font-black tracking-tight text-white hover:opacity-90 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00]"
          >
            <span className="font-extrabold tracking-tighter text-xl">OUTERA</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00]" aria-hidden="true" />
          </a>

          {/* Desktop Navigation Links */}
          {onChangeTab && (
            <nav className="hidden md:flex items-center gap-1" aria-label="Desktop Navigation">
              {desktopNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeTab(item.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all relative ${
                      isActive
                        ? 'bg-white/[0.08] text-[#ccff00]'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                    {Boolean(item.badge) && (
                      <span className="ml-0.5 text-[9px] font-bold text-black bg-[#ccff00] px-1 py-0.2 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* Zone 2: Location selector pill-free interactive trigger */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenLocationModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] border border-white/[0.06] text-xs text-zinc-300 max-w-[210px] sm:max-w-[260px] truncate transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ccff00]"
            title="Tap to browse any division, district or detect GPS"
            aria-label="Current location"
          >
            <MapPin className={`w-3.5 h-3.5 shrink-0 ${currentLocation.coords ? 'text-[#ccff00]' : 'text-zinc-500'}`} />
            <span className="truncate font-medium">
              {currentLocation.neighborhoodName !== 'Location not set'
                ? `${currentLocation.neighborhoodName}${currentLocation.district && currentLocation.district !== 'Nearby Area' ? ` · ${currentLocation.district}` : ''}`
                : 'Set Location'}
            </span>
          </button>

          {/* Zone 3: Search affordance */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="w-9 h-9 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 flex items-center justify-center text-zinc-300 hover:text-white transition-all border border-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ccff00]"
            aria-label="Search places and activities"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
