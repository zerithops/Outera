import React, { useState, useEffect, useCallback } from 'react';
import {
  Navigation,
  MapPin,
  Clock,
  Coins,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Place, TransportOption, TransportType, UserLocation } from '../types/outera';
import { BANGLADESH_DIVISIONS } from '../data/bangladeshLocations';
import { getTransportOptionsForPlace, fetchCommunityFareReports } from '../services/transport';
import { ReportFareModal } from './ReportFareModal';

interface HowToGetThereSectionProps {
  place: Place;
  userLocation?: UserLocation;
  onOpenReportFareModal?: () => void;
}

export const HowToGetThereSection: React.FC<HowToGetThereSectionProps> = ({
  place,
  userLocation,
}) => {
  // Origin State: default to user's real detected district, or Dhaka
  const initialDistrict =
    userLocation?.district && userLocation.district !== 'Select Location' && userLocation.district !== 'Detected Area'
      ? userLocation.district
      : 'Dhaka';

  const [originDistrict, setOriginDistrict] = useState<string>(initialDistrict);
  const [originName, setOriginName] = useState<string>(
    userLocation?.neighborhoodName && userLocation.neighborhoodName !== 'Location not set'
      ? userLocation.neighborhoodName
      : `${initialDistrict} City`
  );
  const [useGpsCoords, setUseGpsCoords] = useState<boolean>(Boolean(userLocation?.coords));

  const [options, setOptions] = useState<TransportOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedMultiLegId, setExpandedMultiLegId] = useState<string | null>(null);
  const [showOriginSelector, setShowOriginSelector] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);

  // Selected Division for origin picker
  const [selectedDivision, setSelectedDivision] = useState<string>('Dhaka');

  // Load transport options dynamically
  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const originCoords = useGpsCoords && userLocation?.coords ? userLocation.coords : null;
      const opts = await getTransportOptionsForPlace(
        {
          name: originName,
          district: originDistrict,
          coords: originCoords,
        },
        place
      );
      setOptions(opts);
    } catch (err) {
      console.warn('Failed to load transport options:', err);
    } finally {
      setLoading(false);
    }
  }, [originName, originDistrict, useGpsCoords, userLocation?.coords, place]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Format duration into hours and minutes
  const formatDuration = (totalMinutes: number): string => {
    if (!totalMinutes || totalMinutes <= 0) return '~30m';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours === 0) return `~${mins} min`;
    if (mins === 0) return `~${hours}h`;
    return `~${hours}h ${mins}m`;
  };

  const getTransportEmoji = (type: TransportType): string => {
    switch (type) {
      case 'Bus':
        return '🚌';
      case 'Train':
        return '🚆';
      case 'CNG / Auto':
        return '🛺';
      case 'Rickshaw':
        return '🚲';
      case 'Easy Bike / E-bike':
        return '🛵';
      case 'Launch / Boat':
        return '🚢';
      case 'Private Car':
        return '🚗';
      default:
        return '🧭';
    }
  };

  const getSourceBadgeStyle = (sourceType: TransportOption['sourceType']) => {
    switch (sourceType) {
      case 'OFFICIAL':
        return {
          label: 'Official fare',
          className: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
        };
      case 'OPERATOR':
        return {
          label: 'Verified operator',
          className: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        };
      case 'COMMUNITY':
        return {
          label: 'Community verified',
          className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        };
      case 'ESTIMATED':
      default:
        return {
          label: 'Estimated',
          className: 'bg-zinc-800 text-zinc-300 border-white/10',
        };
    }
  };

  const getConfidenceBadge = (confidence: TransportOption['confidence']) => {
    switch (confidence) {
      case 'High':
        return <span className="text-[10px] text-emerald-400 font-bold">Confidence: High</span>;
      case 'Medium':
        return <span className="text-[10px] text-amber-400 font-bold">Confidence: Medium</span>;
      case 'Low':
      default:
        return <span className="text-[10px] text-zinc-400 font-bold">Confidence: Low</span>;
    }
  };

  // Handle setting origin from 64-district selector
  const handleSelectDistrictOrigin = (distName: string) => {
    setOriginDistrict(distName);
    setOriginName(`${distName} Center`);
    setUseGpsCoords(false);
    setShowOriginSelector(false);
  };

  const handleUseCurrentLocation = () => {
    if (userLocation?.coords) {
      setUseGpsCoords(true);
      setOriginDistrict(userLocation.district || 'Dhaka');
      setOriginName(userLocation.neighborhoodName || 'Current Location');
      setShowOriginSelector(false);
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-[#12151b] border border-white/[0.08] space-y-5 animate-in fade-in duration-150">
      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black tracking-widest uppercase text-[#ccff00] font-mono">
              Transit & Fare Intelligence
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00]" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
            <span>HOW TO GET THERE</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real transit modes, fare ranges, and community consensus to reach{' '}
            <span className="text-white font-semibold">{place.name}</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsReportModalOpen(true)}
          className="h-8 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 hover:text-white text-[11px] font-bold border border-white/[0.08] flex items-center gap-1.5 transition-all self-start sm:self-auto cursor-pointer"
        >
          <PlusCircle className="w-3.5 h-3.5 text-[#ccff00]" />
          <span>Report Fare</span>
        </button>
      </div>

      {/* Origin Selector Ribbon */}
      <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-[#ccff00]/10 border border-[#ccff00]/20 flex items-center justify-center shrink-0 text-[#ccff00]">
            <Navigation className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
              <span>From:</span>
              <span className="font-bold text-white truncate">{originName}</span>
              {useGpsCoords && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#ccff00]/15 text-[#ccff00] font-mono font-bold">
                  GPS
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-500 truncate">
              <span>To:</span>
              <span className="text-zinc-300 font-semibold truncate">{place.name}</span>
              <span>({place.district || place.neighborhood})</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          {userLocation?.coords && !useGpsCoords && (
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="h-7 px-2.5 rounded-lg bg-[#ccff00] text-black font-extrabold text-[10px] flex items-center gap-1 hover:bg-[#d8ff33] transition-all cursor-pointer"
            >
              <Navigation className="w-3 h-3" />
              <span>Use GPS</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowOriginSelector(!showOriginSelector)}
            className="h-7 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 text-[10px] font-semibold border border-white/[0.08] flex items-center gap-1 transition-all cursor-pointer"
          >
            <MapPin className="w-3 h-3 text-[#ccff00]" />
            <span>Change Origin</span>
            {showOriginSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* 64-District Origin Dropdown Picker */}
      {showOriginSelector && (
        <div className="p-4 rounded-xl bg-black/60 border border-white/[0.08] space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-white">Select starting district:</span>
            <span className="text-[10px] text-zinc-500 font-mono">64 Bangladesh Districts</span>
          </div>

          {/* Division tabs */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
            {BANGLADESH_DIVISIONS.map((div) => (
              <button
                key={div.name}
                type="button"
                onClick={() => setSelectedDivision(div.name)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all cursor-pointer ${
                  selectedDivision === div.name
                    ? 'bg-[#ccff00] text-black font-extrabold'
                    : 'bg-white/[0.04] text-zinc-400 hover:text-white'
                }`}
              >
                {div.name}
              </button>
            ))}
          </div>

          {/* Districts in division */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
            {BANGLADESH_DIVISIONS.find((d) => d.name === selectedDivision)?.districts.map((dist) => (
              <button
                key={dist.name}
                type="button"
                onClick={() => handleSelectDistrictOrigin(dist.name)}
                className={`h-7 px-2 rounded-lg text-[11px] font-medium transition-all text-left truncate border cursor-pointer ${
                  originDistrict === dist.name
                    ? 'bg-[#ccff00]/15 text-[#ccff00] border-[#ccff00]/40 font-bold'
                    : 'bg-white/[0.02] text-zinc-300 border-white/[0.04] hover:bg-white/[0.08]'
                }`}
              >
                {dist.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transport Options Cards List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-8 text-center space-y-2 bg-white/[0.01] rounded-xl border border-white/[0.04]">
            <RefreshCw className="w-5 h-5 text-[#ccff00] animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-mono">Computing transit routes & verified fares...</p>
          </div>
        ) : options.length === 0 ? (
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center space-y-2">
            <Coins className="w-7 h-7 text-zinc-500 mx-auto" />
            <h4 className="text-xs font-bold text-white">Fare information unavailable</h4>
            <p className="text-[11px] text-zinc-400 max-w-sm mx-auto leading-relaxed">
              No official transit data recorded yet between <span className="text-zinc-200">{originDistrict}</span> and{' '}
              <span className="text-zinc-200">{place.name}</span>. Be the first to report your experience!
            </p>
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="h-8 px-4 rounded-xl bg-[#ccff00] text-black font-extrabold text-[11px] inline-flex items-center gap-1.5 hover:bg-[#d8ff33] transition-all cursor-pointer mt-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Contribute Fare Report</span>
            </button>
          </div>
        ) : (
          options.map((opt) => {
            const sourceBadge = getSourceBadgeStyle(opt.sourceType);
            const isMultiLegExpanded = expandedMultiLegId === opt.id;

            return (
              <div
                key={opt.id}
                className="p-4 sm:p-4.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.14] transition-all space-y-3"
              >
                {/* Top Row: Transport Name & Fare Range */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl shrink-0" role="img" aria-label={opt.transportType}>
                      {getTransportEmoji(opt.transportType)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-white truncate">{opt.transportType}</h3>
                        {opt.isMultiLeg && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-[#ccff00]/15 text-[#ccff00]">
                            Multi-Leg
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#ccff00]" />
                          <span>{formatDuration(opt.estimatedDurationMin)}</span>
                        </span>
                        {opt.distanceKm && (
                          <>
                            <span className="text-zinc-600">·</span>
                            <span>{opt.distanceKm} km</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fare Range Display */}
                  <div className="text-right shrink-0">
                    <div className="text-sm sm:text-base font-black text-[#ccff00] font-mono">
                      ৳{opt.minFare.toLocaleString()}–{opt.maxFare.toLocaleString()}
                    </div>
                    <span className="text-[10px] text-zinc-400 block -mt-0.5 font-medium">Estimated Fare</span>
                  </div>
                </div>

                {/* Badges Strip */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/[0.04]">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sourceBadge.className}`}
                  >
                    {sourceBadge.label}
                  </span>

                  {getConfidenceBadge(opt.confidence)}

                  <span className="text-[10px] text-zinc-500 font-mono">
                    Updated {new Date(opt.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>

                  {opt.isOutdated && (
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>May be outdated</span>
                    </span>
                  )}

                  {opt.communityReportsCount && opt.communityReportsCount > 0 && (
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1 ml-auto">
                      <Users className="w-3 h-3 text-[#ccff00]" />
                      <span>{opt.communityReportsCount} scout reports</span>
                    </span>
                  )}
                </div>

                {/* Route Notes if present */}
                {opt.notes && (
                  <p className="text-[11px] text-zinc-300 bg-black/30 p-2.5 rounded-xl border border-white/[0.04] leading-relaxed">
                    {opt.notes}
                  </p>
                )}

                {/* Multi-Leg Accordion Breakdown */}
                {opt.isMultiLeg && opt.legs && opt.legs.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedMultiLegId(isMultiLegExpanded ? null : opt.id)
                      }
                      className="text-[11px] font-bold text-[#ccff00] flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <span>{isMultiLegExpanded ? 'Hide Route Breakdown' : 'View Step-by-Step Breakdown'}</span>
                      {isMultiLegExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {isMultiLegExpanded && (
                      <div className="mt-2.5 p-3 rounded-xl bg-black/50 border border-white/[0.08] space-y-3 animate-in fade-in duration-150">
                        <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                          Recommended Itinerary Steps
                        </div>

                        <div className="space-y-2.5 relative pl-3 border-l-2 border-[#ccff00]/30 ml-2">
                          {opt.legs.map((leg, idx) => (
                            <div key={idx} className="relative space-y-1">
                              <span className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-[#ccff00] border-2 border-black" />
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-white flex items-center gap-1">
                                  <span>{getTransportEmoji(leg.transportType)}</span>
                                  <span>Step {idx + 1}: {leg.transportType}</span>
                                </span>
                                <span className="text-[#ccff00] font-mono font-bold">
                                  ৳{leg.minFare}–{leg.maxFare}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400">
                                {leg.fromLocation} → {leg.toLocation} ({formatDuration(leg.estimatedDurationMin)})
                              </p>
                              {leg.notes && (
                                <p className="text-[10px] text-zinc-500 italic">{leg.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                          <span className="text-zinc-400 font-semibold">Total Estimated Journey:</span>
                          <span className="text-white font-mono font-bold">
                            ৳{opt.minFare}–{opt.maxFare} · {formatDuration(opt.estimatedDurationMin)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Transparency Disclaimer Footer */}
      <div className="text-[10px] text-zinc-500 space-y-1 border-t border-white/[0.04] pt-3">
        <p className="leading-snug">
          ⚠️ <strong className="text-zinc-400">Disclaimer:</strong> Fares are community and operator estimates. Actual charges may vary depending on season, night departures, negotiated rickshaw/auto rates, or fuel prices.
        </p>
      </div>

      {/* Community Fare Reporting Modal */}
      <ReportFareModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        place={place}
        defaultOrigin={originDistrict}
        onFareReported={loadOptions}
      />
    </div>
  );
};
