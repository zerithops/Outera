import React, { useState } from 'react';
import { X, Check, MapPin, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { BANGLADESH_DIVISIONS } from '../data/bangladeshLocations';
import { submitPlaceSuggestion } from '../services/supabase';

interface PlaceSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDivision?: string;
  defaultDistrict?: string;
}

export const PlaceSuggestionModal: React.FC<PlaceSuggestionModalProps> = ({
  isOpen,
  onClose,
  defaultDivision,
  defaultDistrict,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Chill');
  const [division, setDivision] = useState(defaultDivision || 'Dhaka');
  const [district, setDistrict] = useState(defaultDistrict || 'Dhaka');
  const [address, setAddress] = useState('');
  const [whyWorthVisiting, setWhyWorthVisiting] = useState('');
  const [approxBudget, setApproxBudget] = useState('Under ৳500');
  const [bestTimeToVisit, setBestTimeToVisit] = useState('Late afternoon / Sunset');

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Selected division districts
  const currentDivData = BANGLADESH_DIVISIONS.find((d) => d.name === division);
  const availableDistricts = currentDivData?.districts || [];

  const handleDivisionChange = (newDiv: string) => {
    setDivision(newDiv);
    const divObj = BANGLADESH_DIVISIONS.find((d) => d.name === newDiv);
    if (divObj && divObj.districts.length > 0) {
      setDistrict(divObj.districts[0].name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !whyWorthVisiting.trim()) {
      setErrorMessage('Please fill in the place name and why it is worth visiting.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const success = await submitPlaceSuggestion({
      name: name.trim(),
      category,
      division,
      district,
      address: address.trim() || undefined,
      whyWorthVisiting: whyWorthVisiting.trim(),
      approxBudget,
      bestTimeToVisit,
    });

    setLoading(false);

    if (success) {
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setName('');
        setAddress('');
        setWhyWorthVisiting('');
        onClose();
      }, 1500);
    } else {
      setErrorMessage('Failed to submit suggestion. Please try again.');
    }
  };

  const categories = [
    'Chill',
    'Food & Drink',
    'Active & Sports',
    'Culture & Art',
    'Late Night',
    'Outdoors & Nature',
    'Gaming & Arcade',
  ];

  const budgetOptions = [
    'Free / No Cost',
    'Under ৳300',
    'Under ৳500',
    '৳500 – ৳1,000',
    '৳1,000+',
  ];

  const timeOptions = [
    'Morning coffee & walk',
    'Midday hangout',
    'Late afternoon / Sunset',
    'Evening vibes',
    'Late night (after 10 PM)',
    'Anytime',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggestion-modal-title"
    >
      <div className="w-full max-w-lg bg-[#111317] border border-white/[0.1] rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-extrabold text-xs tracking-widest text-[#ccff00] uppercase font-mono">
                OUTERA Scouts
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00]" />
            </div>
            <h2 id="suggestion-modal-title" className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Suggest a Place
            </h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Found a spot worth going out for? Share it with the community scout network.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 flex items-center justify-center text-zinc-400 hover:text-white transition-all border border-white/[0.06]"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-12 text-center space-y-3 animate-in fade-in">
            <div className="w-14 h-14 rounded-full bg-[#ccff00]/10 border border-[#ccff00]/30 flex items-center justify-center mx-auto text-[#ccff00]">
              <Check className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white">Place Submitted!</h3>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
              Thank you for contributing. Our community scouts will review and verify your suggestion.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <p className="leading-snug">{errorMessage}</p>
              </div>
            )}

            {/* Place Name */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Place Name <span className="text-[#ccff00]">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Skyline Vinyl Loft, Apex Bouldering Club..."
                className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Category</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-all border truncate text-left ${
                      category === cat
                        ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                        : 'bg-white/[0.03] text-zinc-300 border-white/[0.06] hover:bg-white/[0.06]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Location (Division & District) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Division
                </label>
                <select
                  value={division}
                  onChange={(e) => handleDivisionChange(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                >
                  {BANGLADESH_DIVISIONS.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  District
                </label>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                >
                  {availableDistricts.map((dist) => (
                    <option key={dist.name} value={dist.name}>
                      {dist.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Address / Specific Area */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Neighborhood / Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Road 11, Banani or near Shaheed Minar"
                className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
              />
            </div>

            {/* Why It's Worth Going Out For */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Why is it worth going out for? <span className="text-[#ccff00]">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={whyWorthVisiting}
                onChange={(e) => setWhyWorthVisiting(e.target.value)}
                placeholder="What's special about this spot? The music, the seating, the coffee, the people, the activities?"
                className="w-full p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] resize-none"
              />
            </div>

            {/* Budget & Best Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Approx Budget
                </label>
                <select
                  value={approxBudget}
                  onChange={(e) => setApproxBudget(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                >
                  {budgetOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Best Time to Visit
                </label>
                <select
                  value={bestTimeToVisit}
                  onChange={(e) => setBestTimeToVisit(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                >
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.99] shadow-lg shadow-[#ccff00]/10"
              >
                <span>{loading ? 'Submitting...' : 'Submit Place Suggestion'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
