import React, { useState } from 'react';
import {
  X,
  Bookmark,
  Share2,
  Navigation,
  Sparkles,
  CheckCircle2,
  Users,
  MessageSquarePlus,
  Compass,
  Check,
  Calendar,
} from 'lucide-react';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { formatDistance } from '../services/location';
import { isPlaceVisitedByUser, toggleVisitedPlace } from '../services/storage';
import { ExperienceVerificationItem } from './ExperienceVerificationItem';

interface PlaceDetailsModalProps {
  place: PlaceWithDistance | null;
  isOpen: boolean;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
  onOpenReportModal: (place: PlaceWithDistance) => void;
  onPlaceUpdated?: () => void;
}

export const PlaceDetailsModal: React.FC<PlaceDetailsModalProps> = ({
  place,
  isOpen,
  onClose,
  isSaved,
  onToggleSave,
  onOpenReportModal,
  onPlaceUpdated,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'experiences'>('overview');

  if (!isOpen || !place) return null;

  const userHasVisited = isPlaceVisitedByUser(place.id);

  const handleToggleVisited = () => {
    toggleVisitedPlace(place.id);
    if (onPlaceUpdated) onPlaceUpdated();
  };

  const handleShare = async () => {
    const shareData = {
      title: `${place.name} on OUTERA`,
      text: `Check out ${place.name} on OUTERA — ${place.shortDescription}`,
      url: window.location.href,
    };

    if (typeof navigator !== 'undefined' && navigator.share) {
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

  const reports = place.experienceReports || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-details-title"
    >
      <div className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] bg-[#101216] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-2xl overflow-y-auto no-scrollbar shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Sticky Mobile Drag & Close Bar */}
        <div className="sticky top-0 z-20 bg-[#101216]/95 backdrop-blur-md px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#ccff00]">
              {place.category}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-xs text-zinc-400 font-mono">{formatDistance(place.distanceKm)}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-xs text-zinc-400 font-medium">{place.district}</span>
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

        {/* Hero Media Container */}
        <div className="relative aspect-[16/9] w-full bg-zinc-900 overflow-hidden shrink-0">
          <img
            src={place.images[0]}
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

          {/* Confidence Badge */}
          <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[11px] font-bold text-white">
            <span className="text-[#ccff00] font-mono">{place.communityScore}%</span>
            <span>·</span>
            <span>{place.communityConfidence} Confidence</span>
          </div>
        </div>

        {/* Header Tabs: Overview vs Community Experiences */}
        <div className="px-5 pt-3 border-b border-white/[0.06] flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-[#ccff00] text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Overview & Vibe
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('experiences')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'experiences'
                ? 'border-[#ccff00] text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>See Community Experiences</span>
            <span className="px-1.5 py-0.2 rounded-full bg-white/[0.08] text-[10px] font-mono">
              {reports.length}
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {copied && (
            <div className="p-2.5 rounded-xl bg-[#ccff00]/15 border border-[#ccff00]/30 text-center text-xs font-semibold text-[#ccff00]">
              Link copied to clipboard!
            </div>
          )}

          {/* Title & Core Location Info */}
          <div>
            <h1 id="place-details-title" className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {place.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-2 font-medium">
              <span className="text-zinc-200 font-semibold">{place.neighborhood}</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="text-zinc-300">{place.district}, {place.division}</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="text-[#ccff00] font-semibold">{place.priceLevel.label}</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>{place.environment}</span>
            </div>
          </div>

          {/* "I'VE BEEN HERE" Action Banner */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className={`w-4 h-4 ${userHasVisited ? 'text-[#ccff00]' : 'text-zinc-400'}`} />
                <span className="text-xs font-bold text-white">
                  {userHasVisited ? "You've marked this place as visited" : "Have you been to this spot?"}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {place.verifiedVisitorsCount} community members have explored here. Marking a visit gives your observations double weight.
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleVisited}
              className={`h-9 px-4 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
                userHasVisited
                  ? 'bg-[#ccff00] text-black border-[#ccff00] shadow-sm'
                  : 'bg-white/[0.05] text-zinc-200 hover:text-white border-white/[0.1] hover:bg-white/[0.09]'
              }`}
            >
              {userHasVisited ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Visited</span>
                </>
              ) : (
                <span>I've Been Here</span>
              )}
            </button>
          </div>

          {/* Event Banner if applicable */}
          {place.isEvent && place.eventInfo && (
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-start gap-3">
              <Calendar className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-purple-200 block uppercase tracking-wider text-[10px]">
                  Upcoming Special Event
                </span>
                <p className="text-white font-bold">{place.eventInfo.date} · {place.eventInfo.schedule}</p>
                <p className="text-zinc-300 font-normal">{place.eventInfo.entryPass}</p>
              </div>
            </div>
          )}

          {activeTab === 'overview' ? (
            <>
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

              {/* COMMUNITY CONSENSUS SECTION */}
              <div className="p-5 rounded-2xl bg-[#14171d] border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#ccff00]">
                      COMMUNITY SAYS
                    </h2>
                    <p className="text-sm font-extrabold text-white mt-0.5">
                      Aggregated Community Observations
                    </p>
                  </div>
                  <span className="text-xs text-zinc-400 font-medium">
                    Based on {place.totalReports} experiences
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-sm block mb-1">💰</span>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">Price</span>
                    <span className="text-xs font-bold text-white">
                      {place.priceLevel.min <= 150 ? 'Mostly affordable' : place.priceLevel.min <= 350 ? 'Fair pricing' : 'Moderate'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-sm block mb-1">👥</span>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">Crowd</span>
                    <span className="text-xs font-bold text-white">Usually {place.crowdLevel.toLowerCase()}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-sm block mb-1">✨</span>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">Vibe</span>
                    <span className="text-xs font-bold text-white">{place.primaryVibe}</span>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-sm block mb-1">🔄</span>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">Would return</span>
                    <span className="text-xs font-bold text-[#ccff00] font-mono">{place.communityScore}%</span>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400 italic">
                  *These are aggregated community observations, not absolute facts.
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
            </>
          ) : (
            /* EXPERIENCES & VERIFICATION TAB */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#ccff00]" />
                    <span>Community Verified Experiences</span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Peer-verified observations. Did your experience match these?
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenReportModal(place)}
                  className="h-9 px-3 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  <span>Log Yours</span>
                </button>
              </div>

              {reports.length > 0 ? (
                <div className="space-y-3">
                  {reports.map((report) => (
                    <ExperienceVerificationItem
                      key={report.id}
                      report={report}
                      placeId={place.id}
                      isUserVerifiedVisitor={userHasVisited}
                      onVerificationUpdated={() => {
                        if (onPlaceUpdated) onPlaceUpdated();
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-center">
                  <p className="text-xs text-zinc-400">Be the first to log a community experience for this spot!</p>
                </div>
              )}
            </div>
          )}

          {/* Map Direction Bar */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-[#ccff00]" />
                  <span>{place.address}</span>
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">{place.neighborhood}, {place.district}</p>
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
              <span>Get Directions</span>
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
