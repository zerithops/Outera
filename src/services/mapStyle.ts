import type { StyleSpecification } from 'maplibre-gl';

export const OPENFREEMAP_DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
export const OUTERA_MAP_ACCENT = '#B7FF00';

// Cached processed flat 2D style object
let cachedOuteraMapStyle: StyleSpecification | null = null;
let fetchPromise: Promise<StyleSpecification | string> | null = null;

/**
 * Customizes an OpenFreeMap style object into OUTERA's flat 2D dark vector map:
 * - Strictly removes all 3D building fill-extrusion layers and 3D terrain
 * - Background: deep black/charcoal (#0B0D0C)
 * - Water: deep black (#080A09)
 * - Flat 2D building footprints: subtle dark charcoal (#121614)
 * - Roads: subtle charcoal grey (#262B28 major / #1D221F local / #131615 casing)
 * - Borders: muted grey (#2A302D)
 * - Labels: soft off-white (#E2E6E3) and muted grey (#A3ABA5)
 */
export function customizeOuteraStyle(rawStyle: any): StyleSpecification {
  const style = JSON.parse(JSON.stringify(rawStyle));

  // Disable any 3D terrain definition
  if ('terrain' in style) {
    delete style.terrain;
  }

  if (!style.layers || !Array.isArray(style.layers)) {
    return rawStyle;
  }

  // 1. Remove any 3D building extrusion layers or hillshade/terrain layers
  style.layers = style.layers.filter((layer: any) => {
    if (!layer) return false;
    const id = String(layer.id || '').toLowerCase();
    if (layer.type === 'fill-extrusion') return false;
    if (layer.type === 'hillshade') return false;
    if (id.includes('3d') || id.includes('extrusion') || id.includes('building-3d')) return false;
    return true;
  });

  // 2. Customize remaining flat 2D layers
  for (const layer of style.layers) {
    // Near-black / charcoal background
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

    // Landuse & Landcover: dark charcoal surface
    if (layer['source-layer'] === 'landuse' || layer['source-layer'] === 'landcover') {
      if (layer.paint && layer.paint['fill-color']) {
        layer.paint['fill-color'] = '#0D100E';
      }
    }

    // Flat 2D building footprints (no extrusion)
    if (layer['source-layer'] === 'building') {
      if (layer.type === 'fill') {
        layer.paint = {
          ...(layer.paint || {}),
          'fill-color': '#121614',
          'fill-outline-color': '#1A1F1D',
          'fill-opacity': 0.75,
        };
      } else if (layer.type === 'line') {
        layer.paint = {
          ...(layer.paint || {}),
          'line-color': '#1A1F1D',
          'line-width': 0.5,
        };
      }
    }

    // Roads & Transportation: subtle grey roads (#262B28 / #1D221F)
    if (layer['source-layer'] === 'transportation') {
      if (layer.paint && layer.paint['line-color']) {
        if (layer.id.includes('casing')) {
          layer.paint['line-color'] = '#131615';
        } else if (
          layer.id.includes('motorway') ||
          layer.id.includes('trunk') ||
          layer.id.includes('primary') ||
          layer.id.includes('major')
        ) {
          layer.paint['line-color'] = '#282E2B';
        } else if (layer.id.includes('secondary') || layer.id.includes('tertiary')) {
          layer.paint['line-color'] = '#212624';
        } else {
          layer.paint['line-color'] = '#1B1F1D';
        }
      }
      if (layer.paint && layer.paint['fill-color']) {
        layer.paint['fill-color'] = '#171B19';
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
        if (
          layer.id.includes('country') ||
          layer.id.includes('city') ||
          layer.id.includes('town') ||
          layer.id.includes('place')
        ) {
          layer.paint['text-color'] = '#E2E6E3';
        } else {
          layer.paint['text-color'] = '#A3ABA5';
        }
        layer.paint['text-halo-color'] = '#0B0D0C';
        layer.paint['text-halo-width'] = 1.6;
      }
    }
  }

  return style as StyleSpecification;
}

/**
 * Retrieves the customized flat 2D OUTERA MapLibre style using OpenFreeMap vector tiles.
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
 * Enforces a strictly flat 2D map state on any running MapLibre instance:
 * - Removes any residual fill-extrusion or 3D layers (e.g. if fallback URL was used)
 * - Disables 3D terrain and locks pitch to 0°
 */
export function enforceFlat2DMap(map: any) {
  if (!map) return;

  try {
    if (typeof map.setTerrain === 'function') {
      map.setTerrain(null);
    }
    if (typeof map.setMaxPitch === 'function') {
      map.setMaxPitch(0);
    }
    if (typeof map.setPitch === 'function' && map.getPitch && map.getPitch() !== 0) {
      map.setPitch(0);
    }
    if (map.touchPitch && typeof map.touchPitch.disable === 'function') {
      map.touchPitch.disable();
    }
  } catch {
    // ignore
  }

  const style = map.getStyle?.();
  if (!style || !Array.isArray(style.layers)) return;

  for (const layer of style.layers) {
    if (
      layer.type === 'fill-extrusion' ||
      layer.type === 'hillshade' ||
      String(layer.id || '').toLowerCase().includes('3d')
    ) {
      try {
        if (map.getLayer(layer.id)) {
          map.removeLayer(layer.id);
        }
      } catch {
        // ignore
      }
    }
  }
}
