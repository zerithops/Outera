import React, { useState } from 'react';
import { X, Navigation, Check, AlertCircle, MapPin } from 'lucide-react';
import { Coordinates, UserLocation } from '../types/outera';
import { POPULAR_NEIGHBORHOODS, requestBrowserLocation } from '../services/location';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: UserLocation;
  onSelectLocation: (loc: UserLocation) => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  currentLocation,
  onSelectLocation,
}) => {
  const [detecting, setDetecting] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDetect = async () => {
    setDetecting(true);
    setErrorState(null);

    const result = await requestBrowserLocation();
    setDetecting(false);

    if (result.success && result.location) {
      onSelectLocation(result.location);
      onClose();
    } else {
      if (result.error === 'denied') {
        setErrorState('Location permission was denied. Select your area manually below.');
      } else if (result.error === 'timeout') {
        setErrorState('GPS timed out. Select an area below to explore right away.');
      } else {
        setErrorState('Could not pinpoint GPS. Pick your neighborhood below.');
      }
    }
  };

  const handleSelectNeighborhood = (hood: { name: string; city: string; coords: Coordinates }) => {
    onSelectLocation({
      coords: hood.coords,
      neighborhoodName: hood.name,
      district: 'Dhaka',
      division: 'Dhaka',
      isCustomManual: true,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-modal-title"
    >
      <div
        className="w-full sm:max-w-md bg-[#111317] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#ccff00]" />
            <h2 id="location-modal-title" className="text-base font-bold text-white tracking-tight">
              Location Experience
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Radar Animation / Detection Box */}
        <div className="mt-5 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col items-center text-center">
          {detecting ? (
            <div className="py-6 flex flex-col items-center">
              {/* Radar pulse rings */}
              <div className="relative w-20 h-20 flex items-center justify-center">
                <span className="absolute w-20 h-20 rounded-full bg-[#ccff00]/20 animate-ping" />
                <span className="absolute w-14 h-14 rounded-full bg-[#ccff00]/30 animate-pulse" />
                <div className="w-8 h-8 rounded-full bg-[#ccff00] flex items-center justify-center text-black shadow-lg">
                  <Navigation className="w-4 h-4 animate-spin" />
                </div>
              </div>
              <p className="text-sm font-semibold text-white mt-4">Pinpointing spots around you...</p>
              <p className="text-xs text-zinc-400 mt-1">Reading GPS distance accurately</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-400 mb-3">
                OUTERA calculates walk and ride distances for everything in your radius.
              </p>

              <button
                type="button"
                onClick={handleDetect}
                className="w-full h-11 rounded-xl bg-[#ccff00] text-black font-bold text-xs tracking-wide flex items-center justify-center gap-2 hover:bg-[#d4ff1a] active:scale-[0.98] transition-all electric-glow-sm"
              >
                <Navigation className="w-4 h-4" />
                <span>Detect My Live GPS Location</span>
              </button>
            </>
          )}

          {errorState && (
            <div className="mt-3 w-full p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-left">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200 leading-relaxed">{errorState}</p>
            </div>
          )}
        </div>

        {/* Manual Neighborhood Fallback List */}
        <div className="mt-5">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Or Choose A Hotspot Area
          </p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
            {POPULAR_NEIGHBORHOODS.map((hood) => {
              const isSelected = currentLocation.neighborhoodName === hood.name;
              return (
                <button
                  key={hood.name}
                  type="button"
                  onClick={() => handleSelectNeighborhood(hood)}
                  className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition-all ${
                    isSelected
                      ? 'bg-[#ccff00]/10 border-[#ccff00]/40 text-white'
                      : 'bg-white/[0.02] border-white/[0.06] text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="pr-2">
                    <p className="text-xs font-semibold text-white">{hood.name}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">{hood.vibe}</p>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-[#ccff00] text-black flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] text-center">
          <p className="text-[11px] text-zinc-400">
            Current: <span className="text-zinc-200 font-medium">{currentLocation.neighborhoodName}</span>
          </p>
        </div>
      </div>
    </div>
  );
};
