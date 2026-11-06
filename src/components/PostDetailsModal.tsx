import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ArrowLeft,
  Share2,
  Trash2,
  Star,
  MapPin,
  CheckCircle2,
  MessageSquare,
  Send,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  ExternalLink,
  Shield,
  Loader2,
  ThumbsUp,
  Flag,
  Edit3,
  Check,
} from 'lucide-react';
import {
  PlacePost,
  PlacePostComment,
  fetchPlacePostById,
  deleteUserPost,
  fetchPostComments,
  addPostComment,
  deletePostComment,
  togglePostHelpful,
  submitReportToSupabase,
  updateUserPendingPost,
} from '../services/supabase';

interface PostDetailsModalProps {
  postId: string | null;
  post: PlacePost | null;
  isOpen: boolean;
  onClose: () => void;
  onPostDeleted?: (postId: string) => void;
  onSelectPlace?: (placeId: string) => void;
  currentUserId?: string;
  isAdmin?: boolean;
  onRequireAuth?: (action: string) => void;
}

export const PostDetailsModal: React.FC<PostDetailsModalProps> = ({
  postId,
  post: initialPost,
  isOpen,
  onClose,
  onPostDeleted,
  onSelectPlace,
  currentUserId,
  isAdmin = false,
  onRequireAuth,
}) => {
  const [currentPost, setCurrentPost] = useState<PlacePost | null>(initialPost);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  // Photos Lightbox & Mobile Swipe state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mobileSlideIdx, setMobileSlideIdx] = useState(0);
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);

  // Helpful state
  const [helpfulCount, setHelpfulCount] = useState(0);
  const [userMarkedHelpful, setUserMarkedHelpful] = useState(false);
  const [togglingHelpful, setTogglingHelpful] = useState(false);

  // Report Post modal state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<'Outdated info' | 'Spam or promotional' | 'Inaccurate details' | 'Closed permanently'>('Inaccurate details');
  const [reportComment, setReportComment] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  // Owner Inline Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editRating, setEditRating] = useState(5);
  const [savingEdit, setSavingEdit] = useState(false);

  // Comments state
  const [comments, setComments] = useState<PlacePostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // Delete post confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Share feedback toast
  const [shareToast, setShareToast] = useState(false);

  const activePostId = postId || initialPost?.id;

  const loadPostData = useCallback(async (id: string) => {
    setLoading(true);
    setErrorMessage(null);
    setIsNotFound(false);

    try {
      const fetched = await fetchPlacePostById(id);
      if (!fetched) {
        setIsNotFound(true);
        setCurrentPost(null);
      } else {
        setCurrentPost(fetched);
        setHelpfulCount(fetched.helpful_count || 0);
        setUserMarkedHelpful(Boolean(fetched.user_marked_helpful));
        if (fetched.comments) {
          setComments(fetched.comments);
        } else {
          loadComments(fetched.id);
        }
      }
    } catch (err: any) {
      console.warn('Error fetching post:', err);
      setErrorMessage(err?.message || 'Failed to load post details.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadComments = async (id: string) => {
    setLoadingComments(true);
    try {
      const data = await fetchPostComments(id);
      setComments(data || []);
    } catch {
      // Ignore comment fetch errors gracefully
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLightboxIndex(null);
      setMobileSlideIdx(0);
      setFailedImageUrls([]);
      setShowDeleteConfirm(false);
      setShowReportModal(false);
      setReportSuccess(false);
      setIsEditing(false);
      setCommentError(null);
      setNewCommentText('');

      if (initialPost) {
        setCurrentPost(initialPost);
        setHelpfulCount(initialPost.helpful_count || 0);
        setUserMarkedHelpful(Boolean(initialPost.user_marked_helpful));
        setComments(initialPost.comments || []);
        setIsNotFound(false);
        setErrorMessage(null);
        loadComments(initialPost.id);
      } else if (postId) {
        loadPostData(postId);
      }
    } else {
      setCurrentPost(null);
      setComments([]);
      setIsNotFound(false);
      setErrorMessage(null);
    }
  }, [isOpen, postId, initialPost, loadPostData]);

  if (!isOpen) return null;

  const isOwner = Boolean(currentPost && currentUserId && currentPost.user_id === currentUserId);
  const canDelete = Boolean(currentPost) && (isAdmin || isOwner);

  const handleToggleHelpful = async () => {
    if (!currentPost) return;
    if (!currentUserId) {
      if (onRequireAuth) onRequireAuth('mark community posts as helpful');
      return;
    }
    setTogglingHelpful(true);
    const res = await togglePostHelpful(currentPost.id);
    setTogglingHelpful(false);
    if (res.success) {
      setUserMarkedHelpful(res.markedHelpful);
      setHelpfulCount(res.helpfulCount);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPost) return;
    if (!currentUserId) {
      if (onRequireAuth) onRequireAuth('report content');
      return;
    }
    setSubmittingReport(true);
    await submitReportToSupabase({
      targetType: 'post',
      targetId: currentPost.id,
      reason: reportReason,
      comment: reportComment.trim() || undefined,
    });
    setSubmittingReport(false);
    setReportSuccess(true);
    setTimeout(() => {
      setShowReportModal(false);
      setReportSuccess(false);
      setReportComment('');
    }, 1200);
  };

  const handleStartEdit = () => {
    if (!currentPost) return;
    setEditTitle(currentPost.title);
    setEditContent(currentPost.content);
    setEditRating(currentPost.rating);
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPost || !editTitle.trim() || !editContent.trim()) return;
    setSavingEdit(true);
    const res = await updateUserPendingPost(currentPost.id, {
      title: editTitle.trim(),
      content: editContent.trim(),
      rating: editRating,
    });
    setSavingEdit(false);
    if (res.success) {
      setCurrentPost({
        ...currentPost,
        title: editTitle.trim(),
        content: editContent.trim(),
        rating: editRating,
        status: 'pending',
      });
      setIsEditing(false);
    }
  };

  const handleDeletePost = async () => {
    if (!currentPost) return;
    setDeleting(true);
    const res = await deleteUserPost(currentPost.id);
    setDeleting(false);

    if (res.success) {
      if (onPostDeleted) onPostDeleted(currentPost.id);
      onClose();
    } else {
      setErrorMessage(res.error || 'Failed to delete post.');
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#post/${activePostId}`;
    const shareData = {
      title: currentPost?.title || 'OUTERA Community Post',
      text: currentPost?.content
        ? `${currentPost.content.slice(0, 100)}...`
        : 'Check out this post on OUTERA',
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPost) return;
    if (!currentUserId) {
      if (onRequireAuth) onRequireAuth('join the discussion and post comments');
      return;
    }
    if (!newCommentText.trim()) return;

    setSubmittingComment(true);
    setCommentError(null);

    const res = await addPostComment(currentPost.id, newCommentText);
    setSubmittingComment(false);

    if (res.success && res.comment) {
      setComments((prev) => [...prev, res.comment!]);
      setNewCommentText('');
    } else {
      setCommentError(res.error || 'Failed to submit comment.');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const res = await deletePostComment(commentId);
    if (res.success) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  };

  const formatPostDate = (isoString?: string) => {
    if (!isoString) return 'Recently';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return 'Recently';
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMinutes < 1) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    } catch {
      return 'Recently';
    }
  };

  // Strictly maximum 2 photos: Photo 1 = primary/cover, Photo 2 = secondary
  const images = (currentPost?.images || [])
    .filter((url) => Boolean(url) && !failedImageUrls.includes(url))
    .slice(0, 2);

  const handleImageError = (url: string) => {
    setFailedImageUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-2xl bg-[#0e1014] border-t sm:border border-white/[0.08] sm:rounded-2xl max-h-screen sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Navigation & Actions Top Bar */}
        <div className="h-14 px-4 sm:px-6 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-[#0e1014]/90 backdrop-blur-md">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors py-1.5 px-2 rounded-lg hover:bg-white/[0.05]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleShare}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white transition-all border border-white/[0.06] relative"
              title="Share post"
              aria-label="Share post"
            >
              <Share2 className="w-4 h-4" />
              {shareToast && (
                <span className="absolute -bottom-8 right-0 bg-[#ccff00] text-black text-[10px] font-black px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                  Link Copied!
                </span>
              )}
            </button>

            {isOwner && !isEditing && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white transition-all border border-white/[0.06]"
                title="Edit post"
                aria-label="Edit post"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all border border-red-500/20"
                title="Delete post"
                aria-label="Delete post"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-all border border-white/[0.06] ml-1"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-6">
          {/* STATE 1: LOADING */}
          {loading && (
            <div className="py-16 space-y-4 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-8 h-8 text-[#ccff00] animate-spin" />
              <p className="text-xs text-zinc-400 font-medium tracking-wide">
                Retrieving community experience...
              </p>
            </div>
          )}

          {/* STATE 2: ERROR */}
          {!loading && errorMessage && (
            <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">Unable to Load Post</h3>
              <p className="text-xs text-zinc-300 max-w-sm mx-auto">{errorMessage}</p>
              <div className="pt-2 flex items-center justify-center gap-3">
                {activePostId && (
                  <button
                    type="button"
                    onClick={() => loadPostData(activePostId)}
                    className="h-9 px-4 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs"
                  >
                    Try Again
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: NOT FOUND / DELETED */}
          {!loading && !errorMessage && isNotFound && (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-500 mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Post Not Found</h3>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                This community post may have been removed, deleted by its author, or is currently pending review.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-5 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs tracking-wider uppercase hover:bg-[#d4ff1a] transition-all"
                >
                  Return to OUTERA
                </button>
              </div>
            </div>
          )}

          {/* STATE 4: VALID POST */}
          {!loading && !errorMessage && !isNotFound && currentPost && (
            <>
              {/* Linked Place Header Banner */}
              {currentPost.place_name && (
                <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[#ccff00]/10 flex items-center justify-center text-[#ccff00] shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-[#ccff00] uppercase tracking-wider block">
                        {currentPost.place_category || 'Spot'}
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                        {currentPost.place_name}
                      </h4>
                      {currentPost.place_address && (
                        <p className="text-[11px] text-zinc-400 truncate">
                          {currentPost.place_address}
                        </p>
                      )}
                    </div>
                  </div>

                  {onSelectPlace && currentPost.place_id && (
                    <button
                      type="button"
                      onClick={() => onSelectPlace(currentPost.place_id)}
                      className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-zinc-200 hover:text-white shrink-0 flex items-center gap-1 transition-all border border-white/[0.08]"
                    >
                      <span>View Spot</span>
                      <ExternalLink className="w-3 h-3 text-[#ccff00]" />
                    </button>
                  )}
                </div>
              )}

              {/* Author & Verification Card */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1a1f26] to-[#12151a] border border-white/[0.1] flex items-center justify-center text-xs font-black text-white shrink-0 overflow-hidden">
                    {currentPost.author_avatar ? (
                      <img
                        src={currentPost.author_avatar}
                        alt={currentPost.author_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{(currentPost.author_name || 'S')[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-white">
                        {currentPost.author_name || 'OUTERA Scout'}
                      </h3>
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 border border-white/[0.08]">
                        Scout
                      </span>
                      {currentPost.is_visited && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Visited</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <span className="font-mono text-[11px]">
                        {currentPost.author_username || '@scout'}
                      </span>
                      <span>·</span>
                      <span>{formatPostDate(currentPost.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Rating Badge */}
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span className="font-mono font-bold text-xs text-white">
                    {currentPost.rating}/5
                  </span>
                </div>
              </div>

              {/* Status Banner if not approved */}
              {currentPost.status !== 'approved' && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    currentPost.status === 'pending'
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                      : currentPost.status === 'rejected'
                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  <Shield className="w-4 h-4 shrink-0" />
                  <div>
                    <span className="font-bold uppercase tracking-wider text-[10px] block">
                      Moderation Status: {currentPost.status}
                    </span>
                    {currentPost.moderation_note && (
                      <p className="mt-0.5 text-[11px] text-zinc-300">
                        {currentPost.moderation_note}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Post Title & Text Content (or Owner Edit Form) */}
              {isEditing ? (
                <form onSubmit={handleSaveEdit} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1">Title</label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 mb-1">Review</label>
                    <textarea
                      rows={4}
                      required
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-white resize-none"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setEditRating(s)}
                          className="p-1"
                        >
                          <Star className={`w-4 h-4 ${s <= editRating ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'}`} />
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="h-8 px-3 rounded-lg bg-white/[0.06] text-xs font-bold text-zinc-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="h-8 px-3.5 rounded-lg bg-[#ccff00] text-black font-extrabold text-xs"
                      >
                        {savingEdit ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="space-y-2">
                  <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight leading-snug">
                    {currentPost.title}
                  </h2>
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line font-normal">
                    {currentPost.content}
                  </p>
                </div>
              )}

              {/* Photos Gallery — Max 2 Photos (Desktop: Primary Large + Second Smaller; Mobile: Swipeable Gallery) */}
              {images.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-400">
                      {images.length === 1 ? 'Visitor Photo (1)' : 'Visitor Photos (2)'}
                    </span>
                    <span className="text-[11px]">Tap to enlarge</span>
                  </div>

                  {/* Single Photo View (Desktop & Mobile) */}
                  {images.length === 1 && (
                    <button
                      type="button"
                      onClick={() => setLightboxIndex(0)}
                      className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.08] hover:border-[#ccff00]/50 transition-all group block"
                    >
                      <img
                        src={images[0]}
                        alt="Primary post photo"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={() => handleImageError(images[0])}
                      />
                    </button>
                  )}

                  {/* 2 Photos View: Desktop (Primary large, Second smaller) + Mobile (Swipeable gallery) */}
                  {images.length === 2 && (
                    <>
                      {/* Desktop Layout: Primary image large (2/3 width), Second image smaller (1/3 width) */}
                      <div className="hidden sm:grid sm:grid-cols-3 gap-2.5 h-64">
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(0)}
                          className="col-span-2 relative h-full rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.08] hover:border-[#ccff00]/50 transition-all group"
                        >
                          <img
                            src={images[0]}
                            alt="Primary cover photo"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={() => handleImageError(images[0])}
                          />
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-[#ccff00] border border-white/10">
                            Primary
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(1)}
                          className="col-span-1 relative h-full rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.08] hover:border-[#ccff00]/50 transition-all group"
                        >
                          <img
                            src={images[1]}
                            alt="Secondary photo"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            onError={() => handleImageError(images[1])}
                          />
                          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-zinc-200 border border-white/10">
                            Photo 2
                          </span>
                        </button>
                      </div>

                      {/* Mobile Layout: Swipeable Gallery */}
                      <div className="sm:hidden space-y-2">
                        <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-white/[0.04] border border-white/[0.08]">
                          <img
                            src={images[mobileSlideIdx] || images[0]}
                            alt={`Photo ${mobileSlideIdx + 1}`}
                            onClick={() => setLightboxIndex(mobileSlideIdx)}
                            className="w-full h-full object-cover cursor-pointer"
                            onError={() => handleImageError(images[mobileSlideIdx] || images[0])}
                          />
                          <button
                            type="button"
                            onClick={() => setMobileSlideIdx((prev) => (prev === 0 ? 1 : 0))}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center"
                            aria-label="Previous photo"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMobileSlideIdx((prev) => (prev === 0 ? 1 : 0))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center"
                            aria-label="Next photo"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/75 text-[10px] font-mono text-white">
                            {mobileSlideIdx + 1} / 2
                          </span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5">
                          {[0, 1].map((idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setMobileSlideIdx(idx)}
                              className={`h-1.5 rounded-full transition-all ${
                                mobileSlideIdx === idx ? 'w-5 bg-[#ccff00]' : 'w-1.5 bg-zinc-600'
                              }`}
                              aria-label={`View photo ${idx + 1}`}
                            />
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Helpful & Report Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={togglingHelpful}
                    onClick={handleToggleHelpful}
                    className={`h-9 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                      userMarkedHelpful
                        ? 'bg-[#ccff00]/15 border-[#ccff00]/40 text-[#ccff00]'
                        : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.08] text-zinc-300 hover:text-white'
                    }`}
                  >
                    <ThumbsUp className={`w-3.5 h-3.5 ${userMarkedHelpful ? 'fill-[#ccff00]' : ''}`} />
                    <span>Helpful</span>
                    {helpfulCount > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.2 rounded bg-black/30 font-mono text-[11px]">
                        {helpfulCount}
                      </span>
                    )}
                  </button>

                  {isOwner && !isEditing && (
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="h-9 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-bold text-zinc-200 hover:text-white flex items-center gap-1.5 transition-all"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="h-9 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowReportModal((prev) => !prev)}
                  className="h-8 px-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] text-[11px] font-semibold text-zinc-400 hover:text-rose-300 flex items-center gap-1 transition-all"
                >
                  <Flag className="w-3 h-3" />
                  <span>Report</span>
                </button>
              </div>

              {/* Inline Report Form */}
              {showReportModal && (
                <form
                  onSubmit={handleSubmitReport}
                  className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Report Community Post</span>
                    <button
                      type="button"
                      onClick={() => setShowReportModal(false)}
                      className="text-zinc-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {reportSuccess ? (
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>Thank you. Our moderators will review this report.</span>
                    </div>
                  ) : (
                    <>
                      <select
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value as any)}
                        className="w-full h-9 px-2.5 rounded-lg bg-[#14171d] border border-white/10 text-xs text-white"
                      >
                        <option value="Inaccurate details">Inaccurate details</option>
                        <option value="Outdated info">Outdated info</option>
                        <option value="Spam or promotional">Spam or promotional</option>
                        <option value="Closed permanently">Place closed permanently</option>
                      </select>
                      <input
                        type="text"
                        value={reportComment}
                        onChange={(e) => setReportComment(e.target.value)}
                        placeholder="Optional context for moderators..."
                        className="w-full h-9 px-2.5 rounded-lg bg-[#14171d] border border-white/10 text-xs text-white placeholder-zinc-500"
                      />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={submittingReport}
                          className="h-8 px-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold"
                        >
                          {submittingReport ? 'Submitting...' : 'Submit Report'}
                        </button>
                      </div>
                    </>
                  )}
                </form>
              )}

              {/* Community Comments Section */}
              <div className="pt-4 border-t border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-[#ccff00]" />
                    <span>Discussion ({comments.length})</span>
                  </h3>
                </div>

                {/* Comment Input */}
                <form onSubmit={handleAddComment} className="space-y-2">
                  <div className="relative">
                    <textarea
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      placeholder={
                        currentUserId
                          ? 'Add to the conversation or share your experience...'
                          : 'Sign in to join the conversation...'
                      }
                      rows={2}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] focus:ring-1 focus:ring-[#ccff00] resize-none transition-all"
                    />
                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={submittingComment || !newCommentText.trim()}
                        className="h-8 px-3 rounded-lg bg-[#ccff00] hover:bg-[#d8ff33] disabled:opacity-40 text-black font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        {submittingComment ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                        <span>Comment</span>
                      </button>
                    </div>
                  </div>
                  {commentError && (
                    <p className="text-[11px] text-red-400">{commentError}</p>
                  )}
                </form>

                {/* Comments List */}
                {loadingComments ? (
                  <div className="py-4 text-center">
                    <Loader2 className="w-4 h-4 text-zinc-500 animate-spin mx-auto" />
                  </div>
                ) : comments.length > 0 ? (
                  <div className="space-y-3">
                    {comments.map((c) => {
                      const isCommentAuthor = currentUserId && c.user_id === currentUserId;
                      const canDeleteComment = isAdmin || isCommentAuthor;

                      return (
                        <div
                          key={c.id}
                          className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-xs">
                                {c.author_name || 'Scout'}
                              </span>
                              <span className="text-zinc-500 text-[11px] font-mono">
                                {c.author_username || '@scout'}
                              </span>
                              <span className="text-zinc-600">·</span>
                              <span className="text-[10px] text-zinc-500">
                                {formatPostDate(c.created_at)}
                              </span>
                            </div>

                            {canDeleteComment && (
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(c.id)}
                                className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                                title="Delete comment"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                            {c.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center rounded-xl bg-white/[0.01] border border-dashed border-white/[0.05]">
                    <p className="text-xs text-zinc-500">
                      No comments yet. Be the first to share your observations!
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-[#14171d] border border-white/[0.1] rounded-2xl p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Delete Experience Post?</h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  This action cannot be undone and will remove the post, photos, and comments.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="h-9 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeletePost}
                className="h-9 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Photo Lightbox */}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/95 backdrop-blur-lg p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/[0.1] hover:bg-white/[0.2] text-white transition-all z-10"
            aria-label="Close photo"
          >
            <X className="w-6 h-6" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev !== null ? (prev - 1 + images.length) % images.length : 0
                  )
                }
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/[0.1] hover:bg-white/[0.2] text-white transition-all z-10"
                aria-label="Previous photo"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev !== null ? (prev + 1) % images.length : 0
                  )
                }
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/[0.1] hover:bg-white/[0.2] text-white transition-all z-10"
                aria-label="Next photo"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          <div className="max-w-4xl max-h-[85vh] flex flex-col items-center justify-center">
            <img
              src={images[lightboxIndex]}
              alt={`Full size ${lightboxIndex + 1}`}
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
            />
            <span className="text-xs text-zinc-400 font-mono mt-3">
              Photo {lightboxIndex + 1} of {images.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

