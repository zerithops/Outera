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

const OUTERA_PLACE_CANONICAL_ORIGIN = 'https://outerabd.buzz';
const OUTERA_DEFAULT_OG_IMAGE = 'https://outerabd.buzz/assets/aistudio/Neon_Lime_OUTERA_Tech_Logo_8daa6fb0.png';

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

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function parseRouteParam(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let cleaned = rawInput.trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {}
  cleaned = cleaned
    .replace(/^\/?places?\//i, '')
    .replace(/[/?#]+$/, '')
    .trim();
  if (!cleaned) return null;

  const uuidMatch = cleaned.match(UUID_REGEX);
  if (uuidMatch && uuidMatch[0]) {
    const fullUuid = uuidMatch[0].toLowerCase();
    const idx = cleaned.toLowerCase().indexOf(fullUuid);
    const slugPart = idx > 0 ? cleaned.slice(0, idx).replace(/-+$/, '').toLowerCase() : '';
    return {
      rawParam: cleaned.toLowerCase(),
      uniqueId: fullUuid,
      slugPart,
      isFullUuid: true,
    };
  }

  const lower = cleaned.toLowerCase();
  const lastDashIdx = lower.lastIndexOf('-');
  if (lastDashIdx > 0 && lastDashIdx < lower.length - 1) {
    return {
      rawParam: lower,
      uniqueId: lower.slice(lastDashIdx + 1),
      slugPart: lower.slice(0, lastDashIdx),
      isFullUuid: false,
    };
  }

  return {
    rawParam: lower,
    uniqueId: lower,
    slugPart: lower,
    isFullUuid: false,
  };
}

function doesRowMatch(row, rawInput) {
  const parsed = parseRouteParam(rawInput);
  if (!parsed || !row || !row.id) return false;
  const placeIdLower = String(row.id).trim().toLowerCase();
  const rawLower = parsed.rawParam.toLowerCase();
  const targetUniqueId = parsed.uniqueId.toLowerCase();
  const storedSlugLower = typeof row.slug === 'string' ? row.slug.trim().toLowerCase() : '';
  const canonicalSlug = buildPlaceUniqueSlug(row).toLowerCase();
  const deterministicShortId = uuidToShortId(row.id).toLowerCase();
  const baseNameSlug = slugifyText(row.name || '').toLowerCase();

  if (placeIdLower === rawLower || placeIdLower === targetUniqueId) return true;
  if (storedSlugLower && (storedSlugLower === rawLower || storedSlugLower === targetUniqueId)) return true;
  if (canonicalSlug === rawLower) return true;
  if (`${baseNameSlug}-${deterministicShortId}` === rawLower || deterministicShortId === targetUniqueId) return true;
  if (storedSlugLower && storedSlugLower.endsWith(`-${targetUniqueId}`) && parsed.slugPart === baseNameSlug) return true;

  const idHex = placeIdLower.replace(/-/g, '');
  const idPrefix6 = idHex.slice(0, 6);
  const idPrefix8 = idHex.slice(0, 8);
  if (
    (idPrefix6 && (`${baseNameSlug}-${idPrefix6}` === rawLower || idPrefix6 === targetUniqueId)) ||
    (idPrefix8 && (`${baseNameSlug}-${idPrefix8}` === rawLower || idPrefix8 === targetUniqueId)) ||
    (targetUniqueId.length >= 6 && /^[0-9a-f]+$/.test(targetUniqueId) && idHex.startsWith(targetUniqueId))
  ) {
    return true;
  }
  if (baseNameSlug && baseNameSlug === rawLower) return true;

  return false;
}

function resolvePublicImageUrl(storagePath) {
  if (!storagePath || typeof storagePath !== 'string') return '';
  const trimmed = storagePath.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return '';
  }
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${OUTERA_PLACE_CANONICAL_ORIGIN}${trimmed}`;
  }
  const clean = trimmed.replace(/^\/+/, '').replace(/^community-review-media\//, '');
  return `${SUPABASE_URL}/storage/v1/object/public/community-review-media/${encodeURI(clean)}`;
}

function parseDescriptionMeta(rawDescription) {
  if (!rawDescription || typeof rawDescription !== 'string') {
    return { cleanDescription: '' };
  }
  const bracketMatch = rawDescription.match(/\[([^\]]+)\]\s*$/);
  const cleanDescription = rawDescription.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
  if (!bracketMatch || !bracketMatch[1]) {
    return { cleanDescription };
  }
  const result = { cleanDescription };
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

async function fetchApprovedPlace(slugParam) {
  const parsed = parseRouteParam(slugParam);
  if (!parsed) return null;

  let matchedRow = null;

  if (parsed.isFullUuid) {
    if (REMOVED_TEST_PLACE_IDS.has(parsed.uniqueId)) return null;
    const { data, error } = await supabase
      .from('places')
      .select('*, place_images(image_url)')
      .eq('id', parsed.uniqueId)
      .maybeSingle();
    if (!error && data) matchedRow = data;
  } else {
    const { data: bySlug, error: slugErr } = await supabase
      .from('places')
      .select('*, place_images(image_url)')
      .eq('slug', parsed.rawParam)
      .limit(1)
      .maybeSingle();
    if (!slugErr && bySlug) matchedRow = bySlug;

    if (!matchedRow) {
      const { data: candidates, error: candErr } = await supabase
        .from('places')
        .select('*, place_images(image_url)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!candErr && candidates) {
        matchedRow = candidates.find((r) => doesRowMatch(r, slugParam)) || null;
      }
    }
  }

  if (!matchedRow || !matchedRow.id) return null;
  const rowIdStr = String(matchedRow.id);
  const normName = String(matchedRow.name || '').trim().toLowerCase();
  if (REMOVED_TEST_PLACE_IDS.has(rowIdStr) || REMOVED_TEST_NAMES.has(normName)) return null;
  if (typeof matchedRow.status === 'string' && matchedRow.status.toLowerCase() !== 'approved') {
    return null;
  }

  let coverImage = '';
  if (Array.isArray(matchedRow.place_images)) {
    for (const img of matchedRow.place_images) {
      const u = resolvePublicImageUrl(img?.image_url);
      if (u) {
        coverImage = u;
        break;
      }
    }
  }

  let communityRating = null;
  let totalReports = 0;
  try {
    const { data: approvedPosts } = await supabase
      .from('place_posts')
      .select('id, rating')
      .eq('place_id', rowIdStr)
      .eq('status', 'approved')
      .is('deleted_at', null);

    if (approvedPosts && approvedPosts.length > 0) {
      totalReports = approvedPosts.length;
      const ratings = approvedPosts
        .map((p) => Number(p.rating))
        .filter((r) => r >= 1 && r <= 5);
      if (ratings.length > 0) {
        communityRating =
          Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
      }
      if (!coverImage) {
        const postIds = approvedPosts.map((p) => p.id);
        const { data: postImgs } = await supabase
          .from('place_post_images')
          .select('storage_path, display_order, created_at')
          .in('post_id', postIds)
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(1);
        if (postImgs && postImgs.length > 0) {
          coverImage = resolvePublicImageUrl(postImgs[0].storage_path);
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
    name: (matchedRow.name || 'OUTERA Spot').trim(),
    category: (matchedRow.category || 'Chill').trim(),
    description: (
      matchedRow.short_description ||
      parsedMeta.cleanDescription ||
      matchedRow.why_worth_visiting ||
      parsedMeta.whyWorthVisiting ||
      ''
    ).trim(),
    address: matchedRow.address || '',
    neighborhood: matchedRow.area || parsedMeta.area || '',
    upazila: matchedRow.upazila || parsedMeta.upazila || '',
    district: matchedRow.district || parsedMeta.district || 'Dhaka',
    division: matchedRow.division || parsedMeta.division || 'Dhaka',
    og_image: coverImage || OUTERA_DEFAULT_OG_IMAGE,
    communityRating,
    totalReports,
    latitude: matchedRow.latitude,
    longitude: matchedRow.longitude,
  };
}

export default async function handler(req, res) {
  const rawSlug =
    (req.query && req.query.slug) ||
    (req.url ? req.url.replace(/^\/places?\//i, '').split('?')[0] : '');

  let baseHtml = COMPILED_INDEX_HTML;

  if (baseHtml.includes('/src/main.tsx') && req.headers?.host) {
    try {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const resp = await fetch(`${proto}://${req.headers.host}/index.html`);
      if (resp.ok) {
        baseHtml = await resp.text();
      }
    } catch {}
  }

  const place = await fetchApprovedPlace(String(rawSlug || ''));

  const cleanedHtml = baseHtml
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');

  if (!place) {
    const fallbackUrl = rawSlug
      ? `${OUTERA_PLACE_CANONICAL_ORIGIN}/place/${encodeURIComponent(String(rawSlug))}`
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

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    return res.status(404).send(cleanedHtml.replace('<head>', `<head>${headBlock}`));
  }

  const canonicalUrl = `${OUTERA_PLACE_CANONICAL_ORIGIN}/place/${place.slug}`;
  const areaPart = (place.neighborhood || place.upazila || '').trim();
  const districtPart = (place.district || place.division || 'Bangladesh').trim();
  const divisionPart = (place.division || districtPart || 'Bangladesh').trim();
  const locationLabel =
    areaPart && areaPart.toLowerCase() !== districtPart.toLowerCase()
      ? `${areaPart}, ${districtPart}`
      : districtPart;

  const pageTitle = `${place.name} (${place.category}) — ${locationLabel} | OUTERA`;
  const ogTitle = `${place.name} · ${place.category} in ${locationLabel} — OUTERA`;
  const description = place.description
    ? `${place.description.slice(0, 115).trim()}${place.description.length > 115 ? '...' : ''} — Explore ${place.name} (${place.category}) in ${locationLabel} on OUTERA.`
    : `Discover ${place.name}, a verified ${place.category} spot in ${locationLabel} on OUTERA. View photos, community reviews, and directions.`;
  const ogDesc = (place.description || description).slice(0, 200);
  const ogImageAlt = `${place.name} (${place.category}) in ${locationLabel} on OUTERA`;

  const catLower = String(place.category || '').toLowerCase();
  const schemaTypes =
    catLower === 'cafe'
      ? ['Place', 'LocalBusiness', 'FoodEstablishment', 'CafeOrCoffeeShop']
      : catLower === 'food'
      ? ['Place', 'LocalBusiness', 'FoodEstablishment', 'Restaurant']
      : catLower === 'stay'
      ? ['Place', 'LocalBusiness', 'LodgingBusiness']
      : catLower === 'shopping'
      ? ['Place', 'LocalBusiness', 'Store']
      : ['Place', 'LocalBusiness', 'TouristAttraction'];

  const placeNode = {
    '@type': schemaTypes,
    '@id': `${canonicalUrl}#place`,
    name: place.name,
    description: ogDesc,
    url: canonicalUrl,
    image: [place.og_image],
    address: {
      '@type': 'PostalAddress',
      streetAddress: place.address || locationLabel,
      addressLocality: districtPart,
      addressRegion: divisionPart,
      addressCountry: 'BD',
    },
  };

  if (typeof place.latitude === 'number' && typeof place.longitude === 'number') {
    placeNode.geo = {
      '@type': 'GeoCoordinates',
      latitude: place.latitude,
      longitude: place.longitude,
    };
  }

  if (typeof place.communityRating === 'number' && place.communityRating > 0) {
    placeNode.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: place.communityRating,
      bestRating: 5,
      worstRating: 1,
      ratingCount: Math.max(1, Number(place.totalReports) || 1),
    };
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      placeNode,
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'OUTERA Bangladesh',
            item: OUTERA_PLACE_CANONICAL_ORIGIN,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: divisionPart,
            item: `${OUTERA_PLACE_CANONICAL_ORIGIN}/location/${divisionPart.toLowerCase()}`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: place.name,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };

  const headBlock = `
    <title>${escapeHtmlAttr(pageTitle)}</title>
    <meta name="description" content="${escapeHtmlAttr(description.slice(0, 160))}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${escapeHtmlAttr(canonicalUrl)}" />
    <meta property="og:type" content="place" />
    <meta property="og:site_name" content="OUTERA" />
    <meta property="og:title" content="${escapeHtmlAttr(ogTitle)}" />
    <meta property="og:description" content="${escapeHtmlAttr(ogDesc)}" />
    <meta property="og:url" content="${escapeHtmlAttr(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtmlAttr(place.og_image)}" />
    <meta property="og:image:secure_url" content="${escapeHtmlAttr(place.og_image)}" />
    <meta property="og:image:alt" content="${escapeHtmlAttr(ogImageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtmlAttr(ogTitle)}" />
    <meta name="twitter:description" content="${escapeHtmlAttr(ogDesc)}" />
    <meta name="twitter:image" content="${escapeHtmlAttr(place.og_image)}" />
    <script id="outera-dynamic-place-jsonld" type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).send(cleanedHtml.replace('<head>', `<head>${headBlock}`));
}
