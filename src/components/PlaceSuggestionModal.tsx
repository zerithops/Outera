import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  MapPin,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Upload,
  Trash2,
  AlertTriangle,
  Lock,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import { BANGLADESH_DIVISIONS } from '../data/bangladeshLocations';
import {
  submitPlaceSuggestion,
  checkDuplicatePlacesAndSuggestions,
  DuplicatePlaceCandidate,
  getCurrentUser,
  MAX_POST_IMAGES,
  StorageUploadProgress,
  validateImageFile,
} from '../services/supabase';
import { LocationPickerMap } from './LocationPickerMap';
import { Coordinates, Place } from '../types/outera';
import { PLACE_CATEGORY_OPTIONS } from '../services/discoveryEngine';
import { OuteraLogo } from './OuteraLogo';

interface PlaceSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDivision?: string;
  defaultDistrict?: string;
  onOpenAuthModal?: () => void;
  existingPlaces?: Place[];
  onSelectExistingPlace?: (placeId: string) => void;
}

const MAX_PHOTOS = MAX_POST_IMAGES;

export const PlaceSuggestionModal: React.FC<PlaceSuggestionModalProps> = ({
  isOpen,
  onClose,
  defaultDivision,
  defaultDistrict,
  onOpenAuthModal,
  existingPlaces = [],
  onSelectExistingPlace,
}) => {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [scoutName, setScoutName] = useState<string>('OUTERA Scout');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Chill');
  const [division, setDivision] = useState(defaultDivision || 'Dhaka');
  const [district, setDistrict] = useState(defaultDistrict || 'Dhaka');
  const [upazila, setUpazila] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [shortDescription, setShortDescription] = useState('');
  const [whyWorthVisiting, setWhyWorthVisiting] = useState('');
  const [estimatedBudgetMin, setEstimatedBudgetMin] = useState<string>('100');
  const [estimatedBudgetMax, setEstimatedBudgetMax] = useState<string>('500');
  const [bestTimeToVisit, setBestTimeToVisit] = useState('Late afternoon / Sunset');

  // Photos state (strictly max 2)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Duplicate check state
  const [duplicates, setDuplicates] = useState<DuplicatePlaceCandidate[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<StorageUploadProgress | null>(null);
  const [canRetryUpload, setCanRetryUpload] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    setIsCheckingAuth(true);
    getCurrentUser()
      .then((user) => {
        if (!mounted) return;
        if (user) {
          setIsAuthenticated(true);
          const metaName =
            user.user_metadata?.name ||
            user.user_metadata?.full_name ||
            user.email?.split('@')[0] ||
            'OUTERA Scout';
          setScoutName(metaName);
        } else {
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        if (mounted) setIsAuthenticated(false);
      })
      .finally(() => {
        if (mounted) setIsCheckingAuth(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (defaultDivision && BANGLADESH_DIVISIONS.some((d) => d.name === defaultDivision)) {
      setDivision(defaultDivision);
    }
    if (defaultDistrict) {
      setDistrict(defaultDistrict);
    }
  }, [defaultDivision, defaultDistrict]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  // Run duplicate check automatically when name or coords change
  useEffect(() => {
    if (!isOpen || !isAuthenticated || name.trim().length < 3) {
      setDuplicates([]);
      setDuplicateAcknowledged(false);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingDuplicates(true);
      try {
        const matches = await checkDuplicatePlacesAndSuggestions(
          name.trim(),
          district,
          coords?.lat ?? null,
          coords?.lng ?? null,
          existingPlaces
        );
        setDuplicates(matches);
        setDuplicateAcknowledged(false);
      } catch {
        // Ignore transient check errors
      } finally {
        setCheckingDuplicates(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [name, district, coords, isOpen, isAuthenticated, existingPlaces]);

  if (!isOpen) return null;

  // Selected division districts & upazilas
  const currentDivData = BANGLADESH_DIVISIONS.find((d) => d.name === division);
  const availableDistricts = currentDivData?.districts || [];
  const currentDistData = availableDistricts.find((d) => d.name === district);
  const availableUpazilas = currentDistData?.upazilas || [];

  const handleDivisionChange = (newDiv: string) => {
    setDivision(newDiv);
    const divObj = BANGLADESH_DIVISIONS.find((d) => d.name === newDiv);
    if (divObj && divObj.districts.length > 0) {
      setDistrict(divObj.districts[0].name);
      setUpazila(divObj.districts[0].upazilas?.[0]?.name || '');
    }
  };

  const handleDistrictChange = (newDist: string) => {
    setDistrict(newDist);
    const distObj = availableDistricts.find((d) => d.name === newDist);
    if (distObj && distObj.upazilas && distObj.upazilas.length > 0) {
      setUpazila(distObj.upazilas[0].name);
    } else {
      setUpazila('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setErrorMessage(null);
    setCanRetryUpload(false);

    if (selectedFiles.length >= MAX_PHOTOS) {
      setErrorMessage('Maximum 2 photos allowed per place suggestion. Remove a photo to select another.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const remainingSlots = MAX_PHOTOS - selectedFiles.length;
    if (files.length > remainingSlots) {
      setErrorMessage(`You can only upload up to 2 photos total (${remainingSlots} slot remaining).`);
    }

    const validNewFiles: File[] = [];
    for (const file of files.slice(0, remainingSlots)) {
      const check = validateImageFile(file);
      if (!check.valid) {
        setErrorMessage(check.error || 'Invalid image file.');
        continue;
      }
      validNewFiles.push(file);
    }

    if (validNewFiles.length > 0) {
      const nextFiles = [...selectedFiles, ...validNewFiles].slice(0, MAX_PHOTOS);
      setSelectedFiles(nextFiles);
      const nextPreviews = nextFiles.map((f) => URL.createObjectURL(f));
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
      setPreviewUrls(nextPreviews);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    const nextFiles = selectedFiles.filter((_, idx) => idx !== index);
    setSelectedFiles(nextFiles);
    previewUrls.forEach((u) => URL.revokeObjectURL(u));
    setPreviewUrls(nextFiles.map((f) => URL.createObjectURL(f)));
    setCanRetryUpload(false);
  };

  const executeSuggestionSubmit = async () => {
    if (!isAuthenticated) {
      if (onOpenAuthModal) {
        onClose();
        onOpenAuthModal();
      }
      return;
    }

    if (!name.trim()) {
      setErrorMessage('Please enter the place name.');
      return;
    }

    if (!shortDescription.trim() || !whyWorthVisiting.trim()) {
      setErrorMessage('Please provide both a short description and why it is worth visiting.');
      return;
    }

    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
      setErrorMessage('Please pick or confirm the exact location on the map (use GPS, map click, drag marker, or search).');
      return;
    }

    if (selectedFiles.length > MAX_PHOTOS) {
      setErrorMessage('Maximum 2 photos allowed per place suggestion.');
      return;
    }

    const minB = estimatedBudgetMin !== '' ? Math.max(0, Number(estimatedBudgetMin)) : 0;
    const maxB = estimatedBudgetMax !== '' ? Math.max(minB, Number(estimatedBudgetMax)) : minB;

    // Duplicate check gate: if likely duplicates exist and user hasn't acknowledged warning
    setLoading(true);
    setErrorMessage(null);
    setCanRetryUpload(false);
    setUploadProgress(null);

    if (!duplicateAcknowledged) {
      const foundDuplicates = await checkDuplicatePlacesAndSuggestions(
        name.trim(),
        district,
        coords.lat,
        coords.lng,
        existingPlaces
      );
      if (foundDuplicates.length > 0) {
        setDuplicates(foundDuplicates);
        setLoading(false);
        return;
      }
    }

    const formattedBudget =
      minB === 0 && maxB === 0
        ? 'Free / No Cost'
        : minB === maxB
        ? `৳${minB}`
        : `৳${minB} – ৳${maxB}`;

    const res = await submitPlaceSuggestion(
      {
        name: name.trim(),
        category,
        division,
        district,
        upazila: upazila.trim() || undefined,
        area: area.trim() || undefined,
        address: address.trim() || area.trim() || undefined,
        shortDescription: shortDescription.trim(),
        whyWorthVisiting: whyWorthVisiting.trim(),
        estimatedBudgetMin: minB,
        estimatedBudgetMax: maxB,
        approxBudget: formattedBudget,
        bestTimeToVisit,
        latitude: coords.lat,
        longitude: coords.lng,
        photos: selectedFiles,
      },
      selectedFiles,
      {
        onUploadProgress: (prog) => setUploadProgress(prog),
      }
    );

    setLoading(false);
    setUploadProgress(null);

    if (res.success) {
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setName('');
        setUpazila('');
        setArea('');
        setAddress('');
        setCoords(null);
        setShortDescription('');
        setWhyWorthVisiting('');
        setSelectedFiles([]);
        setPreviewUrls([]);
        setDuplicates([]);
        setDuplicateAcknowledged(false);
        onClose();
      }, 1800);
    } else {
      if (selectedFiles.length > 0) {
        setCanRetryUpload(true);
      }
      setErrorMessage(res.error || 'Failed to submit suggestion. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSuggestionSubmit();
  };

  const categories = PLACE_CATEGORY_OPTIONS;

  const timeOptions = [
    'Early Morning / Sunrise',
    'Morning coffee & walk',
    'Midday hangout',
    'Late afternoon / Sunset',
    'Evening vibes',
    'Late night (after 10 PM)',
    'Anytime / All Day',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggestion-modal-title"
    >
      <div className="w-full sm:max-w-2xl bg-[#111317] border-t sm:border border-white/[0.1] rounded-t-3xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl space-y-5 max-h-[92dvh] overflow-y-auto no-scrollbar animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <OuteraLogo size="xs" />
              <span className="text-zinc-600" aria-hidden="true">
                ·
              </span>
              <span className="text-[11px] font-semibold text-zinc-400">
                Scout Network
              </span>
              {isAuthenticated && (
                <>
                  <span className="text-zinc-600" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[11px] font-semibold text-[#ccff00]">
                    Scout: {scoutName}
                  </span>
                </>
              )}
            </div>
            <h2 id="suggestion-modal-title" className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              + Suggest a New Place
            </h2>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Propose a new destination, cafe, nature spot, or hangout for OUTERA. Verified suggestions preserve your Scout attribution.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 flex items-center justify-center text-zinc-400 hover:text-white transition-all border border-white/[0.06] shrink-0 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Auth Check Gate */}
        {isCheckingAuth ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#ccff00] border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-mono">Verifying Scout session...</p>
          </div>
        ) : !isAuthenticated ? (
          <div className="py-10 px-4 text-center space-y-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-[#ccff00]/10 border border-[#ccff00]/30 flex items-center justify-center mx-auto text-[#ccff00]">
              <Lock className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-lg font-black text-white">Sign in to Suggest a Place</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Every registered OUTERA member is automatically a <span className="text-[#ccff00] font-bold">Scout</span>. Sign in or create an account to propose new places and earn Scout attribution when approved.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 text-xs font-bold border border-white/[0.08] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenAuthModal) onOpenAuthModal();
                }}
                className="h-10 px-5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#ccff00]/10"
              >
                <span>Login / Register as Scout</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : submitted ? (
          <div className="py-12 text-center space-y-3 animate-in fade-in">
            <div className="w-14 h-14 rounded-full bg-[#ccff00]/10 border border-[#ccff00]/30 flex items-center justify-center mx-auto text-[#ccff00]">
              <Check className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white">Place Suggestion Submitted!</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
              Your suggestion is now <span className="text-amber-300 font-semibold">Pending Moderation</span>. You can track its status anytime in your Profile. Once approved, it will go live on OUTERA with your Scout attribution.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs space-y-2">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <p className="leading-snug">{errorMessage}</p>
                </div>
                {canRetryUpload && !loading && (
                  <button
                    type="button"
                    onClick={() => executeSuggestionSubmit()}
                    className="w-full h-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Photo Upload & Submit</span>
                  </button>
                )}
              </div>
            )}

            {/* Place Name & Category */}
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Place Name <span className="text-[#ccff00]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ratargul Swamp Forest Viewpoint, North End Roastery..."
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              {/* Duplicate Warning Banner */}
              {duplicates.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <h4 className="text-xs font-extrabold text-amber-300">
                        Similar Place Already Exists on OUTERA
                      </h4>
                      <p className="text-[11px] text-amber-200/80 leading-relaxed">
                        We found existing or pending places matching this name or nearby coordinates. Please check if your spot is already listed before submitting:
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {duplicates.map((dup) => (
                      <div
                        key={`${dup.source}-${dup.id}`}
                        className="p-2.5 rounded-xl bg-black/40 border border-white/[0.08] flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white truncate">{dup.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-white/[0.06] text-zinc-300">
                              {dup.source === 'place' ? 'Live Place' : `Suggestion (${dup.status || 'pending'})`}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                            {dup.category} · {dup.district}
                            {dup.address ? ` · ${dup.address}` : ''}
                            {typeof dup.distanceKm === 'number' ? ` · ${dup.distanceKm} km away` : ''}
                          </p>
                        </div>

                        {dup.source === 'place' && onSelectExistingPlace && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onSelectExistingPlace(dup.id);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#ccff00]/15 text-[#ccff00] hover:bg-[#ccff00]/25 text-[10px] font-bold shrink-0 cursor-pointer"
                          >
                            View Place
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={duplicateAcknowledged}
                      onChange={(e) => setDuplicateAcknowledged(e.target.checked)}
                      className="rounded border-amber-500/40 bg-black/50 text-[#ccff00] focus:ring-0"
                    />
                    <span className="text-[11px] font-semibold text-amber-200">
                      I confirm this is a genuinely distinct place and not a duplicate
                    </span>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Category <span className="text-[#ccff00]">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-all border truncate text-left cursor-pointer ${
                        category === cat
                          ? 'bg-[#ccff00] text-black border-[#ccff00] font-bold'
                          : 'bg-white/[0.03] text-zinc-300 border-white/[0.06] hover:bg-white/[0.06]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Division, District, Upazila/City */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Division <span className="text-[#ccff00]">*</span>
                </label>
                <select
                  value={division}
                  onChange={(e) => handleDivisionChange(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                >
                  {BANGLADESH_DIVISIONS.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  District <span className="text-[#ccff00]">*</span>
                </label>
                <select
                  value={district}
                  onChange={(e) => handleDistrictChange(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                >
                  {availableDistricts.map((dist) => (
                    <option key={dist.name} value={dist.name}>
                      {dist.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Upazila / City <span className="text-[#ccff00]">*</span>
                </label>
                {availableUpazilas.length > 0 ? (
                  <input
                    type="text"
                    list="suggestion-upazila-list"
                    required
                    value={upazila}
                    onChange={(e) => setUpazila(e.target.value)}
                    placeholder="Select or type Upazila/City"
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                  />
                ) : (
                  <input
                    type="text"
                    required
                    value={upazila}
                    onChange={(e) => setUpazila(e.target.value)}
                    placeholder="e.g. Savar, Cox's Bazar Sadar, Gulshan"
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                  />
                )}
                {availableUpazilas.length > 0 && (
                  <datalist id="suggestion-upazila-list">
                    {availableUpazilas.map((u) => (
                      <option key={u.name} value={u.name} />
                    ))}
                  </datalist>
                )}
              </div>
            </div>

            {/* Area & Street Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Area / Neighborhood <span className="text-[#ccff00]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Banani, Dhanmondi, Kolatoli"
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Full Address / Landmark <span className="text-[#ccff00]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Road 11, House 42 or beside Central Shaheed Minar"
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                />
              </div>
            </div>

            {/* Exact Map Location Picker (GPS, Map Click, Drag Marker, Search) */}
            <div className="space-y-1.5">
              <LocationPickerMap
                coordinates={coords}
                onChangeCoordinates={setCoords}
                onAddressDetected={(detectedAddr) => {
                  if (!address.trim()) {
                    setAddress(detectedAddr);
                  }
                  if (!area.trim()) {
                    const firstPart = detectedAddr.split(',')[0]?.trim();
                    if (firstPart) setArea(firstPart);
                  }
                }}
              />
              {coords && (
                <div className="px-3 py-2 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/25 flex items-center justify-between text-[11px]">
                  <span className="text-zinc-200 font-medium flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#ccff00]" />
                    <span>Selected Location Verified on Map</span>
                  </span>
                  <span className="font-mono text-[#ccff00] font-bold">
                    {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </span>
                </div>
              )}
            </div>

            {/* Short Description */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Short Description <span className="text-[#ccff00]">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="Summarize what this place is in 1–2 crisp sentences..."
                className="w-full p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] resize-none"
              />
            </div>

            {/* Why Worth Visiting */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Why is it worth visiting? <span className="text-[#ccff00]">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={whyWorthVisiting}
                onChange={(e) => setWhyWorthVisiting(e.target.value)}
                placeholder="What makes it worth going out for? Mention the atmosphere, specialty food/coffee, view, activities, or crowd vibe."
                className="w-full p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] resize-none"
              />
            </div>

            {/* Estimated Budget Min/Max & Best Time to Visit */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Est. Budget Min (৳ BDT) <span className="text-[#ccff00]">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  required
                  value={estimatedBudgetMin}
                  onChange={(e) => setEstimatedBudgetMin(e.target.value)}
                  placeholder="0"
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white font-mono focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Est. Budget Max (৳ BDT) <span className="text-[#ccff00]">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  required
                  value={estimatedBudgetMax}
                  onChange={(e) => setEstimatedBudgetMax(e.target.value)}
                  placeholder="500"
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white font-mono focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Best Time to Visit <span className="text-[#ccff00]">*</span>
                </label>
                <select
                  value={bestTimeToVisit}
                  onChange={(e) => setBestTimeToVisit(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-xl bg-[#181c22] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                >
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Direct Photo Upload (Maximum 2 Photos) */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#ccff00]" />
                  <span>Place Photos (Direct Upload · Max 2 Photos)</span>
                </label>
                <span className="text-[10px] font-mono text-zinc-400">
                  {selectedFiles.length} / {MAX_PHOTOS} selected
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />

              {selectedFiles.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {previewUrls.map((url, idx) => (
                    <div
                      key={url}
                      className="relative group rounded-2xl overflow-hidden border border-white/[0.12] bg-black/40 aspect-[16/10]"
                    >
                      <img
                        src={url}
                        alt={`Suggestion preview ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-white/15 text-[10px] font-bold text-[#ccff00]">
                        {idx === 0 ? 'Photo 1 · Primary Cover' : 'Photo 2 · Secondary'}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/80 hover:bg-red-500 text-white flex items-center justify-center transition-all cursor-pointer"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedFiles.length < MAX_PHOTOS ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 px-4 rounded-2xl border border-dashed border-white/[0.15] hover:border-[#ccff00]/60 bg-white/[0.02] hover:bg-white/[0.04] transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-5 h-5 text-[#ccff00]" />
                  <span className="text-xs font-bold text-white">
                    {selectedFiles.length === 0
                      ? 'Upload up to 2 real photos of this place'
                      : 'Add 2nd Photo (Secondary Image)'}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    JPG, JPEG, PNG, WEBP · Max 5MB per photo · Private until approved by Admin
                  </span>
                </button>
              ) : (
                <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-400 flex items-center justify-between">
                  <span>Maximum 2 photos reached (1 Primary + 1 Secondary).</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFiles([]);
                      previewUrls.forEach((u) => URL.revokeObjectURL(u));
                      setPreviewUrls([]);
                    }}
                    className="text-red-400 hover:underline font-semibold cursor-pointer"
                  >
                    Clear photos
                  </button>
                </div>
              )}
              {loading && uploadProgress && (
                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-300">
                    <span className="truncate font-medium">
                      Uploading {uploadProgress.fileName} ({uploadProgress.fileIndex + 1}/{uploadProgress.totalFiles})...
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

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || (duplicates.length > 0 && !duplicateAcknowledged)}
                className="w-full h-11 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.99] shadow-lg shadow-[#ccff00]/10 cursor-pointer"
              >
                <span>
                  {loading
                    ? uploadProgress
                      ? `Uploading Photos (${uploadProgress.overallPercent}%)...`
                      : 'Submitting Place Suggestion...'
                    : checkingDuplicates
                    ? 'Checking for duplicates...'
                    : 'Submit Place Suggestion'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
