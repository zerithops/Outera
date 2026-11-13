import { createClient } from '@supabase/supabase-js';
import {
  OUTERA_PLACE_CANONICAL_ORIGIN,
  buildPlaceUniqueSlug,
} from './placeUrl';
import {
  buildPostSlugWithId,
  getPostUniqueId,
} from './postUrl';

// Use only public/publishable Supabase credentials — never use or expose service-role keys
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://znyglvfsbxyjsctphigm.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_1lRtsi9_-0131cjmSg76BQ_w8wzpFF3';

const serverSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const REMOVED_TEST_PLACE_IDS = new Set([
  'cbc6ab88-7d9b-4da6-be3e-ca498b0e828f',
  '4e10637f-c1dc-46d3-9efa-cf2aae8c0ed8',
  '980b49a1-5685-4406-8564-d73885e365fe',
]);
const REMOVED_TEST_NAMES = new Set(['hbbb', 'hshs']);

// Explicitly excluded route prefixes (Admin, Dashboard, Auth, Private Profiles, Saved, API)
const EXCLUDED_SITEMAP_PATH_PREFIXES = [
  '/admin',
  '/dashboard',
  '/login',
  '/signin',
  '/signup',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/profile',
  '/user',
  '/u/',
  '/account',
  '/settings',
  '/saved',
  '/api',
];

// Allowed public route patterns in OUTERA
const VALID_PUBLIC_ROUTE_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/explore$/,
  /^\/surprise$/,
  /^\/trips$/,
  /^\/bangladesh$/,
  /^\/location\/(dhaka|chattogram|sylhet|rajshahi|khulna|barishal|rangpur|mymensingh)$/,
  /^\/place\/[a-z0-9-]+$/,
  /^\/p\/[a-z0-9-]+$/,
];

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function resolvePublicBucketUrl(storagePath?: string | null): string {
  if (!storagePath || typeof storagePath !== 'string') return '';
  const trimmed = storagePath.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return '';
  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('http://')) return trimmed.replace(/^http:\/\//i, 'https://');
  if (trimmed.startsWith('/')) return `${OUTERA_PLACE_CANONICAL_ORIGIN}${trimmed}`;
  const clean = trimmed.replace(/^\/+/, '').replace(/^community-review-media\//, '');
  return `${SUPABASE_URL}/storage/v1/object/public/community-review-media/${encodeURI(clean)}`;
}

/**
 * Extracts a reliable W3C ISO-8601 date (`YYYY-MM-DD`) from a database timestamp.
 * Returns `undefined` if the timestamp is missing or invalid so we never emit unreliable dates.
 */
export function formatReliableLastMod(rawTimestamp?: string | null): string | undefined {
  if (!rawTimestamp || typeof rawTimestamp !== 'string') return undefined;
  const trimmed = rawTimestamp.trim();
  if (!trimmed) return undefined;

  const parsedMs = Date.parse(trimmed);
  if (Number.isNaN(parsedMs) || parsedMs <= 0) return undefined;

  const isoDate = new Date(parsedMs).toISOString().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return undefined;
  return isoDate;
}

/**
 * Checks if a URL or pathname belongs to an excluded route (admin, dashboard, login, register, profile, etc.).
 */
export function isExcludedFromSitemap(urlOrPath: string): boolean {
  if (!urlOrPath || typeof urlOrPath !== 'string') return true;
  let pathname = urlOrPath.trim();
  try {
    if (/^https?:\/\//i.test(pathname)) {
      const parsed = new URL(pathname);
      if (parsed.origin !== OUTERA_PLACE_CANONICAL_ORIGIN) {
        return true;
      }
      pathname = parsed.pathname;
    }
  } catch {
    return true;
  }

  const cleanPath = ('/' + pathname.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
  const lower = cleanPath.toLowerCase();

  for (const prefix of EXCLUDED_SITEMAP_PATH_PREFIXES) {
    const lowPrefix = prefix.toLowerCase().replace(/\/+$/, '');
    if (lower === lowPrefix || lower.startsWith(`${lowPrefix}/`)) {
      return true;
    }
  }

  return !VALID_PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(cleanPath));
}

export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: string;
  imageLoc?: string;
  imageTitle?: string;
}

export interface SitemapValidationResult {
  valid: boolean;
  errors: string[];
  totalUrls: number;
  uniqueUrls: number;
}

/**
 * Validates the generated XML sitemap structure, canonical domain, duplicate URLs, and route validity.
 */
export function validateSitemapOutput(
  xml: string,
  entries: SitemapUrlEntry[]
): SitemapValidationResult {
  const errors: string[] = [];

  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
    errors.push('Missing standard XML declaration header.');
  }
  if (!xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')) {
    errors.push('Missing <urlset> root element with standard sitemaps.org namespace.');
  }
  if (!xml.trim().endsWith('</urlset>')) {
    errors.push('Missing closing </urlset> tag.');
  }

  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.loc.startsWith(OUTERA_PLACE_CANONICAL_ORIGIN)) {
      errors.push(`Non-canonical domain in <loc>: ${entry.loc}`);
    }
    if (entry.loc.includes('://www.')) {
      errors.push(`Duplicate www subdomain found in <loc>: ${entry.loc}`);
    }
    if (seen.has(entry.loc)) {
      errors.push(`Duplicate URL detected in sitemap: ${entry.loc}`);
    }
    seen.add(entry.loc);

    if (isExcludedFromSitemap(entry.loc)) {
      errors.push(`Forbidden or invalid route included in sitemap: ${entry.loc}`);
    }

    if (entry.lastmod && !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod)) {
      errors.push(`Invalid <lastmod> format for ${entry.loc}: ${entry.lastmod}`);
    }
  }

  // Verify <loc> count in rendered XML matches entries length
  const locMatches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
  if (locMatches.length !== entries.length) {
    errors.push(
      `XML <loc> tag count (${locMatches.length}) does not match entries count (${entries.length}).`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    totalUrls: entries.length,
    uniqueUrls: seen.size,
  };
}

/**
 * Generates the complete dynamic XML sitemap for `https://outerabd.buzz`
 * containing only public, approved, indexable pages and places.
 */
export async function generateDynamicSitemapXml(): Promise<{
  xml: string;
  urlCount: number;
  placeCount: number;
  postCount: number;
  entries: SitemapUrlEntry[];
  validation: SitemapValidationResult;
}> {
  const entries: SitemapUrlEntry[] = [];
  const seenUrls = new Set<string>();

  const addEntry = (entry: SitemapUrlEntry): boolean => {
    const cleanUrl = entry.loc
      .trim()
      .replace(/^https?:\/\/www\.outerabd\.buzz/i, OUTERA_PLACE_CANONICAL_ORIGIN)
      .replace(/\/+$/, '') || OUTERA_PLACE_CANONICAL_ORIGIN;
    const normalizedLoc =
      cleanUrl === OUTERA_PLACE_CANONICAL_ORIGIN ? `${OUTERA_PLACE_CANONICAL_ORIGIN}/` : cleanUrl;

    if (seenUrls.has(normalizedLoc)) return false;
    if (isExcludedFromSitemap(normalizedLoc)) return false;

    seenUrls.add(normalizedLoc);
    entries.push({
      ...entry,
      loc: normalizedLoc,
    });
    return true;
  };

  // Track latest database modification timestamps for hub pages
  let latestGlobalLastMod: string | undefined;
  const divisionLatestLastMod = new Map<string, string>();

  const updateLatestTimestamps = (lastmod?: string, division?: string | null) => {
    if (!lastmod) return;
    if (!latestGlobalLastMod || lastmod > latestGlobalLastMod) {
      latestGlobalLastMod = lastmod;
    }
    if (division && typeof division === 'string') {
      const divKey = division.trim().toLowerCase();
      const prev = divisionLatestLastMod.get(divKey);
      if (!prev || lastmod > prev) {
        divisionLatestLastMod.set(divKey, lastmod);
      }
    }
  };

  // Fetch Approved, Publicly Visible Places from Supabase (`public.places`)
  const placeEntries: SitemapUrlEntry[] = [];
  const approvedPlaceIds = new Set<string>();
  let placeCount = 0;

  try {
    let placesData: any[] | null = null;
    const { data: withImages, error: joinError } = await serverSupabase
      .from('places')
      .select('id, name, slug, category, division, status, created_at, updated_at, place_images(image_url)')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false });

    if (!joinError && Array.isArray(withImages)) {
      placesData = withImages;
    } else {
      // Graceful fallback if place_images relation fails
      const { data: fallbackPlaces } = await serverSupabase
        .from('places')
        .select('id, name, slug, category, division, status, created_at, updated_at')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false });
      if (Array.isArray(fallbackPlaces)) {
        placesData = fallbackPlaces;
      }
    }

    if (Array.isArray(placesData)) {
      for (const row of placesData) {
        if (!row || !row.id) continue;
        const rowId = String(row.id).trim();
        const normName = String(row.name || '').trim().toLowerCase();
        if (!normName) continue;

        // Exclude removed test places, deleted records, or non-approved statuses
        if (REMOVED_TEST_PLACE_IDS.has(rowId) || REMOVED_TEST_NAMES.has(normName)) continue;
        if ((row as any).deleted_at) continue;
        if (typeof row.status !== 'string' || row.status.trim().toLowerCase() !== 'approved') {
          continue;
        }

        approvedPlaceIds.add(rowId);

        const uniqueSlug = buildPlaceUniqueSlug({
          id: rowId,
          name: row.name,
          slug: row.slug,
        });

        const placeUrl = `${OUTERA_PLACE_CANONICAL_ORIGIN}/place/${uniqueSlug}`;
        const lastmod =
          formatReliableLastMod(row.updated_at) || formatReliableLastMod(row.created_at);

        updateLatestTimestamps(lastmod, row.division);

        let coverImg = '';
        if (Array.isArray(row.place_images) && row.place_images.length > 0) {
          coverImg = resolvePublicBucketUrl(row.place_images[0]?.image_url);
        }

        placeEntries.push({
          loc: placeUrl,
          lastmod,
          changefreq: 'weekly',
          priority: '0.9',
          imageLoc: coverImg || undefined,
          imageTitle: row.name ? `${row.name} (${row.category || 'Spot'}) — OUTERA` : undefined,
        });
      }
    }
  } catch (err: any) {
    console.warn('Sitemap places query notice:', err?.message || 'Unable to query places');
  }

  // Fetch Approved, Non-Deleted Community Posts from Supabase (`public.place_posts`)
  const postEntries: SitemapUrlEntry[] = [];
  let postCount = 0;

  try {
    const { data: postsData, error: postsErr } = await serverSupabase
      .from('place_posts')
      .select(
        'id, place_id, title, slug, short_id, status, deleted_at, created_at, updated_at, places(id, name, status)'
      )
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!postsErr && Array.isArray(postsData)) {
      for (const post of postsData) {
        if (!post || !post.id) continue;
        if (String(post.status || '').toLowerCase() !== 'approved' || post.deleted_at) continue;

        const placeObj = Array.isArray(post.places) ? post.places[0] : (post.places as any);
        if (
          placeObj &&
          typeof placeObj.status === 'string' &&
          placeObj.status.toLowerCase() !== 'approved'
        ) {
          continue;
        }
        if (post.place_id && REMOVED_TEST_PLACE_IDS.has(String(post.place_id))) {
          continue;
        }

        const shortId = getPostUniqueId({ id: post.id, short_id: post.short_id });
        const postSlug = buildPostSlugWithId({
          id: post.id,
          title: post.title,
          place_name: placeObj?.name,
          slug: post.slug,
          short_id: shortId,
        });

        const postUrl = `${OUTERA_PLACE_CANONICAL_ORIGIN}/p/${postSlug}`;
        const lastmod =
          formatReliableLastMod(post.updated_at) || formatReliableLastMod(post.created_at);

        updateLatestTimestamps(lastmod);

        postEntries.push({
          loc: postUrl,
          lastmod,
          changefreq: 'weekly',
          priority: '0.7',
        });
      }
    }
  } catch (err: any) {
    console.warn('Sitemap posts query notice:', err?.message || 'Unable to query place_posts');
  }

  // 1. Primary Public Core & Regional Hub Routes
  addEntry({
    loc: `${OUTERA_PLACE_CANONICAL_ORIGIN}/`,
    lastmod: latestGlobalLastMod,
    changefreq: 'daily',
    priority: '1.0',
  });

  const publicHubPaths: {
    path: string;
    priority: string;
    freq: 'daily' | 'weekly';
    divisionKey?: string;
  }[] = [
    { path: '/explore', priority: '0.8', freq: 'daily' },
    { path: '/surprise', priority: '0.7', freq: 'weekly' },
    { path: '/trips', priority: '0.8', freq: 'weekly' },
    { path: '/bangladesh', priority: '0.8', freq: 'daily' },
    { path: '/location/dhaka', priority: '0.8', freq: 'weekly', divisionKey: 'dhaka' },
    { path: '/location/chattogram', priority: '0.8', freq: 'weekly', divisionKey: 'chattogram' },
    { path: '/location/sylhet', priority: '0.8', freq: 'weekly', divisionKey: 'sylhet' },
    { path: '/location/rajshahi', priority: '0.7', freq: 'weekly', divisionKey: 'rajshahi' },
    { path: '/location/khulna', priority: '0.7', freq: 'weekly', divisionKey: 'khulna' },
    { path: '/location/barishal', priority: '0.7', freq: 'weekly', divisionKey: 'barishal' },
    { path: '/location/rangpur', priority: '0.7', freq: 'weekly', divisionKey: 'rangpur' },
    { path: '/location/mymensingh', priority: '0.7', freq: 'weekly', divisionKey: 'mymensingh' },
  ];

  for (const hub of publicHubPaths) {
    const hubLastMod = hub.divisionKey
      ? divisionLatestLastMod.get(hub.divisionKey) || latestGlobalLastMod
      : latestGlobalLastMod;
    addEntry({
      loc: `${OUTERA_PLACE_CANONICAL_ORIGIN}${hub.path}`,
      lastmod: hubLastMod,
      changefreq: hub.freq,
      priority: hub.priority,
    });
  }

  // 2. Add Approved Place Pages (/place/{unique-slug})
  for (const placeEntry of placeEntries) {
    if (addEntry(placeEntry)) {
      placeCount += 1;
    }
  }

  // 3. Add Approved Community Post Pages (/p/{slug})
  for (const postEntry of postEntries) {
    if (addEntry(postEntry)) {
      postCount += 1;
    }
  }

  const urlNodes = entries
    .map((entry) => {
      const lastmodXml = entry.lastmod
        ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`
        : '';
      const imageXml = entry.imageLoc
        ? `\n    <image:image>\n      <image:loc>${escapeXml(entry.imageLoc)}</image:loc>${
            entry.imageTitle
              ? `\n      <image:title>${escapeXml(entry.imageTitle)}</image:title>`
              : ''
          }\n    </image:image>`
        : '';
      return `  <url>
    <loc>${escapeXml(entry.loc)}</loc>${lastmodXml}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>${imageXml}
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlNodes}
</urlset>
`;

  const validation = validateSitemapOutput(xml, entries);

  return {
    xml,
    urlCount: entries.length,
    placeCount,
    postCount,
    entries,
    validation,
  };
}
