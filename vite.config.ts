import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, Plugin } from 'vite';
import {
  fetchApprovedPostForServerSeo,
  injectPostMetadataIntoHtml,
} from './src/services/postServerSeo';
import {
  fetchApprovedPlaceForServerSeo,
  injectPlaceMetadataIntoHtml,
} from './src/services/placeServerSeo';
import { generateDynamicSitemapXml } from './src/services/sitemapGenerator';
import { isPrivateOrNoIndexRoute } from './src/services/seoEngine';
import { handleAdminUsersServerRequest } from './src/services/adminServerAuth';
import { handleNavigationRouteRequest } from './supabase/functions/navigation-route/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function outeraPostSeoPlugin(): Plugin {
  return {
    name: 'outera-post-seo-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();
        const urlPath = req.url.split('?')[0];

        // Mount /api/admin-users server-side authorization & user management handler
        if (urlPath === '/api/admin-users') {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            const parsedBody = rawBody ? JSON.parse(rawBody) : {};
            const urlObj = new URL(`http://localhost:3000${req.url}`);
            const query: Record<string, string | undefined> = {};
            urlObj.searchParams.forEach((v, k) => {
              query[k] = v;
            });

            const authHeader =
              (typeof req.headers.authorization === 'string'
                ? req.headers.authorization
                : undefined) ||
              (typeof req.headers.Authorization === 'string'
                ? req.headers.Authorization
                : undefined);

            const result = await handleAdminUsersServerRequest({
              method: req.method || 'GET',
              authHeader,
              body: parsedBody,
              query,
            });

            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, must-revalidate');
            res.setHeader('X-Robots-Tag', 'noindex, nofollow');
            res.end(JSON.stringify(result.body));
            return;
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('X-Robots-Tag', 'noindex, nofollow');
            res.end(
              JSON.stringify({
                success: false,
                error: err?.message || 'Internal server error in admin-users middleware.',
              })
            );
            return;
          }
        }

        // Mount /api/navigation-route server-side handler
        if (urlPath === '/api/navigation-route') {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers)) {
              if (typeof v === 'string') headers.set(k, v);
              else if (Array.isArray(v)) headers.set(k, v.join(', '));
            }
            const webReq = new Request(`http://localhost:3000${req.url}`, {
              method: req.method || 'POST',
              headers,
              body: req.method === 'POST' ? rawBody : undefined,
            });
            const webRes = await handleNavigationRouteRequest(webReq);
            const text = await webRes.text();
            res.statusCode = webRes.status;
            webRes.headers.forEach((val, key) => {
              res.setHeader(key, val);
            });
            res.setHeader('X-Robots-Tag', 'noindex, nofollow');
            res.end(text);
            return;
          } catch (err) {
            console.warn('navigation-route middleware notice:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Robots-Tag', 'noindex, nofollow');
            res.end(
              JSON.stringify({
                ok: false,
                error: { code: 'UPSTREAM_ERROR', message: 'Internal routing middleware error.' },
              })
            );
            return;
          }
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') return next();

        // Dynamic XML Sitemap (/sitemap.xml and /api/sitemap)
        if (urlPath === '/sitemap.xml' || urlPath === '/api/sitemap') {
          try {
            const { xml } = await generateDynamicSitemapXml();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
            res.setHeader('X-Robots-Tag', 'all');
            res.end(xml);
            return;
          } catch (err) {
            console.warn('sitemap middleware notice:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Failed to generate sitemap.xml');
            return;
          }
        }

        // robots.txt handler
        if (urlPath === '/robots.txt') {
          try {
            const robotsPath = path.resolve(__dirname, 'public', 'robots.txt');
            if (fs.existsSync(robotsPath)) {
              const robotsTxt = fs.readFileSync(robotsPath, 'utf-8');
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.end(robotsTxt);
              return;
            }
          } catch (err) {
            console.warn('robots.txt middleware notice:', err);
          }
        }

        // Prevent private, admin, login, and account pages from being indexed
        if (isPrivateOrNoIndexRoute(urlPath)) {
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        }

        // Handle /place/:slug and /places/:slug server-side SEO & Open Graph injection
        const placeMatch = urlPath.match(/^\/places?\/([^/?#]+)\/?$/i);
        if (placeMatch && placeMatch[1]) {
          try {
            const slugParam = decodeURIComponent(placeMatch[1]);
            const indexHtmlPath = path.resolve(__dirname, 'index.html');
            const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
            const transformedHtml = await server.transformIndexHtml(req.url, rawHtml);
            const place = await fetchApprovedPlaceForServerSeo(slugParam);
            const finalHtml = injectPlaceMetadataIntoHtml(transformedHtml, place, slugParam);

            res.statusCode = place ? 200 : 404;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader(
              'X-Robots-Tag',
              place ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'
            );
            res.end(finalHtml);
            return;
          } catch (err) {
            console.warn('outera-place-seo-plugin middleware notice:', err);
            return next();
          }
        }

        // Handle /p/:slug server-side SEO & Open Graph injection
        const postMatch = urlPath.match(/^\/p\/([^/?#]+)\/?$/i);
        if (postMatch && postMatch[1]) {
          try {
            const slugParam = decodeURIComponent(postMatch[1]);
            const indexHtmlPath = path.resolve(__dirname, 'index.html');
            const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
            const transformedHtml = await server.transformIndexHtml(req.url, rawHtml);
            const post = await fetchApprovedPostForServerSeo(slugParam);
            const finalHtml = injectPostMetadataIntoHtml(transformedHtml, post, slugParam);

            res.statusCode = post ? 200 : 404;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('X-Robots-Tag', post ? 'index, follow' : 'noindex, nofollow');
            res.end(finalHtml);
            return;
          } catch (err) {
            console.warn('outera-post-seo-plugin middleware notice:', err);
            return next();
          }
        }

        // Return proper HTTP 404 response for unknown non-asset client paths
        const isViteOrStaticAsset =
          urlPath.startsWith('/@') ||
          urlPath.startsWith('/src/') ||
          urlPath.startsWith('/node_modules/') ||
          urlPath.startsWith('/assets/') ||
          /\.[a-z0-9]{2,8}$/i.test(urlPath);

        if (!isViteOrStaticAsset) {
          const cleanRoute = urlPath.toLowerCase().replace(/\/+$/, '') || '/';
          const isKnownAppRoute =
            cleanRoute === '/' ||
            cleanRoute === '/index.html' ||
            cleanRoute === '/explore' ||
            cleanRoute === '/surprise' ||
            cleanRoute === '/trips' ||
            cleanRoute === '/bangladesh' ||
            cleanRoute.startsWith('/location/') ||
            cleanRoute === '/forgot-password' ||
            cleanRoute === '/reset-password' ||
            cleanRoute.startsWith('/auth/') ||
            cleanRoute === '/login' ||
            cleanRoute === '/signup' ||
            cleanRoute === '/profile' ||
            cleanRoute === '/saved' ||
            cleanRoute.startsWith('/admin');

          if (!isKnownAppRoute) {
            try {
              const indexHtmlPath = path.resolve(__dirname, 'index.html');
              const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
              const transformedHtml = await server.transformIndexHtml(req.url, rawHtml);
              const notFoundHtml = injectPlaceMetadataIntoHtml(transformedHtml, null, cleanRoute);
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.setHeader('X-Robots-Tag', 'noindex, nofollow');
              res.end(notFoundHtml);
              return;
            } catch {
              // Fall through to standard middleware if transform fails
            }
          }
        }

        return next();
      });
    },
    async closeBundle() {
      try {
        const distHtmlPath = path.resolve(__dirname, 'dist', 'index.html');
        if (fs.existsSync(distHtmlPath)) {
          const builtHtml = fs.readFileSync(distHtmlPath, 'utf-8');
          const apiTemplatePath = path.resolve(__dirname, 'api', '_htmlTemplate.js');
          const jsContent = `// Auto-generated during \`npm run build\` with compiled dist/index.html\nexport const COMPILED_INDEX_HTML = ${JSON.stringify(
            builtHtml
          )};\n`;
          fs.writeFileSync(apiTemplatePath, jsContent, 'utf-8');
        }
        const distSitemapPath = path.resolve(__dirname, 'dist', 'sitemap.xml');
        const { xml: sitemapXml } = await generateDynamicSitemapXml();
        if (fs.existsSync(path.resolve(__dirname, 'dist'))) {
          fs.writeFileSync(distSitemapPath, sitemapXml, 'utf-8');
        }
      } catch (err) {
        console.warn('Failed to sync dist/index.html or sitemap.xml:', err);
      }
    },
  };
}

export default defineConfig(() => {
  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: {
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://znyglvfsbxyjsctphigm.supabase.co'
      ),
      'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          'sb_publishable_1lRtsi9_-0131cjmSg76BQ_w8wzpFF3'
      ),
      'process.env.VITE_R2_PUBLIC_URL': JSON.stringify(
        process.env.VITE_R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''
      ),
    },
    plugins: [outeraPostSeoPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
