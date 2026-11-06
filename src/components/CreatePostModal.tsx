import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Star,
  Check,
  AlertCircle,
  Send,
  Sparkles,
  Camera,
  Loader2,
  Edit3,
} from 'lucide-react';
import {
  createPlacePost,
  updateUserPendingPost,
  fetchPlacesFromSupabase,
  uploadPlacePostImages,
  checkUserExistingPostForPlace,
  getCurrentUser,
  PlacePost,
} from '../services/supabase';
import { Place } from '../types/outera';

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

const MAX_POST_PHOTOS = 2;

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

  // Direct device photo uploads (strictly max 2)
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoPreview[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
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
      } else {
        setSelectedPlaceId(defaultPlaceId || '');
        setTitle('');
        setContent('');
        setRating(5);
        setIsVisited(true);
      }
      setSelectedPhotos([]);
      setPhotoError(null);
      setErrorMessage(null);
      setSuccessNotice(null);
      setUploadStatus(null);

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

  const handleSwitchToEditExisting = (postToEdit: PlacePost) => {
    setActiveEditingPost(postToEdit);
    setSelectedPlaceId(postToEdit.place_id);
    setTitle(postToEdit.title);
    setContent(postToEdit.content);
    setRating(postToEdit.rating);
    setIsVisited(postToEdit.is_visited);
    setExistingPlacePost(null);
    setErrorMessage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = MAX_POST_PHOTOS - selectedPhotos.length;
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
      if (file.size > 5 * 1024 * 1024) {
        setPhotoError(`"${file.name}" exceeds the 5MB file size limit.`);
        continue;
      }
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!validTypes.includes(file.type.toLowerCase()) && !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        setPhotoError('Only JPG, JPEG, PNG, and WEBP formats are supported.');
        continue;
      }

      validNewPreviews.push({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setSelectedPhotos((prev) => [...prev, ...validNewPreviews].slice(0, MAX_POST_PHOTOS));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    setSelectedPhotos((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setPhotoError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

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
    if (selectedPhotos.length > MAX_POST_PHOTOS) {
      setErrorMessage('Maximum 2 photos are allowed per community post.');
      return;
    }

    setLoading(true);

    if (activeEditingPost) {
      setUploadStatus('Updating post...');
      const res = await updateUserPendingPost(activeEditingPost.id, {
        title: title.trim(),
        content: content.trim(),
        rating,
        is_visited: isVisited,
      });

      setLoading(false);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update post.');
      } else {
        setSuccessNotice('Your community post has been updated and queued for moderation.');
        setTimeout(() => {
          if (onPostSubmitted) onPostSubmitted();
          onClose();
        }, 800);
      }
    } else {
      const placeIdToUse = selectedPlaceId || defaultPlaceId;
      if (!placeIdToUse) {
        setLoading(false);
        setErrorMessage('Please select an existing place for your community post.');
        return;
      }

      if (existingPlacePost) {
        setLoading(false);
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
        if (res.existingPost) {
          setExistingPlacePost(res.existingPost);
        }
        setErrorMessage(res.error || 'Failed to submit post.');
        return;
      }

      if (selectedPhotos.length > 0) {
        const filesToUpload = selectedPhotos.slice(0, MAX_POST_PHOTOS).map((p) => p.file);
        setUploadStatus(`Uploading ${filesToUpload.length} photo(s)...`);
        try {
          const uploadRes = await uploadPlacePostImages(currentUser.id, res.data.id, filesToUpload);
          if (!uploadRes.success && uploadRes.error) {
            console.warn('Photo upload notice:', uploadRes.error);
          }
        } catch (uploadErr) {
          console.warn('Photo upload warning:', uploadErr);
        }
      }

      setLoading(false);
      setSuccessNotice('Experience shared! Your post starts as Pending and becomes publicly visible once approved.');
      setTimeout(() => {
        if (onPostSubmitted) onPostSubmitted();
        onClose();
      }, 1200);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-lg bg-[#111317] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-bottom-4 duration-200 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#ccff00]/10 flex items-center justify-center text-[#ccff00]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {activeEditingPost ? 'Edit Community Post' : 'Create Community Post'}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-[#ccff00]/10 border border-[#ccff00]/25 text-[9px] font-black uppercase tracking-wider text-[#ccff00]">
                  Scout Review
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {defaultPlaceName ? defaultPlaceName : 'Share your real experience or review about an existing place'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-white transition-all"
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
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
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
          {!activeEditingPost && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold text-zinc-400">
                  Direct Photo Upload (Maximum 2 Photos)
                </label>
                <span className="text-[10px] font-mono text-zinc-400">
                  {selectedPhotos.length}/{MAX_POST_PHOTOS} photos
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/jpg"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Thumbnails preview with Primary / Secondary labels */}
              {selectedPhotos.length > 0 && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {selectedPhotos.map((photo, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-[4/3] rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.12] group"
                    >
                      <img
                        src={photo.previewUrl}
                        alt={`Upload preview ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <span
                        className={`absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                          idx === 0
                            ? 'bg-[#ccff00] text-black'
                            : 'bg-black/80 text-white border border-white/15'
                        }`}
                      >
                        {idx === 0 ? 'Photo 1 · Primary / Cover' : 'Photo 2 · Secondary'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/80 hover:bg-red-500 text-white transition-colors"
                        title="Remove photo"
                        aria-label="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload trigger button or 3rd photo blocked notice */}
              {selectedPhotos.length < MAX_POST_PHOTOS ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 rounded-xl border border-dashed border-white/[0.12] hover:border-[#ccff00]/40 bg-white/[0.02] hover:bg-white/[0.04] flex items-center justify-center gap-2 text-xs text-zinc-300 hover:text-white transition-all group"
                >
                  <Camera className="w-4 h-4 text-[#ccff00] group-hover:scale-110 transition-transform" />
                  <span className="font-semibold">
                    {selectedPhotos.length === 0
                      ? 'Upload Photo 1 (Primary Cover)'
                      : 'Add Photo 2 (Secondary Image)'}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    (JPG, PNG, WEBP · max 5MB)
                  </span>
                </button>
              ) : (
                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[11px] text-zinc-400 flex items-center justify-between">
                  <span>Maximum 2 photos selected (3rd photo blocked).</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(1)}
                    className="text-[#ccff00] hover:underline font-bold"
                  >
                    Reselect
                  </button>
                </div>
              )}

              {photoError && (
                <p className="text-[11px] text-rose-400">{photoError}</p>
              )}
            </div>
          )}

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

