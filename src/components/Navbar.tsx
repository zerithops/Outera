import React from 'react';
import { MapPin, Search, Flame, Compass, Sparkles, Bookmark, User } from 'lucide-react';
import { UserLocation } from '../types/outera';
import { NavTab } from './BottomNav';
import { OuteraLogo } from './OuteraLogo';

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

  const locationLabel =
    currentLocation.neighborhoodName && currentLocation.neighborhoodName !== 'Location not set'
      ? `${currentLocation.neighborhoodName}${
          currentLocation.district &&
          currentLocation.district !== 'Nearby Area' &&
          currentLocation.district !== currentLocation.neighborhoodName
            ? ` · ${currentLocation.district}`
            : ''
        }`
      : 'Set Location';

  return (
    <header className="sticky top-0 z-30 w-full bg-[#090a0c]/92 backdrop-blur-md border-b border-white/[0.07] px-3 sm:px-6 h-14 transition-colors">
      <div className="max-w-7xl mx-auto w-full h-full flex items-center justify-between gap-2 sm:gap-6">
        {/* Zone 1: Official Brand Logo */}
        <a
          href="#discover"
          onClick={(e) => {
            e.preventDefault();
            if (onChangeTab) onChangeTab('discover');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="inline-flex items-center shrink-0 py-1 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ccff00] rounded-md"
          aria-label="OUTERA Home"
        >
          <span className="sm:hidden">
            <OuteraLogo size="xs" />
          </span>
          <span className="hidden sm:inline-flex">
            <OuteraLogo size="sm" />
          </span>
        </a>

        {/* Zone 2: Desktop Navigation Links */}
        {onChangeTab && (
          <nav className="hidden md:flex items-center gap-1 lg:gap-2" aria-label="Main Navigation">
            {desktopNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white/[0.08] text-[#ccff00]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                  {Boolean(item.badge) && (
                    <span className="ml-0.5 text-[10px] font-mono tabular-nums font-bold text-black bg-[#ccff00] px-1.5 py-0.2 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* Zone 3: Location Selector & Search Action */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink-0">
          <button
            type="button"
            onClick={onOpenLocationModal}
            className="h-9 px-2.5 sm:px-3.5 rounded-lg bg-[#111317] hover:bg-[#171a20] active:scale-[0.98] border border-white/[0.08] hover:border-white/[0.15] text-xs text-zinc-200 max-w-[138px] xs:max-w-[170px] sm:max-w-[240px] flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ccff00]"
            title="Select division, district, or detect GPS location"
            aria-label="Current location"
          >
            <MapPin
              className={`w-3.5 h-3.5 shrink-0 ${
                currentLocation.coords ? 'text-[#ccff00]' : 'text-zinc-400'
              }`}
            />
            <span className="truncate font-medium">{locationLabel}</span>
          </button>

          <button
            type="button"
            onClick={onOpenSearch}
            className="w-9 h-9 rounded-lg bg-[#111317] hover:bg-[#171a20] active:scale-95 flex items-center justify-center text-zinc-300 hover:text-white transition-all border border-white/[0.08] hover:border-white/[0.15] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ccff00]"
            aria-label="Search places and experiences"
            title="Search places and experiences"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
