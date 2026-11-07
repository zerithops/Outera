import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

/**
 * Configure MapLibre GL JS Web Worker for Vite bundler environment.
 * Ensures the worker script is loaded cleanly without relative path resolution errors.
 */
if (typeof window !== 'undefined') {
  try {
    maplibregl.setWorkerUrl(workerUrl);
  } catch (err) {
    console.warn('Failed to configure MapLibre worker via bundler URL, using fallback:', err);
    try {
      maplibregl.setWorkerUrl('https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl-worker.mjs');
    } catch {
      // ignore
    }
  }
}

export { maplibregl };
