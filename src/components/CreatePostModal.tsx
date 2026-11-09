import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Star,
  Check,
  AlertCircle,
  Send,
  Camera,
  Loader2,
  Edit3,
  RefreshCw,
} from 'lucide-react';
import {
  createPlacePost,
  updateUserPendingPost,
  fetchPlacesFromSupabase,
  uploadPlacePostImages,
  checkUserExistingPostForPlace,
  deleteUserPost,
  getCurrentUser,
  PlacePost,
} from '../services/supabase';
import {
  MAX_POST_IMAGES,
  R2UploadProgress,
  R2UploadedMediaResult,
  uploadMultipleImagesToR2,
  validateImageFile,
} from '../services/r2Storage';
import { Place } from '../types/outera';
import { OuteraLogo } from './OuteraLogo';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPlaceId?: string;
  defaultPlaceName?: string;
  editingPost?: PlacePost | null;
  onPostSubmitted?: () => void;
  onRequireAuth?: (action: string) => void;
}

interface PhotoPreview {
  file: File;
  previewUrl: string;
}

const MAX_POST_PHOTOS = MAX_POST_IMAGES;

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  defaultPlaceId,
  defaultPlaceName,
  editingPost,
  onPostSubmitted,
  onRequireAuth,
}) => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState(defaultPlaceId || '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [rating, setRating] = useState(5);
  const [isVisited, setIsVisited] = useState(true);

  // Track if user is switching into editing their existing post for this place
  const [activeEditingPost, setActiveEditingPost] = useState<PlacePost | null>(editingPost || null);
  const [existingPlacePost, setExistingPlacePost] = useState<PlacePost | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  // Direct device photo uploads (strictly max 2 total including retained existing photos)
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [photosModified, setPhotosModified] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoPreview[]>([]);
  const [preUploadedMedia, setPreUploadedMedia] = useState<R2UploadedMediaResult[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<R2UploadProgress | null>(null);
  const [canRetryUpload, setCanRetryUpload] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveEditingPost(editingPost || null);
      setExistingPlacePost(null);
      if (editingPost) {
        setSelectedPlaceId(editingPost.place_id);
        setTitle(editingPost.title);
        setContent(editingPost.content);
        setRating(editingPost.rating);
        setIsVisited(editingPost.is_visited);
        setExistingImageUrls((editingPost.images || []).slice(0, MAX_POST_PHOTOS));
      } else {
        setSelectedPlaceId(defaultPlaceId || '');
        setTitle('');
        setContent('');
        setRating(5);
        setIsVisited(true);
        setExistingImageUrls([]);
      }
      setPhotosModified(false);
      setSelectedPhotos([]);
      setPreUploadedMedia([]);
      setPhotoError(null);
      setErrorMessage(null);
      setSuccessNotice(null);
      setUploadStatus(null);
      setUploadProgress(null);
      setCanRetryUpload(false);

      fetchPlacesFromSupabase().then((p) => {
        setPlaces(p || []);
        if (!defaultPlaceId && !editingPost && p && p.length > 0) {
          setSelectedPlaceId(p[0].id);
        }
      });
    }
  }, [isOpen, editingPost, defaultPlaceId, defaultPlaceName]);

  // Check if user already has a post for the selected place (1 post per place rule)
  useEffect(() => {
    let active = true;
    const targetPlaceId = selectedPlaceId || defaultPlaceId;
    if (!isOpen || activeEditingPost || !targetPlaceId) {
      setExistingPlacePost(null);
      return;
    }

    setCheckingExisting(true);
    checkUserExistingPostForPlace(targetPlaceId)
      .then((found) => {
        if (!active) return;
        setExistingPlacePost(found);
      })
      .finally(() => {
        if (active) setCheckingExisting(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, selectedPlaceId, defaultPlaceId, activeEditingPost]);

  // Clean up object URLs on unmount/change
  useEffect(() => {
    return () => {
      selectedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [selectedPhotos]);

  if (!isOpen) return null;

  const totalPhotoCount = existingImageUrls.length + selectedPhotos.length;

  const handleSwitchToEditExisting = (postToEdit: PlacePost) => {
    setActiveEditingPost(postToEdit);
    setSelectedPlaceId(postToEdit.place_id);
    setTitle(postToEdit.title);
    setContent(postToEdit.content);
    setRating(postToEdit.rating);
    setIsVisited(postToEdit.is_visited);
    setExistingImageUrls((postToEdit.images || []).slice(0, MAX_POST_PHOTOS));
    setPhotosModified(false);
    setPreUploadedMedia([]);
    setExistingPlacePost(null);
    setErrorMessage(null);
    setCanRetryUpload(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    setErrorMessage(null);
    setCanRetryUpload(false);
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = MAX_POST_PHOTOS - (existingImageUrls.length + selectedPhotos.length);
    if (remainingSlots <= 0) {
      setPhotoError('Maximum 2 photos are allowed per community post (3rd photo is blocked).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (files.length > remainingSlots) {
      setPhotoError(
        `Maximum 2 photos allowed per post. Only the first ${remainingSlots} photo${remainingSlots > 1 ? 's' : ''} can be added.`
      );
    }

    const validNewPreviews: PhotoPreview[] = [];
    for (const file of files.slice(0, remainingSlots)) {
      const check = validateImageFile(file);
      if (!check.valid) {
        setPhotoError(check.error || 'Invalid image file.');
        continue;
      }

      validNewPreviews.push({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (validNewPreviews.length > 0) {
      setPhotosModified(true);
      setPreUploadedMedia([]);
      setSelectedPhotos((prev) =>
        [...prev, ...validNewPreviews].slice(0, MAX_POST_PHOTOS - existingImageUrls.length)
      );
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveExistingPhoto = (index: number) => {
    setExistingImageUrls((prev) => prev.filter((_, i) => i !== index));
    setPhotosModified(true);
    setPhotoError(null);
  };

  const handleRemovePhoto = (index: number) => {
    setSelectedPhotos((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setPreUploadedMedia([]);
    setPhotosModified(true);
    setPhotoError(null);
    setCanRetryUpload(false);
  };

  const executeSubmit = async () => {
    setErrorMessage(null);
    setCanRetryUpload(false);

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      if (onRequireAuth) {
        onRequireAuth('share your community post');
        return;
      }
      setErrorMessage('You must be signed in to submit a post.');
      return;
    }

    if (!title.trim()) {
      setErrorMessage('Please enter a title for your post.');
      return;
    }
    if (!content.trim()) {
      setErrorMessage('Please share your experience or review.');
      return;
    }
    if (totalPhotoCount > MAX_POST_PHOTOS) {
      setErrorMessage('Maximum 2 photos are allowed per community post.');
      return;
    }

    setLoading(true);
    setUploadProgress(null);

    // Upload any newly selected photos to Cloudflare R2 FIRST so failed uploads never create incomplete posts
    const filesToUpload = selectedPhotos.slice(0, MAX_POST_PHOTOS - existingImageUrls.length).map((p) => p.file);
    let r2UploadedResults: R2UploadedMediaResult[] = preUploadedMedia;

    if (filesToUpload.length > 0 && r2UploadedResults.length !== filesToUpload.length) {
      setUploadStatus(`Uploading ${filesToUpload.length} photo${filesToUpload.length > 1 ? 's' : ''} to Cloudflare R2...`);
      try {
        r2UploadedResults = await uploadMultipleImagesToR2(filesToUpload, {
          scope: 'posts',
          entityId: activeEditingPost?.id || undefined,
          maxCount: MAX_POST_PHOTOS - existingImageUrls.length,
          onProgress: (prog) => {
            setUploadProgress(prog);
            if (prog.status === 'retrying') {
              setUploadStatus(
                `Retrying upload for photo ${prog.fileIndex + 1}/${prog.totalFiles} (attempt ${prog.attempt})...`
              );
            } else {
              setUploadStatus(
                `Uploading photo ${prog.fileIndex + 1}/${prog.totalFiles} (${prog.overallPercent}%)...`
              );
            }
          },
        });
        setPreUploadedMedia(r2UploadedResults);
      } catch (uploadErr: any) {
        setLoading(false);
        setUploadStatus(null);
        setCanRetryUpload(true);
        setErrorMessage(
          uploadErr?.message ||
            'Photo upload to Cloudflare R2 failed. Your post was not created—click Retry Upload to try again.'
        );
        return;
      }
    }

    if (activeEditingPost) {
      setUploadStatus('Updating post...');
      const res = await updateUserPendingPost(activeEditingPost.id, {
        title: title.trim(),
        content: content.trim(),
        rating,
        is_visited: isVisited,
      });

      if (!res.success) {
        setLoading(false);
        setUploadStatus(null);
        setErrorMessage(res.error || 'Failed to update post.');
        return;
      }

      if (photosModified || r2UploadedResults.length > 0) {
        setUploadStatus('Saving post photos...');
        const uploadRes = await uploadPlacePostImages(
          currentUser.id,
          activeEditingPost.id,
          [],
          {
            replaceExisting: true,
            retainedUrls: existingImageUrls,
            preUploadedMedia: r2UploadedResults,
          }
        );
        if (!uploadRes.success) {
          setLoading(false);
          setUploadStatus(null);
          setCanRetryUpload(true);
          setErrorMessage(uploadRes.error || 'Failed to save updated post photos.');
          return;
        }
      }

      setLoading(false);
      setUploadStatus(null);
      setUploadProgress(null);
      setSuccessNotice('Your community post has been updated and queued for moderation.');
      setTimeout(() => {
        if (onPostSubmitted) onPostSubmitted();
        onClose();
      }, 800);
    } else {
      const placeIdToUse = selectedPlaceId || defaultPlaceId;
      if (!placeIdToUse) {
        setLoading(false);
        setUploadStatus(null);
        setErrorMessage('Please select an existing place for your community post.');
        return;
      }

      if (existingPlacePost) {
        setLoading(false);
        setUploadStatus(null);
        setErrorMessage('You can only create 1 post/review per place. Click "Edit My Existing Post" above to update it.');
        return;
      }

      setUploadStatus('Creating community post...');
      const res = await createPlacePost({
        place_id: placeIdToUse,
        title: title.trim(),
        content: content.trim(),
        rating,
        is_visited: isVisited,
      });

      if (!res.success || !res.data) {
        setLoading(false);
        setUploadStatus(null);
        if (res.existingPost) {
          setExistingPlacePost(res.existingPost);
        }
        setErrorMessage(res.error || 'Failed to submit post.');
        return;
      }

      if (r2UploadedResults.length > 0) {
        setUploadStatus('Attaching uploaded photos to post...');
        const uploadRes = await uploadPlacePostImages(currentUser.id, res.data.id, [], {
          preUploadedMedia: r2UploadedResults,
        });
        if (!uploadRes.success) {
          // Roll back the incomplete post row so no broken/incomplete post remains
          await deleteUserPost(res.data.id).catch(() => {});
          setLoading(false);
          setUploadStatus(null);
          setCanRetryUpload(true);
          setErrorMessage(
            uploadRes.error ||
              'Failed to link uploaded photos to your post. Post creation was rolled back—please retry.'
          );
          return;
        }
      }

      setLoading(false);
      setUploadStatus(null);
      setUploadProgress(null);
      setSuccessNotice('Experience shared! Your post starts as Pending and becomes publicly visible once approved.');
      setTimeout(() => {
        if (onPostSubmitted) onPostSubmitted();
        onClose();
      }, 1200);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSubmit();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-lg bg-[#111317] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-200 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <OuteraLogo size="xs" />
              <span className="text-zinc-600" aria-hidden="true">
                ·
              </span>
              <span className="text-[11px] font-semibold text-[#ccff00]">
                Scout Review
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
              {activeEditingPost ? 'Edit Community Post' : 'Create Community Post'}
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {defaultPlaceName ? defaultPlaceName : 'Share your real experience or review about an existing place'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-white transition-all shrink-0 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Notice */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
          <p className="font-semibold text-white">Community Post Rules (1 Post Per Place):</p>
          <p className="text-zinc-300 mt-0.5">
            Every registered user is an OUTERA Scout. New posts start as <span className="text-amber-300 font-bold">Pending</span> and become publicly visible once approved. Maximum 2 direct photos per post.
          </p>
        </div>

        {/* Existing Post Warning (1 post per user per place rule) */}
        {!activeEditingPost && existingPlacePost && (
          <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-200">
                <p className="font-bold text-amber-300">
                  You already have a post for this place (Status: {existingPlacePost.status.toUpperCase()})
                </p>
                <p className="text-[11px] text-zinc-300 mt-0.5">
                  Each Scout can create 1 community post/review per place. You can edit your existing post below:
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleSwitchToEditExisting(existingPlacePost)}
              className="w-full h-8 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit My Existing Post ("{existingPlacePost.title}")</span>
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
            {canRetryUpload && !loading && (
              <button
                type="button"
                onClick={() => executeSubmit()}
                className="w-full h-8 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Photo Upload & Submit</span>
              </button>
            )}
          </div>
        )}

        {successNotice && (
          <div className="p-3 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/30 text-xs text-[#ccff00] flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Place Selection if not predetermined */}
          {!defaultPlaceId && !activeEditingPost && places.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Select Existing OUTERA Place
              </label>
              <select
                value={selectedPlaceId}
                onChange={(e) => setSelectedPlaceId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
              >
                {places.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#111317] text-white">
                    {p.name} {p.address ? `· ${p.address}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Post Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Best sunset view and quiet terrace vibe"
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
              Your Review / Experience
            </label>
            <textarea
              rows={4}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What made this place special? How was the atmosphere, crowd, and pricing? Any honest tips for first-time visitors?"
              className="w-full p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] resize-none"
            />
          </div>

          {/* Direct Photo Upload Section — MAXIMUM 2 PHOTOS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-[11px] font-semibold text-zinc-400">
                Direct Photo Upload (Maximum 2 Photos)
              </label>
              <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                {totalPhotoCount}/{MAX_POST_PHOTOS} photos
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,image/jpg"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Thumbnails preview with Primary / Secondary labels */}
            {totalPhotoCount > 0 && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                {existingImageUrls.map((url, idx) => (
                  <div
                    key={`existing-${idx}`}
                    className="relative aspect-[4/3] rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.12] group"
                  >
                    <img
                      src={url}
                      alt={`Existing photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <span
                      className={`absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                        idx === 0
                          ? 'bg-[#ccff00] text-black'
                          : 'bg-black/80 text-white border border-white/15'
                      }`}
                    >
                      {idx === 0 ? 'Photo 1 · Primary' : 'Photo 2 · Secondary'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExistingPhoto(idx)}
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/80 hover:bg-red-500 text-white transition-colors cursor-pointer"
                      title="Remove photo"
                      aria-label="Remove photo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {selectedPhotos.map((photo, idx) => {
                  const displayIdx = existingImageUrls.length + idx;
                  return (
                    <div
                      key={`new-${idx}`}
                      className="relative aspect-[4/3] rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.12] group"
                    >
                      <img
                        src={photo.previewUrl}
                        alt={`Upload preview ${displayIdx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <span
                        className={`absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                          displayIdx === 0
                            ? 'bg-[#ccff00] text-black'
                            : 'bg-black/80 text-white border border-white/15'
                        }`}
                      >
                        {displayIdx === 0 ? 'Photo 1 · Primary' : 'Photo 2 · Secondary'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/80 hover:bg-red-500 text-white transition-colors cursor-pointer"
                        title="Remove photo"
                        aria-label="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Upload trigger button or 3rd photo blocked notice */}
            {totalPhotoCount < MAX_POST_PHOTOS ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 rounded-xl border border-dashed border-white/[0.12] hover:border-[#ccff00]/40 bg-white/[0.02] hover:bg-white/[0.04] flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-300 hover:text-white transition-all group cursor-pointer"
              >
                <Camera className="w-4 h-4 text-[#ccff00] group-hover:scale-110 transition-transform shrink-0" />
                <span className="font-semibold">
                  {totalPhotoCount === 0
                    ? 'Upload Photo 1 (Primary Cover)'
                    : 'Add Photo 2 (Secondary Image)'}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  (JPG, PNG, WEBP · max 5MB)
                </span>
              </button>
            ) : (
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[11px] text-zinc-400 flex items-center justify-between gap-2">
                <span>Maximum 2 photos selected (3rd photo blocked).</span>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPhotos.length > 0) {
                      handleRemovePhoto(selectedPhotos.length - 1);
                    } else if (existingImageUrls.length > 0) {
                      handleRemoveExistingPhoto(existingImageUrls.length - 1);
                    }
                  }}
                  className="text-[#ccff00] hover:underline font-bold shrink-0 cursor-pointer"
                >
                  Reselect
                </button>
              </div>
            )}

            {photoError && <p className="text-[11px] text-rose-400">{photoError}</p>}

            {loading && uploadProgress && (
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-300">
                  <span className="truncate font-medium">
                    Uploading {uploadProgress.fileName} ({uploadProgress.fileIndex + 1}/{uploadProgress.totalFiles})
                  </span>
                  <span className="font-mono font-bold text-[#ccff00] shrink-0">
                    {uploadProgress.overallPercent}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full bg-[#ccff00] transition-all duration-200"
                    style={{ width: `${Math.max(4, Math.min(100, uploadProgress.overallPercent))}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Rating 1-5 */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">
              Rating (1–5)
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 text-zinc-500 hover:text-amber-400 transition-colors"
                >
                  <Star
                    className={`w-6 h-6 ${
                      star <= rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'
                    }`}
                  />
                </button>
              ))}
              <span className="text-xs font-mono font-bold text-white ml-2">{rating}/5 Stars</span>
            </div>
          </div>

          {/* Visited Checkbox */}
          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isVisited}
                onChange={(e) => setIsVisited(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-[#ccff00] focus:ring-[#ccff00]"
              />
              <span className="text-xs text-zinc-300">
                I have personally visited this place (Visited badge)
              </span>
            </label>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || checkingExisting || Boolean(!activeEditingPost && existingPlacePost)}
              className="w-full h-11 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.99] shadow-lg shadow-[#ccff00]/10"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{uploadStatus || 'Submitting...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {activeEditingPost ? 'Save Post Changes' : 'Submit Community Post'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

