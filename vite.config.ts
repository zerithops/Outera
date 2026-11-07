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
            res.end(text);
            return;
          } catch (err) {
            console.warn('navigation-route middleware notice:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                error: { code: 'UPSTREAM_ERROR', message: 'Internal routing middleware error.' },
              })
            );
            return;
          }
        }

        if (req.method !== 'GET') return next();
        const postMatch = urlPath.match(/^\/p\/([^/?#]+)\/?$/i);
        if (!postMatch || !postMatch[1]) return next();

        try {
          const slugParam = decodeURIComponent(postMatch[1]);
          const indexHtmlPath = path.resolve(__dirname, 'index.html');
          const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformedHtml = await server.transformIndexHtml(req.url, rawHtml);
          const post = await fetchApprovedPostForServerSeo(slugParam);
          const finalHtml = injectPostMetadataIntoHtml(transformedHtml, post, slugParam);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(finalHtml);
        } catch (err) {
          console.warn('outera-post-seo-plugin middleware notice:', err);
          next();
        }
      });
    },
    closeBundle() {
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
      } catch (err) {
        console.warn('Failed to sync dist/index.html to api/_htmlTemplate.js:', err);
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
