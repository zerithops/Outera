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
  Star,
  MapPin,
  Sparkles,
  ThumbsUp,
  Share2,
  Camera,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { shareCommunityPost } from '../services/postUrl';
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
  uploadUserProfileAvatar,
  fetchUserRealStats,
  fetchRecentActivities,
  subscribeToAuthChanges,
  isUsernameAvailable,
  fetchUserPlacePosts,
  fetchUserPlaceSuggestions,
  deleteUserPost,
  isEmailVerified,
  PlacePost,
  PlaceSuggestion,
  StorageUploadProgress,
  validateImageFile,
  ingestSelectedFileSafely,
} from '../services/supabase';
import { AdminDashboard } from './AdminDashboard';
import { CreatePostModal } from './CreatePostModal';
import { AccountSecuritySection } from './AccountSecuritySection';

interface ProfileViewProps {
  currentLocation: UserLocation;
  onSelectLocation: (loc: UserLocation) => void;
  savedCount: number;
  reportCount: number;
  onOpenAuthModal?: () => void;
  onSelectPost?: (post: PlacePost) => void;
  onOpenSuggestionModal?: () => void;
  onPostsChanged?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  onOpenAuthModal,
  onSelectPost,
  onOpenSuggestionModal,
  onPostsChanged,
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
    placesSuggested: 0,
    communityPosts: 0,
    helpfulReports: 0,
  });

  const [activeTab, setActiveTab] = useState<
    'preferences' | 'posts' | 'suggestions' | 'visited' | 'activity' | 'security' | 'admin'
  >('posts');
  const [activities, setActivities] = useState<any[]>([]);
  const [userPosts, setUserPosts] = useState<PlacePost[]>([]);
  const [userSuggestions, setUserSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Inline post delete confirmation state (avoids window.confirm which fails in sandboxed iframes)
  const [confirmingDeletePostId, setConfirmingDeletePostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [postActionNotice, setPostActionNotice] = useState<string | null>(null);

  // Edit Profile Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarSeed, setEditAvatarSeed] = useState('scout-1');
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState<StorageUploadProgress | null>(null);
  const [canRetryAvatarUpload, setCanRetryAvatarUpload] = useState(false);
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

  const loadUserSuggestions = useCallback(async (userId: string) => {
    setLoadingSuggestions(true);
    try {
      const sugs = await fetchUserPlaceSuggestions(userId);
      setUserSuggestions(sugs || []);
    } catch (err) {
      console.warn('Failed to load user suggestions:', err);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  // Load auth state, genuine user profile, and real stats
  useEffect(() => {
    let isMounted = true;

    const loadUserData = async (user: any) => {
      setAuthUser(user);
      if (user) {
        const cached = getCachedUserProfile(user.id);
        if (cached && isMounted) {
          setProfile(cached);
        }

        const dbProfile = await ensureUserProfile(user);
        if (isMounted && dbProfile) {
          const loadedProfile: UserProfile = {
            name:
              dbProfile.display_name ||
              user.user_metadata?.display_name ||
              user.user_metadata?.name ||
              user.email?.split('@')[0] ||
              'Scout',
            handle: `@${
              dbProfile.username ||
              user.user_metadata?.username ||
              user.email?.split('@')[0] ||
              'scout'
            }`,
            vibePreference: cached?.vibePreference || 'Chill & Social',
            budgetPreference: cached?.budgetPreference || 'Under ৳500',
            avatarSeed: cached?.avatarSeed || 'scout-1',
            avatarUrl: dbProfile.avatar_url || cached?.avatarUrl || null,
            bio: dbProfile.bio || '',
          };
          setProfile(loadedProfile);
          setCachedUserProfile(user.id, loadedProfile);

          const hasAdminRole = dbProfile.role === 'admin';
          setIsAdmin(hasAdminRole);
        }

        // Fetch genuine stats from Supabase (never hardcoded)
        const realStats = await fetchUserRealStats(user.id);
        if (isMounted) {
          setStats(realStats);
        }

        // Load user's own posts and place suggestions
        loadUserPosts(user.id);
        loadUserSuggestions(user.id);
      } else {
        if (isMounted) {
          setProfile(EMPTY_GUEST_PROFILE);
          setIsAdmin(false);
          setUserPosts([]);
          setUserSuggestions([]);
          setStats({
            explored: 0,
            shared: 0,
            confirmed: 0,
            saved: 0,
            visited: 0,
            verifications: 0,
            placesSuggested: 0,
            communityPosts: 0,
            helpfulReports: 0,
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
  }, [loadUserPosts, loadUserSuggestions]);

  const handleSignOut = async () => {
    const userId = authUser?.id;
    await signOut();
    clearUserProfileCache(userId);
    setAuthUser(null);
    setIsAdmin(false);
    setUserPosts([]);
    setUserSuggestions([]);
    setProfile(EMPTY_GUEST_PROFILE);
    setActiveTab('preferences');
    setStats({
      explored: 0,
      shared: 0,
      confirmed: 0,
      saved: 0,
      visited: 0,
      verifications: 0,
      placesSuggested: 0,
      communityPosts: 0,
      helpfulReports: 0,
    });
  };

  const handleOpenEdit = () => {
    setEditName(
      profile.name ||
        authUser?.user_metadata?.display_name ||
        authUser?.user_metadata?.name ||
        ''
    );
    setEditHandle(profile.handle.replace(/^@/, ''));
    setEditBio(profile.bio || '');
    setEditAvatarSeed(profile.avatarSeed || 'scout-1');
    setEditAvatarFile(null);
    setEditAvatarPreview(profile.avatarUrl || null);
    setAvatarUploadProgress(null);
    setCanRetryAvatarUpload(false);
    setEditError(null);
    setShowEditModal(true);
  };

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditError(null);
    setCanRetryAvatarUpload(false);
    const file = e.target.files?.[0];
    if (!file) return;

    const check = validateImageFile(file);
    if (!check.valid) {
      setEditError(check.error || 'Invalid profile image.');
      e.target.value = '';
      return;
    }

    try {
      const safeFile = await ingestSelectedFileSafely(file);
      if (editAvatarPreview && editAvatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(editAvatarPreview);
      }
      setEditAvatarFile(safeFile);
      setEditAvatarPreview(URL.createObjectURL(safeFile));
    } catch (readErr: any) {
      setEditError(
        readErr?.message || 'Unable to read avatar photo from your device. Please pick directly from gallery.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const executeSaveProfile = async () => {
    if (!authUser) return;
    setEditError(null);
    setCanRetryAvatarUpload(false);

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

    const currentUsername = profile.handle.replace(/^@/, '').toLowerCase();
    if (cleanUsername !== currentUsername) {
      const available = await isUsernameAvailable(cleanUsername, authUser.id);
      if (!available) {
        setEditError('That username is already taken. Please choose another.');
        return;
      }
    }

    let finalAvatarUrl = profile.avatarUrl || null;
    if (editAvatarFile) {
      setUploadingAvatar(true);
      setAvatarUploadProgress(null);
      const uploadRes = await uploadUserProfileAvatar(editAvatarFile, (prog) => {
        setAvatarUploadProgress(prog);
      });
      setUploadingAvatar(false);
      setAvatarUploadProgress(null);

      if (!uploadRes.success || !uploadRes.avatarUrl) {
        setCanRetryAvatarUpload(true);
        setEditError(
          uploadRes.error ||
            'Failed to upload profile photo. Click Retry to try again.'
        );
        return;
      }
      finalAvatarUrl = uploadRes.avatarUrl;
      setEditAvatarFile(null);
      setEditAvatarPreview(finalAvatarUrl);
    }

    const updatedProfile: UserProfile = {
      ...profile,
      name: cleanName,
      handle: `@${cleanUsername}`,
      avatarSeed: editAvatarSeed,
      avatarUrl: finalAvatarUrl,
      bio: editBio.trim(),
    };

    saveUserProfile(updatedProfile, authUser.id);
    setProfile(updatedProfile);

    await upsertProfile({
      display_name: cleanName,
      username: cleanUsername,
      bio: editBio.trim() || undefined,
      avatar_url: finalAvatarUrl || undefined,
    });

    if (onPostsChanged) onPostsChanged();
    loadUserPosts(authUser.id);

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setShowEditModal(false);
    }, 800);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSaveProfile();
  };

  const handleDeletePost = async (postId: string) => {
    setDeletingPostId(postId);
    setPostActionNotice(null);
    const res = await deleteUserPost(postId);
    setDeletingPostId(null);
    setConfirmingDeletePostId(null);

    if (res.success) {
      setUserPosts((prev) => prev.filter((p) => p.id !== postId));
      setPostActionNotice('Community post deleted permanently.');
      setTimeout(() => setPostActionNotice(null), 3000);
      if (authUser) {
        loadUserPosts(authUser.id);
        fetchUserRealStats(authUser.id).then(setStats);
      }
      if (onPostsChanged) onPostsChanged();
    } else {
      setPostActionNotice(res.error || 'Could not delete post. Please try again.');
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

  if (activeTab === 'admin' && isAdmin) {
    return (
      <AdminDashboard
        onClose={() => {
          setActiveTab('posts');
          if (authUser) {
            loadUserPosts(authUser.id);
            loadUserSuggestions(authUser.id);
            fetchUserRealStats(authUser.id).then(setStats);
          }
          if (onPostsChanged) onPostsChanged();
        }}
      />
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-6">
      {/* Header Profile Lockup */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#111317] border border-white/[0.08] flex flex-col xs:flex-row sm:flex-row xs:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[#ccff00]/15 to-zinc-900 border border-[#ccff00]/30 flex items-center justify-center text-[#ccff00] font-extrabold text-lg sm:text-xl shrink-0 uppercase overflow-hidden">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name || 'Scout Avatar'}
                className="w-full h-full object-cover"
              />
            ) : profile.name ? (
              profile.name.slice(0, 2)
            ) : (
              'OUT'
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                {profile.name || (authUser ? 'OUTERA Scout' : 'Guest Visitor')}
              </h1>
              {isAdmin ? (
                <span className="text-[10px] font-bold text-[#D8FF36] bg-[#D8FF36]/12 px-2 py-0.5 rounded-md border border-[#D8FF36]/25 uppercase shrink-0 flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" />
                  <span>Admin · Scout</span>
                </span>
              ) : authUser ? (
                <span className="text-[10px] font-bold text-[#D8FF36] bg-[#D8FF36]/10 px-2 py-0.5 rounded-md border border-[#D8FF36]/25 uppercase shrink-0">
                  ✓ Active Scout
                </span>
              ) : null}
              {authUser && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase shrink-0 ${
                    isEmailVerified(authUser)
                      ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
                      : 'text-amber-300 bg-amber-500/15 border-amber-500/30'
                  }`}
                >
                  {isEmailVerified(authUser) ? 'Verified Email' : 'Unverified Email'}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 truncate font-mono">
              {profile.handle || authUser?.email || 'Every registered user is automatically an OUTERA Scout'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="shrink-0 flex items-center gap-2 self-end xs:self-auto">
          {authUser ? (
            <>
              <button
                type="button"
                onClick={handleOpenEdit}
                className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
                title="Edit profile"
                aria-label="Edit profile"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                title="Account & Security"
              >
                <Shield className="w-3.5 h-3.5 text-[#D8FF36]" />
                <span className="hidden sm:inline">Security</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5 text-red-400" />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="h-10 px-4 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] active:scale-95 text-black text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Join as Scout</span>
            </button>
          )}
        </div>
      </div>

      {/* Unverified Email Notice Banner */}
      {authUser && !isEmailVerified(authUser) && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-amber-200 space-y-0.5">
            <p className="font-bold text-amber-300">Verify your email to unlock full Scout features</p>
            <p className="text-zinc-300">
              Please confirm <span className="font-mono text-white">{authUser.email}</span> before publishing community reviews or suggesting new places.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className="h-9 px-3.5 rounded-xl bg-[#D8FF36] text-black font-extrabold text-xs shrink-0 cursor-pointer"
          >
            Verify in Account Security
          </button>
        </div>
      )}

      {/* Two Separate Scout Actions Bar: Create Community Post vs + Suggest a Place */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            if (!authUser) {
              if (onOpenAuthModal) onOpenAuthModal();
              return;
            }
            if (!isEmailVerified(authUser)) {
              setActiveTab('security');
              return;
            }
            setEditingPost(null);
            setShowCreatePostModal(true);
          }}
          className="h-11 px-4 rounded-xl bg-[#111317] hover:bg-white/[0.06] border border-white/[0.1] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
        >
          <MessageSquareHeart className="w-4 h-4 text-[#D8FF36] shrink-0" />
          <span>Create Community Post</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (!authUser) {
              if (onOpenAuthModal) onOpenAuthModal();
              return;
            }
            if (!isEmailVerified(authUser)) {
              setActiveTab('security');
              return;
            }
            if (onOpenSuggestionModal) onOpenSuggestionModal();
          }}
          className="h-11 px-4 rounded-xl bg-[#D8FF36] hover:bg-[#e2ff5e] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>+ Suggest a Place</span>
        </button>
      </div>

      {/* SECTION 13: PROFILE SCOUT STATS (Real counts only, never hardcoded) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div
          onClick={() => setActiveTab('suggestions')}
          className="p-2.5 sm:p-4 rounded-2xl bg-[#111317] border border-white/[0.08] hover:border-[#ccff00]/30 transition-all text-center cursor-pointer"
        >
          <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs text-zinc-400 mb-1">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#ccff00] shrink-0" />
            <span className="truncate">Suggested</span>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-white font-mono tabular-nums">
            {userSuggestions.length || stats.placesSuggested}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5 truncate">places proposed</p>
        </div>

        <div
          onClick={() => setActiveTab('posts')}
          className="p-2.5 sm:p-4 rounded-2xl bg-[#111317] border border-white/[0.08] hover:border-[#ccff00]/30 transition-all text-center cursor-pointer"
        >
          <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs text-zinc-400 mb-1">
            <MessageSquareHeart className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#ccff00] shrink-0" />
            <span className="truncate">Posts</span>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-white font-mono tabular-nums">
            {userPosts.length || stats.communityPosts}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5 truncate">place reviews</p>
        </div>

        <div className="p-2.5 sm:p-4 rounded-2xl bg-[#111317] border border-white/[0.08] text-center">
          <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs text-zinc-400 mb-1">
            <ThumbsUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#ccff00] shrink-0" />
            <span className="truncate">Helpful</span>
          </div>
          <p className="text-lg sm:text-2xl font-extrabold text-white font-mono tabular-nums">
            {stats.helpfulReports}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5 truncate">verified reports</p>
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
                  Admin Moderation Dashboard
                </span>
                <span className="text-[10px] font-bold text-black bg-[#ccff00] px-1.5 py-0.2 rounded-full">
                  Admin
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Moderate Community Posts, Place Suggestions, Local Transport & Fares.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className="h-9 px-3.5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs transition-all shrink-0 shadow-md shadow-[#ccff00]/10 cursor-pointer"
          >
            Open Dashboard
          </button>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.06] overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={`flex-1 min-w-[95px] py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'posts'
              ? 'bg-[#ccff00] text-black font-extrabold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <span>My Posts</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeTab === 'posts' ? 'bg-black text-[#ccff00]' : 'bg-white/[0.08] text-zinc-300'
            }`}
          >
            {userPosts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('suggestions')}
          className={`flex-1 min-w-[115px] py-2 px-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'suggestions'
              ? 'bg-[#ccff00] text-black font-extrabold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <span>My Suggestions</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeTab === 'suggestions'
                ? 'bg-black text-[#ccff00]'
                : 'bg-white/[0.08] text-zinc-300'
            }`}
          >
            {userSuggestions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          className={`flex-1 min-w-[85px] py-2 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'preferences'
              ? 'bg-[#ccff00] text-black font-extrabold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Preferences
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('visited')}
          className={`flex-1 min-w-[85px] py-2 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'visited'
              ? 'bg-[#D8FF36] text-black font-extrabold'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Visited ({stats.visited})
        </button>

        {authUser && (
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex-1 min-w-[130px] py-2 px-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'security'
                ? 'bg-[#D8FF36] text-black font-extrabold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span>Account & Security</span>
          </button>
        )}
      </div>

      {/* Tab: My Posts */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Your Community Posts</h2>
              <p className="text-[11px] text-zinc-400">
                1 review per place · Up to 2 photos · Approved posts are publicly visible.
              </p>
            </div>
          </div>

          {postActionNotice && (
            <div className="p-3 rounded-xl bg-[#D8FF36]/10 border border-[#D8FF36]/25 text-xs text-[#D8FF36] font-semibold">
              {postActionNotice}
            </div>
          )}

          {loadingPosts ? (
            <div className="py-12 text-center text-xs text-zinc-400 font-mono">
              Loading your posts...
            </div>
          ) : userPosts.length === 0 ? (
            <div className="py-10 px-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center max-w-sm mx-auto space-y-3">
              <MessageSquareHeart className="w-7 h-7 text-zinc-500 mx-auto" />
              <div>
                <p className="text-sm font-bold text-white">No community posts yet</p>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Share an honest review and up to 2 photos for any existing place on OUTERA.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {userPosts.map((post) => {
                const statusStyles: Record<string, string> = {
                  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                  rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
                  hidden: 'bg-zinc-800 text-zinc-400 border-zinc-700',
                };
                const isConfirmingDelete = confirmingDeletePostId === post.id;
                const isDeletingThis = deletingPostId === post.id;

                return (
                  <div
                    key={post.id}
                    onClick={() => onSelectPost && onSelectPost(post)}
                    className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] hover:border-[#ccff00]/40 transition-all cursor-pointer space-y-3 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-[#ccff00] shrink-0" />
                          <span className="text-xs font-bold text-white truncate group-hover:text-[#ccff00] transition-colors">
                            {post.place_name}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-white mt-1 break-words">{post.title}</h3>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {post.images && post.images.length > 0 && (
                          <span className="text-[10px] font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                            📷 {post.images.length}/2
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            statusStyles[post.status] || statusStyles.pending
                          }`}
                        >
                          {post.status}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2 break-words">{post.content}</p>

                    {post.images && post.images.length > 0 && (
                      <div className="flex items-center gap-2 pt-0.5">
                        {post.images.slice(0, 2).map((img, i) => (
                          <img
                            key={i}
                            src={img}
                            alt={`Post photo ${i + 1}`}
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                            className="w-16 h-12 rounded-lg object-cover border border-white/[0.08] bg-zinc-900"
                          />
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 pt-1">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-amber-400">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          <span className="font-mono font-bold text-white">{post.rating}/5</span>
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          · Helpful: {post.helpful_count || 0}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isConfirmingDelete ? (
                          <div
                            className="flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              disabled={isDeletingThis}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePost(post.id);
                              }}
                              className="h-7 px-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-extrabold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {isDeletingThis ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                            <button
                              type="button"
                              disabled={isDeletingThis}
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmingDeletePostId(null);
                              }}
                              className="h-7 px-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-zinc-200 text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            {post.status === 'approved' && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const res = await shareCommunityPost(post);
                                  setPostActionNotice(`Post link copied: ${res.url}`);
                                  setTimeout(() => setPostActionNotice(null), 3000);
                                }}
                                className="h-7 px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-bold text-white flex items-center gap-1 transition-colors cursor-pointer"
                                title="Share unique post link"
                              >
                                <Share2 className="w-3 h-3 text-[#ccff00]" />
                                <span>Share</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPost(post);
                                setShowCreatePostModal(true);
                              }}
                              className="h-7 px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-bold text-[#ccff00] transition-colors cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmingDeletePostId(post.id);
                              }}
                              className="h-7 px-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Delete post"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

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

      {/* Tab: My Place Suggestions (Status tracking in Profile) */}
      {activeTab === 'suggestions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Your Place Suggestions</h2>
              <p className="text-[11px] text-zinc-400">
                Track your proposed places (`pending`, `approved`, `rejected`, `hidden`). Approved places go live with your Scout attribution.
              </p>
            </div>
          </div>

          {loadingSuggestions ? (
            <div className="py-12 text-center text-xs text-zinc-400 font-mono">
              Loading your place suggestions...
            </div>
          ) : userSuggestions.length === 0 ? (
            <div className="py-10 px-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center max-w-sm mx-auto space-y-3">
              <Sparkles className="w-7 h-7 text-[#ccff00] mx-auto" />
              <div>
                <p className="text-sm font-bold text-white">No places suggested yet</p>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Know a great spot that isn't on OUTERA yet? Propose it and earn Scout attribution when approved!
                </p>
              </div>
              {onOpenSuggestionModal && (
                <button
                  type="button"
                  onClick={onOpenSuggestionModal}
                  className="h-9 px-4 rounded-xl bg-[#ccff00] text-black text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Suggest a Place</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {userSuggestions.map((sug) => {
                const statusStyles: Record<string, string> = {
                  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                  rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
                  hidden: 'bg-zinc-800 text-zinc-400 border-zinc-700',
                };

                return (
                  <div
                    key={sug.id}
                    className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-black text-white">{sug.name}</h3>
                          {sug.category && (
                            <span className="text-[10px] font-bold text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded-full border border-[#ccff00]/20">
                              {sug.category}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {[sug.area, sug.upazila, sug.district, sug.division]
                            .filter(Boolean)
                            .join(', ') || sug.address}
                        </p>
                      </div>

                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border shrink-0 ${
                          statusStyles[sug.status] || statusStyles.pending
                        }`}
                      >
                        {sug.status}
                      </span>
                    </div>

                    {(sug.short_description || sug.why_worth_visiting) && (
                      <p className="text-xs text-zinc-300 line-clamp-2">
                        {sug.short_description || sug.why_worth_visiting}
                      </p>
                    )}

                    {sug.images && sug.images.length > 0 && (
                      <div className="flex items-center gap-2">
                        {sug.images.slice(0, 2).map((imgUrl, idx) => (
                          <img
                            key={idx}
                            src={imgUrl}
                            alt={`${sug.name} ${idx + 1}`}
                            className="w-16 h-12 rounded-lg object-cover border border-white/10"
                          />
                        ))}
                      </div>
                    )}

                    {sug.moderation_note && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                        <span className="font-bold">Admin Moderation Note:</span> {sug.moderation_note}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-white/[0.05] font-mono">
                      <span>Submitted {new Date(sug.created_at).toLocaleDateString()}</span>
                      {sug.status === 'approved' && (
                        <span className="text-emerald-400 font-bold">✓ Live on OUTERA with Scout Attribution</span>
                      )}
                    </div>
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
          <div className="space-y-2">
            <span className="text-xs font-bold text-white block">Default Discovery Vibe</span>
            <div className="grid grid-cols-2 gap-2">
              {vibeOptions.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleUpdateVibe(v)}
                  className={`p-3 rounded-xl border text-xs font-medium text-left transition-all cursor-pointer ${
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

          <div className="space-y-2">
            <span className="text-xs font-bold text-white block">Typical Outing Budget</span>
            <div className="grid grid-cols-2 gap-2">
              {budgetOptions.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => handleUpdateBudget(b)}
                  className={`p-3 rounded-xl border text-xs font-medium text-left transition-all cursor-pointer ${
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

      {/* Tab: Account & Security */}
      {activeTab === 'security' && authUser && (
        <AccountSecuritySection
          user={authUser}
          onUserUpdated={(updated) => setAuthUser(updated)}
          onSignedOut={handleSignOut}
        />
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
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs space-y-2">
                <p>{editError}</p>
                {canRetryAvatarUpload && !uploadingAvatar && (
                  <button
                    type="button"
                    onClick={() => executeSaveProfile()}
                    className="w-full h-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Photo Upload & Save</span>
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              {/* Profile Photo Upload */}
              <div className="flex items-center gap-3.5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#ccff00]/15 to-zinc-900 border border-[#ccff00]/30 flex items-center justify-center text-[#ccff00] font-extrabold text-base shrink-0 uppercase overflow-hidden">
                  {editAvatarPreview ? (
                    <img
                      src={editAvatarPreview}
                      alt="Profile avatar preview"
                      className="w-full h-full object-cover"
                    />
                  ) : editName ? (
                    editName.slice(0, 2)
                  ) : (
                    'OUT'
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white cursor-pointer transition-all">
                    <Camera className="w-3.5 h-3.5 text-[#ccff00]" />
                    <span>{editAvatarPreview ? 'Change Photo' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      onChange={handleAvatarFileSelect}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[10px] text-zinc-400">
                    JPG, JPEG, PNG, WEBP · Max 5MB
                  </p>
                </div>
              </div>

              {uploadingAvatar && avatarUploadProgress && (
                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-300">
                    <span className="truncate">Uploading profile photo...</span>
                    <span className="font-mono font-bold text-[#ccff00]">
                      {avatarUploadProgress.overallPercent}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className="h-full bg-[#ccff00] transition-all duration-200"
                      style={{
                        width: `${Math.max(4, Math.min(100, avatarUploadProgress.overallPercent))}%`,
                      }}
                    />
                  </div>
                </div>
              )}

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
                disabled={uploadingAvatar}
                className="w-full h-10 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider hover:bg-[#d8ff33] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {uploadingAvatar ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Uploading Photo...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
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
          if (authUser) {
            loadUserPosts(authUser.id);
            fetchUserRealStats(authUser.id).then(setStats);
          }
          if (onPostsChanged) onPostsChanged();
        }}
      />
    </div>
  );
};
