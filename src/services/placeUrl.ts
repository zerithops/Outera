// ============================================================================
// OUTERA — UNIQUE PLACE-SHARING URL, SLUG & DYNAMIC OPEN GRAPH METADATA SYSTEM
// Canonical URL Structure: https://outerabd.buzz/place/{unique-id}
// Example:                 https://outerabd.buzz/place/raaga-art-caffe-0yr4
// ============================================================================

import { Place } from '../types/outera';
import {
  OUTERA_DEFAULT_DESCRIPTION,
  OUTERA_DEFAULT_OG_IMAGE,
  OUTERA_DEFAULT_TITLE,
  ensureAbsoluteImageUrl,
  slugifyText,
  uuidToShortId,
} from './postUrl';

export const OUTERA_PLACE_CANONICAL_ORIGIN = 'https://outerabd.buzz';

export interface PlaceUrlInput {
  id: string;
  name?: string | null;
  slug?: string | null;
  category?: string | null;
  subcategory?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  whyPick?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  upazila?: string | null;
  district?: string | null;
  division?: string | null;
  images?: string[] | null;
  image?: string | null;
  communityRating?: number | null;
  totalReports?: number | null;
  coordinates?: { lat: number; lng: number } | null;
}

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Generates the single, deterministic, permanent unique identifier/slug for a place.
 * - Uses `place.slug` from the database if it is a valid non-UUID slug (e.g. "raaga-art-caffe-0yr4").
 * - Otherwise deterministically derives `{slugified-name}-{shortId}` from `place.name` and `place.id`.
 * Never generates random or duplicate URLs for the same place.
 */
export function buildPlaceUniqueSlug(place: Pick<PlaceUrlInput, 'id' | 'name' | 'slug'>): string {
  const rawId = String(place?.id || '').trim();
  const rawSlug = typeof place?.slug === 'string' ? place.slug.trim().toLowerCase() : '';

  // If the place has a stored slug in Supabase that is not just the raw UUID, use it as the canonical unique-id
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

  if (baseNameSlug.endsWith(`-${shortId}`)) {
    return baseNameSlug;
  }
  return `${baseNameSlug}-${shortId}`;
}

/**
 * Builds the relative path `/place/{unique-id}` for browser history and SPA routing.
 * Example: "/place/raaga-art-caffe-0yr4"
 */
export function buildPlacePath(place: Pick<PlaceUrlInput, 'id' | 'name' | 'slug'>): string {
  return `/place/${buildPlaceUniqueSlug(place)}`;
}

/**
 * Builds the canonical permanent URL `https://outerabd.buzz/place/{unique-id}`.
 * Example: "https://outerabd.buzz/place/raaga-art-caffe-0yr4"
 */
export function buildCanonicalPlaceUrl(place: Pick<PlaceUrlInput, 'id' | 'name' | 'slug'>): string {
  return `${OUTERA_PLACE_CANONICAL_ORIGIN}${buildPlacePath(place)}`;
}

/**
 * Builds the shareable URL for a place.
 * Always returns the exact unique place URL, never the homepage.
 */
export function buildSharePlaceUrl(place: Pick<PlaceUrlInput, 'id' | 'name' | 'slug'>): string {
  return buildCanonicalPlaceUrl(place);
}

/**
 * Builds the runtime navigable URL on the current host (for local/preview environments).
 */
export function buildRuntimePlaceUrl(place: Pick<PlaceUrlInput, 'id' | 'name' | 'slug'>): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (
      window.location.hostname === 'outerabd.buzz' ||
      window.location.hostname === 'www.outerabd.buzz'
    ) {
      return buildCanonicalPlaceUrl(place);
    }
    return `${window.location.origin}${buildPlacePath(place)}`;
  }
  return buildCanonicalPlaceUrl(place);
}

export interface ParsedPlaceRoute {
  rawParam: string;
  uniqueId: string;
  slugPart: string;
  isFullUuid: boolean;
}

/**
 * Parses a `/place/{unique-id}` parameter.
 * Supports:
 * - "raaga-art-caffe-0yr4"
 * - "15f00f51-8983-4bd9-9215-f7e30977e38b"
 * - "raaga-art-caffe-8f3k2a"
 */
export function parsePlaceRouteParam(rawInput?: string | null): ParsedPlaceRoute | null {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let cleaned = rawInput.trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep raw if malformed encoding
  }

  cleaned = cleaned
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?places?\//i, '')
    .replace(/^#\/?places?\//i, '')
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

/**
 * Inspects `window.location` (`pathname`, `hash`, `search`) and extracts a place route if present.
 * Supports:
 * - `/place/{unique-id}` (primary canonical route)
 * - `/places/{unique-id}`
 * - `#place/{unique-id}` or `#/place/{unique-id}`
 * - `?place={unique-id}` or `?spot={unique-id}` (legacy compatibility)
 */
export function parsePlaceRouteFromLocation(
  pathname: string,
  hash: string = '',
  search: string = ''
): ParsedPlaceRoute | null {
  const cleanPath = (pathname || '').trim();
  const pathMatch = cleanPath.match(/^\/places?\/([^/?#]+)\/?$/i);
  if (pathMatch && pathMatch[1]) {
    return parsePlaceRouteParam(pathMatch[1]);
  }

  const cleanHash = (hash || '').trim();
  const hashMatch = cleanHash.match(/^#\/?places?\/([^/?#]+)\/?$/i);
  if (hashMatch && hashMatch[1]) {
    return parsePlaceRouteParam(hashMatch[1]);
  }

  if (search) {
    try {
      const params = new URLSearchParams(search);
      const qPlace = params.get('place') || params.get('spot');
      if (qPlace) {
        return parsePlaceRouteParam(qPlace);
      }
    } catch {
      // Ignore malformed query string
    }
  }

  return null;
}

/**
 * Checks whether a candidate place record matches a parsed place route or identifier.
 */
export function doesPlaceMatchRoute(
  place: Pick<PlaceUrlInput, 'id' | 'name' | 'slug'>,
  identifierOrSlug: string
): boolean {
  if (!place || !place.id || !identifierOrSlug) return false;
  const parsed = parsePlaceRouteParam(identifierOrSlug);
  if (!parsed) return false;

  const placeIdLower = String(place.id).trim().toLowerCase();
  const rawLower = parsed.rawParam.toLowerCase();
  const targetUniqueId = parsed.uniqueId.toLowerCase();
  const storedSlugLower = typeof place.slug === 'string' ? place.slug.trim().toLowerCase() : '';
  const canonicalSlug = buildPlaceUniqueSlug(place).toLowerCase();
  const deterministicShortId = uuidToShortId(place.id).toLowerCase();
  const baseNameSlug = slugifyText(place.name || '').toLowerCase();

  // 1. Exact ID match
  if (placeIdLower === rawLower || placeIdLower === targetUniqueId) {
    return true;
  }

  // 2. Exact stored slug or canonical slug match (e.g. "raaga-art-caffe-0yr4")
  if (storedSlugLower && (storedSlugLower === rawLower || storedSlugLower === targetUniqueId)) {
    return true;
  }
  if (canonicalSlug === rawLower) {
    return true;
  }

  // 3. Deterministic `{slug}-{shortId}` or shortId match
  if (`${baseNameSlug}-${deterministicShortId}` === rawLower || deterministicShortId === targetUniqueId) {
    return true;
  }

  // 4. Stored slug trailing suffix + name slug match
  if (storedSlugLower && storedSlugLower.endsWith(`-${targetUniqueId}`) && parsed.slugPart === baseNameSlug) {
    return true;
  }

  // 5. Legacy `{slug}-{id.slice(0,6)}` or 6+ char UUID prefix match (e.g. "raaga-art-caffe-15f00f" or "15f00f51")
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

  // 6. Exact name slug match if unambiguous
  if (baseNameSlug && baseNameSlug === rawLower) {
    return true;
  }

  return false;
}

export interface PlaceSeoMetadata {
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
 * Selects the best cover image for a place, ensuring an absolute HTTPS URL for Open Graph crawlers.
 */
export function resolvePlaceCoverImage(place: PlaceUrlInput): string {
  const candidates: (string | null | undefined)[] = [
    ...(Array.isArray(place.images) ? place.images : []),
    place.image,
  ];
  for (const cand of candidates) {
    if (cand && typeof cand === 'string' && cand.trim() && !cand.trim().startsWith('data:')) {
      return ensureAbsoluteImageUrl(cand);
    }
  }
  return OUTERA_DEFAULT_OG_IMAGE;
}

/**
 * Builds complete SEO, Open Graph, Twitter Card, Canonical URL, and Schema.org Place JSON-LD metadata.
 */
export function buildPlaceMetadataPayload(place: PlaceUrlInput): PlaceSeoMetadata {
  const placeName = (place.name || 'OUTERA Spot').trim();
  const category = (place.category || 'Chill').trim();
  const areaPart = (place.neighborhood || place.upazila || '').trim();
  const districtPart = (place.district || place.division || 'Bangladesh').trim();
  const locationLabel =
    areaPart && areaPart.toLowerCase() !== districtPart.toLowerCase()
      ? `${areaPart}, ${districtPart}`
      : districtPart;

  const rawDesc = (
    place.shortDescription ||
    place.whyPick ||
    place.fullDescription ||
    ''
  )
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const pageTitle = `${placeName} (${category}) — ${locationLabel} | OUTERA`;
  const ogTitle = `${placeName} · ${category} in ${locationLabel} — OUTERA`;

  const description = rawDesc
    ? `${rawDesc.slice(0, 125).trim()}${rawDesc.length > 125 ? '...' : ''} — Explore ${placeName} (${category}) in ${locationLabel} on OUTERA.`
    : `Discover ${placeName}, a verified ${category} spot in ${locationLabel} on OUTERA. View photos, community reviews, and directions.`;

  const ogDescription = rawDesc
    ? `${rawDesc.slice(0, 175).trim()}${rawDesc.length > 175 ? '...' : ''}`
    : description;

  const ogImage = resolvePlaceCoverImage(place);
  const canonicalUrl = buildCanonicalPlaceUrl(place);

  const jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: placeName,
    description: ogDescription,
    url: canonicalUrl,
    image: [ogImage],
    address: {
      '@type': 'PostalAddress',
      streetAddress: place.address || locationLabel,
      addressLocality: districtPart,
      addressRegion: place.division || districtPart,
      addressCountry: 'BD',
    },
  };

  if (
    place.coordinates &&
    typeof place.coordinates.lat === 'number' &&
    typeof place.coordinates.lng === 'number'
  ) {
    jsonLd.geo = {
      '@type': 'GeoCoordinates',
      latitude: place.coordinates.lat,
      longitude: place.coordinates.lng,
    };
  }

  if (typeof place.communityRating === 'number' && place.communityRating > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: place.communityRating,
      bestRating: 5,
      worstRating: 1,
      ratingCount: Math.max(1, Number(place.totalReports) || 1),
    };
  }

  return {
    title: pageTitle,
    description: description.slice(0, 160),
    ogTitle,
    ogDescription: ogDescription.slice(0, 200),
    ogImage,
    ogImageAlt: `${placeName} (${category}) in ${locationLabel} on OUTERA`,
    canonicalUrl,
    twitterCard: 'summary_large_image',
    twitterTitle: ogTitle,
    twitterDescription: ogDescription.slice(0, 200),
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

function removeMetaTag(attrName: 'name' | 'property', attrValue: string) {
  if (typeof document === 'undefined') return;
  const el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (el) el.remove();
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

function upsertPlaceJsonLdScript(data: Record<string, any> | null) {
  if (typeof document === 'undefined') return;
  const scriptId = 'outera-dynamic-place-jsonld';
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
 * Dynamically updates the document `<head>` Open Graph, Twitter Card, Canonical URL, and JSON-LD
 * metadata when viewing a place, or sets 404 metadata when a place is not found, or restores default metadata.
 */
export function applyClientPlaceMetadata(
  place: PlaceUrlInput | null,
  options?: { isNotFound?: boolean; requestedSlug?: string }
) {
  if (typeof document === 'undefined') return;

  if (options?.isNotFound) {
    const notFoundTitle = '404 — Place Not Found | OUTERA';
    const notFoundDesc =
      'This place could not be found, may have been removed, or is not publicly available on OUTERA.';
    const fallbackUrl = options.requestedSlug
      ? `${OUTERA_PLACE_CANONICAL_ORIGIN}/place/${encodeURIComponent(options.requestedSlug)}`
      : OUTERA_PLACE_CANONICAL_ORIGIN;

    document.title = notFoundTitle;
    upsertMetaTag('name', 'description', notFoundDesc);
    upsertMetaTag('name', 'robots', 'noindex, nofollow');
    upsertMetaTag('property', 'og:title', notFoundTitle);
    upsertMetaTag('property', 'og:description', notFoundDesc);
    upsertMetaTag('property', 'og:type', 'website');
    upsertMetaTag('property', 'og:url', fallbackUrl);
    upsertMetaTag('property', 'og:image', OUTERA_DEFAULT_OG_IMAGE);
    upsertMetaTag('property', 'og:site_name', 'OUTERA');
    upsertMetaTag('name', 'twitter:card', 'summary_large_image');
    upsertMetaTag('name', 'twitter:title', notFoundTitle);
    upsertMetaTag('name', 'twitter:description', notFoundDesc);
    upsertMetaTag('name', 'twitter:image', OUTERA_DEFAULT_OG_IMAGE);
    upsertCanonicalLink(fallbackUrl);
    upsertPlaceJsonLdScript(null);
    return;
  }

  removeMetaTag('name', 'robots');

  if (!place) {
    document.title = OUTERA_DEFAULT_TITLE;
    upsertMetaTag('name', 'description', OUTERA_DEFAULT_DESCRIPTION);
    upsertMetaTag('property', 'og:title', OUTERA_DEFAULT_TITLE);
    upsertMetaTag('property', 'og:description', OUTERA_DEFAULT_DESCRIPTION);
    upsertMetaTag('property', 'og:type', 'website');
    upsertMetaTag('property', 'og:url', OUTERA_PLACE_CANONICAL_ORIGIN);
    upsertMetaTag('property', 'og:image', OUTERA_DEFAULT_OG_IMAGE);
    upsertMetaTag('property', 'og:site_name', 'OUTERA');
    upsertMetaTag('name', 'twitter:card', 'summary_large_image');
    upsertMetaTag('name', 'twitter:title', OUTERA_DEFAULT_TITLE);
    upsertMetaTag('name', 'twitter:description', OUTERA_DEFAULT_DESCRIPTION);
    upsertMetaTag('name', 'twitter:image', OUTERA_DEFAULT_OG_IMAGE);
    upsertCanonicalLink(OUTERA_PLACE_CANONICAL_ORIGIN);
    upsertPlaceJsonLdScript(null);
    return;
  }

  const meta = buildPlaceMetadataPayload(place);
  document.title = meta.title;
  upsertMetaTag('name', 'description', meta.description);
  upsertMetaTag('property', 'og:title', meta.ogTitle);
  upsertMetaTag('property', 'og:description', meta.ogDescription);
  upsertMetaTag('property', 'og:type', 'place');
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
  upsertPlaceJsonLdScript(meta.jsonLd);
}

/**
 * Copies a place's unique canonical URL directly to the clipboard.
 */
export async function copyPlaceLink(
  place: PlaceUrlInput
): Promise<{ success: boolean; copied: boolean; url: string }> {
  const url = buildSharePlaceUrl(place);

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return { success: true, copied: true, url };
    } catch {
      // Fallback below
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
      return { success: true, copied: true, url };
    } catch {
      // Ignore
    }
  }

  return { success: false, copied: false, url };
}

/**
 * Shares a place using the Web Share API on supported mobile/desktop browsers,
 * with an automatic clipboard Copy Link fallback.
 * Always shares the place's exact unique permanent URL (`https://outerabd.buzz/place/{unique-id}`).
 */
export async function sharePlace(
  place: PlaceUrlInput,
  options?: { preferCopyOnly?: boolean }
): Promise<{ success: boolean; method: 'web_share' | 'clipboard'; url: string }> {
  const url = buildSharePlaceUrl(place);
  const placeName = (place.name || 'OUTERA Spot').trim();
  const category = (place.category || 'Chill').trim();
  const district = (place.district || place.division || 'Bangladesh').trim();
  const rawDesc = (place.shortDescription || place.whyPick || '').trim();

  const shareTitle = `${placeName} (${category}) in ${district} — OUTERA`;
  const shareText = rawDesc
    ? `${placeName} (${category}) — ${rawDesc.slice(0, 110)}${rawDesc.length > 110 ? '...' : ''}`
    : `Check out ${placeName} (${category}) in ${district} on OUTERA`;

  if (!options?.preferCopyOnly && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url,
      });
      return { success: true, method: 'web_share', url };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { success: false, method: 'web_share', url };
      }
      // Fall through to clipboard copy if Web Share fails (e.g., desktop / iframe constraints)
    }
  }

  const copied = await copyPlaceLink(place);
  return {
    success: copied.success,
    method: 'clipboard',
    url: copied.url,
  };
}

export type PlaceHelperTarget = Place | PlaceUrlInput;
