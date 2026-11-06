import React, { useState } from 'react';
import { X, Check, AlertCircle, Send } from 'lucide-react';
import { TransportType, Place, FareUnit } from '../types/outera';
import { submitCommunityFareReport } from '../services/transport';
import { OuteraLogo } from './OuteraLogo';

interface ReportFareModalProps {
  isOpen: boolean;
  onClose: () => void;
  place: Place;
  defaultOrigin?: string;
  onFareReported?: () => void;
}

export const ReportFareModal: React.FC<ReportFareModalProps> = ({
  isOpen,
  onClose,
  place,
  defaultOrigin = 'Dhaka',
  onFareReported,
}) => {
  const [origin, setOrigin] = useState(defaultOrigin || 'Dhaka');
  const [transportType, setTransportType] = useState<TransportType>('Bus');
  const [farePaid, setFarePaid] = useState<string>('');
  const [fareUnit, setFareUnit] = useState<FareUnit>('per person');
  const [tripDate, setTripDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const transportOptions: { type: TransportType; icon: string; defaultUnit: FareUnit }[] = [
    { type: 'Bus', icon: '🚌', defaultUnit: 'per person' },
    { type: 'CNG / Auto', icon: '🛺', defaultUnit: 'per trip' },
    { type: 'Rickshaw', icon: '🚲', defaultUnit: 'per trip' },
    { type: 'Easy Bike / E-bike', icon: '🛵', defaultUnit: 'per person' },
    { type: 'Train', icon: '🚆', defaultUnit: 'per person' },
    { type: 'Launch / Boat', icon: '🚢', defaultUnit: 'per person' },
    { type: 'Private Car', icon: '🚗', defaultUnit: 'per vehicle' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedFare = parseFloat(farePaid);
    if (!origin.trim()) {
      setErrorMessage('Please specify where you traveled from.');
      return;
    }
    if (!parsedFare || parsedFare <= 0 || isNaN(parsedFare)) {
      setErrorMessage('Please enter a valid fare in Taka.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const res = await submitCommunityFareReport({
      origin: origin.trim(),
      destination: place.name,
      destinationPlaceId: place.id,
      destinationPlaceName: place.name,
      transportType,
      farePaid: parsedFare,
      fareUnit,
      tripDate,
      notes: notes.trim() || undefined,
    });

    setLoading(false);

    if (res.success) {
      setSubmitted(true);
      if (onFareReported) onFareReported();
      setTimeout(() => {
        setSubmitted(false);
        setFarePaid('');
        setNotes('');
        onClose();
      }, 1500);
    } else {
      setErrorMessage(res.error || 'Failed to submit report. Please try again.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-fare-modal-title"
    >
      <div className="w-full sm:max-w-md bg-[#111317] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <OuteraLogo size="xs" />
              <span className="text-zinc-600" aria-hidden="true">
                ·
              </span>
              <span className="text-[11px] font-semibold text-zinc-400">
                Transit Scouts
              </span>
            </div>
            <h2 id="report-fare-modal-title" className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
              Report Travel Fare
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Traveled to <span className="text-white font-semibold">{place.name}</span>? Share what you actually paid.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 flex items-center justify-center text-zinc-400 hover:text-white transition-all border border-white/[0.06] shrink-0 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-10 text-center space-y-3 animate-in fade-in">
            <div className="w-12 h-12 rounded-full bg-[#ccff00]/10 border border-[#ccff00]/30 flex items-center justify-center mx-auto text-[#ccff00]">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h3 className="text-base font-bold text-white">Fare Report Contributed!</h3>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
              Thank you! Your verified observation has been added to the community consensus.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <p>{errorMessage}</p>
              </div>
            )}

            {/* Origin & Destination */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  From (Origin) <span className="text-[#ccff00]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="e.g. Dhaka, Barishal..."
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  To (Destination)
                </label>
                <input
                  type="text"
                  disabled
                  value={place.name}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs text-zinc-400 truncate"
                />
              </div>
            </div>

            {/* Transport Type Grid */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">
                Mode of Transport <span className="text-[#ccff00]">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {transportOptions.map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => {
                      setTransportType(opt.type);
                      setFareUnit(opt.defaultUnit);
                    }}
                    className={`h-9 px-2.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 truncate text-left cursor-pointer ${
                      transportType === opt.type
                        ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold shadow-md shadow-[#ccff00]/10'
                        : 'bg-white/[0.03] text-zinc-300 border-white/[0.06] hover:bg-white/[0.06]'
                    }`}
                  >
                    <span>{opt.icon}</span>
                    <span className="truncate">{opt.type}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Fare Paid, Fare Unit & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Fare Paid (৳ BDT) <span className="text-[#ccff00]">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#ccff00]">
                    ৳
                  </span>
                  <input
                    type="number"
                    required
                    min={1}
                    max={50000}
                    value={farePaid}
                    onChange={(e) => setFarePaid(e.target.value)}
                    placeholder="e.g. 650"
                    className="w-full h-9 pl-7 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Fare Unit <span className="text-[#ccff00]">*</span>
                </label>
                <select
                  value={fareUnit}
                  onChange={(e) => setFareUnit(e.target.value as FareUnit)}
                  className="w-full h-9 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                >
                  <option value="per person">Per Person</option>
                  <option value="per trip">Per Trip</option>
                  <option value="per vehicle">Per Vehicle / Reserve</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Date of Travel
                </label>
                <input
                  type="date"
                  value={tripDate}
                  onChange={(e) => setTripDate(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white font-mono focus:outline-none focus:border-[#ccff00]"
                />
              </div>
            </div>

            {/* Optional Notes */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Route Notes / Helpful Details (Optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. AC Scania bus, took 8h with rest stop; or paddle rickshaw bargain price"
                className="w-full p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] resize-none"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-[#ccff00]/10"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{loading ? 'Submitting...' : 'Submit Fare Report'}</span>
              </button>
              <p className="text-[10px] text-zinc-500 text-center mt-2">
                Community submissions help maintain fair, transparent transportation estimates across Bangladesh.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
