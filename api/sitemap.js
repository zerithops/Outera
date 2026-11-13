import { createClient } from '@supabase/supabase-js';

// Use only public/publishable Supabase credentials — never use or expose service-role keys
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://znyglvfsbxyjsctphigm.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_1lRtsi9_-0131cjmSg76BQ_w8wzpFF3';

const OUTERA_CANONICAL_ORIGIN = 'https://outerabd.buzz';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const REMOVED_TEST_PLACE_IDS = new Set([
  'cbc6ab88-7d9b-4da6-be3e-ca498b0e828f',
  '4e10637f-c1dc-46d3-9efa-cf2aae8c0ed8',
  '980b49a1-5685-4406-8564-d73885e365fe',
]);
const REMOVED_TEST_NAMES = new Set(['hbbb', 'hshs']);

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

const VALID_PUBLIC_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/explore$/,
  /^\/surprise$/,
  /^\/trips$/,
  /^\/bangladesh$/,
  /^\/location\/(dhaka|chattogram|sylhet|rajshahi|khulna|barishal|rangpur|mymensingh)$/,
  /^\/place\/[a-z0-9-]+$/,
  /^\/p\/[a-z0-9-]+$/,
];

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugifyText(input) {
  if (!input || typeof input !== 'string') return 'place';
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) return 'place';
  if (normalized.length <= 60) return normalized;
  return normalized.slice(0, 60).replace(/-+[^-]*$/, '').replace(/-+$/, '') || 'place';
}

function uuidToShortId(id) {
  const raw = String(id || '').trim();
  if (!raw) return 'spot00';
  const hex = raw.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (hex.length >= 16) {
    try {
      const high = BigInt('0x' + hex.slice(0, 8));
      const low = BigInt('0x' + hex.slice(-8));
      const combined = (high ^ (low << 7n)) & 0xffffffffn;
      const minVal = 60466176n;
      const maxVal = 2176782336n;
      const mapped = minVal + (combined % (maxVal - minVal));
      return mapped.toString(36).slice(0, 6);
    } catch {}
  }
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return (60466176 + (unsigned % (2176782336 - 60466176))).toString(36).slice(0, 6);
}

function buildPlaceUniqueSlug(place) {
  const rawId = String(place?.id || '').trim();
  const rawSlug = typeof place?.slug === 'string' ? place.slug.trim().toLowerCase() : '';
  if (
    rawSlug &&
    rawSlug !== rawId.toLowerCase() &&
    !UUID_REGEX.test(rawSlug) &&
    /^[a-z0-9-]+$/.test(rawSlug)
  ) {
    return rawSlug;
  }
  const baseNameSlug = slugifyText(place?.name || 'place');
  const shortId = uuidToShortId(rawId || baseNameSlug);
  if (baseNameSlug.endsWith(`-${shortId}`)) return baseNameSlug;
  return `${baseNameSlug}-${shortId}`;
}

function buildPostSlugWithId(post) {
  const uniqueId =
    post.short_id && typeof post.short_id === 'string' && post.short_id.trim().length >= 4
      ? post.short_id.trim().toLowerCase()
      : uuidToShortId(post.id);
  if (post.slug && typeof post.slug === 'string' && post.slug.trim().toLowerCase().endsWith(`-${uniqueId}`)) {
    return post.slug.trim().toLowerCase();
  }
  const placeName = (post.place_name || '').trim();
  const base =
    placeName && placeName.toLowerCase() !== 'selected place' && placeName.toLowerCase() !== 'spot'
      ? slugifyText(placeName)
      : slugifyText(post.title || 'community-post');
  return `${base}-${uniqueId}`;
}

function resolvePublicBucketUrl(storagePath) {
  if (!storagePath || typeof storagePath !== 'string') return '';
  const trimmed = storagePath.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return '';
  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('http://')) return trimmed.replace(/^http:\/\//i, 'https://');
  if (trimmed.startsWith('/')) return `${OUTERA_CANONICAL_ORIGIN}${trimmed}`;
  const clean = trimmed.replace(/^\/+/, '').replace(/^community-review-media\//, '');
  return `${SUPABASE_URL}/storage/v1/object/public/community-review-media/${encodeURI(clean)}`;
}

function formatReliableLastMod(rawTimestamp) {
  if (!rawTimestamp || typeof rawTimestamp !== 'string') return undefined;
  const trimmed = rawTimestamp.trim();
  if (!trimmed) return undefined;
  const parsedMs = Date.parse(trimmed);
  if (Number.isNaN(parsedMs) || parsedMs <= 0) return undefined;
  const isoDate = new Date(parsedMs).toISOString().split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : undefined;
}

function isExcludedFromSitemap(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return true;
  let pathname = urlOrPath.trim();
  try {
    if (/^https?:\/\//i.test(pathname)) {
      const parsed = new URL(pathname);
      if (parsed.origin !== OUTERA_CANONICAL_ORIGIN) return true;
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

export default async function handler(req, res) {
  const entries = [];
  const seenUrls = new Set();

  const addEntry = (entry) => {
    const cleanUrl =
      entry.loc
        .trim()
        .replace(/^https?:\/\/www\.outerabd\.buzz/i, OUTERA_CANONICAL_ORIGIN)
        .replace(/\/+$/, '') || OUTERA_CANONICAL_ORIGIN;
    const normalizedLoc =
      cleanUrl === OUTERA_CANONICAL_ORIGIN ? `${OUTERA_CANONICAL_ORIGIN}/` : cleanUrl;
    if (seenUrls.has(normalizedLoc)) return false;
    if (isExcludedFromSitemap(normalizedLoc)) return false;
    seenUrls.add(normalizedLoc);
    entries.push({ ...entry, loc: normalizedLoc });
    return true;
  };

  let latestGlobalLastMod;
  const divisionLatestLastMod = new Map();

  const updateLatestTimestamps = (lastmod, division) => {
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

  const placeEntries = [];
  try {
    let placesData = null;
    const { data: withImages, error: joinError } = await supabase
      .from('places')
      .select('id, name, slug, category, division, status, created_at, updated_at, place_images(image_url)')
      .eq('status', 'approved')
      .order('updated_at', { ascending: false });

    if (!joinError && Array.isArray(withImages)) {
      placesData = withImages;
    } else {
      const { data: fallbackPlaces } = await supabase
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
        if (REMOVED_TEST_PLACE_IDS.has(rowId) || REMOVED_TEST_NAMES.has(normName)) continue;
        if (row.deleted_at) continue;
        if (typeof row.status !== 'string' || row.status.trim().toLowerCase() !== 'approved') continue;

        const uniqueSlug = buildPlaceUniqueSlug(row);
        const placeUrl = `${OUTERA_CANONICAL_ORIGIN}/place/${uniqueSlug}`;
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
  } catch {}

  const postEntries = [];
  try {
    const { data: postsData, error: postsErr } = await supabase
      .from('place_posts')
      .select(
        'id, place_id, title, slug, short_id, status, deleted_at, created_at, updated_at, places(id, name, status)'
      )
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!postsErr && Array.isArray(postsData)) {
      for (const post of postsData) {
        if (!post || !post.id || String(post.status || '').toLowerCase() !== 'approved' || post.deleted_at) {
          continue;
        }
        const placeObj = Array.isArray(post.places) ? post.places[0] : post.places;
        if (placeObj && typeof placeObj.status === 'string' && placeObj.status.toLowerCase() !== 'approved') {
          continue;
        }
        if (post.place_id && REMOVED_TEST_PLACE_IDS.has(String(post.place_id))) {
          continue;
        }

        const postSlug = buildPostSlugWithId({
          id: post.id,
          title: post.title,
          place_name: placeObj?.name,
          slug: post.slug,
          short_id: post.short_id,
        });
        const postUrl = `${OUTERA_CANONICAL_ORIGIN}/p/${postSlug}`;
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
  } catch {}

  addEntry({
    loc: `${OUTERA_CANONICAL_ORIGIN}/`,
    lastmod: latestGlobalLastMod,
    changefreq: 'daily',
    priority: '1.0',
  });

  const publicHubPaths = [
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
      loc: `${OUTERA_CANONICAL_ORIGIN}${hub.path}`,
      lastmod: hubLastMod,
      changefreq: hub.freq,
      priority: hub.priority,
    });
  }

  for (const placeEntry of placeEntries) {
    addEntry(placeEntry);
  }

  for (const postEntry of postEntries) {
    addEntry(postEntry);
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

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  res.setHeader('X-Robots-Tag', 'all');
  return res.status(200).send(xml);
}
