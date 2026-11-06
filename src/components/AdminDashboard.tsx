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
  Sparkles,
  Bus,
  Plus,
  Navigation,
  Route,
  ChevronDown,
  ChevronUp,
  Coins,
  ShieldCheck,
  Calendar,
  Edit3,
  Phone,
  Hotel,
} from 'lucide-react';
import { OuteraLogo } from './OuteraLogo';
import {
  fetchAdminOverviewStats,
  fetchAdminPlacePosts,
  moderatePlacePost,
  adminDeletePlacePost,
  fetchAdminPlaceSuggestions,
  moderatePlaceSuggestion,
  adminDeletePlaceSuggestion,
  PlacePost,
  PlaceSuggestion,
  getCurrentUser,
  fetchProfile,
} from '../services/supabase';
import {
  fetchAdminTransportRoutes,
  saveAdminTransportRoute,
  deleteAdminTransportRoute,
  fetchAllCommunityFareReports,
  moderateCommunityFareReport,
  deleteCommunityFareReport,
  fetchAdminLocalTransportContacts,
  moderateLocalTransportContact,
  fetchAdminNearbyServices,
  moderateNearbyService,
  AdminTransportItem,
} from '../services/transport';
import {
  TransportType,
  FareConfidence,
  FareSourceType,
  CommunityFareReport,
  LocalTransportContact,
  NearbyServiceItem,
} from '../types/outera';
import { BANGLADESH_DIVISIONS } from '../data/bangladeshLocations';

interface AdminDashboardProps {
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const [isAdminAuthorized, setIsAdminAuthorized] = useState<boolean | null>(null);
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [adminSection, setAdminSection] = useState<'posts' | 'suggestions' | 'transport'>('posts');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'hidden' | 'all'>('pending');
  const [posts, setPosts] = useState<PlacePost[]>([]);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPlaces: 0,
    totalPosts: 0,
    pendingPosts: 0,
    totalReports: 0,
    totalSuggestions: 0,
    pendingSuggestions: 0,
  });

  // Transport & Fares State
  const [transportRoutes, setTransportRoutes] = useState<AdminTransportItem[]>([]);
  const [fareReports, setFareReports] = useState<CommunityFareReport[]>([]);
  const [localContacts, setLocalContacts] = useState<LocalTransportContact[]>([]);
  const [nearbyServices, setNearbyServices] = useState<NearbyServiceItem[]>([]);
  const [transportSubTab, setTransportSubTab] = useState<'routes' | 'reports' | 'contacts' | 'nearby'>('routes');
  const [showAddRouteModal, setShowAddRouteModal] = useState<boolean>(false);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  // New Route Form State
  const [newRouteOriginDistrict, setNewRouteOriginDistrict] = useState('Dhaka');
  const [newRouteDestDistrict, setNewRouteDestDistrict] = useState("Cox's Bazar");
  const [newRouteDestPlaceName, setNewRouteDestPlaceName] = useState('');
  const [newRouteFromName, setNewRouteFromName] = useState('');
  const [newRouteToName, setNewRouteToName] = useState('');
  const [newRouteTransportType, setNewRouteTransportType] = useState<TransportType>('Bus');
  const [newRouteMinFare, setNewRouteMinFare] = useState<number>(500);
  const [newRouteMaxFare, setNewRouteMaxFare] = useState<number>(800);
  const [newRouteDurationMin, setNewRouteDurationMin] = useState<number>(360);
  const [newRouteDistanceKm, setNewRouteDistanceKm] = useState<number>(300);
  const [newRouteConfidence, setNewRouteConfidence] = useState<FareConfidence>('High');
  const [newRouteSourceType, setNewRouteSourceType] = useState<FareSourceType>('OFFICIAL');
  const [newRouteSourceRef, setNewRouteSourceRef] = useState('');
  const [newRouteNotes, setNewRouteNotes] = useState('');
  const [newRouteIsMultiLeg, setNewRouteIsMultiLeg] = useState(false);
  const [newRouteLegs, setNewRouteLegs] = useState<
    {
      fromLocation: string;
      toLocation: string;
      transportType: TransportType;
      minFare: number;
      maxFare: number;
      estimatedDurationMin: number;
      distanceKm?: number;
      notes?: string;
    }[]
  >([]);

  // Action modals state
  const [moderatingPost, setModeratingPost] = useState<{
    post: PlacePost;
    action: 'reject' | 'hide';
  } | null>(null);
  const [moderationNoteInput, setModerationNoteInput] = useState('');

  // Place Suggestion Edit & Moderation Modal State
  const [editingSuggestion, setEditingSuggestion] = useState<PlaceSuggestion | null>(null);
  const [sugEditName, setSugEditName] = useState('');
  const [sugEditCategory, setSugEditCategory] = useState('Chill');
  const [sugEditDivision, setSugEditDivision] = useState('Dhaka');
  const [sugEditDistrict, setSugEditDistrict] = useState('Dhaka');
  const [sugEditUpazila, setSugEditUpazila] = useState('');
  const [sugEditArea, setSugEditArea] = useState('');
  const [sugEditAddress, setSugEditAddress] = useState('');
  const [sugEditShortDesc, setSugEditShortDesc] = useState('');
  const [sugEditWhyWorth, setSugEditWhyWorth] = useState('');
  const [sugEditBudgetMin, setSugEditBudgetMin] = useState<string>('');
  const [sugEditBudgetMax, setSugEditBudgetMax] = useState<string>('');
  const [sugEditBestTime, setSugEditBestTime] = useState('');
  const [sugEditLat, setSugEditLat] = useState<string>('');
  const [sugEditLng, setSugEditLng] = useState<string>('');
  const [sugEditModNote, setSugEditModNote] = useState('');

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
      const [
        overviewStats,
        fetchedPosts,
        fetchedSuggestions,
        fetchedRoutes,
        fetchedFareReports,
        fetchedContacts,
        fetchedNearby,
      ] = await Promise.all([
        fetchAdminOverviewStats(),
        fetchAdminPlacePosts(activeTab),
        fetchAdminPlaceSuggestions(activeTab),
        fetchAdminTransportRoutes(),
        fetchAllCommunityFareReports(),
        fetchAdminLocalTransportContacts(),
        fetchAdminNearbyServices(),
      ]);
      setStats(overviewStats);
      setPosts(fetchedPosts);
      setSuggestions(fetchedSuggestions);
      setTransportRoutes(fetchedRoutes);
      setFareReports(fetchedFareReports);
      setLocalContacts(fetchedContacts);
      setNearbyServices(fetchedNearby);
    } catch (err) {
      console.warn('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, checkAdminStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle APPROVE POST
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

  const openEditSuggestionModal = (sug: PlaceSuggestion) => {
    setEditingSuggestion(sug);
    setSugEditName(sug.name || '');
    setSugEditCategory(sug.category || 'Chill');
    setSugEditDivision(sug.division || 'Dhaka');
    setSugEditDistrict(sug.district || 'Dhaka');
    setSugEditUpazila(sug.upazila || '');
    setSugEditArea(sug.area || '');
    setSugEditAddress(sug.address || '');
    setSugEditShortDesc(sug.short_description || '');
    setSugEditWhyWorth(sug.why_worth_visiting || sug.description || '');
    setSugEditBudgetMin(sug.estimated_budget_min !== null && sug.estimated_budget_min !== undefined ? String(sug.estimated_budget_min) : '');
    setSugEditBudgetMax(sug.estimated_budget_max !== null && sug.estimated_budget_max !== undefined ? String(sug.estimated_budget_max) : '');
    setSugEditBestTime(sug.best_time_to_visit || '');
    setSugEditLat(sug.latitude !== null && sug.latitude !== undefined ? String(sug.latitude) : '');
    setSugEditLng(sug.longitude !== null && sug.longitude !== undefined ? String(sug.longitude) : '');
    setSugEditModNote(sug.moderation_note || '');
  };

  // Handle Place Suggestions Actions (Approve, Reject, Hide, Edit)
  const handleApproveSuggestion = async (sug: PlaceSuggestion, withEdits?: boolean) => {
    setActionLoadingId(sug.id);
    const editsPayload = withEdits
      ? {
          name: sugEditName.trim(),
          category: sugEditCategory,
          division: sugEditDivision,
          district: sugEditDistrict,
          upazila: sugEditUpazila.trim() || undefined,
          area: sugEditArea.trim() || undefined,
          address: sugEditAddress.trim() || undefined,
          short_description: sugEditShortDesc.trim() || undefined,
          why_worth_visiting: sugEditWhyWorth.trim() || undefined,
          estimated_budget_min: sugEditBudgetMin !== '' ? Number(sugEditBudgetMin) : null,
          estimated_budget_max: sugEditBudgetMax !== '' ? Number(sugEditBudgetMax) : null,
          best_time_to_visit: sugEditBestTime.trim() || undefined,
          latitude: sugEditLat !== '' ? Number(sugEditLat) : sug.latitude,
          longitude: sugEditLng !== '' ? Number(sugEditLng) : sug.longitude,
        }
      : undefined;

    const res = await moderatePlaceSuggestion(
      sug.id,
      'approve',
      withEdits ? sugEditModNote.trim() || undefined : sug.moderation_note || undefined,
      editsPayload
    );
    setActionLoadingId(null);
    setEditingSuggestion(null);

    if (res.success) {
      showToast(`Place suggestion "${sug.name}" approved and published to OUTERA!`);
      loadData();
    } else {
      showToast(`Error: ${res.error || 'Failed to approve suggestion'}`);
    }
  };

  const handleModerateSuggestionStatus = async (
    sug: PlaceSuggestion,
    action: 'reject' | 'hide' | 'edit',
    customNote?: string
  ) => {
    setActionLoadingId(sug.id);
    const editsPayload =
      action === 'edit' || editingSuggestion?.id === sug.id
        ? {
            name: sugEditName.trim() || sug.name,
            category: sugEditCategory || sug.category,
            division: sugEditDivision || sug.division,
            district: sugEditDistrict || sug.district,
            upazila: sugEditUpazila.trim() || sug.upazila,
            area: sugEditArea.trim() || sug.area,
            address: sugEditAddress.trim() || sug.address,
            short_description: sugEditShortDesc.trim() || sug.short_description,
            why_worth_visiting: sugEditWhyWorth.trim() || sug.why_worth_visiting,
            estimated_budget_min: sugEditBudgetMin !== '' ? Number(sugEditBudgetMin) : sug.estimated_budget_min,
            estimated_budget_max: sugEditBudgetMax !== '' ? Number(sugEditBudgetMax) : sug.estimated_budget_max,
            best_time_to_visit: sugEditBestTime.trim() || sug.best_time_to_visit,
            latitude: sugEditLat !== '' ? Number(sugEditLat) : sug.latitude,
            longitude: sugEditLng !== '' ? Number(sugEditLng) : sug.longitude,
          }
        : undefined;

    const res = await moderatePlaceSuggestion(
      sug.id,
      action,
      customNote !== undefined ? customNote : sugEditModNote.trim() || undefined,
      editsPayload
    );
    setActionLoadingId(null);
    setEditingSuggestion(null);

    if (res.success) {
      showToast(
        action === 'edit'
          ? `Suggestion "${sug.name}" details & moderation note updated.`
          : `Place suggestion "${sug.name}" marked as ${action === 'reject' ? 'rejected' : 'hidden'}.`
      );
      loadData();
    } else {
      showToast(`Error: ${res.error || 'Failed to update suggestion'}`);
    }
  };

  const handleDeleteSuggestion = async (sug: PlaceSuggestion) => {
    if (!confirm(`Permanently delete suggestion for "${sug.name}"?`)) return;
    setActionLoadingId(sug.id);
    const res = await adminDeletePlaceSuggestion(sug.id);
    setActionLoadingId(null);

    if (res.success) {
      showToast(`Suggestion permanently deleted.`);
      loadData();
    } else {
      showToast(`Error: ${res.error || 'Failed to delete suggestion'}`);
    }
  };

  // Handle Transport Routes & Fares Actions
  const handleSaveRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRouteFromName || !newRouteToName) {
      showToast('Please specify Origin and Destination location names');
      return;
    }
    if (newRouteMinFare <= 0 || newRouteMaxFare < newRouteMinFare) {
      showToast('Please enter valid minimum and maximum fare amounts');
      return;
    }

    const res = await saveAdminTransportRoute({
      transportType: newRouteTransportType,
      originDistrict: newRouteOriginDistrict,
      destinationDistrict: newRouteDestDistrict,
      destinationPlaceNames: newRouteDestPlaceName.trim() ? [newRouteDestPlaceName.trim()] : undefined,
      fromName: newRouteFromName.trim(),
      toName: newRouteToName.trim(),
      minFare: Math.round(newRouteMinFare),
      maxFare: Math.round(newRouteMaxFare),
      currency: 'BDT',
      estimatedDurationMin: Math.max(5, Math.round(newRouteDurationMin)),
      distanceKm: Math.max(1, Math.round(newRouteDistanceKm)),
      sourceType: newRouteSourceType,
      sourceReference: newRouteSourceRef.trim() || undefined,
      confidence: newRouteConfidence,
      lastUpdated: new Date().toISOString().split('T')[0],
      notes: newRouteNotes.trim() || undefined,
      isMultiLeg: newRouteIsMultiLeg && newRouteLegs.length > 0,
      legs: newRouteIsMultiLeg ? newRouteLegs : undefined,
    });

    if (res.success) {
      showToast('Transport route successfully added/updated!');
      setShowAddRouteModal(false);
      // Reset form
      setNewRouteFromName('');
      setNewRouteToName('');
      setNewRouteNotes('');
      setNewRouteDestPlaceName('');
      setNewRouteLegs([]);
      setNewRouteIsMultiLeg(false);
      loadData();
    } else {
      showToast(`Error: ${res.error || 'Failed to save route'}`);
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    if (!confirm('Are you sure you want to delete this transport route?')) return;
    const res = await deleteAdminTransportRoute(routeId);
    if (res.success) {
      showToast('Route removed.');
      loadData();
    } else {
      showToast(`Error: ${res.error || 'Failed to delete route'}`);
    }
  };

  const handleModerateFare = async (reportId: string, status: 'verified' | 'flagged' | 'rejected') => {
    const res = await moderateCommunityFareReport(reportId, status);
    if (res.success) {
      showToast(`Fare report marked as ${status}.`);
      loadData();
    } else {
      showToast(`Error: ${res.error || 'Failed to moderate fare report'}`);
    }
  };

  const handleDeleteFare = async (reportId: string) => {
    if (!confirm('Delete this community fare report?')) return;
    const res = await deleteCommunityFareReport(reportId);
    if (res.success) {
      showToast('Fare report deleted.');
      loadData();
    } else {
      showToast(`Error: ${res.error || 'Failed to delete report'}`);
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
            <div className="flex flex-wrap items-center gap-2.5">
              <OuteraLogo size="xs" />
              <span className="text-zinc-700 hidden sm:inline">·</span>
              <h1 className="text-sm sm:text-base font-black text-white tracking-tight">
                Moderation System
              </h1>
              <span className="text-[10px] font-extrabold text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded-md border border-[#ccff00]/30 uppercase tracking-wider">
                Admin
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 font-mono truncate">
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

      {/* System Overview 6-Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#111317] border border-white/[0.08] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-zinc-400 font-semibold truncate">Total Users</p>
            <p className="text-lg font-black text-white font-mono tabular-nums">{stats.totalUsers}</p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#111317] border border-white/[0.08] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-zinc-400 font-semibold truncate">Total Places</p>
            <p className="text-lg font-black text-white font-mono tabular-nums">{stats.totalPlaces}</p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#111317] border border-white/[0.08] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-zinc-400 font-semibold truncate">Total Posts</p>
            <p className="text-lg font-black text-white font-mono tabular-nums">{stats.totalPosts}</p>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
            stats.pendingPosts > 0
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-[#111317] border-white/[0.08]'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              stats.pendingPosts > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold truncate">Pending Posts</p>
            <p className="text-lg font-black font-mono tabular-nums text-white">{stats.pendingPosts}</p>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
            stats.pendingSuggestions > 0
              ? 'bg-[#ccff00]/10 border-[#ccff00]/30 text-[#ccff00]'
              : 'bg-[#111317] border-white/[0.08]'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              stats.pendingSuggestions > 0 ? 'bg-[#ccff00]/20 text-[#ccff00]' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold truncate">Pending Suggestions</p>
            <p className="text-lg font-black font-mono tabular-nums text-white">{stats.pendingSuggestions}</p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#111317] border border-white/[0.08] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
            <Flag className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-zinc-400 font-semibold truncate">Reports</p>
            <p className="text-lg font-black text-white font-mono tabular-nums">{stats.totalReports}</p>
          </div>
        </div>
      </div>

      {/* Main Section Switcher: Community Posts vs Place Suggestions vs Transport & Fares */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex p-1 bg-white/[0.04] border border-white/[0.08] rounded-xl w-fit overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setAdminSection('posts')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              adminSection === 'posts'
                ? 'bg-[#ccff00] text-black font-extrabold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Community Posts</span>
            {stats.pendingPosts > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-black/20 font-bold">
                {stats.pendingPosts}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAdminSection('suggestions')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              adminSection === 'suggestions'
                ? 'bg-[#ccff00] text-black font-extrabold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Place Suggestions</span>
            {stats.pendingSuggestions > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-black/20 font-bold">
                {stats.pendingSuggestions}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAdminSection('transport')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              adminSection === 'transport'
                ? 'bg-[#ccff00] text-black font-extrabold shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Bus className="w-3.5 h-3.5" />
            <span>Transport & Fares</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-white/[0.08] text-zinc-300 font-bold">
              {transportRoutes.length}
            </span>
          </button>
        </div>

        <div className="text-xs text-zinc-400">
          Showing <span className="text-white font-bold">{adminSection === 'posts' ? 'posts' : adminSection === 'suggestions' ? 'place suggestions' : 'transport routes & fares'}</span> queue
        </div>
      </div>

      {/* Moderation Tabs Navigation (Only for Posts & Suggestions) */}
      {adminSection !== 'transport' ? (
        <div className="flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.06] overflow-x-auto no-scrollbar">
          {(['pending', 'approved', 'rejected', 'hidden', 'all'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const badgeCount =
              adminSection === 'posts'
                ? tab === 'pending'
                  ? stats.pendingPosts
                  : tab === 'all'
                  ? stats.totalPosts
                  : undefined
                : tab === 'pending'
                ? stats.pendingSuggestions
                : tab === 'all'
                ? stats.totalSuggestions
                : undefined;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 min-w-[90px] py-2 px-3 text-xs font-bold rounded-lg transition-all capitalize flex items-center justify-center gap-1.5 cursor-pointer ${
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
      ) : (
        /* Transport Sub-Navigation Bar */
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex p-1 bg-white/[0.03] rounded-xl border border-white/[0.06] w-fit overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setTransportSubTab('routes')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                transportSubTab === 'routes'
                  ? 'bg-[#ccff00] text-black font-extrabold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Route className="w-3.5 h-3.5" />
              <span>Verified Routes ({transportRoutes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTransportSubTab('reports')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                transportSubTab === 'reports'
                  ? 'bg-[#ccff00] text-black font-extrabold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Fare Reports ({fareReports.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTransportSubTab('contacts')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                transportSubTab === 'contacts'
                  ? 'bg-[#ccff00] text-black font-extrabold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Local Transport ({localContacts.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTransportSubTab('nearby')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                transportSubTab === 'nearby'
                  ? 'bg-[#ccff00] text-black font-extrabold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Hotel className="w-3.5 h-3.5" />
              <span>Stay & Eat Nearby ({nearbyServices.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAddRouteModal(true)}
            className="h-9 px-4 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-[#ccff00]/15 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Transport Route</span>
          </button>
        </div>
      )}

      {/* Content Area: Posts or Suggestions List */}
      <div className="space-y-3.5">
        {loading ? (
          <div className="py-20 text-center space-y-3 bg-[#111317] border border-white/[0.08] rounded-2xl">
            <RefreshCw className="w-6 h-6 text-[#ccff00] animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-mono">Loading moderation queue from Supabase...</p>
          </div>
        ) : adminSection === 'posts' ? (
          posts.length === 0 ? (
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
                <div className="space-y-2">
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

                  {/* Post Photos (Max 2) */}
                  {post.images && post.images.length > 0 && (
                    <div className="grid grid-cols-2 gap-2.5 pt-2">
                      {post.images.slice(0, 2).map((imgUrl, idx) => (
                        <div key={idx} className="relative rounded-xl overflow-hidden border border-white/10 aspect-[16/10] bg-black">
                          <img src={imgUrl} alt={`Post photo ${idx + 1}`} className="w-full h-full object-cover" />
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-[#ccff00]">
                            {idx === 0 ? 'Photo 1 · Primary' : 'Photo 2 · Secondary'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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
                        className="h-8 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
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
                        className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
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
                        className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08] text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
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
                      className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center transition-all disabled:opacity-50 cursor-pointer"
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
        )
      ) : adminSection === 'suggestions' ? (
          // PLACE SUGGESTIONS LIST
          suggestions.length === 0 ? (
            <div className="py-20 text-center space-y-2 bg-[#111317] border border-white/[0.08] rounded-2xl p-6">
              <Sparkles className="w-8 h-8 text-[#ccff00]/60 mx-auto mb-1" />
              <h3 className="text-sm font-bold text-white">No {activeTab} place suggestions</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                {activeTab === 'pending'
                  ? 'All scout suggestions have been reviewed! New submissions will appear here.'
                  : `There are currently no place suggestions with status "${activeTab}".`}
              </p>
            </div>
          ) : (
            suggestions.map((sug) => {
              const isActing = actionLoadingId === sug.id;
              const statusColors: Record<string, string> = {
                pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
                hidden: 'bg-zinc-800 text-zinc-400 border-zinc-700',
              };

              return (
                <div
                  key={sug.id}
                  className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] hover:border-white/[0.14] transition-all space-y-4"
                >
                  {/* Header: Place Name, Category & Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/20 flex items-center justify-center font-bold text-sm text-[#ccff00] shrink-0 uppercase">
                        {sug.name ? sug.name.slice(0, 2) : 'PL'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-black text-white truncate">{sug.name}</h3>
                          {sug.category && (
                            <span className="text-[10px] font-bold text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded-full border border-[#ccff00]/20 shrink-0">
                              {sug.category}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 font-mono truncate">
                          Scout: <strong className="text-zinc-200">{sug.author_name}</strong> ({sug.author_handle}) · UUID: {sug.user_id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                          statusColors[sug.status] || statusColors.pending
                        }`}
                      >
                        {sug.status}
                      </span>
                    </div>
                  </div>

                  {/* Structured Location, Coordinates, Budget & Best Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1">
                      <div className="flex items-center gap-1.5 text-[#ccff00] font-bold text-[11px]">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>Location & Coordinates</span>
                      </div>
                      <p className="text-zinc-200 font-medium">
                        {[sug.area, sug.upazila, sug.district, sug.division].filter(Boolean).join(', ')}
                      </p>
                      {sug.address && <p className="text-zinc-400 text-[11px]">Address: {sug.address}</p>}
                      {sug.latitude !== null && sug.longitude !== null && (
                        <p className="text-[10px] font-mono text-zinc-400">
                          GPS: {Number(sug.latitude).toFixed(5)}, {Number(sug.longitude).toFixed(5)}
                        </p>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1">
                      <div className="flex items-center gap-1.5 text-[#ccff00] font-bold text-[11px]">
                        <Coins className="w-3.5 h-3.5 shrink-0" />
                        <span>Budget & Best Time</span>
                      </div>
                      <p className="text-zinc-200 font-medium">
                        Budget:{' '}
                        {sug.estimated_budget_min !== null && sug.estimated_budget_min !== undefined
                          ? `৳${sug.estimated_budget_min} – ৳${sug.estimated_budget_max || sug.estimated_budget_min}`
                          : 'Not specified'}
                      </p>
                      {sug.best_time_to_visit && (
                        <p className="text-zinc-400 text-[11px]">Best Time: {sug.best_time_to_visit}</p>
                      )}
                    </div>
                  </div>

                  {/* Short Description & Why Worth Visiting */}
                  <div className="space-y-2">
                    {sug.short_description && (
                      <div className="p-3 rounded-xl bg-white/[0.015] border border-white/[0.04] text-xs">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">
                          Short Description
                        </span>
                        <p className="text-zinc-200">{sug.short_description}</p>
                      </div>
                    )}

                    {(sug.why_worth_visiting || sug.description) && (
                      <div className="p-3 rounded-xl bg-white/[0.015] border border-white/[0.04] text-xs">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block mb-0.5">
                          Why Worth Visiting
                        </span>
                        <p className="text-zinc-200 whitespace-pre-wrap">
                          {sug.why_worth_visiting || sug.description}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Suggestion Photos (Up to 2) */}
                  {sug.images && sug.images.length > 0 && (
                    <div className="grid grid-cols-2 gap-2.5">
                      {sug.images.slice(0, 2).map((imgUrl, idx) => (
                        <div
                          key={idx}
                          className="relative rounded-xl overflow-hidden border border-white/10 aspect-[16/10] bg-black"
                        >
                          <img
                            src={imgUrl}
                            alt={`${sug.name} photo ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-[#ccff00]">
                            {idx === 0 ? 'Photo 1 · Primary' : 'Photo 2 · Secondary'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Moderation Note if present */}
                  {sug.moderation_note && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <span className="font-bold">Moderation Note:</span> {sug.moderation_note}
                      </div>
                    </div>
                  )}

                  {/* Footer Toolbar: Date, Actions (Approve, Reject, Hide, Edit/Note, Delete) */}
                  <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2.5">
                    <div className="text-[11px] text-zinc-500 font-mono">
                      Submitted: {new Date(sug.created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {sug.promoted_place_id && (
                        <span className="ml-2 text-emerald-400">· Live Place ID: {sug.promoted_place_id.slice(0, 8)}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Edit / Add Note Button */}
                      <button
                        type="button"
                        onClick={() => openEditSuggestionModal(sug)}
                        disabled={isActing}
                        className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border border-white/[0.1] text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#ccff00]" />
                        <span>Edit / Note</span>
                      </button>

                      {/* Approve Suggestion */}
                      {sug.status !== 'approved' && (
                        <button
                          type="button"
                          onClick={() => handleApproveSuggestion(sug)}
                          disabled={isActing}
                          className="h-8 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approve & Publish</span>
                        </button>
                      )}

                      {/* Reject Suggestion */}
                      {sug.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => handleModerateSuggestionStatus(sug, 'reject')}
                          disabled={isActing}
                          className="h-8 px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      )}

                      {/* Hide Suggestion */}
                      {sug.status !== 'hidden' && (
                        <button
                          type="button"
                          onClick={() => handleModerateSuggestionStatus(sug, 'hide')}
                          disabled={isActing}
                          className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 border border-white/[0.08] text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Hide</span>
                        </button>
                      )}

                      {/* Delete Suggestion */}
                      <button
                        type="button"
                        onClick={() => handleDeleteSuggestion(sug)}
                        disabled={isActing}
                        className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center transition-all disabled:opacity-50 cursor-pointer"
                        title="Permanently Delete Suggestion"
                        aria-label="Permanently Delete Suggestion"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )
        ) : (
          /* TRANSPORT & FARES SECTION */
          <div className="space-y-4">
            {transportSubTab === 'routes' ? (
              /* Routes List */
              transportRoutes.length === 0 ? (
                <div className="py-20 text-center space-y-2 bg-[#111317] border border-white/[0.08] rounded-2xl p-6">
                  <Route className="w-8 h-8 text-[#ccff00]/60 mx-auto mb-1" />
                  <h3 className="text-sm font-bold text-white">No Transport Routes Configured</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                    Add inter-district or regional transit options with realistic fares and durations for OUTERA destinations.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                    <span>Showing {transportRoutes.length} active transit corridors & routes</span>
                    <span className="font-mono text-[#ccff00]">64 Districts Covered</span>
                  </div>

                  {transportRoutes.map((route) => {
                    const isExpanded = expandedRouteId === route.id;
                    return (
                      <div
                        key={route.id}
                        className="p-5 rounded-2xl bg-[#111317] border border-white/[0.08] hover:border-white/[0.14] transition-all space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/20 flex items-center justify-center text-sm font-bold text-[#ccff00] shrink-0">
                              <Bus className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black text-black bg-[#ccff00] px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  {route.transportType}
                                </span>
                                <h3 className="text-sm font-black text-white">
                                  {route.originDistrict} → {route.destinationDistrict}
                                </h3>
                                {route.destinationPlaceNames && route.destinationPlaceNames.length > 0 && (
                                  <span className="text-[10px] font-bold text-[#ccff00] bg-[#ccff00]/10 px-2 py-0.5 rounded-full border border-[#ccff00]/20">
                                    {route.destinationPlaceNames.join(', ')}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-300 font-medium mt-1">
                                {route.fromName} → {route.toName}
                              </p>
                            </div>
                          </div>

                          {/* Fare & Duration Pill */}
                          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 bg-white/[0.03] sm:bg-transparent p-2 sm:p-0 rounded-xl">
                            <span className="text-base font-black text-[#ccff00] font-mono">
                              ৳{route.minFare} – ৳{route.maxFare} ({route.fareUnit || 'per person'})
                            </span>
                            <span className="text-[11px] text-zinc-400 font-mono">
                              ~{Math.floor(route.estimatedDurationMin / 60)}h {route.estimatedDurationMin % 60}m · {route.distanceKm} km
                            </span>
                          </div>
                        </div>

                        {/* Badges Strip */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-bold">
                          <span
                            className={`px-2 py-0.5 rounded-full border ${
                              route.confidence === 'High'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {route.confidence} Confidence
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30 uppercase tracking-wider">
                            Source: {route.sourceType}
                          </span>
                          {route.sourceReference && (
                            <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 border border-white/[0.08]">
                              {route.sourceReference}
                            </span>
                          )}
                          {route.isOutdated && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>May be outdated (&gt;180d)</span>
                            </span>
                          )}
                          {route.isMultiLeg && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">
                              Multi-Leg ({route.legs?.length || 2} steps)
                            </span>
                          )}
                          {route.isCustom && (
                            <span className="px-2 py-0.5 rounded-full bg-[#ccff00]/10 text-[#ccff00] border border-[#ccff00]/30">
                              Custom Admin Route
                            </span>
                          )}
                        </div>

                        {/* Notes */}
                        {route.notes && (
                          <p className="text-xs text-zinc-400 italic bg-white/[0.01] p-2.5 rounded-xl border border-white/[0.04]">
                            "{route.notes}"
                          </p>
                        )}

                        {/* Multi-leg step breakdown toggle */}
                        {route.isMultiLeg && route.legs && route.legs.length > 0 && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => setExpandedRouteId(isExpanded ? null : route.id)}
                              className="text-xs font-bold text-[#ccff00] hover:text-[#d8ff33] flex items-center gap-1.5 transition-colors"
                            >
                              <span>{isExpanded ? 'Hide Step Breakdown' : `Show Step Breakdown (${route.legs.length} legs)`}</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>

                            {isExpanded && (
                              <div className="mt-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                                {route.legs.map((leg, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/[0.02]">
                                    <div className="flex items-center gap-2">
                                      <span className="w-5 h-5 rounded-full bg-white/[0.08] font-mono text-[10px] font-bold text-white flex items-center justify-center">
                                        {idx + 1}
                                      </span>
                                      <span className="text-white font-semibold">
                                        {leg.fromLocation} → {leg.toLocation}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#ccff00]/10 text-[#ccff00] font-bold">
                                        {leg.transportType}
                                      </span>
                                    </div>
                                    <div className="text-right font-mono">
                                      <span className="text-[#ccff00] font-bold">৳{leg.minFare}–{leg.maxFare}</span>
                                      <span className="text-zinc-500 text-[11px] ml-2">~{Math.round(leg.estimatedDurationMin)}m</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action Footer */}
                        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                          <span>Updated: {route.lastUpdated}</span>
                          {route.isCustom && (
                            <button
                              type="button"
                              onClick={() => handleDeleteRoute(route.id)}
                              className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Route</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : transportSubTab === 'reports' ? (
              /* Community Fare Reports List */
              fareReports.length === 0 ? (
                <div className="py-20 text-center space-y-2 bg-[#111317] border border-white/[0.08] rounded-2xl p-6">
                  <Coins className="w-8 h-8 text-[#ccff00]/60 mx-auto mb-1" />
                  <h3 className="text-sm font-bold text-white">No Community Fare Reports</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                    When scouts report actual fares paid on the place transit tabs, submissions will be listed here for verification.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                    <span>Showing {fareReports.length} community submitted fare reports</span>
                    <span className="font-mono text-[#ccff00]">Scout Consensus Active</span>
                  </div>

                  {fareReports.map((report) => {
                    const statusColors: Record<string, string> = {
                      verified: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                      flagged: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                      rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
                    };

                    return (
                      <div
                        key={report.id}
                        className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] hover:border-white/[0.14] transition-all space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-black text-black bg-[#ccff00] px-2 py-0.5 rounded-full uppercase tracking-wider">
                              {report.transportType}
                            </span>
                            <span className="text-sm font-bold text-white">
                              {report.origin} → {report.destination}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-base font-black text-[#ccff00] font-mono">
                              ৳{report.farePaid} ({report.fareUnit || 'per person'})
                            </span>
                            <span
                              className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                statusColors[report.status] || statusColors.verified
                              }`}
                            >
                              {report.status}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-2 font-mono">
                          <span>Reported by {report.authorName} ({report.authorHandle})</span>
                          <span>·</span>
                          <span>Trip Date: {report.tripDate}</span>
                          {report.destinationPlaceName && (
                            <>
                              <span>·</span>
                              <span className="text-zinc-300">Spot: {report.destinationPlaceName}</span>
                            </>
                          )}
                        </div>

                        {report.notes && (
                          <p className="text-xs text-zinc-300 italic bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
                            "{report.notes}"
                          </p>
                        )}

                        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-end gap-2">
                          {report.status !== 'verified' && (
                            <button
                              type="button"
                              onClick={() => handleModerateFare(report.id, 'verified')}
                              className="h-8 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1.5 transition-all"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Verify</span>
                            </button>
                          )}
                          {report.status !== 'rejected' && (
                            <button
                              type="button"
                              onClick={() => handleModerateFare(report.id, 'rejected')}
                              className="h-8 px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteFare(report.id)}
                            className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center transition-all"
                            title="Delete Report"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : transportSubTab === 'contacts' ? (
              /* Local Transport Contacts Moderation */
              localContacts.length === 0 ? (
                <div className="py-16 text-center space-y-2 bg-[#111317] border border-white/[0.08] rounded-2xl p-6">
                  <Phone className="w-7 h-7 text-[#ccff00]/60 mx-auto mb-1" />
                  <h3 className="text-sm font-bold text-white">No Local Transport Contacts Submitted</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Submitted local CNG, Rickshaw, Easy Bike, Car, and Boat contacts appear here for moderation.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localContacts.map((c) => (
                    <div key={c.id} className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#ccff00]/15 text-[#ccff00] font-bold">
                            {c.vehicleType}
                          </span>
                          <h4 className="text-sm font-bold text-white mt-1">
                            {c.name} · <span className="text-zinc-400 font-normal">{c.serviceArea} ({c.district})</span>
                          </h4>
                        </div>
                        <span className="text-[10px] uppercase font-mono px-2.5 py-1 rounded-full bg-white/[0.06] text-zinc-300">
                          {c.status}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-300 flex flex-wrap gap-3">
                        <span>Phone: {c.phone || 'N/A'}</span>
                        <span>WhatsApp: {c.whatsapp || 'N/A'}</span>
                        <span>Public Permission: {c.phonePublicPermission ? 'Yes' : 'No'}</span>
                        {c.rateNote && <span>Rate Note: {c.rateNote}</span>}
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                        <button
                          type="button"
                          onClick={async () => {
                            await moderateLocalTransportContact(c.id, {
                              status: 'approved',
                              contactVerified: true,
                              outeraVerified: true,
                            });
                            showToast(`Approved & verified ${c.name}`);
                            loadData();
                          }}
                          className="h-8 px-3 rounded-lg bg-emerald-500 text-black font-extrabold text-xs cursor-pointer"
                        >
                          Approve & Verify
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await moderateLocalTransportContact(c.id, { status: 'rejected' });
                            showToast(`Rejected ${c.name}`);
                            loadData();
                          }}
                          className="h-8 px-3 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-bold cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* Nearby Services (Stay & Eat) Moderation */
              nearbyServices.length === 0 ? (
                <div className="py-16 text-center space-y-2 bg-[#111317] border border-white/[0.08] rounded-2xl p-6">
                  <Hotel className="w-7 h-7 text-[#ccff00]/60 mx-auto mb-1" />
                  <h3 className="text-sm font-bold text-white">No Nearby Stays or Eat Spots Submitted</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Submitted nearby hotels, resorts, restaurants, and cafes appear here for verification.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {nearbyServices.map((s) => (
                    <div key={s.id} className="p-4 rounded-2xl bg-[#111317] border border-white/[0.08] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#ccff00]/15 text-[#ccff00] font-bold">
                            {(s.serviceGroup || s.category_group || 'stay').toUpperCase()} · {s.category || s.service_type}
                          </span>
                          <h4 className="text-sm font-bold text-white mt-1">
                            {s.name} ({s.district})
                          </h4>
                        </div>
                        <span className="text-[10px] uppercase font-mono px-2.5 py-1 rounded-full bg-white/[0.06] text-zinc-300">
                          {s.status}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-300 flex flex-wrap gap-3">
                        {s.priceRange && <span>Price: {s.priceRange}</span>}
                        {s.foodType && <span>Food: {s.foodType}</span>}
                        {s.contactPhone && <span>Phone: {s.contactPhone}</span>}
                        {s.directionsNote && <span>Directions: {s.directionsNote}</span>}
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                        <button
                          type="button"
                          onClick={async () => {
                            await moderateNearbyService(s.id, {
                              status: 'approved',
                              outeraVerified: true,
                              contactVerified: Boolean(s.contactPhone),
                              communityConfidence: 'Medium',
                            });
                            showToast(`Approved & verified ${s.name}`);
                            loadData();
                          }}
                          className="h-8 px-3 rounded-lg bg-emerald-500 text-black font-extrabold text-xs cursor-pointer"
                        >
                          Approve & Verify
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await moderateNearbyService(s.id, { status: 'rejected' });
                            showToast(`Rejected ${s.name}`);
                            loadData();
                          }}
                          className="h-8 px-3 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-bold cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Edit / Moderate Place Suggestion Modal */}
      {editingSuggestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-[#111317] border border-white/[0.1] rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-[#ccff00] font-bold">
                  Scout Attribution Preserved: {editingSuggestion.author_name} ({editingSuggestion.author_handle})
                </span>
                <h3 className="text-base font-black text-white">
                  Edit & Review Place Suggestion
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSuggestion(null)}
                className="text-zinc-400 hover:text-white text-xs font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Place Name</label>
                <input
                  type="text"
                  value={sugEditName}
                  onChange={(e) => setSugEditName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Category</label>
                <input
                  type="text"
                  value={sugEditCategory}
                  onChange={(e) => setSugEditCategory(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Division</label>
                <input
                  type="text"
                  value={sugEditDivision}
                  onChange={(e) => setSugEditDivision(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">District</label>
                <input
                  type="text"
                  value={sugEditDistrict}
                  onChange={(e) => setSugEditDistrict(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Upazila / City</label>
                <input
                  type="text"
                  value={sugEditUpazila}
                  onChange={(e) => setSugEditUpazila(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Area / Neighborhood</label>
                <input
                  type="text"
                  value={sugEditArea}
                  onChange={(e) => setSugEditArea(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Address</label>
                <input
                  type="text"
                  value={sugEditAddress}
                  onChange={(e) => setSugEditAddress(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={sugEditLat}
                  onChange={(e) => setSugEditLat(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={sugEditLng}
                  onChange={(e) => setSugEditLng(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Budget Min (৳)</label>
                <input
                  type="number"
                  value={sugEditBudgetMin}
                  onChange={(e) => setSugEditBudgetMin(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Budget Max (৳)</label>
                <input
                  type="number"
                  value={sugEditBudgetMax}
                  onChange={(e) => setSugEditBudgetMax(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Best Time to Visit</label>
                <input
                  type="text"
                  value={sugEditBestTime}
                  onChange={(e) => setSugEditBestTime(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white"
                />
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Short Description</label>
                <textarea
                  rows={2}
                  value={sugEditShortDesc}
                  onChange={(e) => setSugEditShortDesc(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Why Worth Visiting</label>
                <textarea
                  rows={2}
                  value={sugEditWhyWorth}
                  onChange={(e) => setSugEditWhyWorth(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Moderation Note (Visible to Scout in Profile)
                </label>
                <textarea
                  rows={2}
                  value={sugEditModNote}
                  onChange={(e) => setSugEditModNote(e.target.value)}
                  placeholder="Add verification note, reason for rejection, or feedback for the Scout..."
                  className="w-full p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white resize-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setEditingSuggestion(null)}
                className="h-9 px-4 rounded-xl bg-white/[0.05] text-zinc-300 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleModerateSuggestionStatus(editingSuggestion, 'edit')}
                className="h-9 px-4 rounded-xl bg-white/[0.1] hover:bg-white/[0.15] text-white text-xs font-bold cursor-pointer"
              >
                Save Edits & Note Only
              </button>
              <button
                type="button"
                onClick={() => handleModerateSuggestionStatus(editingSuggestion, 'reject')}
                className="h-9 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold cursor-pointer"
              >
                Reject with Note
              </button>
              <button
                type="button"
                onClick={() => handleApproveSuggestion(editingSuggestion, true)}
                className="h-9 px-5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs uppercase tracking-wider cursor-pointer"
              >
                Approve & Publish Place
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Add / Edit Transport Route Modal */}
      {showAddRouteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-[#111317] border border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#ccff00]/10 text-[#ccff00] flex items-center justify-center">
                  <Bus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-white tracking-tight">Add Transport Route & Fare</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddRouteModal(false)}
                className="text-zinc-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRoute} className="space-y-4">
              {/* Origin & Destination Districts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Origin District
                  </label>
                  <select
                    value={newRouteOriginDistrict}
                    onChange={(e) => {
                      setNewRouteOriginDistrict(e.target.value);
                      if (!newRouteFromName) setNewRouteFromName(`${e.target.value} Bus Terminal`);
                    }}
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                  >
                    {Array.from(
                      new Set(BANGLADESH_DIVISIONS.flatMap((div) => div.districts.map((d) => d.name)))
                    )
                      .sort()
                      .map((d) => (
                        <option key={d} value={d} className="bg-zinc-900 text-white">
                          {d}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Destination District
                  </label>
                  <select
                    value={newRouteDestDistrict}
                    onChange={(e) => {
                      setNewRouteDestDistrict(e.target.value);
                      if (!newRouteToName) setNewRouteToName(`${e.target.value} Central`);
                    }}
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                  >
                    {Array.from(
                      new Set(BANGLADESH_DIVISIONS.flatMap((div) => div.districts.map((d) => d.name)))
                    )
                      .sort()
                      .map((d) => (
                        <option key={d} value={d} className="bg-zinc-900 text-white">
                          {d}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Specific Place Name (Optional) */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Specific Place / Destination Spot (Optional)
                </label>
                <input
                  type="text"
                  value={newRouteDestPlaceName}
                  onChange={(e) => setNewRouteDestPlaceName(e.target.value)}
                  placeholder="e.g. Sajek Valley, Kuakata Beach, Panam Nagar, Nilgiri"
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                />
              </div>

              {/* From & To Station/Stop Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    From (Station / Stop)
                  </label>
                  <input
                    type="text"
                    required
                    value={newRouteFromName}
                    onChange={(e) => setNewRouteFromName(e.target.value)}
                    placeholder="e.g. Dhaka (Sayedabad / Arambagh)"
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    To (Drop-off / Point)
                  </label>
                  <input
                    type="text"
                    required
                    value={newRouteToName}
                    onChange={(e) => setNewRouteToName(e.target.value)}
                    placeholder="e.g. Kolatoli / Laboni Beach"
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
              </div>

              {/* Transport Type & Confidence */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Transport Type
                  </label>
                  <select
                    value={newRouteTransportType}
                    onChange={(e) => setNewRouteTransportType(e.target.value as TransportType)}
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                  >
                    {(['Bus', 'Train', 'CNG / Auto', 'Rickshaw', 'Easy Bike / E-bike', 'Launch / Boat', 'Private Car'] as TransportType[]).map((t) => (
                      <option key={t} value={t} className="bg-zinc-900 text-white">
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Fare Confidence
                  </label>
                  <select
                    value={newRouteConfidence}
                    onChange={(e) => setNewRouteConfidence(e.target.value as FareConfidence)}
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                  >
                    <option value="High" className="bg-zinc-900 text-white">High (Verified / Fixed)</option>
                    <option value="Medium" className="bg-zinc-900 text-white">Medium (Market Range)</option>
                    <option value="Low" className="bg-zinc-900 text-white">Low (Subject to Bargain)</option>
                  </select>
                </div>
              </div>

              {/* Min & Max Fare */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Min Fare (৳ BDT)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newRouteMinFare}
                    onChange={(e) => setNewRouteMinFare(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Max Fare (৳ BDT)
                  </label>
                  <input
                    type="number"
                    required
                    min={newRouteMinFare}
                    value={newRouteMaxFare}
                    onChange={(e) => setNewRouteMaxFare(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
              </div>

              {/* Duration (mins) & Distance (km) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    required
                    min={5}
                    value={newRouteDurationMin}
                    onChange={(e) => setNewRouteDurationMin(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                  />
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    ~{Math.floor(newRouteDurationMin / 60)}h {newRouteDurationMin % 60}m
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Distance (KM)
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newRouteDistanceKm}
                    onChange={(e) => setNewRouteDistanceKm(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
              </div>

              {/* Source Type & Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Source Type
                  </label>
                  <select
                    value={newRouteSourceType}
                    onChange={(e) => setNewRouteSourceType(e.target.value as FareSourceType)}
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-[#ccff00]"
                  >
                    <option value="OFFICIAL" className="bg-zinc-900 text-white">OFFICIAL (BRTA / Railway / BIWTA)</option>
                    <option value="OPERATOR" className="bg-zinc-900 text-white">OPERATOR (Verified Bus / Boat Line)</option>
                    <option value="COMMUNITY" className="bg-zinc-900 text-white">COMMUNITY (Scout Consensus)</option>
                    <option value="ESTIMATED" className="bg-zinc-900 text-white">ESTIMATED (Calculated)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    Source Reference / Operator
                  </label>
                  <input
                    type="text"
                    value={newRouteSourceRef}
                    onChange={(e) => setNewRouteSourceRef(e.target.value)}
                    placeholder="e.g. Bangladesh Railway / Hanif AC / Parjatak"
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
              </div>

              {/* Multi-Leg Route Toggle */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRouteIsMultiLeg}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setNewRouteIsMultiLeg(checked);
                      if (checked && newRouteLegs.length === 0) {
                        setNewRouteLegs([
                          {
                            fromLocation: newRouteFromName || 'Origin',
                            toLocation: 'Transit Hub',
                            transportType: 'Bus',
                            minFare: Math.round(newRouteMinFare * 0.6),
                            maxFare: Math.round(newRouteMaxFare * 0.6),
                            estimatedDurationMin: Math.round(newRouteDurationMin * 0.6),
                          },
                          {
                            fromLocation: 'Transit Hub',
                            toLocation: newRouteToName || 'Destination',
                            transportType: 'CNG / Auto',
                            minFare: Math.round(newRouteMinFare * 0.4),
                            maxFare: Math.round(newRouteMaxFare * 0.4),
                            estimatedDurationMin: Math.round(newRouteDurationMin * 0.4),
                          },
                        ]);
                      }
                    }}
                    className="rounded text-[#ccff00] focus:ring-0"
                  />
                  <span>Is this a Multi-Leg Route? (e.g. Highway Coach + Ferry/Chander Gari)</span>
                </label>

                {newRouteIsMultiLeg && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400">
                      <span>Route Steps ({newRouteLegs.length})</span>
                      <button
                        type="button"
                        onClick={() =>
                          setNewRouteLegs([
                            ...newRouteLegs,
                            {
                              fromLocation: `Step ${newRouteLegs.length + 1} Point`,
                              toLocation: 'Destination',
                              transportType: 'Easy Bike / E-bike',
                              minFare: 50,
                              maxFare: 100,
                              estimatedDurationMin: 30,
                            },
                          ])
                        }
                        className="text-[#ccff00] hover:underline"
                      >
                        + Add Step
                      </button>
                    </div>

                    {newRouteLegs.map((leg, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05] space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">Step {idx + 1}</span>
                          {newRouteLegs.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setNewRouteLegs(newRouteLegs.filter((_, i) => i !== idx))}
                              className="text-red-400 hover:text-red-300 text-[11px]"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={leg.fromLocation}
                            onChange={(e) => {
                              const updated = [...newRouteLegs];
                              updated[idx].fromLocation = e.target.value;
                              setNewRouteLegs(updated);
                            }}
                            placeholder="From"
                            className="h-8 px-2 rounded bg-black/40 border border-white/[0.08] text-white text-[11px]"
                          />
                          <input
                            type="text"
                            value={leg.toLocation}
                            onChange={(e) => {
                              const updated = [...newRouteLegs];
                              updated[idx].toLocation = e.target.value;
                              setNewRouteLegs(updated);
                            }}
                            placeholder="To"
                            className="h-8 px-2 rounded bg-black/40 border border-white/[0.08] text-white text-[11px]"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={leg.transportType}
                            onChange={(e) => {
                              const updated = [...newRouteLegs];
                              updated[idx].transportType = e.target.value as TransportType;
                              setNewRouteLegs(updated);
                            }}
                            className="h-8 px-1.5 rounded bg-black/40 border border-white/[0.08] text-white text-[11px]"
                          >
                            {(['Bus', 'Train', 'CNG / Auto', 'Rickshaw', 'Easy Bike / E-bike', 'Launch / Boat', 'Private Car'] as TransportType[]).map((t) => (
                              <option key={t} value={t} className="bg-zinc-900">{t}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={leg.minFare}
                            onChange={(e) => {
                              const updated = [...newRouteLegs];
                              updated[idx].minFare = Number(e.target.value);
                              setNewRouteLegs(updated);
                            }}
                            placeholder="Min ৳"
                            className="h-8 px-2 rounded bg-black/40 border border-white/[0.08] text-white text-[11px]"
                          />
                          <input
                            type="number"
                            value={leg.maxFare}
                            onChange={(e) => {
                              const updated = [...newRouteLegs];
                              updated[idx].maxFare = Number(e.target.value);
                              setNewRouteLegs(updated);
                            }}
                            placeholder="Max ৳"
                            className="h-8 px-2 rounded bg-black/40 border border-white/[0.08] text-white text-[11px]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Route Notes & Tips (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newRouteNotes}
                  onChange={(e) => setNewRouteNotes(e.target.value)}
                  placeholder="e.g. Advance booking recommended. High demand on Thursday nights."
                  className="w-full p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ccff00] resize-none"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowAddRouteModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-zinc-300 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-[#ccff00]/15"
                >
                  Save Transport Route
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
