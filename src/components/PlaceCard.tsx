import React, { useState } from 'react';
import { Bookmark, Sparkles, Navigation } from 'lucide-react';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { formatDistance } from '../services/location';

interface PlaceCardProps {
  place: PlaceWithDistance;
  isSaved: boolean;
  onToggleSave: (e: React.MouseEvent, id: string) => void;
  onSelect: (place: PlaceWithDistance) => void;
}

export const PlaceCard: React.FC<PlaceCardProps> = ({
  place,
  isSaved,
  onToggleSave,
  onSelect,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isPressing, setIsPressing] = useState(false);

  return (
    <article
      onClick={() => onSelect(place)}
      onMouseDown={() => setIsPressing(true)}
      onMouseUp={() => setIsPressing(false)}
      onMouseLeave={() => setIsPressing(false)}
      onTouchStart={() => setIsPressing(true)}
      onTouchEnd={() => setIsPressing(false)}
      className={`group relative rounded-2xl bg-[#131519] border border-white/[0.08] overflow-hidden cursor-pointer transition-all duration-200 ${
        isPressing ? 'scale-[0.985] border-white/20' : 'hover:border-white/20 hover:shadow-lg'
      }`}
    >
      {/* Visual Image Container */}
      <div className="relative aspect-[16/10] sm:aspect-[4/3] w-full overflow-hidden bg-zinc-900">
        {!imageError && place.images[0] ? (
          <img
            src={place.images[0]}
            alt={place.name}
            onError={() => setImageError(true)}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 p-4 text-center">
            <Sparkles className="w-8 h-8 text-[#ccff00]/60 mb-2" />
            <span className="text-xs font-semibold text-zinc-300">{place.name}</span>
            <span className="text-[11px] text-zinc-500 mt-1">{place.category}</span>
          </div>
        )}

        {/* Measured dark scrim for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

        {/* Top Floating Actions: Save button */}
        <div className="absolute top-3 right-3 z-10">
          <button
            type="button"
            onClick={(e) => onToggleSave(e, place.id)}
            className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 ${
              isSaved
                ? 'bg-[#ccff00] text-black shadow-lg shadow-[#ccff00]/20'
                : 'bg-black/60 text-white hover:bg-black/80 border border-white/10'
            }`}
            aria-label={isSaved ? 'Remove from saved' : 'Save place'}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-black stroke-black' : ''}`} />
          </button>
        </div>

        {/* Bottom Image Overlay: Category & Community Worth-it Score */}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 text-xs text-white font-medium">
            <span className="text-white/90">{place.category}</span>
            <span aria-hidden="true" className="text-white/50">·</span>
            <span className="text-[#ccff00] font-semibold">{place.openingHours.openNow ? 'Open Now' : 'Closed'}</span>
          </div>

          <div className="flex items-center gap-1 text-xs font-semibold text-white">
            <span className="text-[#ccff00] font-mono tabular-nums">{place.communityScore}%</span>
            <span className="text-white/70 text-[11px]">worth it</span>
          </div>
        </div>
      </div>

      {/* Card Content Area */}
      <div className="p-4 sm:p-5">
        <h3 className="text-base font-bold text-white tracking-tight group-hover:text-[#ccff00] transition-colors line-clamp-1">
          {place.name}
        </h3>

        {/* Clean unboxed metadata (anti-slop rule: no static pills) */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400 mt-1.5 font-medium">
          <span className="flex items-center gap-1 text-zinc-300">
            <Navigation className="w-3 h-3 text-[#ccff00]" />
            <span className="font-mono tabular-nums">{formatDistance(place.distanceKm)}</span>
          </span>
          <span aria-hidden="true" className="text-zinc-600">·</span>
          <span>{place.priceLevel.label}</span>
          <span aria-hidden="true" className="text-zinc-600">·</span>
          <span>{place.neighborhood}</span>
        </div>

        <p className="text-xs text-zinc-300 mt-2.5 line-clamp-2 leading-relaxed">
          {place.shortDescription}
        </p>

        {/* Editorial tags (clean unboxed text with subtle border line or unboxed badges) */}
        <div className="mt-3.5 pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          {place.tags.slice(0, 3).map((tag, idx) => (
            <span key={tag} className="flex items-center gap-1.5 text-zinc-300">
              {idx > 0 && <span aria-hidden="true" className="text-zinc-600">·</span>}
              <span>{tag}</span>
            </span>
          ))}
        </div>
      </div>
    </article>
  );
};
