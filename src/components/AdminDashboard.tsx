import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Users,
  MapPin,
  FileText,
  Clock,
  Flag,
  CheckCircle,
  XCircle,
  EyeOff,
  Trash2,
  RefreshCw,
  ArrowLeft,
  Star,
  Check,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import {
  fetchAdminOverviewStats,
  fetchAdminPlacePosts,
  moderatePlacePost,
  adminDeletePlacePost,
  PlacePost,
  isCurrentUserAdmin,
  getCurrentUser,
  fetchProfile,
} from '../services/supabase';

interface AdminDashboardProps {
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const [isAdminAuthorized, setIsAdminAuthorized] = useState<boolean | null>(null);
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'hidden' | 'all'>('pending');
  const [posts, setPosts] = useState<PlacePost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPlaces: 0,
    totalPosts: 0,
    pendingPosts: 0,
    totalReports: 0,
  });

  // Action modals state
  const [moderatingPost, setModeratingPost] = useState<{
    post: PlacePost;
    action: 'reject' | 'hide';
  } | null>(null);
  const [moderationNoteInput, setModerationNoteInput] = useState('');

  const [deletingPost, setDeletingPost] = useState<PlacePost | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Verify real database admin role
  const checkAdminStatus = useCallback(async () => {
    const user = await getCurrentUser();
    if (!user) {
      setIsAdminAuthorized(false);
      return false;
    }
    setAdminEmail(user.email || '');
    const profile = await fetchProfile(user.id);
    const authorized = profile?.role === 'admin';
    setIsAdminAuthorized(authorized);
    return authorized;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const isAuth = await checkAdminStatus();
    if (!isAuth) {
      setLoading(false);
      return;
    }

    try {
      const [overviewStats, fetchedPosts] = await Promise.all([
        fetchAdminOverviewStats(),
        fetchAdminPlacePosts(activeTab),
      ]);
      setStats(overviewStats);
      setPosts(fetchedPosts);
    } catch (err) {
      console.warn('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, checkAdminStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle APPROVE
  const handleApprove = async (post: PlacePost) => {
    setActionLoadingId(post.id);
    const res = await moderatePlacePost(post.id, 'approve');
    setActionLoadingId(null);

    if (res.success) {
      showToast(`Post "${post.title}" approved and now publicly visible!`);
      loadData();
    } else {
      showToast(`Error: ${res.error || 'Failed to approve post'}`);
    }
  };

  // Handle REJECT / HIDE submission
  const handleConfirmModerateWithNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moderatingPost) return;

    setActionLoadingId(moderatingPost.post.id);
    const res = await moderatePlacePost(
      moderatingPost.post.id,
      moderatingPost.action,
      moderationNoteInput.trim() || undefined
    );
    setActionLoadingId(null);
    setModeratingPost(null);
    setModerationNoteInput('');

    if (res.success) {
      showToast(
        moderatingPost.action === 'reject'
          ? `Post rejected. Reason noted for author.`
          : `Post hidden from public views.`
      );
      loadData();
    } else {
      showToast(`Error: ${res.error || 'Action failed'}`);
    }
  };

  // Handle DELETE confirmation
  const handleConfirmDelete = async () => {
    if (!deletingPost) return;

    setActionLoadingId(deletingPost.id);
    const res = await adminDeletePlacePost(deletingPost.id);
    setActionLoadingId(null);
    setDeletingPost(null);

    if (res.success) {
      showToast('Post permanently deleted from database.');
      loadData();
    } else {
      showToast(`Error: ${res.error || 'Failed to delete'}`);
    }
  };

  // Non-admin fallback view
  if (isAdminAuthorized === false) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-black text-white">Access Denied</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            This area requires an authenticated administrator account. Your current profile does not have the admin role.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-10 px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-xs font-bold text-white transition-all flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to App</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#ccff00] text-black font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-150">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Admin Header Bar */}
      <div className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition-all shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                OUTERA Moderation System
              </h1>
              <span className="text-[10px] font-extrabold text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded-full border border-[#ccff00]/30 uppercase">
                Admin
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono truncate">
              Signed in as {adminEmail || 'admin'} · Database RLS Active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            className="h-9 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/[0.08] text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#ccff00]' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs transition-all flex items-center gap-1.5"
          >
            <span>Exit Dashboard</span>
          </button>
        </div>
      </div>

      {/* System Overview 5-Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-zinc-400 font-semibold truncate">Total Users</p>
            <p className="text-xl font-black text-white font-mono tabular-nums">{stats.totalUsers}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-zinc-400 font-semibold truncate">Total Places</p>
            <p className="text-xl font-black text-white font-mono tabular-nums">{stats.totalPlaces}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-zinc-400 font-semibold truncate">Total Posts</p>
            <p className="text-xl font-black text-white font-mono tabular-nums">{stats.totalPosts}</p>
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 ${
            stats.pendingPosts > 0
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-[#111317] border-white/[0.08]'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              stats.pendingPosts > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold truncate">Pending Posts</p>
            <p className="text-xl font-black font-mono tabular-nums text-white">{stats.pendingPosts}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] flex items-center gap-3 col-span-2 sm:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
            <Flag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-zinc-400 font-semibold truncate">Reports</p>
            <p className="text-xl font-black text-white font-mono tabular-nums">{stats.totalReports}</p>
          </div>
        </div>
      </div>

      {/* Moderation Tabs Navigation */}
      <div className="flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.06] overflow-x-auto no-scrollbar">
        {(['pending', 'approved', 'rejected', 'hidden', 'all'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const badgeCount =
            tab === 'pending'
              ? stats.pendingPosts
              : tab === 'all'
              ? stats.totalPosts
              : undefined;

          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 min-w-[90px] py-2 px-3 text-xs font-bold rounded-lg transition-all capitalize flex items-center justify-center gap-1.5 ${
                isActive
                  ? 'bg-[#ccff00] text-black font-extrabold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>{tab}</span>
              {badgeCount !== undefined && badgeCount > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-black text-[#ccff00]' : 'bg-white/[0.08] text-zinc-300'
                  }`}
                >
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content Area: Posts List */}
      <div className="space-y-3.5">
        {loading ? (
          <div className="py-20 text-center space-y-3 bg-[#111317] border border-white/[0.08] rounded-2xl">
            <RefreshCw className="w-6 h-6 text-[#ccff00] animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-mono">Loading moderation queue from Supabase...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="py-20 text-center space-y-2 bg-[#111317] border border-white/[0.08] rounded-2xl p-6">
            <CheckCircle className="w-8 h-8 text-[#ccff00]/60 mx-auto mb-1" />
            <h3 className="text-sm font-bold text-white">No {activeTab} posts</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
              {activeTab === 'pending'
                ? 'All submitted posts have been reviewed! The community feed is up to date.'
                : `There are currently no posts with status "${activeTab}".`}
            </p>
          </div>
        ) : (
          posts.map((post) => {
            const isActing = actionLoadingId === post.id;
            const statusColors: Record<string, string> = {
              pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
              approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
              rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
              hidden: 'bg-zinc-800 text-zinc-400 border-zinc-700',
            };

            return (
              <div
                key={post.id}
                className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] hover:border-white/[0.14] transition-all space-y-4"
              >
                {/* Header: Author & Status Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center font-bold text-sm text-[#ccff00] shrink-0 uppercase">
                      {post.author_name ? post.author_name.slice(0, 2) : 'OS'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white truncate">{post.author_name}</p>
                        <p className="text-xs text-zinc-400 font-mono truncate">{post.author_username}</p>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {new Date(post.created_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {post.is_visited && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>Visited</span>
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                        statusColors[post.status] || statusColors.pending
                      }`}
                    >
                      {post.status}
                    </span>
                  </div>
                </div>

                {/* Target Place Information */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-[#ccff00] shrink-0" />
                    <span className="font-bold text-white truncate">{post.place_name}</span>
                    <span className="text-zinc-500">·</span>
                    <span className="text-zinc-400 truncate">{post.place_category}</span>
                  </div>
                  {post.place_address && (
                    <span className="text-[11px] text-zinc-500 truncate hidden sm:inline max-w-xs">
                      {post.place_address}
                    </span>
                  )}
                </div>

                {/* Post Body & Rating */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-0.5 text-amber-400 shrink-0">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      <span className="text-xs font-mono font-bold text-white ml-0.5">
                        {post.rating}/5
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {post.content}
                  </p>
                </div>

                {/* Moderation Note Display if available */}
                {post.moderation_note && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div>
                      <span className="font-bold">Moderator Note:</span> {post.moderation_note}
                    </div>
                  </div>
                )}

                {/* Admin Actions Toolbar */}
                <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2.5">
                  <div className="text-[11px] text-zinc-500 font-mono">
                    Post ID: {post.id.slice(0, 8)}...
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Approve Action */}
                    {post.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => handleApprove(post)}
                        disabled={isActing}
                        className="h-8 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                    )}

                    {/* Reject Action */}
                    {post.status !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModeratingPost({ post, action: 'reject' });
                          setModerationNoteInput(post.moderation_note || '');
                        }}
                        disabled={isActing}
                        className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    )}

                    {/* Hide Action */}
                    {post.status !== 'hidden' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModeratingPost({ post, action: 'hide' });
                          setModerationNoteInput(post.moderation_note || '');
                        }}
                        disabled={isActing}
                        className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08] text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide</span>
                      </button>
                    )}

                    {/* Permanent Delete Action */}
                    <button
                      type="button"
                      onClick={() => setDeletingPost(post)}
                      disabled={isActing}
                      className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center transition-all disabled:opacity-50"
                      title="Permanently Delete Post"
                      aria-label="Permanently Delete Post"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Moderation Note Modal (Reject / Hide) */}
      {moderatingPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#111317] border border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white tracking-tight capitalize">
                {moderatingPost.action === 'reject' ? 'Reject Post' : 'Hide Post from Public'}
              </h3>
              <button
                type="button"
                onClick={() => setModeratingPost(null)}
                className="text-zinc-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Post: <span className="text-white font-semibold">"{moderatingPost.post.title}"</span> by{' '}
              {moderatingPost.post.author_name}
            </p>

            <form onSubmit={handleConfirmModerateWithNote} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">
                  Moderation Note for Author (Optional)
                </label>
                <textarea
                  rows={3}
                  value={moderationNoteInput}
                  onChange={(e) => setModerationNoteInput(e.target.value)}
                  placeholder="e.g. Please provide a clearer description of your experience, or verify your spending details."
                  className="w-full p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] resize-none"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  The post author will be able to see this feedback in their profile under My Posts.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModeratingPost(null)}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-zinc-300 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all ${
                    moderatingPost.action === 'reject'
                      ? 'bg-rose-500 hover:bg-rose-400 text-white'
                      : 'bg-amber-400 hover:bg-amber-300 text-black'
                  }`}
                >
                  Confirm {moderatingPost.action}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-[#111317] border border-red-500/20 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-white">Permanently Delete Post?</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                This will delete <span className="text-white font-semibold">"{deletingPost.title}"</span> from the Supabase database. This action cannot be reversed.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPost(null)}
                className="flex-1 h-10 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-zinc-300 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold uppercase tracking-wider transition-all shadow-lg shadow-red-600/20"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
