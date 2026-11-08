import React, { useState } from 'react';
import {
  X,
  Bookmark,
  Share2,
  Navigation,
  Sparkles,
  CheckCircle2,
  Users,
  MessageSquarePlus,
  Compass,
  Check,
  Calendar,
  Heart,
  Building2,
  Star,
  ThumbsUp,
  MessageCircle,
  Flag,
  Clock,
  Wallet,
  Sun,
  ShieldCheck,
  Trash2,
  Copy,
  Link2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { PlaceWithDistance } from '../services/discoveryEngine';
import { calculateDistanceKm, DEFAULT_LOCATION, formatDistance } from '../services/location';
import { isPlaceVisitedByUser, toggleVisitedPlace } from '../services/storage';
import { ExperienceVerificationItem } from './ExperienceVerificationItem';
import {
  toggleWantToTryInSupabase,
  submitBusinessClaim,
  fetchPublicPlacePosts,
  fetchPublicPlaceByIdOrSlug,
  togglePostHelpful,
  deleteUserPost,
  subscribeToPostChanges,
  PlacePost,
} from '../services/supabase';
import { CreatePostModal } from './CreatePostModal';
import { HowToGetThereSection } from './HowToGetThereSection';
import { NavigationPreviewModal } from './NavigationPreviewModal';
import { Place, UserLocation } from '../types/outera';
import { shareCommunityPost } from '../services/postUrl';
import {
  applyClientPlaceMetadata,
  buildCanonicalPlaceUrl,
  buildPlacePath,
  copyPlaceLink,
  doesPlaceMatchRoute,
  sharePlace,
} from '../services/placeUrl';

interface PlaceDetailsModalProps {
  place: PlaceWithDistance | null;
  placeIdOrSlug?: string | null;
  isOpen: boolean;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
  onOpenReportModal: (place: PlaceWithDistance) => void;
  onPlaceUpdated?: () => void;
  isAuthenticated?: boolean;
  onRequireAuth?: (action: string) => void;
  userLocation?: UserLocation;
  onSelectPost?: (post: PlacePost) => void;
  onDeletePost?: (postId: string) => void;
  currentUserId?: string;
  isAdmin?: boolean;
  allPlaces?: Place[];
  onSelectAnotherPlace?: (place: Place) => void;
  onPlanTripWithPlace?: (place: Place) => void;
}

export const PlaceDetailsModal: React.FC<PlaceDetailsModalProps> = ({
  place,
  placeIdOrSlug,
  isOpen,
  onClose,
  isSaved,
  onToggleSave,
  onOpenReportModal,
  onPlaceUpdated,
  isAuthenticated = false,
  onRequireAuth,
  userLocation,
  onSelectPost,
  onDeletePost,
  currentUserId,
  isAdmin = false,
  allPlaces = [],
  onSelectAnotherPlace,
  onPlanTripWithPlace,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'experiences' | 'transit'>('overview');
  const [wantToTry, setWantToTry] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimPhone, setClaimPhone] = useState('');
  const [claimEmail, setClaimEmail] = useState('');
  const [claimRole] = useState('Owner / Manager');
  const [claimSuccess, setClaimSuccess] = useState(false);

  const [publicPosts, setPublicPosts] = useState<PlacePost[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [mobileHeroIdx, setMobileHeroIdx] = useState(0);
  const [confirmingDeletePostId, setConfirmingDeletePostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [showNavigationPreview, setShowNavigationPreview] = useState<boolean>(false);

  // Direct URL / Slug resolution state
  const [fetchedPlace, setFetchedPlace] = useState<PlaceWithDistance | null>(null);
  const [loadingPlace, setLoadingPlace] = useState<boolean>(false);
  const [placeNotFound, setPlaceNotFound] = useState<boolean>(false);

  const effectivePlace: PlaceWithDistance | null = React.useMemo(() => {
    if (place && (!placeIdOrSlug || doesPlaceMatchRoute(place, placeIdOrSlug))) {
      return place;
    }
    if (fetchedPlace && (!placeIdOrSlug || doesPlaceMatchRoute(fetchedPlace, placeIdOrSlug))) {
      return fetchedPlace;
    }
    return place;
  }, [place, fetchedPlace, placeIdOrSlug]);

  // Resolve place by ID or slug when opened directly from shared URL or refresh
  React.useEffect(() => {
    let active = true;

    if (!isOpen) {
      setLoadingPlace(false);
      setPlaceNotFound(false);
      return;
    }

    if (place && (!placeIdOrSlug || doesPlaceMatchRoute(place, placeIdOrSlug))) {
      setFetchedPlace(place);
      setLoadingPlace(false);
      setPlaceNotFound(false);
      applyClientPlaceMetadata(place);
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        const canonicalPath = buildPlacePath(place);
        if (window.location.pathname !== canonicalPath) {
          window.history.replaceState({ placeId: place.id }, '', canonicalPath);
        }
      }
      return;
    }

    if (placeIdOrSlug) {
      const fallbackCoords = { lat: 23.794, lng: 90.4043 };
      const originCoords = userLocation?.coords || DEFAULT_LOCATION.coords || fallbackCoords;
      const localMatch = allPlaces.find((p) => doesPlaceMatchRoute(p, placeIdOrSlug));
      if (localMatch) {
        const withDistance: PlaceWithDistance = {
          ...localMatch,
          distanceKm: calculateDistanceKm(
            originCoords,
            localMatch.coordinates || fallbackCoords
          ),
          rankScore: localMatch.communityScore || 100,
        };
        setFetchedPlace(withDistance);
        setLoadingPlace(false);
        setPlaceNotFound(false);
        applyClientPlaceMetadata(withDistance);
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          const canonicalPath = buildPlacePath(withDistance);
          if (window.location.pathname !== canonicalPath) {
            window.history.replaceState({ placeId: withDistance.id }, '', canonicalPath);
          }
        }
        return;
      }

      setLoadingPlace(true);
      setPlaceNotFound(false);
      fetchPublicPlaceByIdOrSlug(placeIdOrSlug)
        .then((remotePlace) => {
          if (!active) return;
          if (remotePlace) {
            const withDistance: PlaceWithDistance = {
              ...remotePlace,
              distanceKm: calculateDistanceKm(
                originCoords,
                remotePlace.coordinates || fallbackCoords
              ),
              rankScore: remotePlace.communityScore || 100,
            };
            setFetchedPlace(withDistance);
            setPlaceNotFound(false);
            setLoadingPlace(false);
            applyClientPlaceMetadata(withDistance);
            if (typeof window !== 'undefined' && window.history?.replaceState) {
              const canonicalPath = buildPlacePath(withDistance);
              if (window.location.pathname !== canonicalPath) {
                window.history.replaceState({ placeId: withDistance.id }, '', canonicalPath);
              }
            }
          } else {
            setFetchedPlace(null);
            setPlaceNotFound(true);
            setLoadingPlace(false);
            applyClientPlaceMetadata(null, {
              isNotFound: true,
              requestedSlug: placeIdOrSlug,
            });
          }
        })
        .catch(() => {
          if (!active) return;
          setFetchedPlace(null);
          setPlaceNotFound(true);
          setLoadingPlace(false);
          applyClientPlaceMetadata(null, {
            isNotFound: true,
            requestedSlug: placeIdOrSlug,
          });
        });
    }

    return () => {
      active = false;
    };
  }, [isOpen, place, placeIdOrSlug, allPlaces, userLocation]);

  const loadPlacePosts = React.useCallback(async () => {
    if (!effectivePlace) return;
    const posts = await fetchPublicPlacePosts(effectivePlace.id);
    setPublicPosts(posts || []);
  }, [effectivePlace]);

  React.useEffect(() => {
    if (isOpen && effectivePlace) {
      setMobileHeroIdx(0);
      setShowNavigationPreview(false);
      loadPlacePosts();
    }
  }, [isOpen, effectivePlace, loadPlacePosts]);

  // Subscribe to real-time and in-app post modifications/deletions so removed/rejected posts vanish immediately
  React.useEffect(() => {
    if (!isOpen || !effectivePlace) return;

    const unsubscribe = subscribeToPostChanges((event) => {
      if (event.type === 'deleted') {
        setPublicPosts((prev) => prev.filter((p) => p.id !== event.postId));
      } else if (event.type === 'updated') {
        if (event.newPost && event.newPost.status !== 'approved') {
          setPublicPosts((prev) => prev.filter((p) => p.id !== event.postId));
        } else {
          loadPlacePosts();
        }
      } else if (event.type === 'inserted') {
        if (
          event.newPost &&
          event.newPost.place_id === effectivePlace.id &&
          event.newPost.status === 'approved'
        ) {
          loadPlacePosts();
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, effectivePlace, loadPlacePosts]);

  if (!isOpen) return null;

  // Loading state when resolving a shared /place/{unique-id} URL directly
  if (loadingPlace && !effectivePlace) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-label="Loading place details"
      >
        <div className="w-full max-w-md bg-[#101216] border border-white/[0.1] rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <Loader2 className="w-8 h-8 text-[#ccff00] animate-spin mx-auto" />
          <div className="space-y-1">
            <h2 className="text-base font-extrabold text-white">Loading Place Details...</h2>
            <p className="text-xs text-zinc-400">
              Retrieving verified place data from OUTERA.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Dedicated 404 Page for Deleted, Unapproved, or Unavailable Places
  if (placeNotFound || !effectivePlace) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-404-title"
      >
        <div className="w-full max-w-lg bg-[#101216] border border-white/[0.12] rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mx-auto text-amber-400">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <span className="inline-block px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-mono font-bold uppercase tracking-wider text-[#ccff00]">
              404 · Place Not Found
            </span>
            <h1 id="place-404-title" className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Place Unavailable or Removed
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-md mx-auto">
              This place may have been deleted, is currently unavailable, or the shared URL does not match an approved public place on OUTERA.
            </p>
            {placeIdOrSlug && (
              <p className="text-[11px] font-mono text-zinc-500 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-1.5 inline-block max-w-full truncate">
                /place/{placeIdOrSlug}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto h-11 px-6 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Compass className="w-4 h-4" />
              <span>Explore Verified Places</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto h-11 px-5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>Back to OUTERA Home</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const placeToRender = effectivePlace;
  const canonicalPlaceUrl = buildCanonicalPlaceUrl(placeToRender);
  const userHasVisited = isPlaceVisitedByUser(placeToRender.id);
  const reports = placeToRender.experienceReports || [];

  // Calculate real community rating & counts from approved posts + experience reports
  const ratedPosts = publicPosts.filter((p) => typeof p.rating === 'number' && p.rating >= 1);
  const computedAvgRating =
    ratedPosts.length > 0
      ? Number(
          (
            ratedPosts.reduce((acc, p) => acc + Number(p.rating || 0), 0) / ratedPosts.length
          ).toFixed(1)
        )
      : placeToRender.communityRating && placeToRender.communityRating > 0
      ? placeToRender.communityRating
      : null;

  const totalCommunityEntries = reports.length + publicPosts.length;
  const effectiveConfidence =
    totalCommunityEntries >= 8
      ? 'High'
      : totalCommunityEntries >= 3
      ? 'Medium'
      : totalCommunityEntries >= 1
      ? 'Limited'
      : placeToRender.communityConfidence || 'Insufficient Data';

  const heroImages = (
    placeToRender.images && placeToRender.images.length > 0
      ? placeToRender.images
      : [placeToRender.image]
  )
    .filter(Boolean)
    .slice(0, 2);

  const handleToggleVisited = () => {
    if (!isAuthenticated && onRequireAuth) {
      onRequireAuth('mark places you have visited');
      return;
    }
    toggleVisitedPlace(placeToRender.id);
    if (onPlaceUpdated) onPlaceUpdated();
  };

  const handleToggleWantToTry = () => {
    if (!isAuthenticated && onRequireAuth) {
      onRequireAuth('save places to your Want-to-Try list');
      return;
    }
    const next = !wantToTry;
    setWantToTry(next);
    toggleWantToTryInSupabase(placeToRender.id);
  };

  const handleQuickHelpful = async (e: React.MouseEvent, post: PlacePost) => {
    e.stopPropagation();
    if (!isAuthenticated && onRequireAuth) {
      onRequireAuth('mark a community review as helpful');
      return;
    }
    const res = await togglePostHelpful(post.id);
    if (res.success) {
      setPublicPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                helpful_count: res.helpfulCount,
                user_marked_helpful: res.markedHelpful,
              }
            : p
        )
      );
    }
  };

  const handleConfirmDeletePlacePost = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    setDeletingPostId(postId);
    const res = await deleteUserPost(postId);
    setDeletingPostId(null);
    setConfirmingDeletePostId(null);
    if (res.success) {
      setPublicPosts((prev) => prev.filter((p) => p.id !== postId));
      if (onDeletePost) onDeletePost(postId);
      if (onPlaceUpdated) onPlaceUpdated();
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimPhone) return;
    await submitBusinessClaim({
      placeId: placeToRender.id,
      businessName: placeToRender.name,
      contactPhone: claimPhone,
      contactEmail: claimEmail,
      role: claimRole,
    });
    setClaimSuccess(true);
    setTimeout(() => {
      setShowClaimModal(false);
      setClaimSuccess(false);
    }, 1500);
  };

  const handleQuickSharePost = async (e: React.MouseEvent, post: PlacePost) => {
    e.stopPropagation();
    await shareCommunityPost({
      ...post,
      place_name: post.place_name || placeToRender.name,
    });
    setCopiedPostId(post.id);
    setTimeout(() => setCopiedPostId((prev) => (prev === post.id ? null : prev)), 2500);
  };

  const handleCopyLink = async () => {
    const res = await copyPlaceLink(placeToRender);
    if (res.copied) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleShare = async () => {
    const res = await sharePlace(placeToRender);
    if (res.method === 'clipboard') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const openNavigationPreview = () => {
    setShowNavigationPreview(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-details-title"
    >
      <div className="w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[90vh] bg-[#101216] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-2xl overflow-y-auto no-scrollbar shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Sticky Top Bar */}
        <div className="sticky top-0 z-20 bg-[#101216]/95 backdrop-blur-md px-3.5 sm:px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 overflow-hidden">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#ccff00] shrink-0">
              {placeToRender.category}
            </span>
            <span className="text-zinc-600 shrink-0">·</span>
            <span className="text-[11px] sm:text-xs text-zinc-400 font-mono shrink-0">
              {formatDistance(placeToRender.distanceKm)}
            </span>
            <span className="text-zinc-600 hidden xs:inline shrink-0">·</span>
            <span className="text-[11px] sm:text-xs text-zinc-400 font-medium truncate hidden xs:inline">
              {placeToRender.upazila ? `${placeToRender.upazila}, ` : ''}
              {placeToRender.district}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-full flex items-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer border ${
                copied
                  ? 'bg-[#ccff00] text-black border-[#ccff00]'
                  : 'bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 hover:text-white border-white/[0.08]'
              }`}
              aria-label="Copy permanent place link"
              title="Copy Place Link"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#ccff00]" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
              aria-label="Share place"
              title="Share Place"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleSave(placeToRender.id)}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                isSaved ? 'bg-[#ccff00] text-black' : 'bg-white/[0.05] text-zinc-300 hover:text-white'
              }`}
              aria-label={isSaved ? 'Saved' : 'Save'}
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-black' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center text-zinc-400 hover:text-white ml-0.5 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hero Media Container (Supports 1 or 2 photos: Desktop large primary + smaller secondary, Mobile swipeable) */}
        <div className="relative w-full bg-zinc-900 overflow-hidden shrink-0">
          {heroImages.length === 1 ? (
            <div className="relative aspect-[16/9] w-full">
              <img
                src={heroImages[0]}
                alt={placeToRender.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#101216] via-transparent to-black/30 pointer-events-none" />
            </div>
          ) : (
            <>
              {/* Desktop: Primary large + Secondary smaller */}
              <div className="hidden sm:grid sm:grid-cols-3 gap-1.5 aspect-[21/9] w-full bg-black">
                <div className="col-span-2 relative overflow-hidden">
                  <img
                    src={heroImages[0]}
                    alt={`${placeToRender.name} primary`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="col-span-1 relative overflow-hidden">
                  <img
                    src={heroImages[1]}
                    alt={`${placeToRender.name} secondary`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#101216] via-transparent to-black/25 pointer-events-none" />
              </div>

              {/* Mobile: Swipeable Gallery */}
              <div className="sm:hidden relative aspect-[16/9] w-full">
                <div
                  className="flex w-full h-full overflow-x-auto snap-x snap-mandatory no-scrollbar"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const idx = Math.round(el.scrollLeft / el.clientWidth);
                    setMobileHeroIdx(idx);
                  }}
                >
                  {heroImages.map((imgUrl, idx) => (
                    <div key={idx} className="w-full h-full shrink-0 snap-center relative">
                      <img
                        src={imgUrl}
                        alt={`${placeToRender.name} ${idx + 1}`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ))}
                </div>
                <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/75 text-[10px] font-mono text-white border border-white/15">
                  {mobileHeroIdx + 1} / {heroImages.length}
                </div>
              </div>
            </>
          )}

          {/* Opening Status Badge */}
          <div className="absolute bottom-3 left-3 max-w-[calc(100%-4.5rem)] flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-white/10 text-white">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                placeToRender.openingHours?.openNow ? 'bg-[#ccff00]' : 'bg-red-400'
              }`}
            />
            <span className="shrink-0">
              {placeToRender.openingHours?.openNow ? 'Open Now' : 'Closed'}
            </span>
            <span className="text-zinc-500 shrink-0">·</span>
            <span className="text-zinc-300 font-normal truncate">
              {typeof placeToRender.openingHours?.hoursText === 'string' &&
              placeToRender.openingHours.hoursText
                ? placeToRender.openingHours.hoursText
                : 'Hours vary'}
            </span>
          </div>

          {/* Real Community Rating & Confidence Badge */}
          <div className="absolute top-3 left-3 max-w-[calc(100%-1.5rem)] flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-[10px] sm:text-[11px] font-bold text-white truncate">
            {computedAvgRating ? (
              <>
                <span className="flex items-center gap-1 text-[#ccff00] font-mono shrink-0">
                  <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-[#ccff00] text-[#ccff00]" />
                  <span>{computedAvgRating} / 5</span>
                </span>
                <span className="text-zinc-500 shrink-0">·</span>
              </>
            ) : placeToRender.communityScore > 0 ? (
              <>
                <span className="text-[#ccff00] font-mono shrink-0">
                  {placeToRender.communityScore}% Worth It
                </span>
                <span className="text-zinc-500 shrink-0">·</span>
              </>
            ) : null}
            <span className="truncate">Confidence: {effectiveConfidence}</span>
          </div>
        </div>

        {/* Header Tabs */}
        <div className="px-5 pt-3 border-b border-white/[0.06] flex items-center gap-4 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'border-[#ccff00] text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Place Details & What to Expect
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('experiences')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'experiences'
                ? 'border-[#ccff00] text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>Community Posts & Reviews</span>
            <span className="px-1.5 py-0.2 rounded-full bg-white/[0.08] text-[10px] font-mono">
              {publicPosts.length + reports.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transit')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'transit'
                ? 'border-[#ccff00] text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Navigation className="w-3.5 h-3.5 text-[#ccff00]" />
            <span>Tourist Guide & Getting There</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {copied && (
            <div className="p-2.5 rounded-xl bg-[#ccff00]/15 border border-[#ccff00]/30 text-center text-xs font-semibold text-[#ccff00]">
              Permanent place link copied to clipboard: {canonicalPlaceUrl}
            </div>
          )}

          {/* Title, Location & Scout Attribution */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  id="place-details-title"
                  className="text-xl sm:text-2xl font-black text-white tracking-tight"
                >
                  {placeToRender.name}
                </h1>
                {placeToRender.suggestedByScoutName && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#ccff00]/15 border border-[#ccff00]/30 text-[#ccff00] text-[10px] font-bold">
                    Scout Suggested by {placeToRender.suggestedByScoutName}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-1.5 font-medium">
                <span className="text-zinc-200 font-semibold">{placeToRender.neighborhood}</span>
                {placeToRender.upazila && (
                  <>
                    <span aria-hidden="true" className="text-zinc-600">
                      ·
                    </span>
                    <span>{placeToRender.upazila}</span>
                  </>
                )}
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
                <span className="text-zinc-300">
                  {placeToRender.district}, {placeToRender.division}
                </span>
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
                <span className="text-[#ccff00] font-semibold">
                  {placeToRender.priceLabel || placeToRender.priceLevel.label}
                </span>
              </div>
            </div>

            {/* Quick Actions: Plan Trip & Create Community Post */}
            <div className="flex flex-wrap items-center gap-2 shrink-0 self-start">
              {onPlanTripWithPlace && (
                <button
                  type="button"
                  onClick={() => onPlanTripWithPlace(placeToRender)}
                  className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-[#ccff00]/30 text-[#ccff00] font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Add to Trip Plan</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated && onRequireAuth) {
                    onRequireAuth('write a community post');
                    return;
                  }
                  setShowCreateModal(true);
                }}
                className="h-9 px-3.5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#ccff00]/10"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>Create Community Post</span>
              </button>
            </div>
          </div>

          {/* Permanent Shareable URL & Copy Link Bar */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#ccff00]/10 border border-[#ccff00]/25 flex items-center justify-center shrink-0 text-[#ccff00]">
                <Link2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                  Permanent Share Link
                </span>
                <span className="text-xs font-mono text-zinc-200 truncate block">
                  {canonicalPlaceUrl}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyLink}
                className={`h-8 px-3 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  copied
                    ? 'bg-[#ccff00] text-black border-[#ccff00]'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/[0.1]'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[#ccff00]" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="h-8 px-3 rounded-xl bg-[#ccff00]/15 hover:bg-[#ccff00]/25 border border-[#ccff00]/30 text-[#ccff00] text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Place</span>
              </button>
            </div>
          </div>

          {/* Core Structured Info Grid: Budget, Best Time, Distance, Suitable For, Indoor/Outdoor, Crowd Level, Visitors */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                <Wallet className="w-3 h-3 text-[#ccff00]" />
                <span>Budget</span>
              </span>
              <p className="text-xs font-bold text-white mt-1">
                {placeToRender.priceLabel || placeToRender.priceLevel.label}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#ccff00]" />
                <span>Best Time</span>
              </span>
              <p className="text-xs font-bold text-white mt-1">
                {placeToRender.bestTimeToVisit ||
                  (placeToRender.timeOfDaySuitability &&
                  placeToRender.timeOfDaySuitability.length > 0
                    ? placeToRender.timeOfDaySuitability.join(', ')
                    : 'Late Afternoon / Evening')}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                <Navigation className="w-3 h-3 text-[#ccff00]" />
                <span>Distance</span>
              </span>
              <p className="text-xs font-bold text-white mt-1 font-mono">
                {formatDistance(placeToRender.distanceKm)}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                <Users className="w-3 h-3 text-[#ccff00]" />
                <span>Suitable For</span>
              </span>
              <p className="text-xs font-bold text-white mt-1 capitalize">
                {placeToRender.suitableFor && placeToRender.suitableFor.length > 0
                  ? placeToRender.suitableFor.join(', ')
                  : 'Solo, Friends, Groups'}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                <Sun className="w-3 h-3 text-[#ccff00]" />
                <span>Indoor / Outdoor</span>
              </span>
              <p className="text-xs font-bold text-white mt-1">{placeToRender.environment}</p>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-[#ccff00]" />
                <span>Crowd & Activity</span>
              </span>
              <p className="text-xs font-bold text-white mt-1">
                {placeToRender.crowdLevel} Crowd ·{' '}
                {placeToRender.verifiedVisitorsCount +
                  publicPosts.filter((p) => p.is_visited).length}{' '}
                Visited
              </p>
            </div>
          </div>

          {/* "I'VE BEEN HERE" Action Banner */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2
                  className={`w-4 h-4 ${userHasVisited ? 'text-[#ccff00]' : 'text-zinc-400'}`}
                />
                <span className="text-xs font-bold text-white">
                  {userHasVisited
                    ? "You've marked this place as visited"
                    : 'Have you visited this place?'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {placeToRender.verifiedVisitorsCount +
                  publicPosts.filter((p) => p.is_visited).length}{' '}
                verified visitors · {totalCommunityEntries} community posts/reports.
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleVisited}
              className={`h-9 px-4 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border cursor-pointer ${
                userHasVisited
                  ? 'bg-[#ccff00] text-black border-[#ccff00] shadow-sm'
                  : 'bg-white/[0.05] text-zinc-200 hover:text-white border-white/[0.1] hover:bg-white/[0.09]'
              }`}
            >
              {userHasVisited ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Visited</span>
                </>
              ) : (
                <span>I've Been Here</span>
              )}
            </button>
          </div>

          {activeTab === 'overview' ? (
            <>
              {/* "WORTH GOING?" COMMUNITY SUMMARY & CONFIDENCE */}
              <div className="p-5 rounded-2xl bg-[#14171d] border border-white/[0.08] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#ccff00]">
                      WORTH GOING? · COMMUNITY SUMMARY
                    </h2>
                    <p className="text-sm font-extrabold text-white mt-0.5">
                      {placeToRender.whyPick || placeToRender.shortDescription}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-bold text-[#ccff00]">
                      Community Confidence: {effectiveConfidence}
                    </span>
                  </div>
                </div>

                {totalCommunityEntries > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">
                        Community Rating
                      </span>
                      <span className="text-xs font-bold text-[#ccff00] font-mono">
                        {computedAvgRating
                          ? `★ ${computedAvgRating} / 5`
                          : `${placeToRender.communityScore}% Positive`}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">
                        Typical Crowd
                      </span>
                      <span className="text-xs font-bold text-white">
                        {placeToRender.crowdLevel}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">
                        Primary Vibe
                      </span>
                      <span className="text-xs font-bold text-white">
                        {placeToRender.primaryVibe}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">
                        Total Activity
                      </span>
                      <span className="text-xs font-bold text-white font-mono">
                        {publicPosts.length} posts · {reports.length} reports
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs text-zinc-400 flex items-center justify-between gap-3">
                    <span>
                      <strong className="text-zinc-200">Insufficient Data:</strong> No community reviews or experience reports submitted yet. We never invent ratings or visitor counts.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isAuthenticated && onRequireAuth) {
                          onRequireAuth('write the first review');
                          return;
                        }
                        setShowCreateModal(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#ccff00]/15 text-[#ccff00] font-bold text-[11px] shrink-0 cursor-pointer"
                    >
                      Write 1st Review
                    </button>
                  </div>
                )}
              </div>

              {/* WHAT TO EXPECT */}
              <div className="space-y-3">
                <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  What To Expect
                </h2>
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                  {placeToRender.fullDescription || placeToRender.shortDescription}
                </p>

                {placeToRender.highlights && placeToRender.highlights.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {placeToRender.highlights.map((item) => (
                      <div
                        key={item}
                        className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2.5 text-xs text-zinc-200"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#ccff00] shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* REAL VISITOR / COMMUNITY POSTS PREVIEW */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#ccff00]" />
                    <span>Real Visitor / Community Posts ({publicPosts.length})</span>
                  </h2>
                  {publicPosts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('experiences')}
                      className="text-xs font-bold text-[#ccff00] hover:underline cursor-pointer"
                    >
                      View all →
                    </button>
                  )}
                </div>

                {publicPosts.length === 0 ? (
                  <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center space-y-2">
                    <p className="text-xs text-zinc-400">
                      No approved community posts for {placeToRender.name} yet. Visited recently? Share your honest review and up to 2 photos!
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isAuthenticated && onRequireAuth) {
                          onRequireAuth('create a community post');
                          return;
                        }
                        setShowCreateModal(true);
                      }}
                      className="h-8 px-4 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      <span>Create Community Post</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {publicPosts.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        onClick={() => onSelectPost && onSelectPost(p)}
                        className="p-4 rounded-2xl bg-[#13161c] border border-white/[0.08] hover:border-[#ccff00]/40 transition-all cursor-pointer space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white">{p.author_name}</span>
                            <span className="text-zinc-500 font-mono text-[11px]">{p.author_username}</span>
                            {p.is_visited && (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                ✓ Visited
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-500">
                              {new Date(p.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {typeof p.rating === 'number' && p.rating > 0 && (
                            <span className="flex items-center gap-1 text-xs font-mono font-bold text-[#ccff00]">
                              <Star className="w-3.5 h-3.5 fill-[#ccff00]" />
                              <span>{p.rating}/5</span>
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-white">{p.title}</h4>
                        <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3">{p.content}</p>

                        {/* Up to 2 Photos */}
                        {p.images && p.images.length > 0 && (
                          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 pt-1">
                            {p.images.slice(0, 2).map((img, i) => (
                              <img
                                key={i}
                                src={img}
                                alt={`${p.title} photo ${i + 1}`}
                                className="w-full h-28 rounded-xl object-cover border border-white/[0.08]"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ))}
                          </div>
                        )}

                        {/* Helpful, Comments, Report & Owner Delete */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.05] text-[11px] text-zinc-400">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => handleQuickHelpful(e, p)}
                              className={`flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                                p.user_marked_helpful ? 'text-[#ccff00]' : 'hover:text-white'
                              }`}
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              <span>Helpful ({p.helpful_count || 0})</span>
                            </button>
                            <span className="flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Comments</span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleQuickSharePost(e, p)}
                              className="flex items-center gap-1 font-semibold text-zinc-300 hover:text-[#ccff00] transition-colors cursor-pointer"
                              title="Share unique post link"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              <span>{copiedPostId === p.id ? 'Link Copied!' : 'Share'}</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            {(isAdmin || (currentUserId && p.user_id === currentUserId)) && (
                              confirmingDeletePostId === p.id ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    disabled={deletingPostId === p.id}
                                    onClick={(e) => handleConfirmDeletePlacePost(e, p.id)}
                                    className="px-2 py-0.5 rounded bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-extrabold"
                                  >
                                    {deletingPostId === p.id ? 'Deleting...' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmingDeletePostId(null);
                                    }}
                                    className="px-2 py-0.5 rounded bg-white/[0.08] text-zinc-300 text-[10px] font-bold"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmingDeletePostId(p.id);
                                  }}
                                  className="flex items-center gap-1 text-rose-400 hover:text-rose-300 font-semibold"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              )
                            )}
                            <span className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300">
                              <Flag className="w-3 h-3" />
                              <span>Report</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* TOURIST INFORMATION & GETTING THERE */}
              <div className="pt-2">
                <HowToGetThereSection
                  place={placeToRender}
                  userLocation={userLocation}
                  allPlaces={allPlaces}
                  onSelectPlace={onSelectAnotherPlace}
                />
              </div>
            </>
          ) : activeTab === 'transit' ? (
            <div className="space-y-4">
              <HowToGetThereSection
                place={placeToRender}
                userLocation={userLocation}
                allPlaces={allPlaces}
                onSelectPlace={onSelectAnotherPlace}
              />
            </div>
          ) : (
            /* COMMUNITY POSTS & EXPERIENCES TAB */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#ccff00] shrink-0" />
                    <span>Real Visitor Posts & Community Observations</span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    1 review per Scout per place · Up to 2 real photos · Helpful votes & constructive verification.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated && onRequireAuth) {
                        onRequireAuth('share your post');
                        return;
                      }
                      setShowCreateModal(true);
                    }}
                    className="h-9 px-3 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-[#ccff00]/10 cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>Create Post</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isAuthenticated && onRequireAuth) {
                        onRequireAuth('share your experience');
                        return;
                      }
                      onOpenReportModal(placeToRender);
                    }}
                    className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold text-xs flex items-center gap-1.5 border border-white/[0.08] cursor-pointer"
                  >
                    <span>Quick Observation</span>
                  </button>
                </div>
              </div>

              {/* Approved Community Posts */}
              {publicPosts.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#ccff00]" />
                    <span>Approved Visitor Reviews ({publicPosts.length})</span>
                  </p>
                  <div className="space-y-3">
                    {publicPosts.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => onSelectPost && onSelectPost(p)}
                        className="p-4 rounded-xl bg-[#111317] border border-white/[0.08] hover:border-[#ccff00]/40 transition-all cursor-pointer space-y-2.5 group"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white group-hover:text-[#ccff00] transition-colors">
                              {p.author_name}
                            </span>
                            <span className="text-zinc-500 font-mono text-[11px]">{p.author_username}</span>
                            {p.is_visited && (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                ✓ Visited
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-500">
                              {new Date(p.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {typeof p.rating === 'number' && p.rating > 0 && (
                              <span className="flex items-center gap-1 text-xs font-mono font-bold text-[#ccff00]">
                                <Star className="w-3.5 h-3.5 fill-[#ccff00]" />
                                <span>{p.rating}/5</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <h4 className="text-sm font-bold text-white tracking-tight">{p.title}</h4>
                        <p className="text-xs text-zinc-300 leading-relaxed">{p.content}</p>

                        {p.images && p.images.length > 0 && (
                          <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 pt-1">
                            {p.images.slice(0, 2).map((img, i) => (
                              <img
                                key={i}
                                src={img}
                                alt={`${p.title} photo ${i + 1}`}
                                className="w-full h-32 rounded-xl object-cover border border-white/[0.08]"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.05] text-[11px] text-zinc-400">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => handleQuickHelpful(e, p)}
                              className={`flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                                p.user_marked_helpful ? 'text-[#ccff00]' : 'hover:text-white'
                              }`}
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              <span>Helpful ({p.helpful_count || 0})</span>
                            </button>
                            <span className="flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Comments & Details</span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleQuickSharePost(e, p)}
                              className="flex items-center gap-1 font-semibold text-zinc-300 hover:text-[#ccff00] transition-colors cursor-pointer"
                              title="Share unique post link"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              <span>{copiedPostId === p.id ? 'Link Copied!' : 'Share'}</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            {(isAdmin || (currentUserId && p.user_id === currentUserId)) && (
                              confirmingDeletePostId === p.id ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    disabled={deletingPostId === p.id}
                                    onClick={(e) => handleConfirmDeletePlacePost(e, p.id)}
                                    className="px-2 py-0.5 rounded bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-extrabold"
                                  >
                                    {deletingPostId === p.id ? 'Deleting...' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmingDeletePostId(null);
                                    }}
                                    className="px-2 py-0.5 rounded bg-white/[0.08] text-zinc-300 text-[10px] font-bold"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmingDeletePostId(p.id);
                                  }}
                                  className="flex items-center gap-1 text-rose-400 hover:text-rose-300 font-semibold"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              )
                            )}
                            <span className="flex items-center gap-1 text-zinc-500">
                              <Flag className="w-3 h-3" />
                              <span>Report</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reports.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-zinc-400">Community Scout Observations</p>
                  {reports.map((report) => (
                    <ExperienceVerificationItem
                      key={report.id}
                      report={report}
                      placeId={placeToRender.id}
                      isUserVerifiedVisitor={userHasVisited}
                      isAuthenticated={isAuthenticated}
                      onRequireAuth={onRequireAuth}
                      onVerificationUpdated={() => {
                        if (onPlaceUpdated) onPlaceUpdated();
                      }}
                    />
                  ))}
                </div>
              ) : publicPosts.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-center">
                  <p className="text-xs text-zinc-400">
                    Be the first to share a post or log an experience for this spot!
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {/* Map Direction Bar */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-[#ccff00]" />
                  <span>{placeToRender.address}</span>
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {placeToRender.neighborhood}, {placeToRender.district}
                </p>
              </div>
              <span className="text-xs font-mono text-[#ccff00] font-semibold">
                {formatDistance(placeToRender.distanceKm)}
              </span>
            </div>

            <button
              type="button"
              onClick={openNavigationPreview}
              className="w-full h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] active:scale-[0.98] border border-white/[0.08] text-xs font-bold text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Compass className="w-4 h-4 text-[#B7FF00]" />
              <span>Let's Go · Preview Route</span>
            </button>
          </div>

          {/* Business Claim / Verification Link */}
          <div className="pt-1 pb-3 text-center">
            <button
              type="button"
              onClick={() => setShowClaimModal(true)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Manage this place? Claim business profile</span>
            </button>
          </div>
        </div>

        {/* Sticky Bottom CTA Bar */}
        <div className="sticky bottom-0 z-20 bg-[#101216]/95 backdrop-blur-md p-3 sm:p-4 border-t border-white/[0.08] flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated && onRequireAuth) {
                onRequireAuth('save places to your vault');
                return;
              }
              onToggleSave(placeToRender.id);
            }}
            className={`h-11 sm:h-12 px-2.5 sm:px-3.5 rounded-xl border flex items-center justify-center text-[11px] sm:text-xs font-bold transition-all cursor-pointer shrink-0 ${
              isSaved
                ? 'bg-[#ccff00]/10 border-[#ccff00]/40 text-[#ccff00]'
                : 'bg-white/[0.05] border-white/[0.1] text-zinc-300 hover:text-white'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 ${isSaved ? 'fill-current' : ''}`} />
            <span>{isSaved ? 'Saved' : 'Save'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleWantToTry}
            className={`h-11 sm:h-12 px-2.5 sm:px-3.5 rounded-xl border flex items-center justify-center text-[11px] sm:text-xs font-bold transition-all cursor-pointer shrink-0 ${
              wantToTry
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                : 'bg-white/[0.05] border-white/[0.1] text-zinc-300 hover:text-white'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 ${wantToTry ? 'fill-current text-rose-400' : ''}`} />
            <span>{wantToTry ? 'Bucketlist' : 'Want to Try'}</span>
          </button>

          <button
            type="button"
            onClick={openNavigationPreview}
            className="flex-1 min-w-[96px] h-11 sm:h-12 rounded-xl bg-[#B7FF00] text-black font-extrabold text-[11px] sm:text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 sm:gap-2 hover:bg-[#c8ff33] active:scale-[0.98] transition-all electric-glow-sm cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>LET'S GO</span>
          </button>
        </div>

        {/* Dedicated Navigation Preview Screen */}
        <NavigationPreviewModal
          place={placeToRender}
          isOpen={showNavigationPreview}
          onBackToPlace={() => setShowNavigationPreview(false)}
        />

        {/* Business Claim Modal */}
        {showClaimModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-sm bg-[#111317] border border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#ccff00]" />
                  <h3 className="text-sm font-bold text-white">Claim {placeToRender.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowClaimModal(false)}
                  className="text-zinc-400 hover:text-white text-xs font-mono"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">
                Connect your business to OUTERA to update hours, post upcoming events, and respond to community observations.
              </p>

              {claimSuccess ? (
                <div className="p-3 rounded-xl bg-[#ccff00]/15 border border-[#ccff00]/30 text-xs font-bold text-[#ccff00] text-center">
                  Claim registered! Our scouts will verify your spot.
                </div>
              ) : (
                <form onSubmit={handleClaimSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                      Phone Number (WhatsApp or Mobile)
                    </label>
                    <input
                      type="tel"
                      required
                      value={claimPhone}
                      onChange={(e) => setClaimPhone(e.target.value)}
                      placeholder="+880 1..."
                      className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                      Business Email
                    </label>
                    <input
                      type="email"
                      value={claimEmail}
                      onChange={(e) => setClaimEmail(e.target.value)}
                      placeholder="owner@spot.com"
                      className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full h-10 rounded-xl bg-[#ccff00] text-black font-extrabold text-xs uppercase tracking-wider transition-all"
                  >
                    Submit Business Claim
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Create Post Modal */}
        <CreatePostModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          defaultPlaceId={placeToRender.id}
          defaultPlaceName={placeToRender.name}
          onRequireAuth={onRequireAuth}
          onPostSubmitted={() => {
            loadPlacePosts();
            if (onPlaceUpdated) onPlaceUpdated();
          }}
        />
      </div>
    </div>
  );
};
