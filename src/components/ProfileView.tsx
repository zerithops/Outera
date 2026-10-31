import React, { useState, useEffect, useCallback } from 'react';
import {
  Compass,
  MessageSquareHeart,
  CheckCircle2,
  LogOut,
  LogIn,
  Edit3,
  Check,
  Shield,
  Plus,
  Trash2,
  AlertCircle,
  Star,
  MapPin,
  Clock,
  Sparkles,
} from 'lucide-react';
import { UserLocation } from '../types/outera';
import {
  saveUserProfile,
  UserProfile,
  EMPTY_GUEST_PROFILE,
  getCachedUserProfile,
  setCachedUserProfile,
  clearUserProfileCache,
} from '../services/storage';
import {
  getCurrentUser,
  signOut,
  ensureUserProfile,
  upsertProfile,
  fetchUserRealStats,
  fetchRecentActivities,
  subscribeToAuthChanges,
  isUsernameAvailable,
  fetchUserPlacePosts,
  deleteUserPost,
  PlacePost,
} from '../services/supabase';
import { AdminDashboard } from './AdminDashboard';
import { CreatePostModal } from './CreatePostModal';

interface ProfileViewProps {
  currentLocation: UserLocation;
  onSelectLocation: (loc: UserLocation) => void;
  savedCount: number;
  reportCount: number;
  onOpenAuthModal?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  onOpenAuthModal,
}) => {
  const [authUser, setAuthUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(EMPTY_GUEST_PROFILE);
  const [stats, setStats] = useState({
    explored: 0,
    shared: 0,
    confirmed: 0,
    saved: 0,
    visited: 0,
    verifications: 0,
  });

  const [activeTab, setActiveTab] = useState<'preferences' | 'visited' | 'activity' | 'posts' | 'admin'>('preferences');
  const [activities, setActivities] = useState<any[]>([]);
  const [userPosts, setUserPosts] = useState<PlacePost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // Edit Profile Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarSeed, setEditAvatarSeed] = useState('scout-1');
  const [editError, setEditError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Create / Edit Post Modal
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [editingPost, setEditingPost] = useState<PlacePost | null>(null);

  const loadUserPosts = useCallback(async (userId: string) => {
    setLoadingPosts(true);
    try {
      const posts = await fetchUserPlacePosts(userId);
      setUserPosts(posts || []);
    } catch (err) {
      console.warn('Failed to load user posts:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  // Load auth state, genuine user profile, and real stats
  useEffect(() => {
    let isMounted = true;

    const loadUserData = async (user: any) => {
      setAuthUser(user);
      if (user) {
        // Fast-load from per-user cache to avoid UI flicker
        const cached = getCachedUserProfile(user.id);
        if (cached && isMounted) {
          setProfile(cached);
        }

        // Fetch or ensure genuine DB profile strictly for user.id
        const dbProfile = await ensureUserProfile(user);
        if (isMounted && dbProfile) {
          const loadedProfile: UserProfile = {
            name: dbProfile.display_name || user.user_metadata?.display_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Scout',
            handle: `@${dbProfile.username || user.user_metadata?.username || user.email?.split('@')[0] || 'scout'}`,
            vibePreference: cached?.vibePreference || 'Chill & Social',
            budgetPreference: cached?.budgetPreference || 'Under ৳500',
            avatarSeed: cached?.avatarSeed || 'scout-1',
            bio: dbProfile.bio || '',
          };
          setProfile(loadedProfile);
          setCachedUserProfile(user.id, loadedProfile);

          // Check if admin from database role
          const hasAdminRole = dbProfile.role === 'admin';
          setIsAdmin(hasAdminRole);
        }

        // Fetch genuine stats from Supabase
        const realStats = await fetchUserRealStats(user.id);
        if (isMounted) {
          setStats(realStats);
        }

        // Load user's own posts
        loadUserPosts(user.id);
      } else {
        // Guest user: starts with genuine 0 across all metrics and neutral guest state
        if (isMounted) {
          setProfile(EMPTY_GUEST_PROFILE);
          setIsAdmin(false);
          setUserPosts([]);
          setStats({
            explored: 0,
            shared: 0,
            confirmed: 0,
            saved: 0,
            visited: 0,
            verifications: 0,
          });
        }
      }
    };

    getCurrentUser().then((u) => {
      if (isMounted) loadUserData(u);
    });

    const unsubscribe = subscribeToAuthChanges((u) => {
      if (isMounted) loadUserData(u);
    });

    fetchRecentActivities().then((acts) => {
      if (isMounted) setActivities(acts || []);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [loadUserPosts]);

  const handleSignOut = async () => {
    const userId = authUser?.id;
    await signOut();
    clearUserProfileCache(userId);
    setAuthUser(null);
    setIsAdmin(false);
    setUserPosts([]);
    setProfile(EMPTY_GUEST_PROFILE);
    setActiveTab('preferences');
    setStats({
      explored: 0,
      shared: 0,
      confirmed: 0,
      saved: 0,
      visited: 0,
      verifications: 0,
    });
  };

  const handleOpenEdit = () => {
    setEditName(profile.name || authUser?.user_metadata?.display_name || authUser?.user_metadata?.name || '');
    setEditHandle(profile.handle.replace(/^@/, ''));
    setEditBio(profile.bio || '');
    setEditAvatarSeed(profile.avatarSeed || 'scout-1');
    setEditError(null);
    setShowEditModal(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    setEditError(null);

    const cleanName = editName.trim();
    const cleanUsername = editHandle.replace(/^@/, '').trim().toLowerCase();

    if (!cleanName) {
      setEditError('Display name cannot be empty.');
      return;
    }
    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 20) {
      setEditError('Username must be between 3 and 20 characters.');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      setEditError('Username can only contain letters, numbers, and underscores.');
      return;
    }

    // Check availability if username was changed
    const currentUsername = profile.handle.replace(/^@/, '').toLowerCase();
    if (cleanUsername !== currentUsername) {
      const available = await isUsernameAvailable(cleanUsername, authUser.id);
      if (!available) {
        setEditError('That username is already taken. Please choose another.');
        return;
      }
    }

    const updatedProfile: UserProfile = {
      ...profile,
      name: cleanName,
      handle: `@${cleanUsername}`,
      avatarSeed: editAvatarSeed,
      bio: editBio.trim(),
    };

    saveUserProfile(updatedProfile, authUser.id);
    setProfile(updatedProfile);

    await upsertProfile({
      display_name: cleanName,
      username: cleanUsername,
      bio: editBio.trim() || undefined,
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setShowEditModal(false);
    }, 800);
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    const res = await deleteUserPost(postId);
    if (res.success && authUser) {
      loadUserPosts(authUser.id);
    }
  };

  const handleUpdateVibe = (vibe: string) => {
    const updated = saveUserProfile({ vibePreference: vibe }, authUser?.id);
    setProfile(updated);
    showSavedNotification();
  };

  const handleUpdateBudget = (budget: string) => {
    const updated = saveUserProfile({ budgetPreference: budget }, authUser?.id);
    setProfile(updated);
    showSavedNotification();
  };

  const showSavedNotification = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 1500);
  };

  const vibeOptions = ['Chill & Social', 'Quiet & Focused', 'High Energy & Active', 'Spontaneous'];
  const budgetOptions = ['Under ৳300', 'Under ৳500', 'Under ৳1,000', 'No Limit'];

  // If Admin Dashboard tab is chosen, display it full width
  if (activeTab === 'admin' && isAdmin) {
    return <AdminDashboard onClose={() => setActiveTab('preferences')} />;
  }

  return (
    <div className="w-full px-4 sm:px-6 py-6 max-w-xl mx-auto space-y-6">
      {/* Header Profile Lockup */}
      <div className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ccff00]/15 to-zinc-900 border border-[#ccff00]/30 flex items-center justify-center text-[#ccff00] font-black text-xl shrink-0 uppercase">
            {profile.name ? profile.name.slice(0, 2) : 'OUT'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                {profile.name || (authUser ? 'OUTERA Scout' : 'Guest Scout')}
              </h1>
              {isAdmin ? (
                <span className="text-[10px] font-extrabold text-[#ccff00] bg-[#ccff00]/15 px-2 py-0.5 rounded-full border border-[#ccff00]/30 uppercase shrink-0 flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" />
                  <span>Admin</span>
                </span>
              ) : authUser ? (
                <span className="text-[10px] font-bold text-zinc-300 bg-white/[0.06] px-2 py-0.5 rounded-full border border-white/[0.1] uppercase shrink-0">
                  Scout
                </span>
              ) : null}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 truncate font-mono">
              {profile.handle || authUser?.email || 'Sign in to create your scout handle'}
            </p>
          </div>
        </div>

        {/* Action button */}
        <div className="shrink-0 flex items-center gap-2">
          {authUser ? (
            <>
              <button
                type="button"
                onClick={handleOpenEdit}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.08] text-zinc-300 hover:text-white transition-all"
                title="Edit profile"
                aria-label="Edit profile"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all"
              >
                <LogOut className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="px-4 py-2 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] active:scale-95 text-black text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-md shadow-[#ccff00]/10"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Join OUTERA</span>
            </button>
          )}
        </div>
      </div>

      {/* Guest Prompt Banner if not logged in */}
      {!authUser && (
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <p className="font-bold text-white">Create an account to build your scout reputation</p>
            <p className="text-zinc-400 mt-0.5">
              Save favorite hangouts, share real crowd reports, and contribute to peer verification.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="px-3 py-1.5 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs self-start sm:self-auto shrink-0 hover:bg-[#d8ff33] transition-all"
          >
            Sign In / Register
          </button>
        </div>
      )}

      {/* Genuine Contribution Stats (Starts at 0 for new accounts, never fake values) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 mb-1">
            <Compass className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Explored</span>
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-white font-mono tabular-nums">
            {stats.explored}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">places visited</p>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 mb-1">
            <MessageSquareHeart className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Shared</span>
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-white font-mono tabular-nums">
            {userPosts.length || stats.shared}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">experiences</p>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Confirmed</span>
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-white font-mono tabular-nums">
            {stats.confirmed}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">verifications</p>
        </div>
      </div>

      {/* ADMIN ENTRY IN PROFILE MENU - EXCLUSIVELY SHOWN TO ROLE = 'admin' */}
      {isAdmin && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[#171a14] to-[#121510] border border-[#ccff00]/30 flex items-center justify-between gap-3 shadow-lg shadow-[#ccff00]/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ccff00]/15 border border-[#ccff00]/30 flex items-center justify-center text-[#ccff00] shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white uppercase tracking-wider">
                  Admin System
                </span>
                <span className="text-[10px] font-bold text-black bg-[#ccff00] px-1.5 py-0.2 rounded-full">
                  Staff
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Review pending posts, manage public visibility & moderation actions.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className="h-9 px-3.5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs transition-all shrink-0 shadow-md shadow-[#ccff00]/10"
          >
            Open Dashboard
          </button>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.06] overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          className={`flex-1 min-w-[85px] py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'preferences'
              ? 'bg-[#ccff00] text-black font-extrabold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Preferences
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={`flex-1 min-w-[85px] py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'posts'
              ? 'bg-[#ccff00] text-black font-extrabold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <span>My Posts</span>
          {userPosts.length > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'posts' ? 'bg-black text-[#ccff00]' : 'bg-white/[0.08] text-zinc-300'
              }`}
            >
              {userPosts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('visited')}
          className={`flex-1 min-w-[85px] py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'visited'
              ? 'bg-[#ccff00] text-black font-extrabold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Visited ({stats.visited})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`flex-1 min-w-[85px] py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === 'activity'
              ? 'bg-[#ccff00] text-black font-extrabold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Activity
        </button>
      </div>

      {/* Tab: My Posts (Normal user post lifecycle) */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Your Community Posts</h2>
              <p className="text-[11px] text-zinc-400">
                Track status from pending review to public community visibility.
              </p>
            </div>

            {authUser && (
              <button
                type="button"
                onClick={() => {
                  setEditingPost(null);
                  setShowCreatePostModal(true);
                }}
                className="h-8 px-3 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-[#ccff00]/10 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Post</span>
              </button>
            )}
          </div>

          {loadingPosts ? (
            <div className="py-12 text-center text-xs text-zinc-400 font-mono">
              Loading your posts...
            </div>
          ) : userPosts.length === 0 ? (
            <div className="py-12 px-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center max-w-sm mx-auto space-y-3">
              <Sparkles className="w-7 h-7 text-zinc-500 mx-auto" />
              <div>
                <p className="text-sm font-bold text-white">No posts shared yet</p>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Visited a spot in Bangladesh? Share your experience, spend, and vibes with the community.
                </p>
              </div>
              {authUser ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPost(null);
                    setShowCreatePostModal(true);
                  }}
                  className="h-9 px-4 rounded-xl bg-[#ccff00] text-black text-xs font-extrabold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Share your first post</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="h-9 px-4 rounded-xl bg-[#ccff00] text-black text-xs font-extrabold inline-flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign in to post</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {userPosts.map((post) => {
                const isPending = post.status === 'pending';
                const statusStyles: Record<string, string> = {
                  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                  rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
                  hidden: 'bg-zinc-800 text-zinc-400 border-zinc-700',
                };

                return (
                  <div
                    key={post.id}
                    className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-[#ccff00]" />
                          <span className="text-xs font-bold text-white truncate">
                            {post.place_name}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white mt-1">{post.title}</h3>
                      </div>

                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${
                          statusStyles[post.status] || statusStyles.pending
                        }`}
                      >
                        {post.status}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-300 leading-relaxed">{post.content}</p>

                    <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                      <div className="flex items-center gap-1 text-amber-400">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span className="font-mono font-bold text-white">{post.rating}/5</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPost(post);
                              setShowCreatePostModal(true);
                            }}
                            className="text-xs font-bold text-[#ccff00] hover:underline"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeletePost(post.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                          title="Delete post"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Moderation note if rejected or hidden */}
                    {post.moderation_note && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                        <span className="font-bold">Moderator Feedback:</span> {post.moderation_note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Preferences */}
      {activeTab === 'preferences' && (
        <div className="space-y-5">
          {/* Vibe Preference */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-white block">Default Discovery Vibe</span>
            <div className="grid grid-cols-2 gap-2">
              {vibeOptions.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleUpdateVibe(v)}
                  className={`p-3 rounded-xl border text-xs font-medium text-left transition-all ${
                    profile.vibePreference === v
                      ? 'bg-[#ccff00]/10 border-[#ccff00] text-white font-bold'
                      : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-white'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Budget Preference */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-white block">Typical Outing Budget</span>
            <div className="grid grid-cols-2 gap-2">
              {budgetOptions.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => handleUpdateBudget(b)}
                  className={`p-3 rounded-xl border text-xs font-medium text-left transition-all ${
                    profile.budgetPreference === b
                      ? 'bg-[#ccff00]/10 border-[#ccff00] text-white font-bold'
                      : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-white'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {savedSuccess && (
            <div className="p-2.5 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/30 text-[#ccff00] text-xs flex items-center justify-center gap-1.5 animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              <span>Preferences saved</span>
            </div>
          )}
        </div>
      )}

      {/* Tab: Visited Places */}
      {activeTab === 'visited' && (
        <div className="space-y-3">
          {stats.visited === 0 ? (
            <div className="py-12 px-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center max-w-sm mx-auto">
              <Compass className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-white">No visited places yet</p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Tap "I've Been Here" on any spot to mark places you've visited and gain scout verification weight.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-xs text-zinc-300">
              <p className="font-semibold text-white">You have marked {stats.visited} place visits.</p>
              <p className="text-zinc-500 mt-1">
                Your feedback on these places is given stronger weight in community confidence calculations.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Activity Stream */}
      {activeTab === 'activity' && (
        <div className="space-y-3">
          {activities.length > 0 ? (
            <div className="space-y-2">
              {activities.map((act, i) => (
                <div
                  key={act.id || i}
                  className="p-3.5 rounded-xl bg-[#111317] border border-white/[0.08] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {act.target_title || `${act.activity_type.toUpperCase()} recorded`}
                    </p>
                    <p className="text-[11px] text-zinc-400 capitalize">
                      {act.activity_type} ·{' '}
                      {new Date(act.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 px-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center max-w-sm mx-auto space-y-1">
              <p className="text-sm font-bold text-white">Nothing here yet.</p>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Start exploring or verifying places to build your OUTERA scout profile.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-[#111317] border border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white tracking-tight">Edit Scout Profile</h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-zinc-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Username Handle
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-mono">
                    @
                  </span>
                  <input
                    type="text"
                    required
                    value={editHandle}
                    onChange={(e) => setEditHandle(e.target.value.replace(/^@/, ''))}
                    placeholder="username"
                    className="w-full h-10 pl-7 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Bio</label>
                <textarea
                  rows={2}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Coffee lover, rooftop seeker, discovering spots in Bangladesh..."
                  className="w-full p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] resize-none"
                />
              </div>

              {savedSuccess && (
                <div className="p-2 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/30 text-[#ccff00] text-xs text-center">
                  Profile updated
                </div>
              )}

              <button
                type="submit"
                className="w-full h-10 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider hover:bg-[#d8ff33] transition-all"
              >
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Post Modal */}
      <CreatePostModal
        isOpen={showCreatePostModal}
        onClose={() => {
          setShowCreatePostModal(false);
          setEditingPost(null);
        }}
        editingPost={editingPost}
        onPostSubmitted={() => {
          if (authUser) loadUserPosts(authUser.id);
        }}
      />
    </div>
  );
};
