import { supabase, getCurrentSession, getCurrentUser, fetchProfile } from './supabase';

export const MAIN_ADMIN_USER_ID = '65215d11-9637-40e8-91d9-daf831fd1acf';
export const MAIN_ADMIN_USERNAME = 'zerith_65215d11';
export const MAIN_ADMIN_EMAIL = 'zerithofficial7@gmail.com';

export type UserRoleType = 'user' | 'moderator' | 'admin';
export type AccountStatusType = 'active' | 'suspended';

export interface AdminAuditLogItem {
  id: string;
  actor_id: string;
  actor_username: string;
  actor_email?: string | null;
  target_user_id: string;
  target_username: string;
  target_display_name: string;
  action_type: 'update_role' | 'suspend_account' | 'reactivate_account' | 'verify_user';
  previous_value: string;
  new_value: string;
  reason: string | null;
  created_at: string;
}

export interface AdminUserRecentPost {
  id: string;
  place_id: string;
  title: string;
  content: string;
  status: string;
  rating: number;
  created_at: string;
}

export interface AdminUserRecentSuggestion {
  id: string;
  name: string;
  category: string;
  district: string;
  status: string;
  created_at: string;
}

export interface AdminManagedUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  email_visibility: 'authorized' | 'protected_by_auth_rls';
  avatar_url: string | null;
  bio: string | null;
  home_location_id: string | null;
  role: UserRoleType;
  account_status: AccountStatusType;
  suspended_at: string | null;
  suspended_reason: string | null;
  is_verified: boolean;
  is_primary_admin: boolean;
  followers_count: number;
  following_count: number;
  created_at: string;
  updated_at: string;
  posts_count: number;
  approved_posts_count: number;
  suggestions_count: number;
  reports_count: number;
  recent_posts: AdminUserRecentPost[];
  recent_suggestions: AdminUserRecentSuggestion[];
  audit_history: AdminAuditLogItem[];
}

export function isProtectedMainAdmin(profile: {
  id?: string | null;
  username?: string | null;
  email?: string | null;
}): boolean {
  if (!profile) return false;
  const id = String(profile.id || '').trim().toLowerCase();
  const username = String(profile.username || '').replace(/^@/, '').trim().toLowerCase();
  const email = String(profile.email || '').trim().toLowerCase();
  return (
    id === MAIN_ADMIN_USER_ID.toLowerCase() ||
    username === MAIN_ADMIN_USERNAME.toLowerCase() ||
    email === MAIN_ADMIN_EMAIL.toLowerCase()
  );
}

/**
 * Verifies that the current user is authenticated AND holds the `admin` role
 * on the backend (`is_admin()` RPC + `public.profiles` check).
 */
export async function verifyAdminAuthorization(): Promise<{
  authorized: boolean;
  accessToken?: string;
  callerId?: string;
  callerUsername?: string;
  callerEmail?: string;
  error?: string;
}> {
  try {
    const session = await getCurrentSession();
    const user = session?.user || (await getCurrentUser());
    if (!user || !session?.access_token) {
      return {
        authorized: false,
        error: 'Authentication required: Please sign in with an administrator account.',
      };
    }

    // Verify against database profile & RPC
    const [profile, rpcRes] = await Promise.all([
      fetchProfile(user.id),
      supabase.rpc('is_admin'),
    ]);

    const isPrimary = isProtectedMainAdmin({
      id: user.id,
      username: profile?.username,
      email: user.email,
    });

    const isRpcAdmin = rpcRes.data === true;
    const isProfileAdmin = profile?.role === 'admin' || isPrimary;

    if (!isRpcAdmin && !isProfileAdmin) {
      return {
        authorized: false,
        error: 'Unauthorized: Administrator privileges required.',
      };
    }

    return {
      authorized: true,
      accessToken: session.access_token,
      callerId: user.id,
      callerUsername: profile?.username || user.email?.split('@')[0] || 'admin',
      callerEmail: user.email || '',
    };
  } catch (err: any) {
    return {
      authorized: false,
      error: err?.message || 'Failed to verify administrator authorization.',
    };
  }
}

/**
 * Checks whether a given user ID is currently suspended.
 */
export async function checkUserSuspensionStatus(userId: string): Promise<{
  suspended: boolean;
  reason?: string | null;
}> {
  if (!userId) return { suspended: false };
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, role, bio')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return { suspended: false };
    if (isProtectedMainAdmin({ id: profile.id, username: profile.username })) {
      return { suspended: false };
    }

    if ((profile as any).account_status === 'suspended' || profile.role === 'suspended') {
      return {
        suspended: true,
        reason: (profile as any).suspended_reason || 'Account suspended by administrator.',
      };
    }

    const { data: auditRows } = await supabase
      .from('activities')
      .select('metadata, created_at')
      .eq('activity_type', 'admin_audit')
      .eq('target_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (Array.isArray(auditRows)) {
      const latestStatusAudit = auditRows.find(
        (r: any) =>
          r.metadata?.action_type === 'suspend_account' ||
          r.metadata?.action_type === 'reactivate_account'
      );
      if (latestStatusAudit?.metadata?.action_type === 'suspend_account') {
        return {
          suspended: true,
          reason: latestStatusAudit.metadata.reason || 'Account suspended by administrator.',
        };
      }
    }

    return { suspended: false };
  } catch {
    return { suspended: false };
  }
}

/**
 * Fetches all registered users and audit logs via the secure server-side `/api/admin-users` endpoint.
 */
export async function fetchAdminUsersAndLogs(): Promise<{
  success: boolean;
  users: AdminManagedUser[];
  auditLogs: AdminAuditLogItem[];
  error?: string;
}> {
  const auth = await verifyAdminAuthorization();
  if (!auth.authorized || !auth.accessToken) {
    return {
      success: false,
      users: [],
      auditLogs: [],
      error: auth.error || 'Unauthorized: Admin role required.',
    };
  }

  try {
    const response = await fetch('/api/admin-users?action=list_users', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const payload = await response.json();
      if (payload && payload.success && Array.isArray(payload.users)) {
        return {
          success: true,
          users: payload.users,
          auditLogs: Array.isArray(payload.auditLogs) ? payload.auditLogs : [],
        };
      }
    } else {
      const errData = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          users: [],
          auditLogs: [],
          error: errData?.error || 'Forbidden: Admin authorization required.',
        };
      }
    }
  } catch (err) {
    console.warn('Server API /api/admin-users notice, falling back to authenticated RLS query:', err);
  }

  // Authenticated RLS fallback if serverless route is unreachable in static preview
  try {
    const [profilesRes, postsRes, sugsRes, reportsRes, auditsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase
        .from('place_posts')
        .select('id, user_id, place_id, title, content, status, rating, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('place_suggestions')
        .select('id, user_id, name, category, district, status, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('reports')
        .select('id, reporter_id, reason, status, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('activities')
        .select('*')
        .eq('activity_type', 'admin_audit')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const rawProfiles = profilesRes.data || [];
    const allPosts = postsRes.data || [];
    const allSugs = sugsRes.data || [];
    const allReports = reportsRes.data || [];
    const rawAudits = auditsRes.data || [];

    const auditLogs: AdminAuditLogItem[] = rawAudits.map((row: any) => {
      const meta = row.metadata || {};
      return {
        id: String(row.id),
        actor_id: String(row.user_id || meta.actor_id || auth.callerId),
        actor_username: String(meta.actor_username || auth.callerUsername || 'admin'),
        actor_email: meta.actor_email || null,
        target_user_id: String(row.target_id || meta.target_user_id || ''),
        target_username: String(meta.target_username || row.target_title || 'user'),
        target_display_name: String(meta.target_display_name || row.target_title || 'User'),
        action_type: meta.action_type || 'update_role',
        previous_value: String(meta.previous_value || ''),
        new_value: String(meta.new_value || ''),
        reason: meta.reason || null,
        created_at: String(row.created_at || new Date().toISOString()),
      };
    });

    const users: AdminManagedUser[] = rawProfiles.map((p: any) => {
      const userId = String(p.id);
      const isPrimary = isProtectedMainAdmin({ id: userId, username: p.username });
      const userAudits = auditLogs.filter((a) => a.target_user_id === userId);
      const latestRoleAudit = userAudits.find((a) => a.action_type === 'update_role');
      const latestStatusAudit = userAudits.find(
        (a) => a.action_type === 'suspend_account' || a.action_type === 'reactivate_account'
      );

      let role: UserRoleType = 'user';
      if (isPrimary) {
        role = 'admin';
      } else if (latestRoleAudit && ['user', 'moderator', 'admin'].includes(latestRoleAudit.new_value)) {
        role = latestRoleAudit.new_value as UserRoleType;
      } else if (p.role === 'admin' || p.role === 'moderator') {
        role = p.role;
      }

      let account_status: AccountStatusType = 'active';
      let suspended_reason: string | null = null;
      let suspended_at: string | null = null;

      if (!isPrimary) {
        if (latestStatusAudit) {
          account_status =
            latestStatusAudit.action_type === 'suspend_account' ? 'suspended' : 'active';
          suspended_reason = account_status === 'suspended' ? latestStatusAudit.reason : null;
          suspended_at = account_status === 'suspended' ? latestStatusAudit.created_at : null;
        } else if (p.account_status === 'suspended' || p.role === 'suspended') {
          account_status = 'suspended';
          suspended_reason = p.suspended_reason || 'Suspended by administrator';
          suspended_at = p.suspended_at || p.updated_at || null;
        }
      }

      let email: string | null = null;
      if (userId === auth.callerId && auth.callerEmail) {
        email = auth.callerEmail;
      } else if (isPrimary) {
        email = MAIN_ADMIN_EMAIL;
      } else if (typeof p.email === 'string' && p.email.includes('@')) {
        email = p.email;
      }

      const userPosts = allPosts.filter((pt: any) => pt.user_id === userId);
      const userSugs = allSugs.filter((sg: any) => sg.user_id === userId);
      const userReports = allReports.filter((rp: any) => rp.reporter_id === userId);

      return {
        id: userId,
        username: p.username || `user_${userId.slice(0, 8)}`,
        display_name: p.display_name || p.username || 'OUTERA User',
        email,
        email_visibility: email ? 'authorized' : 'protected_by_auth_rls',
        avatar_url: p.avatar_url || null,
        bio: p.bio || null,
        home_location_id: p.home_location_id || null,
        role,
        account_status,
        suspended_at,
        suspended_reason,
        is_verified: Boolean(p.is_verified || isPrimary),
        is_primary_admin: isPrimary,
        followers_count: Number(p.followers_count || 0),
        following_count: Number(p.following_count || 0),
        created_at: p.created_at || new Date().toISOString(),
        updated_at: p.updated_at || p.created_at || new Date().toISOString(),
        posts_count: userPosts.length,
        approved_posts_count: userPosts.filter((pt: any) => pt.status === 'approved').length,
        suggestions_count: userSugs.length,
        reports_count: userReports.length,
        recent_posts: userPosts.slice(0, 10),
        recent_suggestions: userSugs.slice(0, 10),
        audit_history: userAudits.slice(0, 20),
      };
    });

    return {
      success: true,
      users,
      auditLogs,
    };
  } catch (err: any) {
    return {
      success: false,
      users: [],
      auditLogs: [],
      error: err?.message || 'Failed to load registered users.',
    };
  }
}

/**
 * Updates a user's role strictly through server-side authorization (`/api/admin-users`).
 * Protects the primary admin account (`zerith_65215d11`) from demotion.
 */
export async function adminUpdateUserRoleServer(params: {
  targetUserId: string;
  targetUsername?: string;
  newRole: UserRoleType;
  reason?: string;
}): Promise<{
  success: boolean;
  error?: string;
  auditEntry?: AdminAuditLogItem;
}> {
  const auth = await verifyAdminAuthorization();
  if (!auth.authorized || !auth.accessToken) {
    return {
      success: false,
      error: auth.error || 'Unauthorized: Admin role required.',
    };
  }

  if (
    isProtectedMainAdmin({ id: params.targetUserId, username: params.targetUsername }) &&
    params.newRole !== 'admin'
  ) {
    return {
      success: false,
      error:
        'Protected Account: The primary OUTERA administrator account (Zerith) cannot be demoted.',
    };
  }

  if (params.targetUserId === auth.callerId && params.newRole !== 'admin') {
    return {
      success: false,
      error: 'Safety Check: You cannot demote your own administrator account.',
    };
  }

  try {
    const response = await fetch('/api/admin-users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        action: 'update_role',
        targetUserId: params.targetUserId,
        newRole: params.newRole,
        reason: params.reason || '',
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      return {
        success: false,
        error: payload?.error || 'Server rejected role update.',
      };
    }

    return {
      success: true,
      auditEntry: payload.auditEntry,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to execute server-side role update.',
    };
  }
}

/**
 * Suspends or reactivates a user account via secure server-side authorization (`/api/admin-users`).
 * Protects the primary admin account (`zerith_65215d11`) from suspension.
 */
export async function adminSetUserSuspensionServer(params: {
  targetUserId: string;
  targetUsername?: string;
  suspend: boolean;
  reason?: string;
}): Promise<{
  success: boolean;
  error?: string;
  auditEntry?: AdminAuditLogItem;
}> {
  const auth = await verifyAdminAuthorization();
  if (!auth.authorized || !auth.accessToken) {
    return {
      success: false,
      error: auth.error || 'Unauthorized: Admin role required.',
    };
  }

  if (
    params.suspend &&
    isProtectedMainAdmin({ id: params.targetUserId, username: params.targetUsername })
  ) {
    return {
      success: false,
      error:
        'Protected Account: The primary OUTERA administrator account (Zerith) cannot be suspended.',
    };
  }

  if (params.suspend && params.targetUserId === auth.callerId) {
    return {
      success: false,
      error: 'Safety Check: You cannot suspend your own administrator account.',
    };
  }

  try {
    const response = await fetch('/api/admin-users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        action: params.suspend ? 'suspend_account' : 'reactivate_account',
        targetUserId: params.targetUserId,
        reason:
          params.reason ||
          (params.suspend
            ? 'Suspended by administrator for policy violation'
            : 'Account reactivated by administrator'),
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      return {
        success: false,
        error: payload?.error || 'Server rejected account status update.',
      };
    }

    return {
      success: true,
      auditEntry: payload.auditEntry,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to update user account status.',
    };
  }
}
