import React, { useState } from 'react';
import { Bookmark, Check, Compass, Navigation, Share2, Star } from 'lucide-react';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { formatDistance } from '../services/location';
import { buildPlacePath, sharePlace } from '../services/placeUrl';

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
  const [copiedShare, setCopiedShare] = useState(false);

  const handleCardShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await sharePlace(place);
    if (res.method === 'clipboard') {
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  };

  const hasCommunityData =
    place.communityConfidence !== 'Insufficient Data' &&
    (place.communityScore > 0 || (place.communityRating && place.communityRating > 0));

  const primaryBadge = place.isTrending
    ? { label: 'Trending', className: 'bg-[#ccff00] text-black font-bold' }
    : place.isEvent
    ? {
        label: 'Event',
        className: 'bg-purple-950/85 text-purple-200 border border-purple-400/30 font-semibold',
      }
    : place.isHiddenGem
    ? {
        label: 'Hidden Gem',
        className: 'bg-black/75 text-zinc-200 border border-white/15 font-semibold',
      }
    : null;

  return (
    <article
      onClick={() => onSelect(place)}
      onMouseDown={() => setIsPressing(true)}
      onMouseUp={() => setIsPressing(false)}
      onMouseLeave={() => setIsPressing(false)}
      onTouchStart={() => setIsPressing(true)}
      onTouchEnd={() => setIsPressing(false)}
      className={`group relative rounded-2xl bg-[#111317] border border-white/[0.08] overflow-hidden cursor-pointer transition-all duration-150 flex flex-col ${
        isPressing ? 'scale-[0.99] border-white/20' : 'hover:border-white/[0.18]'
      }`}
    >
      {/* Visual Image Container */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#161920] shrink-0">
        {!imageError && (place.images?.[0] || place.image) ? (
          <img
            src={place.images?.[0] || place.image}
            alt={place.name}
            onError={() => setImageError(true)}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#161a22] via-[#111317] to-[#0c0e12] p-5 text-center">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-2.5 text-[#ccff00]">
              <Compass className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-zinc-200 line-clamp-1">{place.name}</span>
            <span className="text-[11px] text-zinc-500 mt-0.5">{place.category}</span>
          </div>
        )}

        {/* Measured dark scrim for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />

        {/* Single Top-Left Status Indicator */}
        {primaryBadge && (
          <div className="absolute top-3 left-3 z-10">
            <span
              className={`text-[10px] px-2.5 py-1 rounded-md uppercase tracking-wider backdrop-blur-md ${primaryBadge.className}`}
            >
              {primaryBadge.label}
            </span>
          </div>
        )}

        {/* Top-Right Share & Save Actions */}
        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCardShare}
            className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 cursor-pointer ${
              copiedShare
                ? 'bg-[#ccff00] text-black shadow-md'
                : 'bg-black/60 text-white hover:bg-black/80 border border-white/15'
            }`}
            aria-label={`Share ${place.name}`}
            title={copiedShare ? 'Link copied!' : `Share ${place.name}`}
          >
            {copiedShare ? (
              <Check className="w-4 h-4 stroke-[2.5]" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => onToggleSave(e, place.id)}
            className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 cursor-pointer ${
              isSaved
                ? 'bg-[#ccff00] text-black shadow-md'
                : 'bg-black/60 text-white hover:bg-black/80 border border-white/15'
            }`}
            aria-label={isSaved ? 'Remove from saved' : 'Save place'}
          >
            <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-black stroke-black' : ''}`} />
          </button>
        </div>

        {/* Bottom Scrim Overlay: Category & Real Community Rating */}
        <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2 pointer-events-none">
          <div className="flex items-center gap-1.5 text-xs text-white font-medium truncate">
            <span className="text-zinc-200 truncate">{place.category}</span>
            <span aria-hidden="true" className="text-zinc-500">
              ·
            </span>
            <span
              className={`font-semibold whitespace-nowrap ${
                place.openingHours?.openNow ? 'text-[#ccff00]' : 'text-zinc-400'
              }`}
            >
              {place.openingHours?.openNow ? 'Open Now' : 'Closed'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-white shrink-0">
            {place.communityRating && place.communityRating > 0 ? (
              <span className="flex items-center gap-1 text-[#ccff00] font-mono tabular-nums">
                <Star className="w-3.5 h-3.5 fill-[#ccff00] text-[#ccff00]" />
                <span>{place.communityRating}</span>
              </span>
            ) : hasCommunityData ? (
              <span className="text-[#ccff00] font-mono tabular-nums">{place.communityScore}%</span>
            ) : null}
            <span className="text-[11px] text-zinc-300 font-normal">
              {place.communityConfidence === 'Insufficient Data'
                ? 'New Spot'
                : `${place.communityConfidence} Trust`}
            </span>
          </div>
        </div>
      </div>

      {/* Card Content Area */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight group-hover:text-[#ccff00] transition-colors line-clamp-1">
            <a
              href={buildPlacePath(place)}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(place);
              }}
              className="focus:outline-none"
            >
              {place.name}
            </a>
          </h3>

          {/* Clean unboxed metadata */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400 mt-1.5 font-medium">
            {place.distanceKm !== undefined && (
              <>
                <span className="flex items-center gap-1 text-zinc-200">
                  <Navigation className="w-3 h-3 text-[#ccff00] shrink-0" />
                  <span className="font-mono tabular-nums">{formatDistance(place.distanceKm)}</span>
                </span>
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
              </>
            )}
            <span className="font-mono tabular-nums text-zinc-300">
              {place.priceLabel || place.priceLevel.label}
            </span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            <span className="truncate max-w-[160px]">{place.neighborhood || place.district}</span>
          </div>

          <p className="text-xs text-zinc-300 mt-2.5 line-clamp-2 leading-relaxed">
            {place.shortDescription}
          </p>
        </div>

        {/* Clean Unboxed Footer Metadata */}
        <div className="mt-3.5 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2 text-[11px] text-zinc-400">
          <div className="flex flex-wrap items-center gap-1.5 truncate">
            {place.tags.slice(0, 3).map((tag, idx) => (
              <span key={`${tag}-${idx}`} className="flex items-center gap-1.5 text-zinc-400">
                {idx > 0 && (
                  <span aria-hidden="true" className="text-zinc-600">
                    ·
                  </span>
                )}
                <span>{tag}</span>
              </span>
            ))}
          </div>

          {place.suggestedByScoutName && (
            <span className="text-[11px] text-zinc-400 shrink-0 truncate max-w-[130px]">
              Scout: <span className="text-zinc-200 font-medium">{place.suggestedByScoutName}</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
};
