import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateDynamicSitemapXml } from '../src/services/sitemapGenerator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function buildProductionSitemap() {
  const result = await generateDynamicSitemapXml();

  if (!result.validation.valid) {
    console.error('[OUTERA Sitemap] Validation errors found:', result.validation.errors);
    process.exit(1);
  }

  const publicDir = path.resolve(projectRoot, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const publicSitemapPath = path.resolve(publicDir, 'sitemap.xml');
  fs.writeFileSync(publicSitemapPath, result.xml, 'utf-8');

  const distDir = path.resolve(projectRoot, 'dist');
  if (fs.existsSync(distDir)) {
    const distSitemapPath = path.resolve(distDir, 'sitemap.xml');
    fs.writeFileSync(distSitemapPath, result.xml, 'utf-8');
  }

  console.log(
    `[OUTERA Sitemap] Generated valid sitemap.xml (${result.urlCount} total URLs: ${result.placeCount} approved places, ${result.postCount} approved posts)`
  );
}

buildProductionSitemap().catch((err) => {
  console.warn('[OUTERA Sitemap] Build-time generation fallback notice:', err?.message || err);
});
