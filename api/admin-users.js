import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://znyglvfsbxyjsctphigm.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_1lRtsi9_-0131cjmSg76BQ_w8wzpFF3';

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const MAIN_ADMIN_USER_ID = '65215d11-9637-40e8-91d9-daf831fd1acf';
const MAIN_ADMIN_USERNAME = 'zerith_65215d11';
const MAIN_ADMIN_EMAIL = 'zerithofficial7@gmail.com';

const serverUserOverrides = new Map();
const serverAuditLogs = [];

function isProtectedMainAdminProfile(profile) {
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

function createScopedClient(accessToken) {
  const keyToUse = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  const headers = {};
  if (accessToken && !SUPABASE_SERVICE_ROLE_KEY) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return createClient(SUPABASE_URL, keyToUse, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
}

async function verifyServerAdminCaller(authHeader) {
  if (!authHeader || !String(authHeader).toLowerCase().startsWith('bearer ')) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Missing Bearer authentication token.',
    };
  }

  const accessToken = String(authHeader).slice(7).trim();
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
      : override?.account_status ||
        profile.account_status ||
        (profile.role === 'suspended' ? 'suspended' : 'active');

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
  } catch (err) {
    return {
      authorized: false,
      status: 500,
      error: err?.message || 'Internal server error during admin verification.',
    };
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const authCheck = await verifyServerAdminCaller(authHeader);
  if (!authCheck.authorized || !authCheck.callerUser) {
    return res.status(authCheck.status).json({
      success: false,
      error: authCheck.error || 'Unauthorized',
    });
  }

  const caller = authCheck.callerUser;
  const scopedClient = createScopedClient(authCheck.accessToken);
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const action =
    req.method === 'GET'
      ? (req.query && req.query.action) || 'list_users'
      : body.action || 'list_users';

  try {
    const { data: activityAuditRows } = await scopedClient
      .from('activities')
      .select('*')
      .eq('activity_type', 'admin_audit')
      .order('created_at', { ascending: false })
      .limit(100);

    const combinedAuditLogs = [...serverAuditLogs];
    if (Array.isArray(activityAuditRows)) {
      for (const row of activityAuditRows) {
        const meta = row.metadata || {};
        const entry = {
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

      const enrichedUsers = rawProfiles.map((p) => {
        const userId = String(p.id);
        const isMainAdmin = isProtectedMainAdminProfile({
          id: userId,
          username: p.username,
        });
        const override = serverUserOverrides.get(userId);
        const userAudits = combinedAuditLogs.filter((a) => a.target_user_id === userId);
        const latestRoleAudit = userAudits.find((a) => a.action_type === 'update_role');
        const latestStatusAudit = userAudits.find(
          (a) => a.action_type === 'suspend_account' || a.action_type === 'reactivate_account'
        );

        let effectiveRole = 'user';
        if (isMainAdmin) {
          effectiveRole = 'admin';
        } else if (override?.role) {
          effectiveRole = override.role;
        } else if (
          latestRoleAudit &&
          ['user', 'moderator', 'admin'].includes(latestRoleAudit.new_value)
        ) {
          effectiveRole = latestRoleAudit.new_value;
        } else if (p.role === 'admin' || p.role === 'moderator') {
          effectiveRole = p.role;
        }

        let effectiveStatus = 'active';
        let suspendedReason = null;
        let suspendedAt = null;

        if (!isMainAdmin) {
          if (override?.account_status) {
            effectiveStatus = override.account_status;
            suspendedReason = override.suspended_reason || null;
            suspendedAt = override.suspended_at || null;
          } else if (latestStatusAudit) {
            effectiveStatus =
              latestStatusAudit.action_type === 'suspend_account' ? 'suspended' : 'active';
            suspendedReason = effectiveStatus === 'suspended' ? latestStatusAudit.reason : null;
            suspendedAt = effectiveStatus === 'suspended' ? latestStatusAudit.created_at : null;
          } else if (p.account_status === 'suspended' || p.role === 'suspended') {
            effectiveStatus = 'suspended';
            suspendedReason = p.suspended_reason || 'Suspended by administrator';
            suspendedAt = p.suspended_at || p.updated_at || null;
          }
        }

        let authorizedEmail = null;
        if (userId === caller.id && caller.email) {
          authorizedEmail = caller.email;
        } else if (isMainAdmin) {
          authorizedEmail = MAIN_ADMIN_EMAIL;
        } else if (typeof p.email === 'string' && p.email.includes('@')) {
          authorizedEmail = p.email;
        }

        const userPosts = allPosts.filter((post) => post.user_id === userId);
        const userSugs = allSugs.filter((sug) => sug.user_id === userId);
        const userReports = allReports.filter((rep) => rep.reporter_id === userId);

        return {
          id: userId,
          username: p.username || `user_${userId.slice(0, 8)}`,
          display_name: p.display_name || p.username || 'OUTERA User',
          email: authorizedEmail,
          email_visibility: authorizedEmail ? 'authorized' : 'protected_by_auth_rls',
          avatar_url: p.avatar_url || null,
          bio: p.bio || null,
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
          approved_posts_count: userPosts.filter((pt) => pt.status === 'approved').length,
          suggestions_count: userSugs.length,
          reports_count: userReports.length,
          recent_posts: userPosts.slice(0, 10),
          recent_suggestions: userSugs.slice(0, 10),
          audit_history: userAudits.slice(0, 20),
        };
      });

      if (action === 'get_user_details') {
        const targetId = String(body.targetUserId || (req.query && req.query.targetUserId) || '').trim();
        const found = enrichedUsers.find((u) => u.id === targetId);
        if (!found) {
          return res.status(404).json({ success: false, error: 'User profile not found.' });
        }
        return res.status(200).json({ success: true, user: found });
      }

      return res.status(200).json({
        success: true,
        users: enrichedUsers,
        auditLogs: combinedAuditLogs.slice(0, 50),
      });
    }

    const targetUserId = String(body.targetUserId || '').trim();
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'Target user ID is required.' });
    }

    const { data: targetProfile, error: targetErr } = await scopedClient
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return res.status(404).json({ success: false, error: 'Target user profile does not exist.' });
    }

    const isTargetMainAdmin = isProtectedMainAdminProfile({
      id: targetProfile.id,
      username: targetProfile.username,
    });

    if (isTargetMainAdmin) {
      if (
        action === 'suspend_account' ||
        (action === 'update_role' && body.newRole !== 'admin')
      ) {
        return res.status(403).json({
          success: false,
          error:
            'Protected Account: The primary OUTERA administrator account (Zerith) cannot be suspended, demoted, or removed.',
        });
      }
    }

    if (targetUserId === caller.id) {
      if (
        action === 'suspend_account' ||
        (action === 'update_role' && body.newRole !== 'admin')
      ) {
        return res.status(400).json({
          success: false,
          error: 'Safety Check: You cannot suspend or demote your own administrator account.',
        });
      }
    }

    const currentOverride = serverUserOverrides.get(targetUserId) || {};
    const nowIso = new Date().toISOString();
    let previousValue = '';
    let newValue = '';
    let auditActionType = 'update_role';

    if (action === 'update_role') {
      const newRole = String(body.newRole || '').trim().toLowerCase();
      if (!['user', 'moderator', 'admin'].includes(newRole)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role. Allowed roles are: user, moderator, admin.',
        });
      }

      previousValue = String(currentOverride.role || targetProfile.role || 'user');
      newValue = newRole;
      auditActionType = 'update_role';

      await scopedClient.rpc('admin_manage_user_account', {
        p_target_user_id: targetUserId,
        p_action: 'update_role',
        p_new_role: newRole,
        p_reason: reason || null,
      });

      await scopedClient
        .from('profiles')
        .update({ role: newRole, updated_at: nowIso })
        .eq('id', targetUserId);

      serverUserOverrides.set(targetUserId, {
        ...currentOverride,
        role: newRole,
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
    } else {
      return res.status(400).json({ success: false, error: `Unsupported action: ${action}` });
    }

    const auditEntry = {
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
    } catch {}

    return res.status(200).json({
      success: true,
      action: auditActionType,
      targetUserId,
      previousValue,
      newValue,
      auditEntry,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to execute admin user management action.',
    });
  }
}
