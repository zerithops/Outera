import { createClient } from '@supabase/supabase-js';
import {
  OUTERA_DEFAULT_DESCRIPTION,
  OUTERA_DEFAULT_OG_IMAGE,
  OUTERA_DEFAULT_TITLE,
  OUTERA_PRODUCTION_ORIGIN,
  buildPostMetadataPayload,
  buildPostSlugWithId,
  doesPostMatchRoute,
  ensureAbsoluteImageUrl,
  getPostUniqueId,
  parsePostRouteParam,
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

function escapeHtmlAttr(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resolvePublicBucketUrl(storagePath: string): string {
  if (!storagePath) return '';
  const trimmed = storagePath.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
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

/**
 * Fetches an approved, non-deleted post from Supabase on the server for SEO / Open Graph link previews.
 * Strictly returns null for missing, deleted, pending, hidden, or rejected posts.
 */
export async function fetchApprovedPostForServerSeo(slugOrIdParam: string) {
  const parsed = parsePostRouteParam(slugOrIdParam);
  if (!parsed) return null;

  try {
    let matchedRow: any = null;

    if (parsed.isFullUuid) {
      const { data, error } = await serverSupabase
        .from('place_posts')
        .select('*, places(id, name, category, address)')
        .eq('id', parsed.uniqueId)
        .eq('status', 'approved')
        .is('deleted_at', null)
        .maybeSingle();

      if (!error && data) {
        matchedRow = data;
      }
    } else {
      try {
        const { data: byCol, error: colErr } = await serverSupabase
          .from('place_posts')
          .select('*, places(id, name, category, address)')
          .or(`short_id.eq.${parsed.uniqueId},slug.eq.${parsed.rawParam}`)
          .eq('status', 'approved')
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();

        if (!colErr && byCol) {
          matchedRow = byCol;
        }
      } catch {
        // Fallback below if short_id / slug columns are not yet migrated
      }

      if (!matchedRow) {
        const { data: candidates, error: candErr } = await serverSupabase
          .from('place_posts')
          .select('*, places(id, name, category, address)')
          .eq('status', 'approved')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(500);

        if (!candErr && candidates && candidates.length > 0) {
          matchedRow =
            candidates.find((row: any) =>
              doesPostMatchRoute(
                {
                  id: row.id,
                  title: row.title,
                  place_name: row.places?.name,
                  slug: row.slug,
                  short_id: row.short_id,
                },
                slugOrIdParam
              )
            ) || null;
        }
      }
    }

    if (!matchedRow || matchedRow.status !== 'approved' || matchedRow.deleted_at) {
      return null;
    }

    // Fetch public author profile (never expose email or private fields)
    let authorName = 'OUTERA Scout';
    let authorUsername = '@scout';
    if (matchedRow.user_id) {
      try {
        const { data: profile } = await serverSupabase
          .from('profiles')
          .select('display_name, username')
          .eq('id', matchedRow.user_id)
          .maybeSingle();
        if (profile) {
          authorName = profile.display_name || 'OUTERA Scout';
          authorUsername = profile.username ? `@${profile.username}` : '@scout';
        }
      } catch {}
    }

    // Fetch approved post images (up to 2)
    const imageUrls: string[] = [];
    try {
      const { data: imgs } = await serverSupabase
        .from('place_post_images')
        .select('storage_path, display_order, created_at')
        .eq('post_id', matchedRow.id)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(2);

      if (imgs && imgs.length > 0) {
        for (const img of imgs) {
          const publicUrl = resolvePublicBucketUrl(img.storage_path);
          if (publicUrl && !imageUrls.includes(publicUrl)) {
            imageUrls.push(publicUrl);
          }
        }
      }
    } catch {}

    const place = matchedRow.places || {};
    const shortId = getPostUniqueId({ id: matchedRow.id, short_id: matchedRow.short_id });
    const fullSlug = buildPostSlugWithId({
      id: matchedRow.id,
      title: matchedRow.title,
      place_name: place.name,
      slug: matchedRow.slug,
      short_id: shortId,
    });

    return {
      id: matchedRow.id,
      place_id: matchedRow.place_id,
      title: matchedRow.title || 'Community Review',
      content: matchedRow.content || '',
      rating: Number(matchedRow.rating) || 5,
      is_visited: Boolean(matchedRow.is_visited),
      created_at: matchedRow.created_at,
      author_name: authorName,
      author_username: authorUsername,
      place_name: place.name || 'OUTERA Spot',
      place_category: place.category || 'Spot',
      place_address: place.address || 'Bangladesh',
      images: imageUrls,
      short_id: shortId,
      slug: fullSlug,
    };
  } catch (err) {
    console.warn('fetchApprovedPostForServerSeo error:', err);
    return null;
  }
}

/**
 * Injects dynamic post SEO, Open Graph, Twitter Card, Canonical URL, and JSON-LD metadata
 * directly into the server-rendered `index.html` response for social crawlers and direct visitors.
 */
export function injectPostMetadataIntoHtml(rawHtml: string, post: any | null, requestedSlug?: string): string {
  // Strip existing default title & meta tags that we will replace
  let cleanedHtml = rawHtml
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');

  if (!post) {
    const fallbackUrl = requestedSlug
      ? `${OUTERA_PRODUCTION_ORIGIN}/p/${encodeURIComponent(requestedSlug)}`
      : OUTERA_PRODUCTION_ORIGIN;
    const notFoundTitle = 'Community Post Unavailable | OUTERA';
    const notFoundDesc =
      'This community post may have been removed, is pending moderation, or is no longer available on OUTERA.';

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

  const meta = buildPostMetadataPayload(post);
  const ogImage = ensureAbsoluteImageUrl(post.images?.[0]);

  const headBlock = `
    <title>${escapeHtmlAttr(meta.title)}</title>
    <meta name="description" content="${escapeHtmlAttr(meta.description)}" />
    <link rel="canonical" href="${escapeHtmlAttr(meta.canonicalUrl)}" />
    <meta property="og:type" content="article" />
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
    <script id="outera-dynamic-post-jsonld" type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>`;

  return cleanedHtml.replace('<head>', `<head>${headBlock}`);
}
