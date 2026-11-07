import type { StyleSpecification } from 'maplibre-gl';

export const OPENFREEMAP_DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

// Cached processed style object
let cachedOuteraMapStyle: StyleSpecification | null = null;
let fetchPromise: Promise<StyleSpecification | string> | null = null;

/**
 * Builds the OUTERA 3D buildings layer definition targeting OpenFreeMap OpenMapTiles vector source.
 */
export function create3DBuildingsLayer(id = 'outera-3d-buildings'): any {
  return {
    id,
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 13,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      // Subtle dark charcoal colors matching near-black OUTERA UI
      'fill-extrusion-color': [
        'interpolate',
        ['linear'],
        ['zoom'],
        13,
        '#141715',
        15,
        '#1b1f1d',
        18,
        '#252A27',
      ],
      // Realistic height transitions according to source data
      'fill-extrusion-height': [
        'interpolate',
        ['linear'],
        ['zoom'],
        13,
        0,
        14.5,
        ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
      ],
      'fill-extrusion-base': [
        'interpolate',
        ['linear'],
        ['zoom'],
        13,
        0,
        14.5,
        ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
      ],
      // Smooth fade-in as user zooms in to 3D level
      'fill-extrusion-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        13,
        0,
        13.5,
        0.35,
        15,
        0.82,
        17,
        0.9,
      ],
      'fill-extrusion-vertical-gradient': true,
    },
  };
}

/**
 * Customizes an OpenFreeMap style object to enforce OUTERA's genuine deep-black palette:
 * - Background: near-black (#0B0D0C)
 * - Water: deep black (#080A09)
 * - Roads: subtle charcoal grey (#252A27)
 * - Borders: muted grey (#2A302D)
 * - Labels: soft off-white (#D4DAD6) and grey (#9CA39E)
 * - 3D Buildings: subtle dark charcoal fill-extrusion
 */
export function customizeOuteraStyle(rawStyle: any): StyleSpecification {
  const style = JSON.parse(JSON.stringify(rawStyle));

  if (!style.layers || !Array.isArray(style.layers)) {
    return rawStyle;
  }

  // 1. Process layers
  for (const layer of style.layers) {
    // Near-black background
    if (layer.type === 'background') {
      layer.paint = { ...(layer.paint || {}), 'background-color': '#0B0D0C' };
    }

    // Water: deep black
    if (layer['source-layer'] === 'water') {
      if (layer.paint) {
        layer.paint['fill-color'] = '#080A09';
      }
    }
    if (layer['source-layer'] === 'waterway') {
      if (layer.paint) {
        layer.paint['line-color'] = '#0b0e0c';
      }
    }

    // Landuse & Landcover: dark muted background
    if (layer['source-layer'] === 'landuse' || layer['source-layer'] === 'landcover') {
      if (layer.paint && layer.paint['fill-color']) {
        layer.paint['fill-color'] = '#0d100e';
      }
    }

    // Roads & Transportation: subtle charcoal grey (#252A27)
    if (layer['source-layer'] === 'transportation') {
      if (layer.paint && layer.paint['line-color']) {
        if (layer.id.includes('casing')) {
          layer.paint['line-color'] = '#141715';
        } else if (layer.id.includes('motorway') || layer.id.includes('major')) {
          layer.paint['line-color'] = '#252A27';
        } else {
          layer.paint['line-color'] = '#1c201e';
        }
      }
      if (layer.paint && layer.paint['fill-color']) {
        layer.paint['fill-color'] = '#171b19';
      }
    }

    // Borders & boundaries: muted grey (#2A302D)
    if (layer['source-layer'] === 'boundary') {
      if (layer.paint && layer.paint['line-color']) {
        layer.paint['line-color'] = '#2A302D';
      }
    }

    // Labels & Symbols: soft off-white & grey with near-black halo
    if (layer.type === 'symbol') {
      if (layer.paint) {
        if (layer.id.includes('country') || layer.id.includes('city_large')) {
          layer.paint['text-color'] = '#E2E6E3'; // soft off-white for major cities
        } else {
          layer.paint['text-color'] = '#A3ABA5'; // muted grey for streets/suburbs
        }
        layer.paint['text-halo-color'] = '#0B0D0C';
        layer.paint['text-halo-width'] = 1.6;
      }
    }
  }

  // 2. Add 3D building extrusion layer before symbols if not already present
  const has3D = style.layers.some((l: any) => l.id === 'outera-3d-buildings' || l.type === 'fill-extrusion');
  if (!has3D && style.sources?.openmaptiles) {
    const firstSymbolIdx = style.layers.findIndex((l: any) => l.type === 'symbol');
    const building3D = create3DBuildingsLayer('outera-3d-buildings');
    if (firstSymbolIdx >= 0) {
      style.layers.splice(firstSymbolIdx, 0, building3D);
    } else {
      style.layers.push(building3D);
    }
  }

  return style as StyleSpecification;
}

/**
 * Retrieves the customized OUTERA MapLibre style using OpenFreeMap vector tiles.
 * Caches in memory for instant reuse across map instances.
 */
export async function getOuteraMapStyle(): Promise<StyleSpecification | string> {
  if (cachedOuteraMapStyle) {
    return cachedOuteraMapStyle;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      const response = await fetch(OPENFREEMAP_DARK_STYLE_URL, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.warn('OpenFreeMap style fetch non-200, falling back to direct URL');
        return OPENFREEMAP_DARK_STYLE_URL;
      }

      const rawStyle = await response.json();
      const customized = customizeOuteraStyle(rawStyle);
      cachedOuteraMapStyle = customized;
      return customized;
    } catch (err) {
      console.warn('Failed to load customized OpenFreeMap style, falling back to URL:', err);
      return OPENFREEMAP_DARK_STYLE_URL;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Adds the 3D building layer to a running MapLibre instance if it does not already exist.
 */
export function ensure3DBuildingsLayer(map: any) {
  if (!map || !map.getStyle()) return;

  if (map.getLayer('outera-3d-buildings')) return;

  const style = map.getStyle();
  if (!style || !style.sources || !style.sources.openmaptiles) return;

  const layers = style.layers || [];
  let firstSymbolId: string | undefined;
  for (const layer of layers) {
    if (layer.type === 'symbol') {
      firstSymbolId = layer.id;
      break;
    }
  }

  try {
    map.addLayer(create3DBuildingsLayer('outera-3d-buildings'), firstSymbolId);
  } catch (err) {
    console.debug('3D building layer add notice:', err);
  }
}
