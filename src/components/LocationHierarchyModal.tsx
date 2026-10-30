import React, { useState } from 'react';
import {
  X,
  Navigation,
  Check,
  AlertCircle,
  MapPin,
  ChevronRight,
  Search,
  Globe2,
} from 'lucide-react';
import { DivisionName, UserLocation } from '../types/outera';
import {
  BANGLADESH_DIVISIONS,
  DistrictInfo,
  DivisionInfo,
  searchBangladeshLocations,
} from '../data/bangladeshLocations';
import { requestBrowserLocation } from '../services/location';

interface LocationHierarchyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: UserLocation;
  onSelectLocation: (loc: UserLocation) => void;
}

export const LocationHierarchyModal: React.FC<LocationHierarchyModalProps> = ({
  isOpen,
  onClose,
  currentLocation,
  onSelectLocation,
}) => {
  const [detecting, setDetecting] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Hierarchy navigation state: 'divisions' | 'districts' | 'areas'
  const [selectedDivision, setSelectedDivision] = useState<DivisionInfo | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictInfo | null>(null);

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
        setErrorState('GPS access was denied. Pick your division or district manually below.');
      } else if (result.error === 'timeout') {
        setErrorState('GPS timed out. Select an area below to explore right away.');
      } else {
        setErrorState('Could not pinpoint GPS. Pick your district below.');
      }
    }
  };

  const searchResults = searchQuery.trim().length > 1 ? searchBangladeshLocations(searchQuery) : [];

  const handleSelectSearchResult = (res: {
    division: DivisionName;
    district: string;
    area: string;
    coords: { lat: number; lng: number };
  }) => {
    onSelectLocation({
      coords: res.coords,
      neighborhoodName: res.area,
      district: res.district,
      division: res.division,
      isCustomManual: true,
    });
    onClose();
  };

  const handleSelectArea = (area: string) => {
    if (!selectedDistrict || !selectedDivision) return;
    onSelectLocation({
      coords: selectedDistrict.coords,
      neighborhoodName: area,
      district: selectedDistrict.name,
      division: selectedDivision.name,
      isCustomManual: true,
    });
    onClose();
  };

  const handleSelectWholeDistrict = (dist: DistrictInfo) => {
    if (!selectedDivision) return;
    onSelectLocation({
      coords: dist.coords,
      neighborhoodName: dist.popularAreas[0] || dist.name,
      district: dist.name,
      division: selectedDivision.name,
      isCustomManual: true,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-hierarchy-title"
    >
      <div className="w-full sm:max-w-xl bg-[#111317] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-[#ccff00]" />
            <div>
              <h2 id="location-hierarchy-title" className="text-base font-bold text-white tracking-tight">
                Bangladesh Location Hierarchy
              </h2>
              <p className="text-[11px] text-zinc-400">All 8 Divisions & 64 Districts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live GPS Radar Bar */}
        <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#ccff00]/10 flex items-center justify-center shrink-0">
              <Navigation className={`w-4 h-4 text-[#ccff00] ${detecting ? 'animate-spin' : ''}`} />
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-white">Live GPS Detection</p>
              <p className="text-[10px] text-zinc-400 truncate">
                Current: {currentLocation.neighborhoodName}, {currentLocation.district}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDetect}
            disabled={detecting}
            className="h-9 px-3 rounded-lg bg-[#ccff00] text-black font-extrabold text-[11px] uppercase tracking-wider shrink-0 hover:bg-[#d4ff1a] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {detecting ? 'Locating...' : 'Detect GPS'}
          </button>
        </div>

        {errorState && (
          <div className="mt-2.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">{errorState}</p>
          </div>
        )}

        {/* Search Bar across Bangladesh */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any district, city or area (e.g., Cox's Bazar, Sylhet, Dhanmondi)..."
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
          />
        </div>

        {/* Fast Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-2 p-2 rounded-xl bg-[#16181d] border border-[#ccff00]/30 space-y-1">
            <p className="text-[10px] font-bold text-[#ccff00] uppercase tracking-wider px-2 py-1">
              Matching Locations
            </p>
            {searchResults.map((res, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelectSearchResult(res)}
                className="w-full p-2 rounded-lg text-left text-xs text-zinc-200 hover:bg-white/[0.06] hover:text-[#ccff00] flex items-center justify-between transition-colors"
              >
                <span>{res.displayName}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>
            ))}
          </div>
        )}

        {/* Breadcrumb Hierarchy Bar */}
        <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-400 flex-wrap pb-2 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              setSelectedDivision(null);
              setSelectedDistrict(null);
            }}
            className={`font-semibold hover:underline ${
              !selectedDivision ? 'text-[#ccff00]' : 'text-zinc-300'
            }`}
          >
            Bangladesh (8)
          </button>

          {selectedDivision && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              <button
                type="button"
                onClick={() => setSelectedDistrict(null)}
                className={`font-semibold hover:underline ${
                  !selectedDistrict ? 'text-[#ccff00]' : 'text-zinc-300'
                }`}
              >
                {selectedDivision.name} Division
              </button>
            </>
          )}

          {selectedDistrict && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
              <span className="font-semibold text-[#ccff00]">{selectedDistrict.name} District</span>
            </>
          )}
        </div>

        {/* TIER 1: Divisions List */}
        {!selectedDivision && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              Select A Division
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {BANGLADESH_DIVISIONS.map((div) => {
                const isCurrent = currentLocation.division === div.name;
                return (
                  <button
                    key={div.name}
                    type="button"
                    onClick={() => setSelectedDivision(div)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isCurrent
                        ? 'bg-[#ccff00]/10 border-[#ccff00]/50 text-white'
                        : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] text-zinc-200'
                    }`}
                  >
                    <p className="text-xs font-bold">{div.name}</p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{div.districts.length} Districts</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TIER 2: Districts in Division */}
        {selectedDivision && !selectedDistrict && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                {selectedDivision.name} Districts ({selectedDivision.districts.length})
              </p>
              <button
                type="button"
                onClick={() => setSelectedDivision(null)}
                className="text-xs text-[#ccff00] hover:underline"
              >
                Back to Divisions
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto no-scrollbar">
              {selectedDivision.districts.map((dist) => {
                const isCurrent = currentLocation.district === dist.name;
                return (
                  <div
                    key={dist.name}
                    className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                      isCurrent
                        ? 'bg-[#ccff00]/10 border-[#ccff00]/50 text-white'
                        : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] text-zinc-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectWholeDistrict(dist)}
                      className="text-left flex-1"
                    >
                      <p className="text-xs font-bold text-white">{dist.name}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {dist.popularAreas.length} Curated Areas
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedDistrict(dist)}
                      className="p-1 text-zinc-400 hover:text-[#ccff00] text-xs font-semibold flex items-center gap-0.5"
                      title="View areas in district"
                    >
                      <span>Areas</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TIER 3: Specific Areas in District */}
        {selectedDistrict && selectedDivision && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Areas in {selectedDistrict.name}
              </p>
              <button
                type="button"
                onClick={() => setSelectedDistrict(null)}
                className="text-xs text-[#ccff00] hover:underline"
              >
                Back to Districts
              </button>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
              {selectedDistrict.popularAreas.map((area) => {
                const isCurrent = currentLocation.neighborhoodName === area;
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => handleSelectArea(area)}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                      isCurrent
                        ? 'bg-[#ccff00]/10 border-[#ccff00]/50 text-white'
                        : 'bg-white/[0.02] border-white/[0.06] text-zinc-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#ccff00]" />
                      <span className="text-xs font-semibold">{area}</span>
                    </div>
                    {isCurrent && <Check className="w-4 h-4 text-[#ccff00] stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom indicator */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] text-center">
          <p className="text-[11px] text-zinc-400">
            Current area:{' '}
            <span className="text-[#ccff00] font-semibold">
              {currentLocation.neighborhoodName}, {currentLocation.district} ({currentLocation.division})
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};
