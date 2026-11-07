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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function outeraPostSeoPlugin(): Plugin {
  return {
    name: 'outera-post-seo-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || req.method !== 'GET') return next();
        const urlPath = req.url.split('?')[0];
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
