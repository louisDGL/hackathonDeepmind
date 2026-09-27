import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ExtractedLogo {
  id: string;
  url: string;
  source: string;
  type: 'svg' | 'png' | 'ico' | 'webp' | 'other';
  label: string;
  dimensions?: string;
  isPrimary?: boolean;
}

interface SiteMeta {
  title?: string;
  description?: string;
  themeColor?: string;
  domain: string;
  fullUrl: string;
}

function resolveUrl(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch {
    return relativeOrAbsolute;
  }
}

function determineImageType(url: string): ExtractedLogo['type'] {
  const clean = url.toLowerCase().split('?')[0];
  if (clean.endsWith('.svg')) return 'svg';
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.ico')) return 'ico';
  if (clean.endsWith('.webp')) return 'webp';
  return 'other';
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API: Proxy image to allow clean CORS download and clipboard copy
  app.get('/api/proxy-image', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        return res.status(response.status).send('Failed to fetch image');
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      console.error('Error proxying image:', err.message);
      res.status(500).send('Image fetch failed');
    }
  });

  // API: Extract logos from website
  app.get('/api/extract-logo', async (req, res) => {
    let inputUrl = (req.query.url as string || '').trim();
    if (!inputUrl) {
      return res.status(400).json({ error: 'URL manquante ou invalide' });
    }

    // Add protocol if missing
    if (!/^https?:\/\//i.test(inputUrl)) {
      inputUrl = 'https://' + inputUrl;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(inputUrl);
    } catch {
      return res.status(400).json({ error: "Format d'URL invalide" });
    }

    const domain = parsedUrl.hostname.replace(/^www\./, '');
    const origin = parsedUrl.origin;
    const finalUrl = parsedUrl.href;

    const logos: ExtractedLogo[] = [];
    const siteMeta: SiteMeta = {
      domain,
      fullUrl: finalUrl,
    };

    const addLogo = (
      rawUrl: string,
      source: string,
      label: string,
      dimensions?: string,
      isPrimary = false
    ) => {
      if (!rawUrl || rawUrl.startsWith('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')) {
        return;
      }
      const resolved = resolveUrl(rawUrl, finalUrl);
      // Avoid exact duplicates
      if (logos.some((l) => l.url === resolved)) return;

      logos.push({
        id: `logo-${logos.length + 1}-${Math.random().toString(36).substring(2, 6)}`,
        url: resolved,
        source,
        label,
        type: determineImageType(resolved),
        dimensions,
        isPrimary,
      });
    };

    // Always prepare fallback services (Google 256px, Clearbit, Unavatar, DuckDuckGo)
    const googleHighRes = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
    const clearbitLogo = `https://logo.clearbit.com/${domain}`;
    const unavatarLogo = `https://unavatar.io/${domain}`;
    const duckduckgoIcon = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
    const rootFavicon = `${origin}/favicon.ico`;

    let html = '';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(finalUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        html = await response.text();
      }
    } catch (err: any) {
      console.warn(`Direct fetch to ${finalUrl} failed or timed out:`, err.message);
    }

    if (html) {
      // 1. Extract metadata: Title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        siteMeta.title = titleMatch[1].trim();
      }

      // 2. Extract Description
      const descMatch =
        html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
        html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      if (descMatch && descMatch[1]) {
        siteMeta.description = descMatch[1].trim();
      }

      // 3. Extract Theme Color
      const themeMatch = html.match(/<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i);
      if (themeMatch && themeMatch[1]) {
        siteMeta.themeColor = themeMatch[1].trim();
      }

      // 4. Schema.org JSON-LD Logos (Highest fidelity official organization logos)
      const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let jsonMatch;
      while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          const checkItem = (item: any) => {
            if (!item || typeof item !== 'object') return;
            if (item.logo) {
              const logoUrl = typeof item.logo === 'string' ? item.logo : item.logo?.url;
              if (logoUrl) {
                addLogo(logoUrl, 'Schema.org', 'Logo Officiel (Organisation)', undefined, true);
              }
            }
            if (item.publisher?.logo) {
              const logoUrl =
                typeof item.publisher.logo === 'string'
                  ? item.publisher.logo
                  : item.publisher.logo?.url;
              if (logoUrl) {
                addLogo(logoUrl, 'Schema.org Publisher', 'Logo Éditeur', undefined, true);
              }
            }
            if (Array.isArray(item['@graph'])) {
              item['@graph'].forEach(checkItem);
            }
          };
          if (Array.isArray(parsed)) {
            parsed.forEach(checkItem);
          } else {
            checkItem(parsed);
          }
        } catch {
          // ignore invalid JSON-LD
        }
      }

      // 5. Apple Touch Icons (Great high-resolution PNGs)
      const appleTouchRegex = /<link[^>]*rel=["']apple-touch-icon(?:-precomposed)?["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
      let appleMatch;
      while ((appleMatch = appleTouchRegex.exec(html)) !== null) {
        const fullTag = appleMatch[0];
        const sizesMatch = fullTag.match(/sizes=["']([^"']+)["']/i);
        const sizes = sizesMatch ? sizesMatch[1] : '180x180';
        addLogo(appleMatch[1], 'Apple Touch Icon', `Icône Haute Définition (${sizes})`, sizes, logos.length === 0);
      }

      // Reverse check where href comes before rel
      const appleTouchRevRegex = /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon(?:-precomposed)?["'][^>]*>/gi;
      while ((appleMatch = appleTouchRevRegex.exec(html)) !== null) {
        addLogo(appleMatch[1], 'Apple Touch Icon', 'Icône Haute Définition', '180x180', logos.length === 0);
      }

      // 6. SVG and Modern Favicons
      const svgIconRegex = /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*type=["']image\/svg\+xml["'][^>]*href=["']([^"']+)["']/gi;
      let svgMatch;
      while ((svgMatch = svgIconRegex.exec(html)) !== null) {
        addLogo(svgMatch[1], 'Favicon Vectoriel', 'Logo SVG Vectoriel', 'Vectoriel', true);
      }
      const svgIconRevRegex = /<link[^>]*href=["']([^"']+)["'][^>]*type=["']image\/svg\+xml["'][^>]*rel=["'](?:shortcut )?icon["']/gi;
      while ((svgMatch = svgIconRevRegex.exec(html)) !== null) {
        addLogo(svgMatch[1], 'Favicon Vectoriel', 'Logo SVG Vectoriel', 'Vectoriel', true);
      }

      // 7. Standard Icons & Favicons with sizes
      const iconRegex = /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
      let iconMatch;
      while ((iconMatch = iconRegex.exec(html)) !== null) {
        const fullTag = iconMatch[0];
        const sizesMatch = fullTag.match(/sizes=["']([^"']+)["']/i);
        const sizes = sizesMatch ? sizesMatch[1] : undefined;
        addLogo(iconMatch[1], 'Favicon', sizes ? `Favicon (${sizes})` : 'Favicon', sizes);
      }
      const iconRevRegex = /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["'][^>]*>/gi;
      while ((iconMatch = iconRevRegex.exec(html)) !== null) {
        addLogo(iconMatch[1], 'Favicon', 'Favicon');
      }

      // 8. Mask Icon (often high-res SVG for Safari pinned tabs)
      const maskIconRegex = /<link[^>]*rel=["']mask-icon["'][^>]*href=["']([^"']+)["']/gi;
      let maskMatch;
      while ((maskMatch = maskIconRegex.exec(html)) !== null) {
        addLogo(maskMatch[1], 'Safari Mask Icon', 'Logo Monochrome SVG', 'Vectoriel');
      }

      // 9. Open Graph & Twitter Social Image
      const ogImageMatch =
        html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (ogImageMatch && ogImageMatch[1]) {
        addLogo(ogImageMatch[1], 'OpenGraph Social', 'Bannière / Visuel Réseaux');
      }

      const twitterImageMatch =
        html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
      if (twitterImageMatch && twitterImageMatch[1]) {
        addLogo(twitterImageMatch[1], 'Twitter Card', 'Visuel Twitter / X');
      }

      // 10. Header Logo detection in HTML (<img class="...logo..." src="..."> or <a class="brand"><img src="...">)
      const imgLogoRegex = /<img[^>]+(?:class|id|alt)=["'][^"']*(?:brand|logo|site-logo)[^"']*["'][^>]+src=["']([^"']+)["']/gi;
      let imgMatch;
      while ((imgMatch = imgLogoRegex.exec(html)) !== null) {
        addLogo(imgMatch[1], 'Header / Navbar', 'Logo Page Web (HTML img)', undefined, logos.length === 0);
      }
      const imgLogoRevRegex = /<img[^>]+src=["']([^"']+)["'][^>]+(?:class|id|alt)=["'][^"']*(?:brand|logo|site-logo)[^"']*["']/gi;
      while ((imgMatch = imgLogoRevRegex.exec(html)) !== null) {
        addLogo(imgMatch[1], 'Header / Navbar', 'Logo Page Web (HTML img)', undefined, logos.length === 0);
      }
    }

    // Always include public CDN/API logos for reliability & high res
    addLogo(clearbitLogo, 'Clearbit Logo API', 'Logo Haute Résolution (Clearbit)', '512x512', logos.length === 0);
    addLogo(unavatarLogo, 'Unavatar API', 'Logo Vectoriel / Hi-Res (Unavatar)', '256x256');
    addLogo(googleHighRes, 'Google Favicon API', 'Favicon HD (Google 256px)', '256x256');
    addLogo(duckduckgoIcon, 'DuckDuckGo', 'Icône Standard (DuckDuckGo)', '64x64');
    addLogo(rootFavicon, 'Domaine Racine', 'Favicon racine (/favicon.ico)', '32x32');

    // Prioritize high-fidelity logos (SVG, PNG, Schema.org, Clearbit) as primary over .ico
    const priorityIndex = (logo: ExtractedLogo) => {
      let score = 0;
      if (logo.source.includes('Schema.org')) score += 50;
      if (logo.source.includes('Header')) score += 40;
      if (logo.source.includes('Clearbit')) score += 35;
      if (logo.source.includes('Unavatar')) score += 30;
      if (logo.source.includes('Apple Touch')) score += 25;
      if (logo.type === 'svg') score += 20;
      if (logo.type === 'png') score += 10;
      if (logo.type === 'ico') score -= 20;
      return score;
    };

    logos.sort((a, b) => priorityIndex(b) - priorityIndex(a));

    // Reset primary flag and mark highest scored logo
    logos.forEach((l, idx) => {
      l.isPrimary = idx === 0;
    });

    return res.json({
      success: true,
      meta: siteMeta,
      count: logos.length,
      logos,
    });
  });

  // Setup Vite middlewares in dev or serve static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer();
