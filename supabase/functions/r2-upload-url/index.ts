// Supabase Edge Function: r2-upload-url
// Generates presigned HTTP PUT URLs for uploading images directly to Cloudflare R2 ("outera-media").
// Security:
// - Requires a valid Supabase user JWT in the Authorization header.
// - Enforces allowed image MIME types (JPG, JPEG, PNG, WEBP) and max file size (5MB).
// - Generates server-controlled object keys scoped to the authenticated user ID.
// - Never exposes Cloudflare R2 credentials to the client.

declare const Deno:
  | {
      env: {
        get(key: string): string | undefined;
      };
      serve?: (handler: (req: Request) => Response | Promise<Response>) => void;
    }
  | undefined;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const ALLOWED_SCOPES = new Set(['posts', 'suggestions', 'avatars', 'places', 'reviews']);
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const DEFAULT_BUCKET = 'outera-media';

function getEnv(key: string): string {
  if (typeof Deno !== 'undefined' && Deno?.env) {
    return Deno.env.get(key) ?? '';
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] ?? '';
  }
  return '';
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return toHex(hash);
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message) as BufferSource);
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function createR2PresignedPutUrl(params: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const region = 'auto';
  const service = 's3';
  const expiresIn = params.expiresInSeconds ?? 600;
  const host = `${params.accountId}.r2.cloudflarestorage.com`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const encodedKey = params.objectKey
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/');
  const canonicalUri = `/${encodeRfc3986(params.bucket)}/${encodedKey}`;

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${params.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'content-type;host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `content-type:${params.contentType}\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await getSignatureKey(params.secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

export async function handleR2UploadUrlRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader) {
      return jsonResponse(
        { code: 'UNAUTHORIZED_NO_AUTH_HEADER', message: 'Missing authorization header' },
        401
      );
    }

    const supabaseUrl = (getEnv('SUPABASE_URL') || 'https://znyglvfsbxyjsctphigm.supabase.co').replace(/\/+$/, '');
    const supabaseAnonKey =
      getEnv('SUPABASE_ANON_KEY') || 'sb_publishable_1lRtsi9_-0131cjmSg76BQ_w8wzpFF3';

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        apikey: supabaseAnonKey,
      },
    });

    if (!userRes.ok) {
      return jsonResponse({ error: 'Invalid user session' }, 401);
    }

    const user = (await userRes.json().catch(() => null)) as { id?: string } | null;
    if (!user || !user.id) {
      return jsonResponse({ error: 'Invalid user session' }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const rawContentType = String(
      body.contentType || body.fileType || body.mimeType || ''
    )
      .trim()
      .toLowerCase();

    if (!ALLOWED_CONTENT_TYPES.has(rawContentType)) {
      return jsonResponse(
        { error: 'Invalid file type. Only JPG, JPEG, PNG, and WEBP images are allowed.' },
        400
      );
    }

    const normalizedContentType = rawContentType === 'image/jpg' ? 'image/jpeg' : rawContentType;
    const fileSize = Number(body.fileSize ?? body.size ?? 0);
    if (Number.isFinite(fileSize) && fileSize > MAX_FILE_SIZE_BYTES) {
      return jsonResponse(
        { error: 'File exceeds the 5MB maximum size limit.' },
        400
      );
    }

    const rawScope = String(body.scope || body.folder || 'posts').trim().toLowerCase();
    const scope = ALLOWED_SCOPES.has(rawScope) ? rawScope : 'posts';

    const ext =
      normalizedContentType === 'image/png'
        ? 'png'
        : normalizedContentType === 'image/webp'
        ? 'webp'
        : 'jpg';

    const randomId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const objectKey = `${scope}/${user.id}/${Date.now()}-${randomId}.${ext}`;

    const accountId = getEnv('R2_ACCOUNT_ID');
    const accessKeyId = getEnv('R2_ACCESS_KEY_ID');
    const secretAccessKey = getEnv('R2_SECRET_ACCESS_KEY');
    const bucket = getEnv('R2_BUCKET_NAME') || DEFAULT_BUCKET;
    const publicBaseUrl = (getEnv('R2_PUBLIC_URL') || getEnv('VITE_R2_PUBLIC_URL') || '')
      .trim()
      .replace(/\/+$/, '');

    if (!accountId || !accessKeyId || !secretAccessKey) {
      return jsonResponse(
        { error: 'R2 storage credentials are not configured on the Edge Function.' },
        500
      );
    }

    const uploadUrl = await createR2PresignedPutUrl({
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      objectKey,
      contentType: normalizedContentType,
      expiresInSeconds: 600,
    });

    const publicUrl = publicBaseUrl ? `${publicBaseUrl}/${objectKey}` : undefined;

    return jsonResponse({
      uploadUrl,
      objectKey,
      key: objectKey,
      publicUrl,
      bucket,
      contentType: normalizedContentType,
      expiresIn: 600,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return jsonResponse({ error: message }, 500);
  }
}

if (typeof Deno !== 'undefined' && typeof Deno?.serve === 'function') {
  Deno.serve(handleR2UploadUrlRequest);
}

