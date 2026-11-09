import { createClient } from '@supabase/supabase-js';
import {
  OUTERA_DEFAULT_OG_IMAGE,
} from './postUrl';
import {
  OUTERA_PLACE_CANONICAL_ORIGIN,
  buildPlaceMetadataPayload,
  buildPlaceUniqueSlug,
  doesPlaceMatchRoute,
  parsePlaceRouteParam,
  resolvePlaceCoverImage,
} from './placeUrl';

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

function escapeHtmlAttr(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resolvePublicBucketUrl(storagePath: string): string {
  if (!storagePath || typeof storagePath !== 'string') return '';
  const trimmed = storagePath.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${OUTERA_PLACE_CANONICAL_ORIGIN}${trimmed}`;
  }
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
  const clean = trimmed
    .replace(/^\/+/, '')
    .replace(/^community-review-media\//, '');
  return `${SUPABASE_URL}/storage/v1/object/public/community-review-media/${encodeURI(clean)}`;
}

function parseDescriptionMeta(rawDescription?: string | null): {
  cleanDescription: string;
  whyWorthVisiting?: string;
  division?: string;
  district?: string;
  upazila?: string;
  area?: string;
} {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return { cleanDescription: '' };
  }
  const bracketMatch = rawDescription.match(/\[([^\]]+)\]\s*$/);
  const cleanDescription = rawDescription.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
  if (!bracketMatch || !bracketMatch[1]) {
    return { cleanDescription };
  }
  const result: {
    cleanDescription: string;
    whyWorthVisiting?: string;
    division?: string;
    district?: string;
    upazila?: string;
    area?: string;
  } = { cleanDescription };

  const parts = bracketMatch[1].split('•').map((s) => s.trim());
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.startsWith('why:')) result.whyWorthVisiting = part.slice(4).trim();
    else if (lower.startsWith('division:')) result.division = part.slice(9).trim();
    else if (lower.startsWith('district:')) result.district = part.slice(9).trim();
    else if (lower.startsWith('upazila:')) result.upazila = part.slice(8).trim();
    else if (lower.startsWith('area:')) result.area = part.slice(5).trim();
  }
  return result;
}

/**
 * Fetches an approved, non-deleted place from Supabase on the server for SEO / Open Graph link previews.
 * Strictly returns null for missing, deleted, pending, hidden, or rejected places.
 */
export async function fetchApprovedPlaceForServerSeo(slugOrIdParam: string) {
  const parsed = parsePlaceRouteParam(slugOrIdParam);
  if (!parsed) return null;

  try {
    let matchedRow: any = null;

    if (parsed.isFullUuid) {
      if (REMOVED_TEST_PLACE_IDS.has(parsed.uniqueId)) return null;
      const { data, error } = await serverSupabase
        .from('places')
        .select('*, place_images(image_url)')
        .eq('id', parsed.uniqueId)
        .maybeSingle();

      if (!error && data) {
        matchedRow = data;
      }
    } else {
      const { data: bySlug, error: slugErr } = await serverSupabase
        .from('places')
        .select('*, place_images(image_url)')
        .eq('slug', parsed.rawParam)
        .limit(1)
        .maybeSingle();

      if (!slugErr && bySlug) {
        matchedRow = bySlug;
      }

      if (!matchedRow) {
        const { data: candidates, error: candErr } = await serverSupabase
          .from('places')
          .select('*, place_images(image_url)')
          .order('created_at', { ascending: false })
          .limit(500);

        if (!candErr && candidates && candidates.length > 0) {
          matchedRow =
            candidates.find((row: any) =>
              doesPlaceMatchRoute(
                {
                  id: row.id,
                  name: row.name,
                  slug: row.slug,
                },
                slugOrIdParam
              )
            ) || null;
        }
      }
    }

    if (!matchedRow || !matchedRow.id) {
      return null;
    }

    const rowIdStr = String(matchedRow.id);
    const normName = String(matchedRow.name || '').trim().toLowerCase();
    if (REMOVED_TEST_PLACE_IDS.has(rowIdStr) || REMOVED_TEST_NAMES.has(normName)) {
      return null;
    }

    if (typeof matchedRow.status === 'string' && matchedRow.status.toLowerCase() !== 'approved') {
      return null;
    }

    // Gather cover images from place_images or approved place_posts photos
    const imageUrls: string[] = [];
    if (Array.isArray(matchedRow.place_images)) {
      for (const img of matchedRow.place_images) {
        const u = resolvePublicBucketUrl(img?.image_url);
        if (u && !imageUrls.includes(u)) imageUrls.push(u);
      }
    }

    // Also check approved posts for this place if place_images has no image yet
    let communityRating: number | null = null;
    let totalReports = 0;
    try {
      const { data: approvedPosts } = await serverSupabase
        .from('place_posts')
        .select('id, rating')
        .eq('place_id', rowIdStr)
        .eq('status', 'approved')
        .is('deleted_at', null);

      if (approvedPosts && approvedPosts.length > 0) {
        totalReports = approvedPosts.length;
        const ratings = approvedPosts
          .map((p: any) => Number(p.rating))
          .filter((r: number) => r >= 1 && r <= 5);
        if (ratings.length > 0) {
          communityRating =
            Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
        }

        if (imageUrls.length === 0) {
          const postIds = approvedPosts.map((p: any) => p.id);
          const { data: postImgs } = await serverSupabase
            .from('place_post_images')
            .select('storage_path, display_order, created_at')
            .in('post_id', postIds)
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: true })
            .limit(2);

          if (postImgs) {
            for (const pi of postImgs) {
              const u = resolvePublicBucketUrl(pi.storage_path);
              if (u && !imageUrls.includes(u)) imageUrls.push(u);
            }
          }
        }
      }
    } catch {}

    const parsedMeta = parseDescriptionMeta(matchedRow.description);
    const canonicalSlug = buildPlaceUniqueSlug({
      id: rowIdStr,
      name: matchedRow.name,
      slug: matchedRow.slug,
    });

    return {
      id: rowIdStr,
      slug: canonicalSlug,
      name: matchedRow.name || 'OUTERA Spot',
      category: matchedRow.category || 'Chill',
      shortDescription:
        matchedRow.short_description || parsedMeta.cleanDescription || '',
      fullDescription: parsedMeta.cleanDescription || matchedRow.description || '',
      whyPick: matchedRow.why_worth_visiting || parsedMeta.whyWorthVisiting || '',
      address: matchedRow.address || '',
      neighborhood: matchedRow.area || parsedMeta.area || '',
      upazila: matchedRow.upazila || parsedMeta.upazila || '',
      district: matchedRow.district || parsedMeta.district || 'Dhaka',
      division: matchedRow.division || parsedMeta.division || 'Dhaka',
      images: imageUrls,
      communityRating,
      totalReports,
      coordinates:
        typeof matchedRow.latitude === 'number' && typeof matchedRow.longitude === 'number'
          ? { lat: matchedRow.latitude, lng: matchedRow.longitude }
          : null,
    };
  } catch (err) {
    console.warn('fetchApprovedPlaceForServerSeo error:', err);
    return null;
  }
}

/**
 * Injects dynamic Place SEO, Open Graph, Twitter Card, Canonical URL, and JSON-LD metadata
 * directly into the server-rendered `index.html` response for social crawlers and direct visitors.
 */
export function injectPlaceMetadataIntoHtml(
  rawHtml: string,
  place: any | null,
  requestedSlug?: string
): string {
  const cleanedHtml = rawHtml
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');

  if (!place) {
    const fallbackUrl = requestedSlug
      ? `${OUTERA_PLACE_CANONICAL_ORIGIN}/place/${encodeURIComponent(requestedSlug)}`
      : OUTERA_PLACE_CANONICAL_ORIGIN;
    const notFoundTitle = '404 — Place Not Found | OUTERA';
    const notFoundDesc =
      'This place could not be found, may have been removed, or is not publicly available on OUTERA.';

    const headBlock = `
    <title>${escapeHtmlAttr(notFoundTitle)}</title>
    <meta name="description" content="${escapeHtmlAttr(notFoundDesc)}" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="canonical" href="${escapeHtmlAttr(fallbackUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="OUTERA" />
    <meta property="og:title" content="${escapeHtmlAttr(notFoundTitle)}" />
    <meta property="og:description" content="${escapeHtmlAttr(notFoundDesc)}" />
    <meta property="og:url" content="${escapeHtmlAttr(fallbackUrl)}" />
    <meta property="og:image" content="${escapeHtmlAttr(OUTERA_DEFAULT_OG_IMAGE)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(notFoundTitle)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(notFoundDesc)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(OUTERA_DEFAULT_OG_IMAGE)}" />`;

    return cleanedHtml.replace('<head>', `<head>${headBlock}`);
  }

  const meta = buildPlaceMetadataPayload(place);
  const ogImage = resolvePlaceCoverImage(place);

  const headBlock = `
    <title>${escapeHtmlAttr(meta.title)}</title>
    <meta name="description" content="${escapeHtmlAttr(meta.description)}" />
    <link rel="canonical" href="${escapeHtmlAttr(meta.canonicalUrl)}" />
    <meta property="og:type" content="place" />
    <meta property="og:site_name" content="OUTERA" />
    <meta property="og:title" content="${escapeHtmlAttr(meta.ogTitle)}" />
    <meta property="og:description" content="${escapeHtmlAttr(meta.ogDescription)}" />
    <meta property="og:url" content="${escapeHtmlAttr(meta.canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtmlAttr(ogImage)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(ogImage)}" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(meta.ogImageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(meta.twitterTitle)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(meta.twitterDescription)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(ogImage)}" />
    <script id="outera-dynamic-place-jsonld" type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>`;

  return cleanedHtml.replace('<head>', `<head>${headBlock}`);
}
