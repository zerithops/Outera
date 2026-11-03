import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Star,
  Check,
  AlertCircle,
  Send,
  Sparkles,
  Image as ImageIcon,
  Camera,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  createPlacePost,
  updateUserPendingPost,
  fetchPlacesFromSupabase,
  uploadPlacePostImages,
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

  // Direct device photo uploads
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoPreview[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
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

      // Load places from Supabase
      fetchPlacesFromSupabase().then((p) => {
        setPlaces(p || []);
        if (!selectedPlaceId && p && p.length > 0) {
          setSelectedPlaceId(p[0].id);
        }
      });
    }
  }, [isOpen, editingPost, defaultPlaceId, defaultPlaceName]);

  // Clean up object URLs on unmount/change
  useEffect(() => {
    return () => {
      selectedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [selectedPhotos]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = 5 - selectedPhotos.length;
    if (remainingSlots <= 0) {
      setPhotoError('You can upload a maximum of 5 photos.');
      return;
    }

    const validNewPreviews: PhotoPreview[] = [];
    for (const file of files.slice(0, remainingSlots)) {
      // Check 5MB limit
      if (file.size > 5 * 1024 * 1024) {
        setPhotoError(`"${file.name}" exceeds the 5MB file size limit.`);
        continue;
      }
      // Check file types
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!validTypes.includes(file.type.toLowerCase())) {
        setPhotoError(`Only JPG, PNG, and WEBP formats are supported.`);
        continue;
      }

      validNewPreviews.push({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setSelectedPhotos((prev) => [...prev, ...validNewPreviews].slice(0, 5));
    // Reset file input value so same file can be re-selected if removed
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
        onRequireAuth('share your experience');
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
      setErrorMessage('Please share some details about your experience.');
      return;
    }

    setLoading(true);

    if (editingPost) {
      setUploadStatus('Updating post...');
      const res = await updateUserPendingPost(editingPost.id, {
        title: title.trim(),
        content: content.trim(),
        rating,
        is_visited: isVisited,
      });

      setLoading(false);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update post.');
      } else {
        setSuccessNotice('Pending post updated successfully.');
        setTimeout(() => {
          if (onPostSubmitted) onPostSubmitted();
          onClose();
        }, 800);
      }
    } else {
      const placeIdToUse = selectedPlaceId || defaultPlaceId;
      if (!placeIdToUse) {
        setLoading(false);
        setErrorMessage('Please select a place for your post.');
        return;
      }

      setUploadStatus('Creating experience record...');
      const res = await createPlacePost({
        place_id: placeIdToUse,
        title: title.trim(),
        content: content.trim(),
        rating,
        is_visited: isVisited,
      });

      if (!res.success || !res.data) {
        setLoading(false);
        setErrorMessage(res.error || 'Failed to submit post.');
        return;
      }

      // If user provided device photos, upload them directly to Supabase storage
      if (selectedPhotos.length > 0) {
        setUploadStatus(`Uploading ${selectedPhotos.length} photo(s)...`);
        const filesToUpload = selectedPhotos.map((p) => p.file);
        try {
          await uploadPlacePostImages(currentUser.id, res.data.id, filesToUpload);
        } catch (uploadErr) {
          console.warn('Photo upload warning:', uploadErr);
        }
      }

      setLoading(false);
      setSuccessNotice('Experience shared! Your post is pending moderation and will appear once approved.');
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
              <h2 className="text-base font-bold text-white tracking-tight">
                {editingPost ? 'Edit Pending Post' : 'Share Place Experience'}
              </h2>
              <p className="text-[11px] text-zinc-400">
                {defaultPlaceName ? defaultPlaceName : 'Contribute to the OUTERA community'}
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
          <p className="font-semibold text-white">Community Review Policy:</p>
          <p className="text-zinc-300 mt-0.5">
            Posts start in <span className="text-amber-300 font-bold">Pending</span> status. Once approved by an OUTERA moderator, your photos and review appear publicly on the feed and spot page.
          </p>
        </div>

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
          {!defaultPlaceId && places.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Select Place
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
              Your Experience
            </label>
            <textarea
              rows={4}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What made this place special? How was the atmosphere, crowd, and pricing? Any tips for someone going for the first time?"
              className="w-full p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] resize-none"
            />
          </div>

          {/* Direct Photo Upload Section */}
          {!editingPost && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold text-zinc-400">
                  Photos from Your Visit (Optional)
                </label>
                <span className="text-[10px] text-zinc-500">
                  {selectedPhotos.length}/5 photos
                </span>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/jpg"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Thumbnails preview */}
              {selectedPhotos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-1">
                  {selectedPhotos.map((photo, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.1] group"
                    >
                      <img
                        src={photo.previewUrl}
                        alt={`Upload preview ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/80 hover:bg-red-500 text-white transition-colors"
                        title="Remove photo"
                        aria-label="Remove photo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload trigger button */}
              {selectedPhotos.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 rounded-xl border border-dashed border-white/[0.12] hover:border-[#ccff00]/40 bg-white/[0.02] hover:bg-white/[0.04] flex items-center justify-center gap-2 text-xs text-zinc-300 hover:text-white transition-all group"
                >
                  <Camera className="w-4 h-4 text-[#ccff00] group-hover:scale-110 transition-transform" />
                  <span className="font-semibold">
                    {selectedPhotos.length === 0 ? 'Select Device Photos' : 'Add More Photos'}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    (JPG, PNG, WEBP · max 5MB)
                  </span>
                </button>
              )}

              {photoError && (
                <p className="text-[11px] text-rose-400">{photoError}</p>
              )}
            </div>
          )}

          {/* Rating */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">Rating</label>
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
                I have personally visited this place (Verified visitor badge)
              </span>
            </label>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
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
                    {editingPost ? 'Update Pending Post' : 'Submit for Moderation'}
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
