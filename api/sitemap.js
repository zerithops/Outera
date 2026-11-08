import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://znyglvfsbxyjsctphigm.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
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

export default async function handler(req, res) {
  const todayIso = new Date().toISOString().split('T')[0];
  const entries = [];
  const seenUrls = new Set();

  const addEntry = (entry) => {
    const cleanUrl = entry.loc.trim().replace(/\/+$/, '') || OUTERA_CANONICAL_ORIGIN;
    const normalizedLoc =
      cleanUrl === OUTERA_CANONICAL_ORIGIN ? `${OUTERA_CANONICAL_ORIGIN}/` : cleanUrl;
    if (seenUrls.has(normalizedLoc)) return;
    seenUrls.add(normalizedLoc);
    entries.push({ ...entry, loc: normalizedLoc });
  };

  addEntry({
    loc: `${OUTERA_CANONICAL_ORIGIN}/`,
    lastmod: todayIso,
    changefreq: 'daily',
    priority: '1.0',
  });

  const publicHubPaths = [
    { path: '/explore', priority: '0.8', freq: 'daily' },
    { path: '/surprise', priority: '0.7', freq: 'weekly' },
    { path: '/trips', priority: '0.8', freq: 'weekly' },
    { path: '/bangladesh', priority: '0.8', freq: 'daily' },
    { path: '/location/dhaka', priority: '0.8', freq: 'weekly' },
    { path: '/location/chattogram', priority: '0.8', freq: 'weekly' },
    { path: '/location/sylhet', priority: '0.8', freq: 'weekly' },
    { path: '/location/rajshahi', priority: '0.7', freq: 'weekly' },
    { path: '/location/khulna', priority: '0.7', freq: 'weekly' },
    { path: '/location/barishal', priority: '0.7', freq: 'weekly' },
    { path: '/location/rangpur', priority: '0.7', freq: 'weekly' },
    { path: '/location/mymensingh', priority: '0.7', freq: 'weekly' },
  ];

  for (const hub of publicHubPaths) {
    addEntry({
      loc: `${OUTERA_CANONICAL_ORIGIN}${hub.path}`,
      lastmod: todayIso,
      changefreq: hub.freq,
      priority: hub.priority,
    });
  }

  try {
    const { data: placesData } = await supabase
      .from('places')
      .select('id, name, slug, category, status, created_at, updated_at, place_images(image_url)')
      .order('created_at', { ascending: false });

    if (Array.isArray(placesData)) {
      for (const row of placesData) {
        if (!row || !row.id) continue;
        const rowId = String(row.id);
        const normName = String(row.name || '').trim().toLowerCase();
        if (REMOVED_TEST_PLACE_IDS.has(rowId) || REMOVED_TEST_NAMES.has(normName)) continue;
        if (typeof row.status === 'string' && row.status.toLowerCase() !== 'approved') continue;

        const uniqueSlug = buildPlaceUniqueSlug(row);
        const placeUrl = `${OUTERA_CANONICAL_ORIGIN}/place/${uniqueSlug}`;
        const rawDate = row.updated_at || row.created_at || todayIso;
        const lastmod = String(rawDate).split('T')[0] || todayIso;

        let coverImg = '';
        if (Array.isArray(row.place_images) && row.place_images.length > 0) {
          coverImg = resolvePublicBucketUrl(row.place_images[0]?.image_url);
        }

        addEntry({
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

  try {
    const { data: postsData } = await supabase
      .from('place_posts')
      .select('id, title, status, deleted_at, created_at, updated_at, places(name)')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (Array.isArray(postsData)) {
      for (const post of postsData) {
        if (!post || !post.id || post.status !== 'approved' || post.deleted_at) continue;
        const placeObj = Array.isArray(post.places) ? post.places[0] : post.places;
        const postSlug = buildPostSlugWithId({
          id: post.id,
          title: post.title,
          place_name: placeObj?.name,
          slug: post.slug,
          short_id: post.short_id,
        });
        const postUrl = `${OUTERA_CANONICAL_ORIGIN}/p/${postSlug}`;
        const rawDate = post.updated_at || post.created_at || todayIso;
        const lastmod = String(rawDate).split('T')[0] || todayIso;

        addEntry({
          loc: postUrl,
          lastmod,
          changefreq: 'weekly',
          priority: '0.7',
        });
      }
    }
  } catch {}

  const urlNodes = entries
    .map((entry) => {
      const imageXml = entry.imageLoc
        ? `\n    <image:image>\n      <image:loc>${escapeXml(entry.imageLoc)}</image:loc>${
            entry.imageTitle
              ? `\n      <image:title>${escapeXml(entry.imageTitle)}</image:title>`
              : ''
          }\n    </image:image>`
        : '';
      return `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
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
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}
