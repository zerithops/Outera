import React, { useState } from 'react';
import {
  User,
  MapPin,
  Sparkles,
  ShieldCheck,
  MessageSquareHeart,
  Bookmark,
  Check,
  Sliders,
} from 'lucide-react';
import { UserLocation } from '../types/outera';
import { getUserProfile, saveUserProfile, UserProfile } from '../services/storage';
import { POPULAR_NEIGHBORHOODS } from '../services/location';

interface ProfileViewProps {
  currentLocation: UserLocation;
  onSelectLocation: (loc: UserLocation) => void;
  savedCount: number;
  reportCount: number;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentLocation,
  onSelectLocation,
  savedCount,
  reportCount,
}) => {
  const [profile, setProfile] = useState<UserProfile>(getUserProfile());
  const [savedSuccess, setSavedSuccess] = useState(false);

  const vibeOptions = ['Chill & Social', 'Quiet & Focused', 'High Energy & Active', 'Spontaneous'];
  const budgetOptions = ['Under ৳300', 'Under ৳500', 'Under ৳1,000', 'No Limit'];

  const handleUpdateVibe = (vibe: string) => {
    const updated = saveUserProfile({ vibePreference: vibe });
    setProfile(updated);
    showNotice();
  };

  const handleUpdateBudget = (budget: string) => {
    const updated = saveUserProfile({ budgetPreference: budget });
    setProfile(updated);
    showNotice();
  };

  const showNotice = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 1500);
  };

  return (
    <div className="w-full px-4 sm:px-6 py-6 max-w-xl mx-auto space-y-6">
      {/* Header Profile Lockup */}
      <div className="flex items-center gap-4 p-5 rounded-2xl bg-[#111317] border border-white/[0.08]">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ccff00]/20 to-zinc-800 border border-[#ccff00]/40 flex items-center justify-center text-[#ccff00] font-black text-xl">
          OUT
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white tracking-tight">{profile.name}</h1>
            <span className="text-[10px] font-bold text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded-full border border-[#ccff00]/30 uppercase">
              Scout
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">{profile.handle} · Dhaka</p>
        </div>
      </div>

      {/* Activity Counters */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 mb-1">
            <Bookmark className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Saved Spots</span>
          </div>
          <p className="text-xl font-extrabold text-white font-mono tabular-nums">{savedCount}</p>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 mb-1">
            <MessageSquareHeart className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Community Reports</span>
          </div>
          <p className="text-xl font-extrabold text-white font-mono tabular-nums">{reportCount}</p>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-2.5 rounded-xl bg-[#ccff00]/15 border border-[#ccff00]/30 text-center text-xs font-semibold text-[#ccff00]">
          Preferences updated for your recommendations!
        </div>
      )}

      {/* Preferences: Preferred Vibe */}
      <div className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-[#ccff00]" />
          <span>Your Go-To Vibe</span>
        </div>
        <p className="text-xs text-zinc-400">
          We bias the "Surprise Me" engine toward your chosen mood.
        </p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          {vibeOptions.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => handleUpdateVibe(v)}
              className={`h-11 px-3 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between ${
                profile.vibePreference === v
                  ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                  : 'bg-white/[0.02] text-zinc-300 border-white/[0.06] hover:bg-white/[0.06]'
              }`}
            >
              <span>{v}</span>
              {profile.vibePreference === v && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Preferences: Typical Budget */}
      <div className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
          <Sliders className="w-4 h-4 text-[#ccff00]" />
          <span>Comfort Budget</span>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {budgetOptions.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => handleUpdateBudget(b)}
              className={`h-11 px-3 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between ${
                profile.budgetPreference === b
                  ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                  : 'bg-white/[0.02] text-zinc-300 border-white/[0.06] hover:bg-white/[0.06]'
              }`}
            >
              <span>{b}</span>
              {profile.budgetPreference === b && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Brand Manifesto / Ethics */}
      <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-[#ccff00]" />
          <span>The OUTERA Manifesto</span>
        </h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          OUTERA is built against algorithmic rot and fake 5-star review bots. We answer one question honestly:
          <strong className="text-zinc-200 block mt-1 font-semibold">
            “What can I actually do around me right now that won't waste my evening?”
          </strong>
        </p>
      </div>
    </div>
  );
};
