import React, { useState } from 'react';
import { X, Check, MessageSquareHeart } from 'lucide-react';
import {
  CrowdLevel,
  ExperienceReport,
  Place,
  PricePerception,
  RevisitDecision,
  VibeType,
} from '../types/outera';

interface CommunityFeedbackModalProps {
  place: Place | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (report: ExperienceReport) => void;
}

export const CommunityFeedbackModal: React.FC<CommunityFeedbackModalProps> = ({
  place,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [price, setPrice] = useState<PricePerception>('Fair');
  const [crowd, setCrowd] = useState<CrowdLevel>('Medium');
  const [vibe, setVibe] = useState<VibeType>('Social');
  const [wouldGoAgain, setWouldGoAgain] = useState<RevisitDecision>('Yes');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen || !place) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newReport: ExperienceReport = {
      id: `report-${Date.now()}`,
      placeId: place.id,
      createdAt: Date.now(),
      authorName: 'You',
      authorHandle: '@you',
      isVerifiedVisitor: true,
      price,
      crowd,
      vibe,
      wouldGoAgain,
      comment: comment.trim() || undefined,
      verification: {
        mostlyCount: 1,
        partlyCount: 0,
        notReallyCount: 0,
        totalResponses: 1,
        confidence: 'High',
        commonDifferences: [],
      },
    };

    onSubmit(newReport);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 1200);
  };

  const prices: PricePerception[] = ['Cheap', 'Fair', 'Expensive'];
  const crowds: CrowdLevel[] = ['Low', 'Medium', 'High'];
  const vibes: VibeType[] = ['Relaxed', 'Energetic', 'Social', 'Quiet'];
  const decisions: RevisitDecision[] = ['Yes', 'Maybe', 'No'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
    >
      <div className="w-full sm:max-w-lg bg-[#111317] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <MessageSquareHeart className="w-5 h-5 text-[#ccff00]" />
            <div>
              <h2 id="feedback-title" className="text-base font-bold text-white tracking-tight">
                Log Your Experience
              </h2>
              <p className="text-[11px] text-zinc-400">{place.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-full bg-[#ccff00] text-black flex items-center justify-center mb-3 shadow-lg shadow-[#ccff00]/20 animate-in zoom-in duration-150">
              <Check className="w-7 h-7 stroke-[3]" />
            </div>
            <h3 className="text-base font-bold text-white">Experience Recorded!</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Thank you for keeping OUTERA accurate and toxic-free.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            {/* Question 1: Price */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-2">
                1. How was the pricing for what you got?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {prices.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrice(p)}
                    className={`h-11 rounded-xl text-xs font-medium border transition-all ${
                      price === p
                        ? 'bg-[#ccff00] text-black font-bold border-[#ccff00] shadow-sm'
                        : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Question 2: Crowd */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-2">
                2. How crowded was it?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {crowds.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCrowd(c)}
                    className={`h-11 rounded-xl text-xs font-medium border transition-all ${
                      crowd === c
                        ? 'bg-[#ccff00] text-black font-bold border-[#ccff00] shadow-sm'
                        : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Question 3: Vibe */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-2">
                3. What was the dominant vibe?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {vibes.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVibe(v)}
                    className={`h-11 rounded-xl text-xs font-medium border transition-all ${
                      vibe === v
                        ? 'bg-[#ccff00] text-black font-bold border-[#ccff00] shadow-sm'
                        : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Question 4: Would you go again? */}
            <div>
              <label className="text-xs font-semibold text-zinc-300 block mb-2">
                4. Would you actually go out for this again?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {decisions.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setWouldGoAgain(d)}
                    className={`h-11 rounded-xl text-xs font-medium border transition-all ${
                      wouldGoAgain === d
                        ? 'bg-[#ccff00] text-black font-bold border-[#ccff00] shadow-sm'
                        : 'bg-white/[0.03] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Comment */}
            <div>
              <label htmlFor="feedback-comment" className="text-xs font-semibold text-zinc-300 block mb-1.5">
                Optional short note (helpful tip for others)
              </label>
              <textarea
                id="feedback-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={180}
                placeholder="e.g. Try to come right before sunset for breeze, cold brew is great..."
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] transition-colors resize-none"
              />
              <span className="text-[10px] text-zinc-500 text-right block mt-1">
                {comment.length}/180 characters
              </span>
            </div>

            {/* Submit CTA */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full h-12 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs tracking-wider uppercase flex items-center justify-center hover:bg-[#d4ff1a] active:scale-[0.98] transition-all electric-glow-sm"
              >
                Submit Community Insight
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
