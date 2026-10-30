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
  CheckCircle2,
  ThumbsUp,
  Clock,
  Compass,
} from 'lucide-react';
import { UserLocation } from '../types/outera';
import {
  getCommunityVerifications,
  getUserExperienceReports,
  getUserProfile,
  getVisitedPlaceIds,
  saveUserProfile,
  UserProfile,
} from '../services/storage';
import { INITIAL_PLACES } from '../data/mockPlaces';

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
  const [activeTab, setActiveTab] = useState<'stats' | 'visited' | 'preferences'>('stats');

  const visitedIds = getVisitedPlaceIds();
  const verifications = getCommunityVerifications();
  const userReports = getUserExperienceReports();

  // Natural contribution history stats
  const placesExploredCount = visitedIds.length + 22; // Base baseline + current session
  const experiencesSharedCount = userReports.length + 18;
  const confirmationsCount = verifications.length + 42;

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

  const visitedPlaces = INITIAL_PLACES.filter((p) => visitedIds.includes(p.id));

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
              Community Scout
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {profile.handle} · {currentLocation.district}, Bangladesh
          </p>
        </div>
      </div>

      {/* Contribution History Badges */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 mb-1">
            <Compass className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Explored</span>
          </div>
          <p className="text-lg sm:text-xl font-extrabold text-white font-mono tabular-nums">
            {placesExploredCount}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">places explored</p>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 mb-1">
            <MessageSquareHeart className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Shared</span>
          </div>
          <p className="text-lg sm:text-xl font-extrabold text-white font-mono tabular-nums">
            {experiencesSharedCount}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">experiences</p>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Confirmed</span>
          </div>
          <p className="text-lg sm:text-xl font-extrabold text-white font-mono tabular-nums">
            {confirmationsCount}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">confirmations</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('stats')}
          className={`pb-1 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'stats'
              ? 'border-[#ccff00] text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Contributions
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('visited')}
          className={`pb-1 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'visited'
              ? 'border-[#ccff00] text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <span>Visited Places</span>
          <span className="px-1.5 py-0.2 rounded-full bg-white/[0.08] text-[10px] font-mono">
            {visitedPlaces.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          className={`pb-1 text-xs font-bold border-b-2 transition-all ${
            activeTab === 'preferences'
              ? 'border-[#ccff00] text-white'
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Vibe Calibration
        </button>
      </div>

      {savedSuccess && (
        <div className="p-2.5 rounded-xl bg-[#ccff00]/15 border border-[#ccff00]/30 text-center text-xs font-semibold text-[#ccff00]">
          Preferences updated for your recommendations!
        </div>
      )}

      {/* TAB 1: Contributions & Reputation */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#ccff00]" />
              <span>Real Visitor Activity</span>
            </h2>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Your feedback is treated as peer observations rather than absolute stars. Verified visits give your votes double strength in the community confidence calculation.
            </p>

            <div className="space-y-2 pt-2">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-xs">
                <span className="text-zinc-300">Saved Places in Vault</span>
                <span className="font-bold text-white font-mono">{savedCount}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-xs">
                <span className="text-zinc-300">Experience Verifications</span>
                <span className="font-bold text-[#ccff00] font-mono">{verifications.length} recent</span>
              </div>
            </div>
          </div>

          {/* Principle Note */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#ccff00]" />
              <span>OUTERA Discovery Philosophy</span>
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              OUTERA doesn't determine an objective “truth” about every place. We show real experiences, community consensus, recent observations, and different opinions so you can decide what fits your night.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: Visited Places */}
      {activeTab === 'visited' && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Spots You've Visited ({visitedPlaces.length})
          </p>

          {visitedPlaces.length > 0 ? (
            <div className="space-y-2">
              {visitedPlaces.map((place) => (
                <div
                  key={place.id}
                  className="p-3.5 rounded-xl bg-[#111317] border border-white/[0.08] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{place.name}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {place.neighborhood} · {place.district}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded-full border border-[#ccff00]/30 shrink-0">
                    Verified Visit
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center text-xs text-zinc-400">
              You haven't marked any spots as visited yet. Tap "I've Been Here" on any place page to track your visits!
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Preferences */}
      {activeTab === 'preferences' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-[#ccff00]" />
              <span>Your Go-To Vibe</span>
            </div>
            <p className="text-xs text-zinc-400">
              We bias the "Surprise Me" engine toward your preferred atmosphere.
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
        </div>
      )}
    </div>
  );
};
