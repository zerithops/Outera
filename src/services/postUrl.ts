// ============================================================================
// OUTERA — UNIQUE POST-SHARING URL, SLUG & DYNAMIC METADATA SYSTEM
// Canonical URL Structure: https://www.outerabd.buzz/p/{slug}-{uniqueId}
// Example:                 https://www.outerabd.buzz/p/raaga-art-caffe-8f3k2a
// ============================================================================

export const OUTERA_PRODUCTION_ORIGIN = 'https://www.outerabd.buzz';
export const OUTERA_DEFAULT_OG_IMAGE = `${OUTERA_PRODUCTION_ORIGIN}/assets/aistudio/Neon_Lime_OUTERA_Tech_Logo_8daa6fb0.png`;

export const OUTERA_DEFAULT_TITLE = 'OUTERA — Find something worth going out for.';
export const OUTERA_DEFAULT_DESCRIPTION =
  'Location-based Gen-Z discovery platform in Bangladesh. Find something worth going out for — curated spots, community reviews, and verified experiences around you.';

export interface PostUrlInput {
  id: string;
  title?: string | null;
  place_name?: string | null;
  content?: string | null;
  rating?: number | null;
  author_name?: string | null;
  author_username?: string | null;
  place_category?: string | null;
  place_address?: string | null;
  images?: string[] | null;
  created_at?: string | null;
  slug?: string | null;
  short_id?: string | null;
}

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Converts a place name or post title into a clean, URL-safe lowercase slug.
 * Example: "Raaga Art Caffe" -> "raaga-art-caffe"
 */
export function slugifyText(input?: string | null): string {
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

  const truncated = normalized.slice(0, 60).replace(/-+[^-]*$/, '').replace(/-+$/, '');
  return truncated || normalized.slice(0, 60).replace(/-+$/, '') || 'community-post';
}

/**
 * Generates a deterministic 6-character lowercase alphanumeric (`[0-9a-z]{6}`)
 * unique identifier from a post's UUID (or non-UUID ID).
 * Example output: "8f3k2a"
 */
export function uuidToShortId(id: string): string {
  const raw = String(id || '').trim();
  if (!raw) return 'post00';

  const hex = raw.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (hex.length >= 16) {
    try {
      const high = BigInt('0x' + hex.slice(0, 8));
      const low = BigInt('0x' + hex.slice(-8));
      const combined = (high ^ (low << 7n)) & 0xffffffffn;
      const minVal = 60466176n; // 36^5 ("100000" in base36)
      const maxVal = 2176782336n; // 36^6 ("1000000" in base36)
      const mapped = minVal + (combined % (maxVal - minVal));
      return mapped.toString(36).slice(0, 6);
    } catch {
      // Fallback below
    }
  }

  // Deterministic hash fallback for non-UUID IDs
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  const minVal = 60466176;
  const range = 2176782336 - minVal;
  return (minVal + (unsigned % range)).toString(36).slice(0, 6);
}

/**
 * Returns the short unique identifier for a post.
 * Reuses `post.short_id` if present in DB, otherwise deterministically derives from `post.id`.
 */
export function getPostUniqueId(post: Pick<PostUrlInput, 'id' | 'short_id'>): string {
  if (post.short_id && typeof post.short_id === 'string' && post.short_id.trim().length >= 4) {
    return post.short_id.trim().toLowerCase();
  }
  return uuidToShortId(post.id);
}

/**
 * Generates the base human-readable slug from the post's associated place name or title.
 */
export function getPostBaseSlug(
  post: Pick<PostUrlInput, 'title' | 'place_name' | 'slug' | 'id' | 'short_id'>
): string {
  const uniqueId = getPostUniqueId(post);
  if (post.slug && typeof post.slug === 'string' && post.slug.trim()) {
    const cleanDbSlug = post.slug.trim().toLowerCase();
    if (cleanDbSlug.endsWith(`-${uniqueId}`)) {
      const stripped = cleanDbSlug.slice(0, cleanDbSlug.length - uniqueId.length - 1);
      if (stripped) return stripped;
    }
    return slugifyText(cleanDbSlug);
  }

  // Prefer the associated place name (e.g., "Raaga Art Caffe" -> "raaga-art-caffe"),
  // or combine/fallback to post title if place_name is generic or missing.
  const placeName = (post.place_name || '').trim();
  const title = (post.title || '').trim();

  if (placeName && placeName.toLowerCase() !== 'selected place' && placeName.toLowerCase() !== 'spot') {
    return slugifyText(placeName);
  }
  if (title) {
    return slugifyText(title);
  }
  return 'community-post';
}

/**
 * Builds the complete `{slug}-{uniqueId}` segment for `/p/{slug}-{uniqueId}`.
 * Example: "raaga-art-caffe-8f3k2a"
 */
export function buildPostSlugWithId(post: PostUrlInput): string {
  const uniqueId = getPostUniqueId(post);
  if (
    post.slug &&
    typeof post.slug === 'string' &&
    post.slug.trim().toLowerCase().endsWith(`-${uniqueId}`)
  ) {
    return post.slug.trim().toLowerCase();
  }
  const baseSlug = getPostBaseSlug(post);
  return `${baseSlug}-${uniqueId}`;
}

/**
 * Builds the relative path `/p/{slug}-{uniqueId}` for browser history & routing.
 * Example: "/p/raaga-art-caffe-8f3k2a"
 */
export function buildPostPath(post: PostUrlInput): string {
  return `/p/${buildPostSlugWithId(post)}`;
}

/**
 * Builds the canonical production URL `https://www.outerabd.buzz/p/{slug}-{uniqueId}`.
 * Example: "https://www.outerabd.buzz/p/raaga-art-caffe-8f3k2a"
 */
export function buildCanonicalPostUrl(post: PostUrlInput): string {
  return `${OUTERA_PRODUCTION_ORIGIN}${buildPostPath(post)}`;
}

/**
 * Builds the share URL for a post.
 * Always uses `https://www.outerabd.buzz/p/{slug}-{uniqueId}` as required.
 * Never returns only the homepage URL.
 */
export function buildSharePostUrl(post: PostUrlInput): string {
  return buildCanonicalPostUrl(post);
}

/**
 * Builds the runtime navigable URL on the current host (useful for "Open in New Tab" during local/preview testing).
 */
export function buildRuntimePostUrl(post: PostUrlInput): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (
      window.location.hostname === 'outerabd.buzz' ||
      window.location.hostname === 'www.outerabd.buzz'
    ) {
      return buildCanonicalPostUrl(post);
    }
    return `${window.location.origin}${buildPostPath(post)}`;
  }
  return buildCanonicalPostUrl(post);
}

export interface ParsedPostRoute {
  rawParam: string;
  uniqueId: string;
  slugPart: string;
  isFullUuid: boolean;
}

/**
 * Parses a route parameter such as:
 * - "raaga-art-caffe-8f3k2a" -> { uniqueId: "8f3k2a", slugPart: "raaga-art-caffe", isFullUuid: false }
 * - "raaga-art-caffe-15f00f51-8983-4bd9-9215-f7e30977e38b" -> { uniqueId: "15f00f51-...", isFullUuid: true }
 * - "15f00f51-8983-4bd9-9215-f7e30977e38b" -> { uniqueId: "15f00f51-...", isFullUuid: true }
 */
export function parsePostRouteParam(rawInput?: string | null): ParsedPostRoute | null {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let cleaned = rawInput.trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep raw if malformed percent encoding
  }
  cleaned = cleaned
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?p\//i, '')
    .replace(/^#\/?post\//i, '')
    .replace(/^#\/?p\//i, '')
    .replace(/[/?#]+$/, '')
    .trim();

  if (!cleaned) return null;

  // Check if it contains a full 36-char UUID
  const uuidMatch = cleaned.match(UUID_REGEX);
  if (uuidMatch && uuidMatch[0]) {
    const fullUuid = uuidMatch[0].toLowerCase();
    const idx = cleaned.toLowerCase().indexOf(fullUuid);
    const slugPart = idx > 0 ? cleaned.slice(0, idx).replace(/-+$/, '').toLowerCase() : '';
    return {
      rawParam: cleaned,
      uniqueId: fullUuid,
      slugPart,
      isFullUuid: true,
    };
  }

  // Extract trailing `-uniqueId` segment
  const lastDashIdx = cleaned.lastIndexOf('-');
  if (lastDashIdx > 0 && lastDashIdx < cleaned.length - 1) {
    const slugPart = cleaned.slice(0, lastDashIdx).toLowerCase();
    const uniqueId = cleaned.slice(lastDashIdx + 1).toLowerCase();
    return {
      rawParam: cleaned.toLowerCase(),
      uniqueId,
      slugPart,
      isFullUuid: false,
    };
  }

  return {
    rawParam: cleaned.toLowerCase(),
    uniqueId: cleaned.toLowerCase(),
    slugPart: '',
    isFullUuid: false,
  };
}

/**
 * Inspects `window.location` (`pathname`, `hash`, `search`) and extracts a post route if present.
 * Supports:
 * - `/p/{slug}-{uniqueId}` (primary canonical route)
 * - `/p/{uuid}`
 * - `#post/{id}` or `#post/{slug}-{uniqueId}` (legacy hash compatibility)
 * - `#p/{slug}-{uniqueId}` or `#/p/{slug}-{uniqueId}`
 * - `?post={id}` or `?p={slug}-{uniqueId}`
 */
export function parsePostRouteFromLocation(
  pathname: string,
  hash: string = '',
  search: string = ''
): ParsedPostRoute | null {
  const cleanPath = (pathname || '').trim();
  const pathMatch = cleanPath.match(/^\/p\/([^/?#]+)\/?$/i);
  if (pathMatch && pathMatch[1]) {
    return parsePostRouteParam(pathMatch[1]);
  }

  const cleanHash = (hash || '').trim();
  const hashPostMatch =
    cleanHash.match(/^#\/?p\/([^/?#]+)\/?$/i) ||
    cleanHash.match(/^#\/?post\/([^/?#]+)\/?$/i);
  if (hashPostMatch && hashPostMatch[1]) {
    return parsePostRouteParam(hashPostMatch[1]);
  }

  if (search) {
    try {
      const params = new URLSearchParams(search);
      const qPost = params.get('p') || params.get('post');
      if (qPost) {
        return parsePostRouteParam(qPost);
      }
    } catch {
      // Ignore invalid query string
    }
  }

  return null;
}

/**
 * Checks whether a candidate post record matches a parsed post route or identifier.
 */
export function doesPostMatchRoute(
  post: { id: string; title?: string | null; place_name?: string | null; slug?: string | null; short_id?: string | null },
  identifierOrSlug: string
): boolean {
  if (!post || !post.id || !identifierOrSlug) return false;
  const parsed = parsePostRouteParam(identifierOrSlug);
  if (!parsed) return false;

  const postIdLower = String(post.id).trim().toLowerCase();
  const rawLower = parsed.rawParam.toLowerCase();
  const targetUniqueId = parsed.uniqueId.toLowerCase();

  // 1. Exact ID match
  if (postIdLower === rawLower || postIdLower === targetUniqueId) {
    return true;
  }

  // 2. Derived or stored short_id match (primary `{slug}-{uniqueId}` resolution)
  const postShortId = getPostUniqueId(post);
  if (postShortId === targetUniqueId || postShortId === rawLower) {
    return true;
  }

  // 3. Stored slug match
  if (post.slug && String(post.slug).trim().toLowerCase() === rawLower) {
    return true;
  }

  // 4. Computed `{slug}-{uniqueId}` match
  const computedSlugWithId = buildPostSlugWithId(post);
  if (computedSlugWithId === rawLower) {
    return true;
  }

  // 5. UUID hex prefix / suffix compatibility (for 6-12 char hex short links)
  if (targetUniqueId.length >= 6) {
    const cleanHex = postIdLower.replace(/-/g, '');
    if (cleanHex.startsWith(targetUniqueId) || cleanHex.endsWith(targetUniqueId)) {
      return true;
    }
  }

  return false;
}

export interface PostSeoMetadata {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogImageAlt: string;
  canonicalUrl: string;
  twitterCard: 'summary_large_image';
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  jsonLd: Record<string, any>;
}

/**
 * Ensures any image URL is an absolute `https://` URL for social media crawlers
 * (Facebook, Messenger, WhatsApp, X/Twitter require absolute image URLs).
 */
export function ensureAbsoluteImageUrl(imageUrl?: string | null): string {
  if (!imageUrl || typeof imageUrl !== 'string') return OUTERA_DEFAULT_OG_IMAGE;
  const trimmed = imageUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return OUTERA_DEFAULT_OG_IMAGE;
  }
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${OUTERA_PRODUCTION_ORIGIN}${trimmed}`;
  }
  return `https://znyglvfsbxyjsctphigm.supabase.co/storage/v1/object/public/community-review-media/${trimmed.replace(
    /^community-review-media\//,
    ''
  )}`;
}

/**
 * Builds complete SEO, Open Graph, Twitter Card, Canonical, and JSON-LD metadata for an approved post.
 */
export function buildPostMetadataPayload(post: PostUrlInput): PostSeoMetadata {
  const cleanTitle = (post.title || 'Community Review').trim();
  const placeName =
    post.place_name && post.place_name !== 'Selected Place'
      ? post.place_name.trim()
      : 'OUTERA Spot';
  const authorName = (post.author_name || 'OUTERA Scout').trim();
  const rating = typeof post.rating === 'number' && post.rating > 0 ? post.rating : 5;
  const rawContent = (post.content || '')
    .replace(/\s+/g, ' ')
    .trim();

  const pageTitle = `${cleanTitle} — ${placeName} | OUTERA`;
  const ogTitle = `${cleanTitle} · ${placeName} (${rating}/5 ★) — OUTERA`;

  const snippet =
    rawContent.length > 140 ? `${rawContent.slice(0, 137).trim()}...` : rawContent;
  const description = snippet
    ? `${snippet} — Verified review by ${authorName} (${rating}/5 ★) at ${placeName} on OUTERA.`
    : `Read ${authorName}'s ${rating}/5 ★ community review of ${placeName} on OUTERA.`;

  const primaryImage =
    Array.isArray(post.images) && post.images.length > 0 ? post.images[0] : null;
  const ogImage = ensureAbsoluteImageUrl(primaryImage);
  const canonicalUrl = buildCanonicalPostUrl(post);

  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Review',
    name: cleanTitle,
    reviewBody: rawContent,
    url: canonicalUrl,
    datePublished: post.created_at || new Date().toISOString(),
    author: {
      '@type': 'Person',
      name: authorName,
    },
    itemReviewed: {
      '@type': 'Place',
      name: placeName,
      address: post.place_address || 'Bangladesh',
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: rating,
      bestRating: 5,
      worstRating: 1,
    },
  };

  if (primaryImage) {
    jsonLd.image = [ogImage];
  }

  return {
    title: pageTitle,
    description: description.slice(0, 160),
    ogTitle,
    ogDescription: (rawContent || description).slice(0, 200),
    ogImage,
    ogImageAlt: `${cleanTitle} at ${placeName} on OUTERA`,
    canonicalUrl,
    twitterCard: 'summary_large_image',
    twitterTitle: ogTitle,
    twitterDescription: (rawContent || description).slice(0, 200),
    twitterImage: ogImage,
    jsonLd,
  };
}

function upsertMetaTag(attrName: 'name' | 'property', attrValue: string, content: string) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonicalLink(href: string) {
  if (typeof document === 'undefined') return;
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function upsertJsonLdScript(data: Record<string, any> | null) {
  if (typeof document === 'undefined') return;
  const scriptId = 'outera-dynamic-post-jsonld';
  const existing = document.getElementById(scriptId);
  if (!data) {
    if (existing) existing.remove();
    return;
  }
  const script = existing || document.createElement('script');
  script.id = scriptId;
  script.setAttribute('type', 'application/ld+json');
  script.textContent = JSON.stringify(data);
  if (!existing) {
    document.head.appendChild(script);
  }
}

/**
 * Dynamically updates the document `<head>` metadata for an active post,
 * or restores OUTERA's default metadata when `post` is null.
 */
export function applyClientPostMetadata(post: PostUrlInput | null) {
  if (typeof document === 'undefined') return;

  if (!post) {
    document.title = OUTERA_DEFAULT_TITLE;
    upsertMetaTag('name', 'description', OUTERA_DEFAULT_DESCRIPTION);
    upsertMetaTag('property', 'og:title', OUTERA_DEFAULT_TITLE);
    upsertMetaTag('property', 'og:description', OUTERA_DEFAULT_DESCRIPTION);
    upsertMetaTag('property', 'og:type', 'website');
    upsertMetaTag('property', 'og:url', OUTERA_PRODUCTION_ORIGIN);
    upsertMetaTag('property', 'og:image', OUTERA_DEFAULT_OG_IMAGE);
    upsertMetaTag('property', 'og:site_name', 'OUTERA');
    upsertMetaTag('name', 'twitter:card', 'summary_large_image');
    upsertMetaTag('name', 'twitter:title', OUTERA_DEFAULT_TITLE);
    upsertMetaTag('name', 'twitter:description', OUTERA_DEFAULT_DESCRIPTION);
    upsertMetaTag('name', 'twitter:image', OUTERA_DEFAULT_OG_IMAGE);
    upsertCanonicalLink(OUTERA_PRODUCTION_ORIGIN);
    upsertJsonLdScript(null);
    return;
  }

  const meta = buildPostMetadataPayload(post);
  document.title = meta.title;
  upsertMetaTag('name', 'description', meta.description);
  upsertMetaTag('property', 'og:title', meta.ogTitle);
  upsertMetaTag('property', 'og:description', meta.ogDescription);
  upsertMetaTag('property', 'og:type', 'article');
  upsertMetaTag('property', 'og:url', meta.canonicalUrl);
  upsertMetaTag('property', 'og:image', meta.ogImage);
  upsertMetaTag('property', 'og:image:secure_url', meta.ogImage);
  upsertMetaTag('property', 'og:image:alt', meta.ogImageAlt);
  upsertMetaTag('property', 'og:site_name', 'OUTERA');
  upsertMetaTag('name', 'twitter:card', meta.twitterCard);
  upsertMetaTag('name', 'twitter:title', meta.twitterTitle);
  upsertMetaTag('name', 'twitter:description', meta.twitterDescription);
  upsertMetaTag('name', 'twitter:image', meta.twitterImage);
  upsertCanonicalLink(meta.canonicalUrl);
  upsertJsonLdScript(meta.jsonLd);
}

/**
 * Shares a community post using the Web Share API on supported mobile/desktop browsers,
 * with an automatic clipboard Copy Link fallback.
 * Never shares the bare homepage URL.
 */
export async function shareCommunityPost(
  post: PostUrlInput,
  options?: { preferCopyOnly?: boolean }
): Promise<{ success: boolean; method: 'web_share' | 'clipboard'; url: string }> {
  const url = buildSharePostUrl(post);
  const placeLabel =
    post.place_name && post.place_name !== 'Selected Place' ? ` at ${post.place_name}` : '';
  const shareTitle = `${post.title || 'Community Post'}${placeLabel} — OUTERA`;
  const shareText = post.content
    ? `${post.content.slice(0, 110).trim()}${post.content.length > 110 ? '...' : ''} — View on OUTERA`
    : `Check out this community review${placeLabel} on OUTERA`;

  if (
    !options?.preferCopyOnly &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url,
      });
      return { success: true, method: 'web_share', url };
    } catch (err: any) {
      // If user explicitly aborted the native share sheet, still copy link as helpful fallback or return
      if (err?.name === 'AbortError') {
        return { success: false, method: 'web_share', url };
      }
      // In iframes or unsupported environments, fall through to clipboard copy
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return { success: true, method: 'clipboard', url };
    } catch {
      // Fallback to textarea copy below
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return { success: true, method: 'clipboard', url };
    } catch {
      // Ignore
    }
  }

  return { success: false, method: 'clipboard', url };
}
