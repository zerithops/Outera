import React from 'react';
import {
  MapPin,
  Sparkles,
  Flame,
  Zap,
  Gem,
  Calendar,
  Layers,
  ArrowRight,
  Globe2,
} from 'lucide-react';
import { DivisionName, Place, UserLocation } from '../types/outera';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { PlaceCard } from './PlaceCard';
import { DiscoveryMap } from './DiscoveryMap';

interface LocationHubViewProps {
  places: PlaceWithDistance[];
  currentLocation: UserLocation;
  selectedDivision: 'all' | DivisionName;
  onSelectDivision: (div: 'all' | DivisionName) => void;
  savedPlaceIds: string[];
  onToggleSave: (e: React.MouseEvent, id: string) => void;
  onSelectPlace: (place: PlaceWithDistance) => void;
  onOpenHierarchyModal: () => void;
}

export const LocationHubView: React.FC<LocationHubViewProps> = ({
  places,
  currentLocation,
  selectedDivision,
  onSelectDivision,
  savedPlaceIds,
  onToggleSave,
  onSelectPlace,
  onOpenHierarchyModal,
}) => {
  const hubs: { name: 'all' | DivisionName; label: string; tag: string }[] = [
    { name: 'all', label: 'All Bangladesh', tag: '64 Districts' },
    { name: 'Dhaka', label: 'Dhaka', tag: 'Lakeside & Heritage' },
    { name: 'Chattogram', label: 'Chattogram', tag: 'Seas & Ridges' },
    { name: 'Sylhet', label: 'Sylhet', tag: 'Rainforest & Tea' },
    { name: 'Rajshahi', label: 'Rajshahi', tag: 'Padma & Silk' },
    { name: 'Khulna', label: 'Khulna', tag: 'Mangrove Forests' },
    { name: 'Barishal', label: 'Barishal', tag: 'Floating Canals' },
    { name: 'Rangpur', label: 'Rangpur', tag: 'Palaces & Tea' },
    { name: 'Mymensingh', label: 'Mymensingh', tag: 'Brahmaputra Hills' },
  ];

  // Segmentations for current active hub
  const hubPlaces =
    selectedDivision === 'all'
      ? places
      : places.filter((p) => p.division === selectedDivision);

  const trendingPlaces = hubPlaces.filter((p) => p.isTrending || p.markerState === 'Trending');
  const hiddenGems = hubPlaces.filter((p) => p.isHiddenGem || p.markerState === 'HiddenGem');
  const popularPlaces = hubPlaces.filter((p) => p.markerState === 'Popular' || p.communityScore >= 92);
  const eventPlaces = hubPlaces.filter((p) => p.isEvent);

  return (
    <div className="w-full px-4 sm:px-6 py-5 space-y-7">
      {/* Location Directory Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#ccff00] flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5" />
              <span>Bangladesh Nationwide Directory</span>
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-xs text-zinc-400">All 8 Divisions</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {selectedDivision === 'all' ? 'All Across Bangladesh' : `${selectedDivision} Division Hub`}
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-lg">
            Discover verified spots, hill retreats, riverfront walks, and hidden local cafes across every district.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenHierarchyModal}
          className="h-10 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-bold text-white flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <MapPin className="w-3.5 h-3.5 text-[#ccff00]" />
          <span>Switch Hierarchy</span>
        </button>
      </div>

      {/* Division Switcher Carousel */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {hubs.map((hub) => {
          const isActive = selectedDivision === hub.name;
          return (
            <button
              key={hub.name}
              type="button"
              onClick={() => onSelectDivision(hub.name)}
              className={`shrink-0 p-2.5 px-3.5 rounded-xl border text-left transition-all ${
                isActive
                  ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold shadow-md'
                  : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
              }`}
            >
              <p className="text-xs font-bold leading-tight">{hub.label}</p>
              <p
                className={`text-[10px] mt-0.5 leading-none ${
                  isActive ? 'text-black/80 font-medium' : 'text-zinc-500'
                }`}
              >
                {hub.tag}
              </p>
            </button>
          );
        })}
      </div>

      {/* Discovery Map for this hub */}
      <section aria-labelledby="hub-map-title">
        <DiscoveryMap
          places={hubPlaces}
          currentLocation={currentLocation}
          selectedLayer="all"
          onChangeLayer={() => {}}
          onSelectPlace={onSelectPlace}
        />
      </section>

      {/* Section 1: Trending Places */}
      {trendingPlaces.length > 0 && (
        <section className="space-y-3" aria-labelledby="trending-title">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#ccff00]" />
              <h2 id="trending-title" className="text-base sm:text-lg font-black text-white tracking-tight">
                Trending Right Now
              </h2>
            </div>
            <span className="text-xs text-zinc-400 font-mono">
              {trendingPlaces.length} Spots
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trendingPlaces.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSaved={savedPlaceIds.includes(place.id)}
                onToggleSave={onToggleSave}
                onSelect={onSelectPlace}
              />
            ))}
          </div>
        </section>
      )}

      {/* Section 2: Hidden Gems */}
      {hiddenGems.length > 0 && (
        <section className="space-y-3" aria-labelledby="gems-title">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gem className="w-4 h-4 text-cyan-400" />
              <h2 id="gems-title" className="text-base sm:text-lg font-black text-white tracking-tight">
                Hidden Gems & Quiet Escapes
              </h2>
            </div>
            <span className="text-xs text-zinc-400 font-mono">
              {hiddenGems.length} Spots
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {hiddenGems.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSaved={savedPlaceIds.includes(place.id)}
                onToggleSave={onToggleSave}
                onSelect={onSelectPlace}
              />
            ))}
          </div>
        </section>
      )}

      {/* Section 3: Live Events & Pop-ups if present */}
      {eventPlaces.length > 0 && (
        <section className="space-y-3" aria-labelledby="events-title">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400" />
              <h2 id="events-title" className="text-base sm:text-lg font-black text-white tracking-tight">
                Live Cultural Pop-Ups & Events
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {eventPlaces.map((place) => (
              <PlaceCard
                key={place.id}
                place={place}
                isSaved={savedPlaceIds.includes(place.id)}
                onToggleSave={onToggleSave}
                onSelect={onSelectPlace}
              />
            ))}
          </div>
        </section>
      )}

      {/* Section 4: All Popular Spots */}
      <section className="space-y-3" aria-labelledby="all-hub-title">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <h2 id="all-hub-title" className="text-base sm:text-lg font-black text-white tracking-tight">
              Community Favorites in {selectedDivision === 'all' ? 'Bangladesh' : selectedDivision}
            </h2>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {popularPlaces.length} Spots
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {popularPlaces.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              isSaved={savedPlaceIds.includes(place.id)}
              onToggleSave={onToggleSave}
              onSelect={onSelectPlace}
            />
          ))}
        </div>
      </section>
    </div>
  );
};
