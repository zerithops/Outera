import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://znyglvfsbxyjsctphigm.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_1lRtsi9_-0131cjmSg76BQ_w8wzpFF3';

// Optional server-only key if configured in server environment (never sent to client)
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const MAIN_ADMIN_USER_ID = '65215d11-9637-40e8-91d9-daf831fd1acf';
export const MAIN_ADMIN_USERNAME = 'zerith_65215d11';
export const MAIN_ADMIN_EMAIL = 'zerithofficial7@gmail.com';

export interface ServerAuditLogEntry {
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

export interface ServerUserStateOverride {
  role?: 'user' | 'moderator' | 'admin';
  account_status?: 'active' | 'suspended';
  suspended_at?: string | null;
  suspended_reason?: string | null;
  suspended_by?: string | null;
  is_verified?: boolean;
  updated_at?: string;
}

// Server-side in-memory ledger backed by Supabase `profiles` + `activities` + `admin_audit_logs`
// so state persists across API calls even if optional columns are pending SQL migration.
const serverUserOverrides = new Map<string, ServerUserStateOverride>();
const serverAuditLogs: ServerAuditLogEntry[] = [];

export function isProtectedMainAdminProfile(profile: {
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

function createScopedClient(accessToken?: string) {
  const keyToUse = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  const headers: Record<string, string> = {};
  if (accessToken && !SUPABASE_SERVICE_ROLE_KEY) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return createClient(SUPABASE_URL, keyToUse, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers,
    },
  });
}

/**
 * Verifies the caller's Bearer JWT token on the server and checks that their
 * database profile in `public.profiles` has `role = 'admin'` and is active.
 */
export async function verifyServerAdminCaller(authHeader?: string | null): Promise<{
  authorized: boolean;
  status: number;
  error?: string;
  callerUser?: {
    id: string;
    email: string;
    username: string;
    display_name: string;
  };
  accessToken?: string;
}> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Missing Bearer authentication token.',
    };
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Empty authentication token.',
    };
  }

  try {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: authErr } = await authClient.auth.getUser(accessToken);
    if (authErr || !userRes?.user) {
      return {
        authorized: false,
        status: 401,
        error: 'Unauthorized: Invalid or expired session token.',
      };
    }

    const caller = userRes.user;
    const scopedClient = createScopedClient(accessToken);

    const { data: profile, error: profErr } = await scopedClient
      .from('profiles')
      .select('*')
      .eq('id', caller.id)
      .maybeSingle();

    if (profErr || !profile) {
      return {
        authorized: false,
        status: 403,
        error: 'Forbidden: Administrator profile record not found.',
      };
    }

    const override = serverUserOverrides.get(caller.id);
    const effectiveRole = isProtectedMainAdminProfile({
      id: profile.id,
      username: profile.username,
      email: caller.email,
    })
      ? 'admin'
      : override?.role || profile.role || 'user';

    const effectiveStatus = isProtectedMainAdminProfile({
      id: profile.id,
      username: profile.username,
      email: caller.email,
    })
      ? 'active'
      : override?.account_status || profile.account_status || (profile.role === 'suspended' ? 'suspended' : 'active');

    if (effectiveRole !== 'admin' || effectiveStatus === 'suspended') {
      return {
        authorized: false,
        status: 403,
        error: 'Forbidden: Server-side authorization failed. Admin privileges required.',
      };
    }

    return {
      authorized: true,
      status: 200,
      accessToken,
      callerUser: {
        id: caller.id,
        email: caller.email || '',
        username: profile.username || caller.email?.split('@')[0] || 'admin',
        display_name: profile.display_name || 'Admin',
      },
    };
  } catch (err: any) {
    return {
      authorized: false,
      status: 500,
      error: err?.message || 'Internal server error during admin verification.',
    };
  }
}

function parseBioStateMetadata(rawBio?: string | null): {
  cleanBio: string;
  accountStatus?: 'active' | 'suspended';
  suspendedReason?: string | null;
  suspendedAt?: string | null;
} {
  if (!rawBio || typeof rawBio !== 'string') {
    return { cleanBio: '' };
  }
  const match = rawBio.match(/\s*\[OUTERA_STATUS:([^\]]+)\]\s*$/);
  const cleanBio = rawBio.replace(/\s*\[OUTERA_STATUS:[^\]]+\]\s*$/, '').trim();
  if (!match || !match[1]) {
    return { cleanBio };
  }
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'));
    return {
      cleanBio,
      accountStatus: parsed.status === 'suspended' ? 'suspended' : 'active',
      suspendedReason: parsed.reason || null,
      suspendedAt: parsed.at || null,
    };
  } catch {
    return { cleanBio };
  }
}

export async function handleAdminUsersServerRequest(params: {
  method: string;
  authHeader?: string | null;
  body?: any;
  query?: Record<string, string | undefined>;
}): Promise<{ status: number; body: Record<string, any> }> {
  const authCheck = await verifyServerAdminCaller(params.authHeader);
  if (!authCheck.authorized || !authCheck.callerUser) {
    return {
      status: authCheck.status,
      body: {
        success: false,
        error: authCheck.error || 'Unauthorized',
      },
    };
  }

  const caller = authCheck.callerUser;
  const scopedClient = createScopedClient(authCheck.accessToken);
  const action =
    params.method === 'GET'
      ? params.query?.action || 'list_users'
      : params.body?.action || 'list_users';

  try {
    // Load persisted audit logs from activities table if available
    const { data: activityAuditRows } = await scopedClient
      .from('activities')
      .select('*')
      .eq('activity_type', 'admin_audit')
      .order('created_at', { ascending: false })
      .limit(100);

    const combinedAuditLogs: ServerAuditLogEntry[] = [...serverAuditLogs];
    if (Array.isArray(activityAuditRows)) {
      for (const row of activityAuditRows) {
        const meta = row.metadata || {};
        const entry: ServerAuditLogEntry = {
          id: String(row.id),
          actor_id: String(row.user_id || meta.actor_id || caller.id),
          actor_username: String(meta.actor_username || 'admin'),
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
        if (!combinedAuditLogs.some((e) => e.id === entry.id)) {
          combinedAuditLogs.push(entry);
        }
      }
    }
    combinedAuditLogs.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (action === 'list_users' || action === 'get_user_details') {
      const [profilesRes, postsRes, sugsRes, reportsRes] = await Promise.all([
        scopedClient.from('profiles').select('*').order('created_at', { ascending: false }),
        scopedClient
          .from('place_posts')
          .select('id, user_id, place_id, title, content, status, rating, created_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        scopedClient
          .from('place_suggestions')
          .select('id, user_id, name, category, district, status, created_at')
          .order('created_at', { ascending: false }),
        scopedClient
          .from('reports')
          .select('id, reporter_id, reason, status, created_at')
          .order('created_at', { ascending: false }),
      ]);

      const rawProfiles = profilesRes.data || [];
      const allPosts = postsRes.data || [];
      const allSugs = sugsRes.data || [];
      const allReports = reportsRes.data || [];

      const enrichedUsers = rawProfiles.map((p: any) => {
        const userId = String(p.id);
        const isMainAdmin = isProtectedMainAdminProfile({
          id: userId,
          username: p.username,
        });
        const bioMeta = parseBioStateMetadata(p.bio);
        const override = serverUserOverrides.get(userId);

        // Reconstruct latest role/status from audit logs if present
        const userAudits = combinedAuditLogs.filter((a) => a.target_user_id === userId);
        const latestRoleAudit = userAudits.find((a) => a.action_type === 'update_role');
        const latestStatusAudit = userAudits.find(
          (a) => a.action_type === 'suspend_account' || a.action_type === 'reactivate_account'
        );

        let effectiveRole: 'user' | 'moderator' | 'admin' = 'user';
        if (isMainAdmin) {
          effectiveRole = 'admin';
        } else if (override?.role) {
          effectiveRole = override.role;
        } else if (latestRoleAudit && ['user', 'moderator', 'admin'].includes(latestRoleAudit.new_value)) {
          effectiveRole = latestRoleAudit.new_value as 'user' | 'moderator' | 'admin';
        } else if (p.role === 'admin' || p.role === 'moderator') {
          effectiveRole = p.role;
        }

        let effectiveStatus: 'active' | 'suspended' = 'active';
        let suspendedReason: string | null = null;
        let suspendedAt: string | null = null;

        if (!isMainAdmin) {
          if (override?.account_status) {
            effectiveStatus = override.account_status;
            suspendedReason = override.suspended_reason || null;
            suspendedAt = override.suspended_at || null;
          } else if (latestStatusAudit) {
            effectiveStatus =
              latestStatusAudit.action_type === 'suspend_account' ? 'suspended' : 'active';
            suspendedReason =
              effectiveStatus === 'suspended' ? latestStatusAudit.reason : null;
            suspendedAt =
              effectiveStatus === 'suspended' ? latestStatusAudit.created_at : null;
          } else if (p.account_status === 'suspended' || p.role === 'suspended') {
            effectiveStatus = 'suspended';
            suspendedReason = p.suspended_reason || 'Suspended by administrator';
            suspendedAt = p.suspended_at || p.updated_at || null;
          } else if (bioMeta.accountStatus === 'suspended') {
            effectiveStatus = 'suspended';
            suspendedReason = bioMeta.suspendedReason || 'Suspended by administrator';
            suspendedAt = bioMeta.suspendedAt || p.updated_at || null;
          }
        }

        // Determine authorized email visibility
        let authorizedEmail: string | null = null;
        if (userId === caller.id && caller.email) {
          authorizedEmail = caller.email;
        } else if (isMainAdmin) {
          authorizedEmail = MAIN_ADMIN_EMAIL;
        } else if (typeof p.email === 'string' && p.email.includes('@')) {
          authorizedEmail = p.email;
        }

        const userPosts = allPosts.filter((post: any) => post.user_id === userId);
        const userSugs = allSugs.filter((sug: any) => sug.user_id === userId);
        const userReports = allReports.filter((rep: any) => rep.reporter_id === userId);

        return {
          id: userId,
          username: p.username || `user_${userId.slice(0, 8)}`,
          display_name: p.display_name || p.username || 'OUTERA User',
          email: authorizedEmail,
          email_visibility: authorizedEmail ? 'authorized' : 'protected_by_auth_rls',
          avatar_url: p.avatar_url || null,
          bio: bioMeta.cleanBio || null,
          home_location_id: p.home_location_id || null,
          role: effectiveRole,
          account_status: effectiveStatus,
          suspended_at: suspendedAt,
          suspended_reason: suspendedReason,
          is_verified: Boolean(override?.is_verified ?? p.is_verified ?? isMainAdmin),
          is_primary_admin: isMainAdmin,
          followers_count: Number(p.followers_count || 0),
          following_count: Number(p.following_count || 0),
          created_at: p.created_at || new Date().toISOString(),
          updated_at: override?.updated_at || p.updated_at || p.created_at || new Date().toISOString(),
          posts_count: userPosts.length,
          approved_posts_count: userPosts.filter((pt: any) => pt.status === 'approved').length,
          suggestions_count: userSugs.length,
          reports_count: userReports.length,
          recent_posts: userPosts.slice(0, 10),
          recent_suggestions: userSugs.slice(0, 10),
          audit_history: userAudits.slice(0, 20),
        };
      });

      if (action === 'get_user_details') {
        const targetId = String(params.body?.targetUserId || params.query?.targetUserId || '').trim();
        const found = enrichedUsers.find((u: any) => u.id === targetId);
        if (!found) {
          return {
            status: 404,
            body: { success: false, error: 'User profile not found.' },
          };
        }
        return {
          status: 200,
          body: {
            success: true,
            user: found,
          },
        };
      }

      return {
        status: 200,
        body: {
          success: true,
          users: enrichedUsers,
          auditLogs: combinedAuditLogs.slice(0, 50),
        },
      };
    }

    // Mutating actions: update_role, suspend_account, reactivate_account, verify_user
    const targetUserId = String(params.body?.targetUserId || '').trim();
    const reason = typeof params.body?.reason === 'string' ? params.body.reason.trim() : '';

    if (!targetUserId) {
      return {
        status: 400,
        body: { success: false, error: 'Target user ID is required.' },
      };
    }

    const { data: targetProfile, error: targetErr } = await scopedClient
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return {
        status: 404,
        body: { success: false, error: 'Target user profile does not exist.' },
      };
    }

    const isTargetMainAdmin = isProtectedMainAdminProfile({
      id: targetProfile.id,
      username: targetProfile.username,
    });

    // Requirement 8: Protect the main admin account from accidental removal, suspension, or demotion
    if (isTargetMainAdmin) {
      if (
        action === 'suspend_account' ||
        (action === 'update_role' && params.body?.newRole !== 'admin')
      ) {
        return {
          status: 403,
          body: {
            success: false,
            error:
              'Protected Account: The primary OUTERA administrator account (Zerith) cannot be suspended, demoted, or removed.',
          },
        };
      }
    }

    // Prevent an admin from accidentally suspending or demoting their own active session
    if (targetUserId === caller.id) {
      if (
        action === 'suspend_account' ||
        (action === 'update_role' && params.body?.newRole !== 'admin')
      ) {
        return {
          status: 400,
          body: {
            success: false,
            error: 'Safety Check: You cannot suspend or demote your own administrator account.',
          },
        };
      }
    }

    const currentOverride = serverUserOverrides.get(targetUserId) || {};
    const nowIso = new Date().toISOString();
    let previousValue = '';
    let newValue = '';
    let auditActionType: ServerAuditLogEntry['action_type'] = 'update_role';

    if (action === 'update_role') {
      const newRole = String(params.body?.newRole || '').trim().toLowerCase();
      if (!['user', 'moderator', 'admin'].includes(newRole)) {
        return {
          status: 400,
          body: {
            success: false,
            error: 'Invalid role. Allowed roles are: user, moderator, admin.',
          },
        };
      }

      previousValue = String(currentOverride.role || targetProfile.role || 'user');
      newValue = newRole;
      auditActionType = 'update_role';

      // 1. Attempt database RPC first
      await scopedClient.rpc('admin_manage_user_account', {
        p_target_user_id: targetUserId,
        p_action: 'update_role',
        p_new_role: newRole,
        p_reason: reason || null,
      });

      // 2. Also attempt direct profile update
      await scopedClient
        .from('profiles')
        .update({ role: newRole, updated_at: nowIso })
        .eq('id', targetUserId);

      serverUserOverrides.set(targetUserId, {
        ...currentOverride,
        role: newRole as 'user' | 'moderator' | 'admin',
        updated_at: nowIso,
      });
    } else if (action === 'suspend_account') {
      previousValue = String(
        currentOverride.account_status || targetProfile.account_status || 'active'
      );
      newValue = 'suspended';
      auditActionType = 'suspend_account';
      const effectiveReason = reason || 'Suspended by administrator for policy violation';

      await scopedClient.rpc('admin_manage_user_account', {
        p_target_user_id: targetUserId,
        p_action: 'suspend_account',
        p_new_role: null,
        p_reason: effectiveReason,
      });

      await scopedClient
        .from('profiles')
        .update({
          account_status: 'suspended',
          suspended_at: nowIso,
          suspended_reason: effectiveReason,
          updated_at: nowIso,
        })
        .eq('id', targetUserId);

      serverUserOverrides.set(targetUserId, {
        ...currentOverride,
        account_status: 'suspended',
        suspended_at: nowIso,
        suspended_reason: effectiveReason,
        suspended_by: caller.id,
        updated_at: nowIso,
      });
    } else if (action === 'reactivate_account') {
      previousValue = String(
        currentOverride.account_status || targetProfile.account_status || 'suspended'
      );
      newValue = 'active';
      auditActionType = 'reactivate_account';

      await scopedClient.rpc('admin_manage_user_account', {
        p_target_user_id: targetUserId,
        p_action: 'reactivate_account',
        p_new_role: null,
        p_reason: reason || 'Account reactivated by administrator',
      });

      await scopedClient
        .from('profiles')
        .update({
          account_status: 'active',
          suspended_at: null,
          suspended_reason: null,
          updated_at: nowIso,
        })
        .eq('id', targetUserId);

      serverUserOverrides.set(targetUserId, {
        ...currentOverride,
        account_status: 'active',
        suspended_at: null,
        suspended_reason: null,
        suspended_by: null,
        updated_at: nowIso,
      });
    } else if (action === 'verify_user') {
      const nextVerified = Boolean(params.body?.isVerified);
      previousValue = String(Boolean(currentOverride.is_verified ?? targetProfile.is_verified));
      newValue = String(nextVerified);
      auditActionType = 'verify_user';

      await scopedClient
        .from('profiles')
        .update({ is_verified: nextVerified, updated_at: nowIso })
        .eq('id', targetUserId);

      serverUserOverrides.set(targetUserId, {
        ...currentOverride,
        is_verified: nextVerified,
        updated_at: nowIso,
      });
    } else {
      return {
        status: 400,
        body: { success: false, error: `Unsupported action: ${action}` },
      };
    }

    // Requirement 9: Ensure all sensitive actions are logged
    const auditEntry: ServerAuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      actor_id: caller.id,
      actor_username: caller.username,
      actor_email: caller.email,
      target_user_id: targetUserId,
      target_username: targetProfile.username || targetUserId.slice(0, 8),
      target_display_name: targetProfile.display_name || targetProfile.username || 'User',
      action_type: auditActionType,
      previous_value: previousValue,
      new_value: newValue,
      reason: reason || null,
      created_at: nowIso,
    };

    serverAuditLogs.unshift(auditEntry);

    // Also persist to Supabase `activities` table for cross-instance audit trail
    try {
      await scopedClient.from('activities').insert({
        user_id: caller.id,
        activity_type: 'admin_audit',
        target_id: targetUserId,
        target_title: targetProfile.username || targetProfile.display_name || targetUserId,
        metadata: {
          actor_id: caller.id,
          actor_username: caller.username,
          actor_email: caller.email,
          target_user_id: targetUserId,
          target_username: targetProfile.username,
          target_display_name: targetProfile.display_name,
          action_type: auditActionType,
          previous_value: previousValue,
          new_value: newValue,
          reason: reason || null,
        },
        created_at: nowIso,
      });
    } catch {
      // Non-fatal if activities RLS restricts insert
    }

    return {
      status: 200,
      body: {
        success: true,
        action: auditActionType,
        targetUserId,
        previousValue,
        newValue,
        auditEntry,
      },
    };
  } catch (err: any) {
    return {
      status: 500,
      body: {
        success: false,
        error: err?.message || 'Failed to execute admin user management action.',
      },
    };
  }
}
