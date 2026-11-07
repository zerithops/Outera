import { createClient } from '@supabase/supabase-js';
import { COMPILED_INDEX_HTML } from './_htmlTemplate.js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://znyglvfsbxyjsctphigm.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_1lRtsi9_-0131cjmSg76BQ_w8wzpFF3';

const OUTERA_PRODUCTION_ORIGIN = 'https://www.outerabd.buzz';
const OUTERA_DEFAULT_OG_IMAGE = `${OUTERA_PRODUCTION_ORIGIN}/assets/aistudio/Neon_Lime_OUTERA_Tech_Logo_8daa6fb0.png`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugifyText(input) {
  if (!input || typeof input !== 'string') return 'community-post';
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) return 'community-post';
  if (normalized.length <= 60) return normalized;
  return normalized.slice(0, 60).replace(/-+[^-]*$/, '').replace(/-+$/, '') || 'community-post';
}

function uuidToShortId(id) {
  const raw = String(id || '').trim();
  if (!raw) return 'post00';
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
    } catch {
      // Fallback below
    }
  }
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return (60466176 + (unsigned % (2176782336 - 60466176))).toString(36).slice(0, 6);
}

function getPostUniqueId(post) {
  if (post.short_id && typeof post.short_id === 'string' && post.short_id.trim().length >= 4) {
    return post.short_id.trim().toLowerCase();
  }
  return uuidToShortId(post.id);
}

function buildPostSlugWithId(post) {
  const uniqueId = getPostUniqueId(post);
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

function parseRouteParam(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let cleaned = rawInput.trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {}
  cleaned = cleaned
    .replace(/^\/?p\//i, '')
    .replace(/[/?#]+$/, '')
    .trim();
  if (!cleaned) return null;

  const uuidMatch = cleaned.match(UUID_REGEX);
  if (uuidMatch && uuidMatch[0]) {
    return {
      rawParam: cleaned.toLowerCase(),
      uniqueId: uuidMatch[0].toLowerCase(),
      isFullUuid: true,
    };
  }

  const lastDashIdx = cleaned.lastIndexOf('-');
  if (lastDashIdx > 0 && lastDashIdx < cleaned.length - 1) {
    return {
      rawParam: cleaned.toLowerCase(),
      uniqueId: cleaned.slice(lastDashIdx + 1).toLowerCase(),
      isFullUuid: false,
    };
  }

  return {
    rawParam: cleaned.toLowerCase(),
    uniqueId: cleaned.toLowerCase(),
    isFullUuid: false,
  };
}

function doesRowMatch(row, rawInput) {
  const parsed = parseRouteParam(rawInput);
  if (!parsed || !row || !row.id) return false;
  const idLower = String(row.id).toLowerCase();
  if (idLower === parsed.rawParam || idLower === parsed.uniqueId) return true;
  const shortId = getPostUniqueId(row);
  if (shortId === parsed.uniqueId || shortId === parsed.rawParam) return true;
  if (row.slug && String(row.slug).toLowerCase() === parsed.rawParam) return true;
  const computedSlug = buildPostSlugWithId({
    id: row.id,
    title: row.title,
    place_name: row.places?.name,
    slug: row.slug,
    short_id: row.short_id,
  });
  if (computedSlug === parsed.rawParam) return true;
  if (parsed.uniqueId.length >= 6) {
    const cleanHex = idLower.replace(/-/g, '');
    if (cleanHex.startsWith(parsed.uniqueId) || cleanHex.endsWith(parsed.uniqueId)) return true;
  }
  return false;
}

function resolvePublicImageUrl(storagePath) {
  if (!storagePath || typeof storagePath !== 'string') return OUTERA_DEFAULT_OG_IMAGE;
  const trimmed = storagePath.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return OUTERA_DEFAULT_OG_IMAGE;
  }
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${OUTERA_PRODUCTION_ORIGIN}${trimmed}`;
  }
  const clean = trimmed.replace(/^\/+/, '').replace(/^community-review-media\//, '');
  return `${SUPABASE_URL}/storage/v1/object/public/community-review-media/${encodeURI(clean)}`;
}

async function fetchApprovedPost(slugParam) {
  const parsed = parseRouteParam(slugParam);
  if (!parsed) return null;

  let matchedRow = null;

  if (parsed.isFullUuid) {
    const { data, error } = await supabase
      .from('place_posts')
      .select('*, places(id, name, category, address)')
      .eq('id', parsed.uniqueId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .maybeSingle();
    if (!error && data) matchedRow = data;
  } else {
    try {
      const { data: byCol, error: colErr } = await supabase
        .from('place_posts')
        .select('*, places(id, name, category, address)')
        .or(`short_id.eq.${parsed.uniqueId},slug.eq.${parsed.rawParam}`)
        .eq('status', 'approved')
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (!colErr && byCol) matchedRow = byCol;
    } catch {}

    if (!matchedRow) {
      const { data: candidates, error: candErr } = await supabase
        .from('place_posts')
        .select('*, places(id, name, category, address)')
        .eq('status', 'approved')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (!candErr && candidates) {
        matchedRow = candidates.find((r) => doesRowMatch(r, slugParam)) || null;
      }
    }
  }

  if (!matchedRow || matchedRow.status !== 'approved' || matchedRow.deleted_at) {
    return null;
  }

  let authorName = 'OUTERA Scout';
  if (matchedRow.user_id) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', matchedRow.user_id)
        .maybeSingle();
      if (profile?.display_name) authorName = profile.display_name;
    } catch {}
  }

  let primaryImageUrl = OUTERA_DEFAULT_OG_IMAGE;
  try {
    const { data: imgs } = await supabase
      .from('place_post_images')
      .select('storage_path, display_order, created_at')
      .eq('post_id', matchedRow.id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1);
    if (imgs && imgs.length > 0 && imgs[0].storage_path) {
      primaryImageUrl = resolvePublicImageUrl(imgs[0].storage_path);
    }
  } catch {}

  const place = matchedRow.places || {};
  const fullSlug = buildPostSlugWithId({
    id: matchedRow.id,
    title: matchedRow.title,
    place_name: place.name,
    slug: matchedRow.slug,
    short_id: matchedRow.short_id,
  });

  return {
    id: matchedRow.id,
    title: (matchedRow.title || 'Community Review').trim(),
    content: (matchedRow.content || '').replace(/\s+/g, ' ').trim(),
    rating: Number(matchedRow.rating) || 5,
    created_at: matchedRow.created_at,
    author_name: authorName,
    place_name: place.name || 'OUTERA Spot',
    place_address: place.address || 'Bangladesh',
    og_image: primaryImageUrl,
    slug: fullSlug,
  };
}

export default async function handler(req, res) {
  const rawSlug =
    (req.query && req.query.slug) ||
    (req.url ? req.url.replace(/^\/p\//i, '').split('?')[0] : '');

  let baseHtml = COMPILED_INDEX_HTML;

  // Attempt to load the freshly deployed index.html from origin if needed
  if (baseHtml.includes('/src/main.tsx') && req.headers?.host) {
    try {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const resp = await fetch(`${proto}://${req.headers.host}/index.html`);
      if (resp.ok) {
        baseHtml = await resp.text();
      }
    } catch {}
  }

  const post = await fetchApprovedPost(String(rawSlug || ''));

  const cleanedHtml = baseHtml
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');

  if (!post) {
    const fallbackUrl = rawSlug
      ? `${OUTERA_PRODUCTION_ORIGIN}/p/${encodeURIComponent(String(rawSlug))}`
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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    return res.status(200).send(cleanedHtml.replace('<head>', `<head>${headBlock}`));
  }

  const canonicalUrl = `${OUTERA_PRODUCTION_ORIGIN}/p/${post.slug}`;
  const pageTitle = `${post.title} — ${post.place_name} | OUTERA`;
  const ogTitle = `${post.title} · ${post.place_name} (${post.rating}/5 ★) — OUTERA`;
  const snippet = post.content.length > 140 ? `${post.content.slice(0, 137).trim()}...` : post.content;
  const description = snippet
    ? `${snippet} — Verified review by ${post.author_name} (${post.rating}/5 ★) at ${post.place_name} on OUTERA.`
    : `Read ${post.author_name}'s ${post.rating}/5 ★ community review of ${post.place_name} on OUTERA.`;
  const ogDesc = (post.content || description).slice(0, 200);
  const ogImageAlt = `${post.title} at ${post.place_name} on OUTERA`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    name: post.title,
    reviewBody: post.content,
    url: canonicalUrl,
    datePublished: post.created_at || new Date().toISOString(),
    author: {
      '@type': 'Person',
      name: post.author_name,
    },
    itemReviewed: {
      '@type': 'Place',
      name: post.place_name,
      address: post.place_address,
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: post.rating,
      bestRating: 5,
      worstRating: 1,
    },
    image: [post.og_image],
  };

  const headBlock = `
    <title>${escapeHtmlAttr(pageTitle)}</title>
    <meta name="description" content="${escapeHtmlAttr(description.slice(0, 160))}" />
    <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="OUTERA" />
    <meta property="og:title" content="${escapeHtmlAttr(ogTitle)}" />
    <meta property="og:description" content="${escapeHtmlAttr(ogDesc)}" />
    <meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtmlAttr(post.og_image)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(post.og_image)}" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(ogImageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(ogTitle)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(ogDesc)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(post.og_image)}" />
    <script id="outera-dynamic-post-jsonld" type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).send(cleanedHtml.replace('<head>', `<head>${headBlock}`));
}
