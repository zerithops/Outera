// Supabase Edge Function: admin-manage-users
// Enforces server-side JWT verification, database role='admin' check,
// primary admin protection, and immutable audit logging.

import { createClient } from '@supabase/supabase-js';

declare const Deno:
  | {
      env: {
        get(key: string): string | undefined;
      };
      serve?: (handler: (req: Request) => Response | Promise<Response>) => void;
    }
  | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const MAIN_ADMIN_USER_ID = '65215d11-9637-40e8-91d9-daf831fd1acf';
const MAIN_ADMIN_USERNAME = 'zerith_65215d11';
const MAIN_ADMIN_EMAIL = 'zerithofficial7@gmail.com';

function isProtectedMainAdmin(profile: { id?: string; username?: string; email?: string }) {
  const id = String(profile?.id || '').trim().toLowerCase();
  const username = String(profile?.username || '').replace(/^@/, '').trim().toLowerCase();
  const email = String(profile?.email || '').trim().toLowerCase();
  return (
    id === MAIN_ADMIN_USER_ID.toLowerCase() ||
    username === MAIN_ADMIN_USERNAME.toLowerCase() ||
    email === MAIN_ADMIN_EMAIL.toLowerCase()
  );
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
      const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Missing Bearer token.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.slice(7).trim();
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: authData, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Invalid session token.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(
      supabaseUrl,
      supabaseServiceRoleKey || supabaseAnonKey,
      supabaseServiceRoleKey
        ? undefined
        : { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Forbidden: Server-side admin role verification failed.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = body.action || 'list_users';

    if (action === 'update_role' || action === 'suspend_account' || action === 'reactivate_account') {
      const targetUserId = String(body.targetUserId || '').trim();
      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .maybeSingle();

      if (!targetProfile) {
        return new Response(
          JSON.stringify({ success: false, error: 'Target user not found.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (
        isProtectedMainAdmin(targetProfile) &&
        (action === 'suspend_account' || (action === 'update_role' && body.newRole !== 'admin'))
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              'Protected Account: The primary OUTERA administrator account cannot be suspended or demoted.',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: rpcRes, error: rpcErr } = await userClient.rpc('admin_manage_user_account', {
        p_target_user_id: targetUserId,
        p_action: action,
        p_new_role: body.newRole || null,
        p_reason: body.reason || null,
      });

      if (rpcErr) {
        return new Response(
          JSON.stringify({ success: false, error: rpcErr.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ success: true, result: rpcRes }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profiles } = await adminClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    return new Response(JSON.stringify({ success: true, users: profiles || [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, error: err?.message || 'Internal error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  });
}
