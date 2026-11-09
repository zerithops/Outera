import { createClient } from '@supabase/supabase-js';
import {
  OUTERA_PLACE_CANONICAL_ORIGIN,
  buildPlaceUniqueSlug,
} from './placeUrl';
import {
  buildPostSlugWithId,
  getPostUniqueId,
} from './postUrl';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://znyglvfsbxyjsctphigm.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
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
  const r2Base = (
    process.env.VITE_R2_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
    process.env.R2_PUBLIC_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  const cleanKey = trimmed
    .replace(/^r2:\/+/i, '')
    .replace(/^r2:/i, '')
    .replace(/^\/+/, '')
    .replace(/^outera-media\//i, '');
  const isLegacySupabaseKey =
    trimmed.includes('/storage/v1/object/public/community-review-media/') ||
    trimmed.startsWith('community-review-media/') ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(
      cleanKey
    );
  const isR2Key =
    trimmed.startsWith('r2:') ||
    /^(posts|suggestions|avatars|places|reviews|uploads|media)\//i.test(cleanKey) ||
    (!isLegacySupabaseKey && Boolean(r2Base));
  if (isR2Key && r2Base) {
    const encodedKey = cleanKey
      .split('/')
      .filter(Boolean)
      .map((s) => encodeURIComponent(decodeURIComponent(s)))
      .join('/');
    return `${r2Base}/${encodedKey}`;
  }
  const clean = trimmed.replace(/^\/+/, '').replace(/^community-review-media\//, '');
  return `${SUPABASE_URL}/storage/v1/object/public/community-review-media/${encodeURI(clean)}`;
}

export interface SitemapUrlEntry {
  loc: string;
  lastmod: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: string;
  imageLoc?: string;
  imageTitle?: string;
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
}> {
  const todayIso = new Date().toISOString().split('T')[0];
  const entries: SitemapUrlEntry[] = [];
  const seenUrls = new Set<string>();

  const addEntry = (entry: SitemapUrlEntry) => {
    const cleanUrl = entry.loc.trim().replace(/\/+$/, '') || OUTERA_PLACE_CANONICAL_ORIGIN;
    const normalizedLoc =
      cleanUrl === OUTERA_PLACE_CANONICAL_ORIGIN ? `${OUTERA_PLACE_CANONICAL_ORIGIN}/` : cleanUrl;
    if (seenUrls.has(normalizedLoc)) return;
    seenUrls.add(normalizedLoc);
    entries.push({
      ...entry,
      loc: normalizedLoc,
    });
  };

  // 1. Primary Public Core & Regional Hub Routes
  addEntry({
    loc: `${OUTERA_PLACE_CANONICAL_ORIGIN}/`,
    lastmod: todayIso,
    changefreq: 'daily',
    priority: '1.0',
  });

  const publicHubPaths = [
    { path: '/explore', priority: '0.8', freq: 'daily' as const },
    { path: '/surprise', priority: '0.7', freq: 'weekly' as const },
    { path: '/trips', priority: '0.8', freq: 'weekly' as const },
    { path: '/bangladesh', priority: '0.8', freq: 'daily' as const },
    { path: '/location/dhaka', priority: '0.8', freq: 'weekly' as const },
    { path: '/location/chattogram', priority: '0.8', freq: 'weekly' as const },
    { path: '/location/sylhet', priority: '0.8', freq: 'weekly' as const },
    { path: '/location/rajshahi', priority: '0.7', freq: 'weekly' as const },
    { path: '/location/khulna', priority: '0.7', freq: 'weekly' as const },
    { path: '/location/barishal', priority: '0.7', freq: 'weekly' as const },
    { path: '/location/rangpur', priority: '0.7', freq: 'weekly' as const },
    { path: '/location/mymensingh', priority: '0.7', freq: 'weekly' as const },
  ];

  for (const hub of publicHubPaths) {
    addEntry({
      loc: `${OUTERA_PLACE_CANONICAL_ORIGIN}${hub.path}`,
      lastmod: todayIso,
      changefreq: hub.freq,
      priority: hub.priority,
    });
  }

  // 2. Public, Approved, Indexable Place Pages (/place/{unique-id})
  let placeCount = 0;
  try {
    const { data: placesData } = await serverSupabase
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

        const uniqueSlug = buildPlaceUniqueSlug({
          id: rowId,
          name: row.name,
          slug: row.slug,
        });

        const placeUrl = `${OUTERA_PLACE_CANONICAL_ORIGIN}/place/${uniqueSlug}`;
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
        placeCount += 1;
      }
    }
  } catch (err) {
    console.warn('Sitemap places query notice:', err);
  }

  // 3. Public, Approved Community Review Posts (/p/{slug}-{uniqueId})
  let postCount = 0;
  try {
    const { data: postsData } = await serverSupabase
      .from('place_posts')
      .select('id, title, status, deleted_at, created_at, updated_at, places(name)')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (Array.isArray(postsData)) {
      for (const post of postsData) {
        if (!post || !post.id || post.status !== 'approved' || post.deleted_at) continue;
        const placeObj = Array.isArray(post.places) ? post.places[0] : (post.places as any);
        const shortId = getPostUniqueId({ id: post.id, short_id: (post as any).short_id });
        const postSlug = buildPostSlugWithId({
          id: post.id,
          title: post.title,
          place_name: placeObj?.name,
          slug: (post as any).slug,
          short_id: shortId,
        });

        const postUrl = `${OUTERA_PLACE_CANONICAL_ORIGIN}/p/${postSlug}`;
        const rawDate = post.updated_at || post.created_at || todayIso;
        const lastmod = String(rawDate).split('T')[0] || todayIso;

        addEntry({
          loc: postUrl,
          lastmod,
          changefreq: 'weekly',
          priority: '0.7',
        });
        postCount += 1;
      }
    }
  } catch (err) {
    console.warn('Sitemap posts query notice:', err);
  }

  const urlNodes = entries
    .map((entry) => {
      const imageXml =
        entry.imageLoc
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

  return {
    xml,
    urlCount: entries.length,
    placeCount,
    postCount,
    entries,
  };
}
