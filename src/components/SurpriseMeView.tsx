import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Navigation,
  ArrowRight,
  Bookmark,
  Share2,
} from 'lucide-react';
import { Place, UserLocation } from '../types/outera';
import { getSurpriseRecommendation, PlaceWithDistance } from '../services/discoveryEngine';
import { formatDistance } from '../services/location';

interface SurpriseMeViewProps {
  places: Place[];
  userLocation: UserLocation;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
  onSelectPlace: (place: PlaceWithDistance) => void;
  onSuggestPlace?: () => void;
}

export const SurpriseMeView: React.FC<SurpriseMeViewProps> = ({
  places,
  userLocation,
  isSaved,
  onToggleSave,
  onSelectPlace,
  onSuggestPlace,
}) => {
  const [animating, setAnimating] = useState(false);
  const [currentRecommendation, setCurrentRecommendation] = useState<{
    place: PlaceWithDistance;
    reason: string;
  } | null>(null);

  // Generate on mount or location change
  useEffect(() => {
    if (places.length > 0) {
      rollRecommendation();
    } else {
      setCurrentRecommendation(null);
    }
  }, [userLocation.neighborhoodName, places.length]);

  const rollRecommendation = () => {
    if (places.length === 0) {
      setCurrentRecommendation(null);
      return;
    }
    setAnimating(true);
    setTimeout(() => {
      const rec = getSurpriseRecommendation(
        places,
        userLocation.coords,
        currentRecommendation?.place.id
      );
      setCurrentRecommendation(rec);
      setAnimating(false);
    }, 450);
  };

  const handleShare = async () => {
    if (!currentRecommendation) return;
    const { place } = currentRecommendation;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Surprise pick: ${place.name}`,
          text: `Found on OUTERA: ${place.name} (${place.neighborhood})`,
          url: window.location.href,
        });
      } catch {
        // cancelled
      }
    }
  };

  const currentPlace = currentRecommendation?.place;

  if (places.length === 0) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-8 max-w-md mx-auto text-center">
        <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/[0.06] space-y-4 w-full">
          <Sparkles className="w-10 h-10 text-[#ccff00] mx-auto" />
          <h2 className="text-xl font-black text-white tracking-tight">Nothing around you yet</h2>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
            OUTERA is still growing here. Be the first to suggest a hangout spot in {userLocation.neighborhoodName}!
          </p>
          {onSuggestPlace && (
            <button
              type="button"
              onClick={onSuggestPlace}
              className="mt-2 h-11 px-6 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 hover:bg-[#d8ff33] transition-all"
            >
              <span>Suggest a place</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[82vh] flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto">
      {/* Top Banner Tag */}
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-[#ccff00]" />
        <span className="text-xs font-bold uppercase tracking-wider text-[#ccff00]">
          Surprise Generator
        </span>
      </div>

      <h1 className="text-2xl sm:text-3xl font-black text-white text-center tracking-tight">
        Indecisive? Let OUTERA pick.
      </h1>
      <p className="text-xs text-zinc-400 text-center mt-1 mb-6 max-w-xs">
        No endless scrolling. One standout spot calibrated to your radius and real community vibes.
      </p>

      {/* Main Pick Card */}
      {animating ? (
        <div className="w-full aspect-[4/5] rounded-3xl bg-[#121418] border border-white/[0.08] p-6 flex flex-col items-center justify-center text-center">
          <div className="relative w-20 h-20 flex items-center justify-center">
            <span className="absolute w-20 h-20 rounded-full border border-[#ccff00]/40 animate-ping" />
            <span className="absolute w-14 h-14 rounded-full border border-[#ccff00]/60 animate-spin" />
            <Sparkles className="w-8 h-8 text-[#ccff00]" />
          </div>
          <p className="text-sm font-bold text-white mt-6">Scanning discovered spots...</p>
          <p className="text-xs text-zinc-500 mt-1">Checking distance & live community scores</p>
        </div>
      ) : currentPlace ? (
        <div className="w-full rounded-3xl bg-[#121418] border border-white/[0.1] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Image */}
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-900">
            <img
              src={currentPlace.images[0]}
              alt={currentPlace.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#121418] via-transparent to-black/30 pointer-events-none" />

            {/* Float badges */}
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="text-[11px] font-bold text-black bg-[#ccff00] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-md">
                Found something for you
              </span>
            </div>

            <div className="absolute top-4 right-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleShare}
                className="w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-md border border-white/10 active:scale-90 transition-all"
                aria-label="Share pick"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onToggleSave(currentPlace.id)}
                className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 ${
                  isSaved
                    ? 'bg-[#ccff00] text-black shadow-lg shadow-[#ccff00]/20'
                    : 'bg-black/60 text-white border border-white/10'
                }`}
                aria-label="Save pick"
              >
                <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-black' : ''}`} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 sm:p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#ccff00] uppercase tracking-wider">
                <span>{currentPlace.category}</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-300 font-mono">{formatDistance(currentPlace.distanceKm)}</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-300">{currentPlace.priceLevel.label}</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
                {currentPlace.name}
              </h2>

              <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                {currentPlace.shortDescription}
              </p>
            </div>

            {/* Why This Pick Box */}
            <div className="p-3.5 rounded-2xl bg-[#181c22] border border-white/[0.08]">
              <span className="text-[10px] font-bold text-[#ccff00] uppercase tracking-wider block mb-1">
                Why this pick?
              </span>
              <p className="text-xs text-zinc-200 leading-relaxed font-normal">
                "{currentRecommendation?.reason || currentPlace.whyPick}"
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center justify-between text-xs text-zinc-400 pt-1 border-t border-white/[0.06]">
              <span className="flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-[#ccff00]" />
                <span>{currentPlace.neighborhood}</span>
              </span>
              <span className="font-semibold text-white">
                <span className="text-[#ccff00] font-mono">{currentPlace.communityScore}%</span> would return
              </span>
            </div>

            {/* Actions: "Let's Go" + "Try Another" */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                onClick={() => onSelectPlace(currentPlace)}
                className="w-full sm:flex-1 h-12 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 hover:bg-[#d4ff1a] active:scale-[0.98] transition-all electric-glow-sm"
              >
                <span>Let's Go</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={rollRecommendation}
                className="w-full sm:w-auto h-12 px-5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] active:scale-[0.98] border border-white/[0.1] text-xs font-bold text-white flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCw className="w-4 h-4 text-zinc-400" />
                <span>Try Another</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
