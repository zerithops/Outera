import React, { useState } from 'react';
import {
  Sparkles,
  Flame,
  Zap,
  Gem,
  CheckCircle2,
  Calendar,
  Layers,
  Navigation,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ShieldCheck,
} from 'lucide-react';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { UserLocation } from '../types/outera';
import { formatDistance } from '../services/location';

interface DiscoveryMapProps {
  places: PlaceWithDistance[];
  currentLocation: UserLocation;
  selectedLayer: 'all' | 'Trending' | 'Popular' | 'HiddenGems' | 'CommunityActivity' | 'Events';
  onChangeLayer: (
    layer: 'all' | 'Trending' | 'Popular' | 'HiddenGems' | 'CommunityActivity' | 'Events'
  ) => void;
  onSelectPlace: (place: PlaceWithDistance) => void;
}

export const DiscoveryMap: React.FC<DiscoveryMapProps> = ({
  places,
  currentLocation,
  selectedLayer,
  onChangeLayer,
  onSelectPlace,
}) => {
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(places[0]?.id || null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Filter places based on active map layer
  const displayedPlaces = places.filter((p) => {
    if (selectedLayer === 'all') return true;
    if (selectedLayer === 'Trending') return p.isTrending || p.markerState === 'Trending';
    if (selectedLayer === 'Popular') return p.markerState === 'Popular' || p.communityScore >= 92;
    if (selectedLayer === 'HiddenGems') return p.isHiddenGem || p.markerState === 'HiddenGem';
    if (selectedLayer === 'Events') return p.isEvent;
    if (selectedLayer === 'CommunityActivity') return (p.experienceReports?.length || 0) >= 1;
    return true;
  });

  const activePlace = places.find((p) => p.id === selectedPlaceId) || displayedPlaces[0];

  // Map layer options
  const layers = [
    { id: 'all' as const, label: 'All Places', count: places.length },
    { id: 'Trending' as const, label: '⚡ Trending', count: places.filter((p) => p.isTrending).length },
    { id: 'Popular' as const, label: '🔥 Popular', count: places.filter((p) => p.markerState === 'Popular').length },
    { id: 'HiddenGems' as const, label: '💎 Hidden Gems', count: places.filter((p) => p.isHiddenGem).length },
    { id: 'CommunityActivity' as const, label: '✓ Verified Hotspots', count: places.filter((p) => p.experienceReports?.length > 0).length },
    { id: 'Events' as const, label: '🎟️ Pop-ups & Events', count: places.filter((p) => p.isEvent).length },
  ];

  return (
    <div className="w-full rounded-2xl bg-[#111317] border border-white/[0.08] p-4 sm:p-5 space-y-4">
      {/* Top Header & Layer Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#ccff00] uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5" />
            <span>Community Discovery Map</span>
          </div>
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight mt-0.5">
            Explore {currentLocation.neighborhoodName} & Bangladesh
          </h2>
        </div>

        {/* Zoom & View Reset */}
        <div className="flex items-center gap-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.3))}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 flex items-center justify-center border border-white/[0.06]"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.3))}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 flex items-center justify-center border border-white/[0.06]"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel(1)}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 flex items-center justify-center border border-white/[0.06]"
            title="Reset scale"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Layer Toggles */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {layers.map((layer) => {
          const isActive = selectedLayer === layer.id;
          return (
            <button
              key={layer.id}
              type="button"
              onClick={() => onChangeLayer(layer.id)}
              className={`shrink-0 h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                isActive
                  ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold shadow-sm'
                  : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
              }`}
            >
              <span>{layer.label}</span>
              <span className={`text-[10px] font-mono ${isActive ? 'text-black' : 'text-zinc-500'}`}>
                ({layer.count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Interactive Map Canvas Container */}
      <div className="relative aspect-[16/10] sm:aspect-[21/9] w-full rounded-2xl bg-zinc-950 border border-white/[0.08] overflow-hidden flex items-center justify-center">
        {/* Stylized dark cartographic grid & concentric distance radar rings */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-300"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          <div className="w-28 h-28 sm:w-44 sm:h-44 rounded-full border border-white/[0.06]" />
          <div className="w-56 h-56 sm:w-80 sm:h-80 rounded-full border border-white/[0.04]" />
          <div className="w-84 h-84 sm:w-[500px] sm:h-[500px] rounded-full border border-white/[0.03]" />
          <div className="absolute w-full h-[1px] bg-white/[0.04]" />
          <div className="absolute h-full w-[1px] bg-white/[0.04]" />
          <div className="absolute inset-0 bg-radial from-transparent via-transparent to-black/80" />
        </div>

        {/* Center User Location Radar Pulse */}
        <div className="relative z-10 flex flex-col items-center pointer-events-none">
          <div className="relative flex items-center justify-center">
            <span className="absolute w-8 h-8 rounded-full bg-[#ccff00]/20 animate-ping" />
            <div className="w-3.5 h-3.5 rounded-full bg-[#ccff00] border-2 border-black shadow-lg shadow-[#ccff00]/50" />
          </div>
          <span className="mt-1.5 text-[10px] font-bold text-white bg-black/80 px-2 py-0.5 rounded-full border border-white/10 backdrop-blur-md">
            You ({currentLocation.neighborhoodName})
          </span>
        </div>

        {/* Interactive Dynamic Pins */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-auto transition-transform duration-300"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {displayedPlaces.slice(0, 14).map((place, index) => {
            const isSelected = activePlace?.id === place.id;
            // Project relative coordinates radially around center
            const angle = (index / Math.min(14, displayedPlaces.length)) * Math.PI * 2 + 0.3;
            const distRadius = Math.min(160, Math.max(40, (index + 1) * 22));
            const x = Math.cos(angle) * distRadius;
            const y = Math.sin(angle) * distRadius;

            // Marker visual indicator depending on markerState
            let PinIcon = Navigation;
            let markerColor = 'bg-zinc-800 text-zinc-300 border-white/20';

            if (place.markerState === 'Popular') {
              PinIcon = Flame;
              markerColor = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
            } else if (place.markerState === 'Trending' || place.isTrending) {
              PinIcon = Zap;
              markerColor = 'bg-[#ccff00]/20 text-[#ccff00] border-[#ccff00]/50';
            } else if (place.markerState === 'HiddenGem' || place.isHiddenGem) {
              PinIcon = Gem;
              markerColor = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
            } else if (place.isEvent) {
              PinIcon = Calendar;
              markerColor = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
            } else if (place.markerState === 'CommunityReviewed') {
              PinIcon = CheckCircle2;
              markerColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
            }

            return (
              <button
                key={place.id}
                type="button"
                onClick={() => setSelectedPlaceId(place.id)}
                style={{
                  transform: `translate(${x}px, ${y}px)`,
                }}
                className={`absolute z-20 p-2 rounded-full border transition-all active:scale-95 flex items-center justify-center ${markerColor} ${
                  isSelected
                    ? 'ring-2 ring-[#ccff00] scale-125 bg-[#ccff00] text-black shadow-lg shadow-[#ccff00]/30 z-30'
                    : 'hover:scale-110 hover:border-white'
                }`}
                title={`${place.name} · ${place.category}`}
              >
                <PinIcon className="w-3.5 h-3.5 stroke-[2.2]" />
              </button>
            );
          })}
        </div>

        {/* Privacy badge */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 border border-white/10 text-[10px] text-zinc-400 pointer-events-none">
          <ShieldCheck className="w-3 h-3 text-[#ccff00]" />
          <span>Aggregated place signals only · Zero user tracking</span>
        </div>
      </div>

      {/* Selected Marker Detail Card Popup */}
      {activePlace && (
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-150">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold mb-1 flex-wrap">
              <span className="text-[#ccff00] uppercase font-bold">{activePlace.category}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-400">{activePlace.district}, {activePlace.division}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-300 font-mono">{formatDistance(activePlace.distanceKm)}</span>
              <span className="text-zinc-600">·</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  activePlace.communityConfidence === 'High'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}
              >
                {activePlace.communityConfidence} Confidence
              </span>
            </div>

            <h3 className="text-base font-bold text-white tracking-tight truncate">
              {activePlace.name}
            </h3>

            <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
              {activePlace.shortDescription}
            </p>

            <div className="flex items-center gap-3 text-xs text-zinc-300 mt-2 font-medium">
              <span>{activePlace.priceLevel.label}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-[#ccff00] font-mono">{activePlace.communityScore}% worth it</span>
              <span className="text-zinc-600">·</span>
              <span>{activePlace.verifiedVisitorsCount} visited</span>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectPlace(activePlace)}
              className="w-full sm:w-auto h-11 px-4 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 hover:bg-[#d4ff1a] active:scale-[0.98] transition-all"
            >
              <span>View Spot Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
