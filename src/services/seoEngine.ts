// ============================================================================
// OUTERA — CENTRAL SEO, CANONICALIZATION, STRUCTURED DATA & INDEXING ENGINE
// Primary Canonical Domain: https://outerabd.buzz
// ============================================================================

import { FilterState, Place } from '../types/outera';
import {
  buildCanonicalPlaceUrl,
  buildPlacePath,
  buildPlaceUniqueSlug,
  resolvePlaceCoverImage,
} from './placeUrl';

export const OUTERA_CANONICAL_ORIGIN = 'https://outerabd.buzz';
export const OUTERA_SITE_NAME = 'OUTERA';
export const OUTERA_DEFAULT_SEO_TITLE =
  'OUTERA — Discover Curated Places, Cafes & Hidden Gems in Bangladesh';
export const OUTERA_DEFAULT_SEO_DESCRIPTION =
  'Discover verified places, cafes, nature spots, community reviews, and live turn-by-turn routes across Bangladesh on OUTERA. Find something worth going out for.';
export const OUTERA_DEFAULT_OG_IMAGE_URL = `${OUTERA_CANONICAL_ORIGIN}/assets/aistudio/Neon_Lime_OUTERA_Tech_Logo_8daa6fb0.png`;

// Routes that must NEVER be indexed by Google or other search engines (Requirement 5)
const NOINDEX_PATH_PREFIXES = [
  '/admin',
  '/login',
  '/signup',
  '/Signin',
  '/signin',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/profile',
  '/saved',
  '/api/',
];

/**
 * Normalizes any URL or path to a clean, canonical `https://outerabd.buzz` URL:
 * - Enforces `https://` protocol
 * - Normalizes `www.outerabd.buzz` -> `outerabd.buzz`
 * - Normalizes `/places/{slug}` -> `/place/{slug}`
 * - Strips tracking query parameters (`utm_*`, `fbclid`, `gclid`)
 * - Removes trailing slashes (except root `/`)
 */
export function normalizeCanonicalUrl(pathOrUrl?: string | null): string {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') {
    return OUTERA_CANONICAL_ORIGIN;
  }

  let raw = pathOrUrl.trim();
  if (!raw || raw === '/') {
    return OUTERA_CANONICAL_ORIGIN;
  }

  try {
    // Handle full URLs
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      raw = parsed.pathname + parsed.search;
    }
  } catch {
    // Keep path as-is
  }

  // Strip hash fragments
  const withoutHash = raw.split('#')[0] || '/';
  const [rawPathname, rawQuery] = withoutHash.split('?');

  // Normalize path
  let cleanPath = ('/' + (rawPathname || '').replace(/^\/+/, ''))
    .replace(/\/+/g, '/')
    .replace(/^\/places\//i, '/place/');

  if (cleanPath.length > 1) {
    cleanPath = cleanPath.replace(/\/+$/, '');
  }

  // Only preserve canonical SEO query params if needed (strip tracking params)
  let canonicalQuery = '';
  if (rawQuery) {
    try {
      const searchParams = new URLSearchParams(rawQuery);
      const allowedParams = new URLSearchParams();
      const cat = searchParams.get('category');
      const div = searchParams.get('division');
      if (cat && cat.toLowerCase() !== 'all') {
        allowedParams.set('category', cat);
      }
      if (div && div.toLowerCase() !== 'all') {
        allowedParams.set('division', div);
      }
      const serialized = allowedParams.toString();
      if (serialized && cleanPath === '/') {
        canonicalQuery = `?${serialized}`;
      }
    } catch {
      canonicalQuery = '';
    }
  }

  if (cleanPath === '/') {
    return `${OUTERA_CANONICAL_ORIGIN}${canonicalQuery}`;
  }
  return `${OUTERA_CANONICAL_ORIGIN}${cleanPath}${canonicalQuery}`;
}

/**
 * Determines whether a given pathname or application view is private/restricted
 * and must be marked `noindex, nofollow`.
 */
export function isPrivateOrNoIndexRoute(
  input:
    | string
    | {
        pathname?: string;
        activeTab?: string;
        authRoute?: string;
        isAdminOpen?: boolean;
        isAuthModalOpen?: boolean;
        isNotFound?: boolean;
      }
): boolean {
  const params = typeof input === 'string' ? { pathname: input } : input || {};
  if (
    params.isNotFound ||
    params.isAdminOpen ||
    params.isAuthModalOpen ||
    (params.authRoute && params.authRoute !== 'none')
  ) {
    return true;
  }

  if (params.activeTab === 'profile' || params.activeTab === 'saved') {
    return true;
  }

  const cleanPath = (params.pathname || '/').trim().toLowerCase();
  for (const prefix of NOINDEX_PATH_PREFIXES) {
    const lowPrefix = prefix.toLowerCase();
    if (cleanPath === lowPrefix || cleanPath.startsWith(`${lowPrefix}/`)) {
      return true;
    }
  }

  return false;
}

/**
 * Maps an OUTERA place category to the most appropriate Schema.org Place / LocalBusiness subtypes.
 */
export function resolveSchemaTypesForCategory(category?: string | null): string[] {
  const cat = String(category || '').trim().toLowerCase();
  if (cat === 'cafe' || cat.includes('coffee') || cat.includes('tea')) {
    return ['Place', 'LocalBusiness', 'FoodEstablishment', 'CafeOrCoffeeShop'];
  }
  if (cat === 'food' || cat === 'restaurant' || cat.includes('dining') || cat.includes('street food')) {
    return ['Place', 'LocalBusiness', 'FoodEstablishment', 'Restaurant'];
  }
  if (cat === 'stay' || cat.includes('hotel') || cat.includes('resort')) {
    return ['Place', 'LocalBusiness', 'LodgingBusiness'];
  }
  if (
    cat === 'nature' ||
    cat === 'historical' ||
    cat === 'landmark' ||
    cat === 'heritage' ||
    cat === 'religious' ||
    cat === 'viewpoint'
  ) {
    return ['Place', 'TouristAttraction'];
  }
  if (cat === 'shopping' || cat.includes('market') || cat.includes('mall')) {
    return ['Place', 'LocalBusiness', 'Store'];
  }
  if (cat === 'recreation' || cat === 'entertainment' || cat === 'sports') {
    return ['Place', 'LocalBusiness', 'EntertainmentBusiness'];
  }
  return ['Place', 'LocalBusiness', 'TouristAttraction'];
}

/**
 * Builds the root WebSite + Organization + ItemList Schema.org JSON-LD graph for OUTERA.
 */
export function buildSiteStructuredDataJsonLd(places?: Place[]): Record<string, any> {
  const graph: Record<string, any>[] = [
    {
      '@type': 'Organization',
      '@id': `${OUTERA_CANONICAL_ORIGIN}/#organization`,
      name: 'OUTERA',
      url: OUTERA_CANONICAL_ORIGIN,
      logo: {
        '@type': 'ImageObject',
        url: OUTERA_DEFAULT_OG_IMAGE_URL,
      },
      areaServed: {
        '@type': 'Country',
        name: 'Bangladesh',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${OUTERA_CANONICAL_ORIGIN}/#website`,
      url: OUTERA_CANONICAL_ORIGIN,
      name: 'OUTERA',
      description: OUTERA_DEFAULT_SEO_DESCRIPTION,
      publisher: {
        '@id': `${OUTERA_CANONICAL_ORIGIN}/#organization`,
      },
      inLanguage: ['en', 'bn'],
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${OUTERA_CANONICAL_ORIGIN}/?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ];

  if (Array.isArray(places) && places.length > 0) {
    const topPlaces = places.slice(0, 25);
    graph.push({
      '@type': 'ItemList',
      '@id': `${OUTERA_CANONICAL_ORIGIN}/#featured-places`,
      name: 'Verified Places & Spots in Bangladesh on OUTERA',
      numberOfItems: topPlaces.length,
      itemListElement: topPlaces.map((p, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: p.name,
        url: buildCanonicalPlaceUrl(p),
        item: {
          '@type': resolveSchemaTypesForCategory(p.category),
          '@id': buildCanonicalPlaceUrl(p),
          name: p.name,
          url: buildCanonicalPlaceUrl(p),
          image: resolvePlaceCoverImage(p),
          address: {
            '@type': 'PostalAddress',
            streetAddress: p.address || p.neighborhood || p.district,
            addressLocality: p.district || 'Dhaka',
            addressRegion: p.division || 'Dhaka',
            addressCountry: 'BD',
          },
        },
      })),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

export interface PageSeoConfig {
  title: string;
  description: string;
  canonicalUrl: string;
  robots: 'index, follow, max-image-preview:large' | 'noindex, nofollow';
  ogType: 'website' | 'place' | 'article';
  ogImage: string;
  ogImageAlt: string;
  jsonLd?: Record<string, any> | null;
}

/**
 * Computes unique SEO title, meta description, canonical URL, and robots directive
 * for every public and private view in OUTERA.
 */
export function buildPageSeoConfig(params: {
  pathname?: string;
  activeTab: string;
  filters?: Partial<FilterState>;
  selectedCategory?: string;
  selectedDivision?: string;
  selectedDistrict?: string;
  searchQuery?: string;
  showLocationHub?: boolean;
  activeHubDivision?: string;
  authRoute?: string;
  isAdminOpen?: boolean;
  isAuthModalOpen?: boolean;
  isNotFound?: boolean;
  places?: Place[];
}): PageSeoConfig {
  const pathname =
    params.pathname ||
    (typeof window !== 'undefined' && window.location?.pathname ? window.location.pathname : '/');

  const selectedCategory = params.selectedCategory ?? params.filters?.selectedCategory;
  const selectedDivision = params.selectedDivision ?? params.filters?.selectedDivision;
  const selectedDistrict = params.selectedDistrict ?? params.filters?.selectedDistrict;

  const noIndex = isPrivateOrNoIndexRoute({
    pathname,
    activeTab: params.activeTab,
    authRoute: params.authRoute,
    isAdminOpen: params.isAdminOpen,
    isAuthModalOpen: params.isAuthModalOpen,
    isNotFound: params.isNotFound,
  });

  if (params.isNotFound) {
    return {
      title: '404 — Page Not Found | OUTERA Bangladesh',
      description:
        'The page or place you requested could not be found on OUTERA. Explore verified cafes, nature spots, and local experiences across Bangladesh.',
      canonicalUrl: normalizeCanonicalUrl(pathname),
      robots: 'noindex, nofollow',
      ogType: 'website',
      ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
      ogImageAlt: '404 Page Not Found on OUTERA',
      jsonLd: null,
    };
  }

  if (params.isAdminOpen || pathname.toLowerCase().startsWith('/admin')) {
    return {
      title: 'Admin Moderation & User Management | OUTERA',
      description: 'Restricted administrator moderation and user management console for OUTERA.',
      canonicalUrl: `${OUTERA_CANONICAL_ORIGIN}/admin`,
      robots: 'noindex, nofollow',
      ogType: 'website',
      ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
      ogImageAlt: 'OUTERA Admin',
      jsonLd: null,
    };
  }

  if (params.authRoute && params.authRoute !== 'none') {
    const authTitles: Record<string, string> = {
      'forgot-password': 'Reset Your Account Password | OUTERA',
      'reset-password': 'Set New Account Password | OUTERA',
      'auth-callback': 'Verifying Authentication | OUTERA',
    };
    return {
      title: authTitles[params.authRoute] || 'Account Authentication | OUTERA',
      description: 'Secure account authentication and verification on OUTERA.',
      canonicalUrl: `${OUTERA_CANONICAL_ORIGIN}/${params.authRoute}`,
      robots: 'noindex, nofollow',
      ogType: 'website',
      ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
      ogImageAlt: 'OUTERA Account Authentication',
      jsonLd: null,
    };
  }

  if (params.activeTab === 'profile') {
    return {
      title: 'My Scout Profile & Contributions | OUTERA',
      description: 'Manage your OUTERA scout profile, community reviews, and place suggestions.',
      canonicalUrl: `${OUTERA_CANONICAL_ORIGIN}/profile`,
      robots: 'noindex, nofollow',
      ogType: 'website',
      ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
      ogImageAlt: 'OUTERA Scout Profile',
      jsonLd: null,
    };
  }

  if (params.activeTab === 'saved') {
    return {
      title: 'Saved Places Vault | OUTERA',
      description: 'Your personal saved places and collections on OUTERA.',
      canonicalUrl: `${OUTERA_CANONICAL_ORIGIN}/saved`,
      robots: 'noindex, nofollow',
      ogType: 'website',
      ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
      ogImageAlt: 'OUTERA Saved Vault',
      jsonLd: null,
    };
  }

  if (params.showLocationHub) {
    const div =
      params.activeHubDivision && params.activeHubDivision !== 'all'
        ? params.activeHubDivision
        : 'Bangladesh';
    const path =
      div === 'Bangladesh' ? '/bangladesh' : `/location/${div.toLowerCase()}`;
    return {
      title: `Best Places to Visit in ${div} — Verified Spots & Cafes | OUTERA`,
      description: `Explore top-rated places, cafes, nature spots, historical landmarks, and community reviews in ${div} on OUTERA. Get directions and local transit fares.`,
      canonicalUrl: `${OUTERA_CANONICAL_ORIGIN}${path}`,
      robots: noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
      ogType: 'website',
      ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
      ogImageAlt: `Best places to visit in ${div} on OUTERA`,
      jsonLd: buildSiteStructuredDataJsonLd(params.places),
    };
  }

  if (params.activeTab === 'explore') {
    return {
      title: 'Interactive Bangladesh Map — Explore Places & Live Routes | OUTERA',
      description:
        'Explore verified cafes, nature spots, restaurants, and landmarks across all 8 divisions of Bangladesh on the interactive OUTERA map with turn-by-turn navigation.',
      canonicalUrl: `${OUTERA_CANONICAL_ORIGIN}/explore`,
      robots: noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
      ogType: 'website',
      ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
      ogImageAlt: 'OUTERA Interactive Map of Bangladesh',
      jsonLd: buildSiteStructuredDataJsonLd(params.places),
    };
  }

  if (params.activeTab === 'surprise') {
    return {
      title: 'Surprise Me — Spontaneous Spot Finder in Bangladesh | OUTERA',
      description:
        'Not sure where to go out today? Spin the OUTERA spontaneous spot finder to discover curated cafes, hangouts, and hidden gems near you in Bangladesh.',
      canonicalUrl: `${OUTERA_CANONICAL_ORIGIN}/surprise`,
      robots: noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
      ogType: 'website',
      ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
      ogImageAlt: 'OUTERA Surprise Me Spot Finder',
      jsonLd: buildSiteStructuredDataJsonLd(params.places),
    };
  }

  if (params.activeTab === 'trips') {
    return {
      title: 'Smart Trip Planner & Transit Fare Guide in Bangladesh | OUTERA',
      description:
        'Plan your next outing or inter-district trip in Bangladesh with OUTERA. Compare verified bus, train, launch, and local transport fares, budgets, and itineraries.',
      canonicalUrl: `${OUTERA_CANONICAL_ORIGIN}/trips`,
      robots: noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
      ogType: 'website',
      ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
      ogImageAlt: 'OUTERA Bangladesh Trip Planner & Fare Guide',
      jsonLd: buildSiteStructuredDataJsonLd(params.places),
    };
  }

  // Category or Location filtered Discover View
  const cat =
    selectedCategory && selectedCategory !== 'all' ? selectedCategory : null;
  const loc =
    selectedDistrict && selectedDistrict !== 'all'
      ? selectedDistrict
      : selectedDivision && selectedDivision !== 'all'
      ? selectedDivision
      : 'Bangladesh';

  if (cat) {
    const querySuffix = `?category=${encodeURIComponent(cat)}`;
    return {
      title: `Best ${cat} Spots in ${loc} — Verified Reviews & Directions | OUTERA`,
      description: `Discover the best verified ${cat} places in ${loc} on OUTERA. Browse community photos, ratings, budgets, and live turn-by-turn navigation.`,
      canonicalUrl: `${OUTERA_CANONICAL_ORIGIN}/${querySuffix}`,
      robots: noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
      ogType: 'website',
      ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
      ogImageAlt: `Best ${cat} spots in ${loc} on OUTERA`,
      jsonLd: buildSiteStructuredDataJsonLd(params.places),
    };
  }

  return {
    title: OUTERA_DEFAULT_SEO_TITLE,
    description: OUTERA_DEFAULT_SEO_DESCRIPTION,
    canonicalUrl: OUTERA_CANONICAL_ORIGIN,
    robots: noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
    ogType: 'website',
    ogImage: OUTERA_DEFAULT_OG_IMAGE_URL,
    ogImageAlt: 'OUTERA — Location-Based Discovery Platform in Bangladesh',
    jsonLd: buildSiteStructuredDataJsonLd(params.places),
  };
}

function setOrCreateMeta(attrName: 'name' | 'property', attrValue: string, content: string) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(
    `meta[${attrName}="${attrValue}"]`
  ) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setOrCreateCanonical(href: string) {
  if (typeof document === 'undefined') return;
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function setOrCreateSiteJsonLd(data: Record<string, any> | null) {
  if (typeof document === 'undefined') return;
  const scriptId = 'outera-site-structured-data';
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
 * Applies page-level SEO title, meta description, canonical link, robots directives,
 * Open Graph tags, Twitter Card tags, and JSON-LD structured data to `document.head`.
 */
export function applyPageSeoToDocument(config: PageSeoConfig) {
  if (typeof document === 'undefined') return;

  document.title = config.title;
  setOrCreateMeta('name', 'description', config.description);
  setOrCreateMeta('name', 'robots', config.robots);
  setOrCreateMeta('name', 'googlebot', config.robots);
  setOrCreateCanonical(config.canonicalUrl);

  setOrCreateMeta('property', 'og:type', config.ogType);
  setOrCreateMeta('property', 'og:site_name', OUTERA_SITE_NAME);
  setOrCreateMeta('property', 'og:title', config.title);
  setOrCreateMeta('property', 'og:description', config.description);
  setOrCreateMeta('property', 'og:url', config.canonicalUrl);
  setOrCreateMeta('property', 'og:image', config.ogImage);
  setOrCreateMeta('property', 'og:image:secure_url', config.ogImage);
  setOrCreateMeta('property', 'og:image:alt', config.ogImageAlt);

  setOrCreateMeta('name', 'twitter:card', 'summary_large_image');
  setOrCreateMeta('name', 'twitter:title', config.title);
  setOrCreateMeta('name', 'twitter:description', config.description);
  setOrCreateMeta('name', 'twitter:image', config.ogImage);

  setOrCreateSiteJsonLd(config.jsonLd || null);
}

export { buildPlacePath, buildPlaceUniqueSlug };
