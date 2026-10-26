import React, { useState } from 'react';
import {
  X,
  Bookmark,
  Share2,
  Navigation,
  Clock,
  Sparkles,
  CheckCircle2,
  Users,
  MessageSquarePlus,
  Compass,
} from 'lucide-react';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { formatDistance } from '../services/location';

interface PlaceDetailsModalProps {
  place: PlaceWithDistance | null;
  isOpen: boolean;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
  onOpenReportModal: (place: PlaceWithDistance) => void;
}

export const PlaceDetailsModal: React.FC<PlaceDetailsModalProps> = ({
  place,
  isOpen,
  onClose,
  isSaved,
  onToggleSave,
  onOpenReportModal,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeImageIndex] = useState(0);

  if (!isOpen || !place) return null;

  const handleShare = async () => {
    const shareData = {
      title: `${place.name} on OUTERA`,
      text: `Check out ${place.name} on OUTERA — ${place.shortDescription}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled share
      }
    } else {
      try {
        await navigator.clipboard.writeText(
          `${place.name} — ${place.neighborhood}: ${window.location.origin}`
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.warn(err);
      }
    }
  };

  const openGoogleMaps = () => {
    const query = encodeURIComponent(`${place.name}, ${place.address}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-details-title"
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] bg-[#101216] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-2xl overflow-y-auto no-scrollbar shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-6 duration-200"
      >
        {/* Sticky Mobile Drag & Close Bar */}
        <div className="sticky top-0 z-20 bg-[#101216]/90 backdrop-blur-md px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#ccff00]">
              {place.category}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-xs text-zinc-400 font-mono">{formatDistance(place.distanceKm)}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleShare}
              className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-300 hover:text-white transition-all"
              aria-label="Share spot"
              title="Share"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleSave(place.id)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                isSaved ? 'bg-[#ccff00] text-black' : 'bg-white/[0.05] text-zinc-300 hover:text-white'
              }`}
              aria-label={isSaved ? 'Saved' : 'Save'}
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-black' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-400 hover:text-white ml-1"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hero Media */}
        <div className="relative aspect-[16/9] w-full bg-zinc-900 overflow-hidden shrink-0">
          <img
            src={place.images[activeImageIndex] || place.images[0]}
            alt={place.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#101216] via-transparent to-black/30 pointer-events-none" />

          {/* Opening Status Badge */}
          <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-white">
            <span
              className={`w-2 h-2 rounded-full ${
                place.openingHours.openNow ? 'bg-[#ccff00]' : 'bg-red-400'
              }`}
            />
            <span>{place.openingHours.openNow ? 'Open Now' : 'Closed Right Now'}</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-300 font-normal">{place.openingHours.hoursText}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {copied && (
            <div className="p-2.5 rounded-xl bg-[#ccff00]/15 border border-[#ccff00]/30 text-center text-xs font-semibold text-[#ccff00]">
              Link copied to clipboard!
            </div>
          )}

          {/* Title & Core Stats */}
          <div>
            <h1 id="place-details-title" className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {place.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-2 font-medium">
              <span className="text-zinc-200">{place.neighborhood}</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="text-[#ccff00] font-semibold">{place.priceLevel.label}</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>{place.environment}</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>{place.address}</span>
            </div>
          </div>

          {/* Why This Pick / Context Callout */}
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#ccff00] mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>WHY OUTERA RECOMMENDS THIS</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed font-medium">
              {place.whyPick}
            </p>
          </div>

          {/* Description */}
          <div>
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">About The Spot</h2>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              {place.fullDescription}
            </p>
          </div>

          {/* Highlights */}
          {place.highlights && place.highlights.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5">Key Highlights</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {place.highlights.map((item) => (
                  <div
                    key={item}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2.5 text-xs text-zinc-200"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#ccff00] shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Community Experience Insights (Major Core Feature) */}
          <div className="p-5 rounded-2xl bg-[#14171d] border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#ccff00]" />
                  <span>Community Experience Insights</span>
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Based on {place.totalReports} visitor reports
                </p>
              </div>

              <div className="text-right">
                <span className="text-xl font-extrabold text-[#ccff00] font-mono tabular-nums">
                  {place.communityScore}%
                </span>
                <span className="block text-[10px] text-zinc-400 uppercase font-semibold">
                  Worth Visiting
                </span>
              </div>
            </div>

            {/* Aggregated Community Metrics Grid */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Crowd</span>
                <span className="text-xs font-bold text-white">{place.userReportsBreakdown.mostCommonCrowd}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Vibe</span>
                <span className="text-xs font-bold text-white">{place.userReportsBreakdown.mostCommonVibe}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-1">Pricing</span>
                <span className="text-xs font-bold text-white">{place.userReportsBreakdown.mostCommonPrice}</span>
              </div>
            </div>

            {/* Aggregated prose quote */}
            <div className="text-xs text-zinc-300 italic bg-white/[0.02] p-3 rounded-xl border border-white/[0.04]">
              “People say this place is: {place.communityScore}% worth visiting,{' '}
              {place.userReportsBreakdown.mostCommonCrowd.toLowerCase()} crowd, good for{' '}
              {place.groupFit.join(' and ').toLowerCase()}, and mostly {place.priceLevel.label}.”
            </div>

            {/* Recent Real Experience Comments */}
            {place.userReportsBreakdown.recentComments.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Recent Experiences</p>
                {place.userReportsBreakdown.recentComments.map((comment, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs">
                    <p className="text-zinc-200 leading-relaxed font-normal">“{comment.text}”</p>
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2 font-medium">
                      <span>Vibe: {comment.vibe}</span>
                      <span>{comment.timeAgo}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Button to submit feedback */}
            <button
              type="button"
              onClick={() => onOpenReportModal(place)}
              className="w-full h-11 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] active:scale-[0.98] border border-white/[0.1] text-xs font-bold text-white flex items-center justify-center gap-2 transition-all"
            >
              <MessageSquarePlus className="w-4 h-4 text-[#ccff00]" />
              <span>Log Your Experience (30s)</span>
            </button>
          </div>

          {/* Location & Map Direction Simulation */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-[#ccff00]" />
                  <span>{place.address}</span>
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">{place.neighborhood}, {place.city}</p>
              </div>
              <span className="text-xs font-mono text-[#ccff00] font-semibold">
                {formatDistance(place.distanceKm)}
              </span>
            </div>

            <button
              type="button"
              onClick={openGoogleMaps}
              className="w-full h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] active:scale-[0.98] border border-white/[0.08] text-xs font-bold text-white flex items-center justify-center gap-2 transition-all"
            >
              <Compass className="w-4 h-4 text-[#ccff00]" />
              <span>Open in Maps & Get Directions</span>
            </button>
          </div>
        </div>

        {/* Sticky Mobile Bottom CTA Bar */}
        <div className="sticky bottom-0 z-20 bg-[#101216]/95 backdrop-blur-md p-4 border-t border-white/[0.08] flex items-center gap-3">
          <button
            type="button"
            onClick={() => onToggleSave(place.id)}
            className={`h-12 px-4 rounded-xl border flex items-center justify-center text-xs font-bold transition-all ${
              isSaved
                ? 'bg-[#ccff00]/10 border-[#ccff00]/40 text-[#ccff00]'
                : 'bg-white/[0.05] border-white/[0.1] text-zinc-300 hover:text-white'
            }`}
          >
            <Bookmark className={`w-4 h-4 mr-1.5 ${isSaved ? 'fill-current' : ''}`} />
            <span>{isSaved ? 'Saved' : 'Save'}</span>
          </button>

          <button
            type="button"
            onClick={openGoogleMaps}
            className="flex-1 h-12 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 hover:bg-[#d4ff1a] active:scale-[0.98] transition-all electric-glow-sm"
          >
            <span>Let's Go Right Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
