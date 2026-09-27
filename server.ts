import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

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
  score?: number;
  clarityBadge?: string;
  reason?: string;
}

interface SiteMeta {
  title?: string;
  description?: string;
  themeColor?: string;
  domain: string;
  fullUrl: string;
  searchQuery?: string;
  resolvedBrand?: string;
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

function isExplicitUrl(input: string): boolean {
  const trimmed = input.trim();
  // Any whitespace means it's a search term
  if (/\s/.test(trimmed)) return false;

  // Has protocol
  if (/^https?:\/\//i.test(trimmed)) return true;

  // Matches domain pattern like domain.com, sub.domain.fr, domain.co.uk
  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,12}(\/.*)?$/.test(trimmed)) {
    return true;
  }

  return false;
}

async function resolveBrandQuery(query: string): Promise<{ url: string; domain: string; siteName?: string } | null> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return null;

  try {
    const ai = new GoogleGenAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Quelle est l'URL du site web officiel principal le plus pertinent pour la marque, l'entreprise ou la recherche suivante: "${cleanQuery}" ?
Réponds STRICTEMENT sous la forme d'un objet JSON valide contenant:
- "url": l'URL complète avec le protocole https:// (ex: "https://www.lemonde.fr")
- "domain": le nom de domaine principal (ex: "lemonde.fr")
- "siteName": le nom officiel de l'entité (ex: "Le Monde")`,
      config: {
        responseMimeType: 'application/json',
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      if (data.url && data.domain) {
        return {
          url: data.url,
          domain: data.domain.replace(/^www\./, ''),
          siteName: data.siteName,
        };
      }
    }
  } catch (err: any) {
    console.warn(`Query resolution for "${cleanQuery}" via AI failed:`, err.message);
  }

  // Fallback heuristics: clean slug + .com
  const slug = cleanQuery.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (slug) {
    return {
      url: `https://${slug}.com`,
      domain: `${slug}.com`,
      siteName: cleanQuery,
    };
  }

  return null;
}

// Quick validation function to ensure the logo is an actual, accessible, non-empty image file
async function validateImageResource(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2800);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return false;

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    // Must NOT be an HTML error page (soft 404)
    if (contentType.includes('text/html')) {
      return false;
    }

    // Must have content
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) === 0) {
      return false;
    }

    // Buffer check: ensure at least 25 bytes of actual image data
    const buf = await res.arrayBuffer();
    if (!buf || buf.byteLength < 25) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Popular brand icon mappings for guaranteed ultra-high fidelity
const POPULAR_BRAND_LOGOS: Record<string, { label: string; url: string; type: ExtractedLogo['type']; dimensions: string; reason: string }[]> = {
  'google.com': [
    {
      label: 'Logo Officiel Google (Couleurs de marque)',
      url: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
      type: 'png',
      dimensions: '544x184',
      reason: 'Logo officiel de Google en haute définition (Retina 2x)',
    },
    {
      label: 'Monogramme Vectoriel Google "G"',
      url: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/google.svg',
      type: 'svg',
      dimensions: 'Vectoriel',
      reason: 'Icône vectorielle officielle Google en tracé pur SVG',
    },
  ],
  'apple.com': [
    {
      label: 'Pomme Apple Vectorielle Officielle',
      url: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/apple.svg',
      type: 'svg',
      dimensions: 'Vectoriel',
      reason: 'Emblème officiel Apple en format vectoriel SVG sans perte',
    },
  ],
  'github.com': [
    {
      label: 'Octocat & Logo GitHub Officiel',
      url: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/github.svg',
      type: 'svg',
      dimensions: 'Vectoriel',
      reason: 'Emblème vectoriel mondial GitHub (SVG)',
    },
  ],
  'stripe.com': [
    {
      label: 'Logo Officiel Stripe (Vectoriel)',
      url: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/stripe.svg',
      type: 'svg',
      dimensions: 'Vectoriel',
      reason: 'Logo officiel Stripe SVG haute fidélité',
    },
  ],
  'spotify.com': [
    {
      label: 'Logo Officiel Spotify',
      url: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/spotify.svg',
      type: 'svg',
      dimensions: 'Vectoriel',
      reason: 'Emblème Spotify officiel vectoriel',
    },
  ],
  'figma.com': [
    {
      label: 'Logo Officiel Figma',
      url: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/figma.svg',
      type: 'svg',
      dimensions: 'Vectoriel',
      reason: 'Symbole officiel Figma en SVG',
    },
  ],
  'netflix.com': [
    {
      label: 'Logo Officiel Netflix',
      url: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/netflix.svg',
      type: 'svg',
      dimensions: 'Vectoriel',
      reason: 'Monogramme officiel Netflix',
    },
  ],
  'airbnb.com': [
    {
      label: 'Bélo Airbnb Officiel',
      url: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/airbnb.svg',
      type: 'svg',
      dimensions: 'Vectoriel',
      reason: 'Symbole Bélo officiel Airbnb',
    },
  ],
  'notion.so': [
    {
      label: 'Logo Officiel Notion',
      url: 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/notion.svg',
      type: 'svg',
      dimensions: 'Vectoriel',
      reason: 'Cube emblématique Notion en SVG',
    },
  ],
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API: Proxy image to bypass CORS and guarantee binary delivery
  app.get('/api/proxy-image', async (req, res) => {
    const targetUrl = (req.query.url as string || '').trim();
    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).send('Invalid protocol');
      }
    } catch {
      return res.status(400).send('Invalid URL format');
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(parsed.href, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).send('Remote server returned error');
      }

      let contentType = response.headers.get('content-type') || 'image/png';
      if (parsed.href.toLowerCase().endsWith('.svg') || contentType.includes('svg')) {
        contentType = 'image/svg+xml';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch {
      // Gracefully handle remote unreachable/timeout errors without polluting error logs
      res.status(502).send('Unable to retrieve image');
    }
  });

  // API: Extract logos from website
  app.get('/api/extract-logo', async (req, res) => {
    const rawInput = (req.query.url as string || '').trim();
    if (!rawInput) {
      return res.status(400).json({ error: 'Recherche ou URL manquante' });
    }

    let targetUrl = rawInput;
    let originalSearchQuery: string | undefined;
    let resolvedBrandName: string | undefined;

    // Check if input is an exact URL/domain or a search query
    const isUrl = isExplicitUrl(rawInput);
    if (!isUrl) {
      originalSearchQuery = rawInput;
      const resolved = await resolveBrandQuery(rawInput);
      if (resolved && resolved.url) {
        targetUrl = resolved.url;
        resolvedBrandName = resolved.siteName;
      } else {
        targetUrl = 'https://' + rawInput.replace(/\s+/g, '') + '.com';
      }
    } else if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: "Impossible de déterminer l'URL du site" });
    }

    const domain = parsedUrl.hostname.replace(/^www\./, '');
    const origin = parsedUrl.origin;
    const finalUrl = parsedUrl.href;

    const candidates: ExtractedLogo[] = [];
    const siteMeta: SiteMeta = {
      domain,
      fullUrl: finalUrl,
      searchQuery: originalSearchQuery,
      resolvedBrand: resolvedBrandName,
    };

    const addCandidate = (
      rawUrl: string,
      source: string,
      label: string,
      dimensions?: string,
      customReason?: string,
      forceType?: ExtractedLogo['type']
    ) => {
      if (!rawUrl || rawUrl.startsWith('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')) {
        return;
      }
      const resolved = resolveUrl(rawUrl, finalUrl);
      if (candidates.some((l) => l.url === resolved)) return;

      candidates.push({
        id: `logo-${candidates.length + 1}-${Math.random().toString(36).substring(2, 6)}`,
        url: resolved,
        source,
        label,
        type: forceType || determineImageType(resolved),
        dimensions,
        reason: customReason,
      });
    };

    // 1. Add well-known brand logos if domain matches
    if (POPULAR_BRAND_LOGOS[domain]) {
      for (const item of POPULAR_BRAND_LOGOS[domain]) {
        addCandidate(
          item.url,
          'Base Officielle Marque',
          item.label,
          item.dimensions,
          item.reason,
          item.type
        );
      }
    }

    // Try Simple Icons for the brand name (e.g. "stripe" from "stripe.com")
    const brandSlug = domain.split('.')[0].toLowerCase();
    const simpleIconUrl = `https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/${brandSlug}.svg`;
    addCandidate(
      simpleIconUrl,
      'Simple Icons (Vectoriel)',
      `Logo Vectoriel Officiel ${brandSlug.toUpperCase()}`,
      'Vectoriel',
      'Format SVG officiel haute netteté',
      'svg'
    );

    // 2. Fetch the target website HTML directly
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
      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        siteMeta.title = titleMatch[1].trim();
      }

      // Extract description
      const descMatch =
        html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
        html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      if (descMatch && descMatch[1]) {
        siteMeta.description = descMatch[1].trim();
      }

      // Extract Schema.org JSON-LD Logos
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
                addCandidate(logoUrl, 'Schema.org', 'Logo Officiel Organisation', undefined, "Déclaré officiellement par l'organisation");
              }
            }
            if (item.publisher?.logo) {
              const logoUrl =
                typeof item.publisher.logo === 'string'
                  ? item.publisher.logo
                  : item.publisher.logo?.url;
              if (logoUrl) {
                addCandidate(logoUrl, 'Schema.org Éditeur', 'Logo Éditeur', undefined, "Logo officiel de l'éditeur");
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

      // Apple Touch Icons (Crisp 180x180 Retina icons)
      const appleTouchRegex = /<link[^>]*rel=["']apple-touch-icon(?:-precomposed)?["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
      let appleMatch;
      while ((appleMatch = appleTouchRegex.exec(html)) !== null) {
        const fullTag = appleMatch[0];
        const sizesMatch = fullTag.match(/sizes=["']([^"']+)["']/i);
        const sizes = sizesMatch ? sizesMatch[1] : '180x180';
        addCandidate(appleMatch[1], 'Apple Touch Icon', `Icône Écran Retina (${sizes})`, sizes, 'Icône haute fidélité pour appareils Apple');
      }

      const appleTouchRev = /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon(?:-precomposed)?["']/gi;
      while ((appleMatch = appleTouchRev.exec(html)) !== null) {
        addCandidate(appleMatch[1], 'Apple Touch Icon', 'Icône Écran Retina (180x180)', '180x180', 'Icône haute fidélité pour appareils Apple');
      }

      // SVG Favicons
      const svgIconRegex = /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*type=["']image\/svg\+xml["'][^>]*href=["']([^"']+)["']/gi;
      let svgMatch;
      while ((svgMatch = svgIconRegex.exec(html)) !== null) {
        addCandidate(svgMatch[1], 'Favicon Vectoriel', 'Logo SVG Vectoriel', 'Vectoriel', 'Tracé SVG net sans pixel', 'svg');
      }
      const svgIconRev = /<link[^>]*href=["']([^"']+)["'][^>]*type=["']image\/svg\+xml["'][^>]*rel=["'](?:shortcut )?icon["']/gi;
      while ((svgMatch = svgIconRev.exec(html)) !== null) {
        addCandidate(svgMatch[1], 'Favicon Vectoriel', 'Logo SVG Vectoriel', 'Vectoriel', 'Tracé SVG net sans pixel', 'svg');
      }

      // Header logo detection
      const imgLogoRegex = /<img[^>]+(?:class|id|alt)=["'][^"']*(?:brand|logo|site-logo)[^"']*["'][^>]+src=["']([^"']+)["']/gi;
      let imgMatch;
      while ((imgMatch = imgLogoRegex.exec(html)) !== null) {
        addCandidate(imgMatch[1], 'Header / Navigation', 'Logo Page Web (HTML img)', undefined, 'Logo extrait du bandeau supérieur du site');
      }

      // Standard icons
      const iconRegex = /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
      let iconMatch;
      while ((iconMatch = iconRegex.exec(html)) !== null) {
        const fullTag = iconMatch[0];
        const sizesMatch = fullTag.match(/sizes=["']([^"']+)["']/i);
        const sizes = sizesMatch ? sizesMatch[1] : undefined;
        addCandidate(iconMatch[1], 'Favicon', sizes ? `Favicon (${sizes})` : 'Favicon', sizes);
      }

      // OpenGraph
      const ogImageMatch =
        html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (ogImageMatch && ogImageMatch[1]) {
        addCandidate(ogImageMatch[1], 'Bannière Réseaux', 'Visuel OpenGraph', undefined, 'Image de partage sur les réseaux');
      }
    }

    // 3. High quality global CDN / API icon mirrors
    const googleHdIcon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=256`;
    const unavatarIcon = `https://unavatar.io/${domain}?fallback=false`;
    const duckduckgoIcon = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
    const rootFavicon = `${origin}/favicon.ico`;

    addCandidate(googleHdIcon, 'Google Favicon HD', 'Favicon HD 256px (Google)', '256x256', 'Favicon officiel indexé par Google en haute résolution');
    addCandidate(unavatarIcon, 'Unavatar CDN', 'Logo Vectoriel / Hi-Res (Unavatar)', '256x256', 'Service unifié de logos de marques');
    addCandidate(duckduckgoIcon, 'DuckDuckGo', 'Icône Standard (DuckDuckGo)', '64x64', 'Icône DuckDuckGo');
    addCandidate(rootFavicon, 'Domaine Racine', 'Favicon racine (/favicon.ico)', '32x32', 'Fichier favicon.ico à la racine du domaine');

    // 4. CRITICAL: Validate every candidate image in parallel to eliminate broken/empty files!
    const validatedLogos: ExtractedLogo[] = [];
    const validationPromises = candidates.map(async (logo) => {
      const isValid = await validateImageResource(logo.url);
      if (isValid) {
        validatedLogos.push(logo);
      }
    });

    await Promise.all(validationPromises);

    // Fallback: If for some network reason none validated, keep the Google HD and DuckDuckGo which are ultra reliable
    const finalLogos = validatedLogos.length > 0 ? validatedLogos : [
      {
        id: 'logo-google-hd',
        url: googleHdIcon,
        source: 'Google Favicon HD',
        label: 'Favicon HD 256px (Google)',
        type: 'png' as const,
        dimensions: '256x256',
        reason: 'Favicon officiel indexé par Google en haute résolution',
      },
      {
        id: 'logo-duckduckgo',
        url: duckduckgoIcon,
        source: 'DuckDuckGo',
        label: 'Icône DuckDuckGo',
        type: 'ico' as const,
        dimensions: '64x64',
        reason: 'Icône standard',
      }
    ];

    // 5. Compute Fidelity & Prominence Score
    const calculateFidelityScore = (logo: ExtractedLogo) => {
      let score = 50;
      const urlLower = logo.url.toLowerCase();

      // Sharpness & Vector Quality
      if (logo.type === 'svg' || urlLower.endsWith('.svg') || logo.label.toLowerCase().includes('svg')) {
        score += 90;
        logo.clarityBadge = 'Ultra Net (Vectoriel SVG)';
      } else if (logo.dimensions && (logo.dimensions.includes('512') || logo.dimensions.includes('544'))) {
        score += 80;
        logo.clarityBadge = 'Haute Définition (512px+)';
      } else if (logo.dimensions?.includes('256')) {
        score += 65;
        logo.clarityBadge = 'Très Net (256x256)';
      } else if (logo.dimensions?.includes('180') || logo.source.includes('Apple Touch')) {
        score += 55;
        logo.clarityBadge = 'Net (180x180 Retina)';
      } else {
        logo.clarityBadge = 'Standard';
      }

      // Brand recognition
      if (logo.source.includes('Base Officielle')) {
        score += 70;
      } else if (logo.source.includes('Schema.org')) {
        score += 60;
      } else if (logo.source.includes('Simple Icons')) {
        score += 55;
      } else if (logo.source.includes('Apple Touch')) {
        score += 45;
      } else if (logo.source.includes('Google Favicon')) {
        score += 40;
      } else if (logo.source.includes('Header')) {
        score += 30;
      }

      // Penalize low resolution .ico files
      if (logo.type === 'ico' || urlLower.endsWith('.ico') || logo.source.includes('Domaine Racine')) {
        score -= 45;
        logo.clarityBadge = 'Basse Résolution (.ico)';
      }

      // Penalize social cards (not true logo emblems)
      if (logo.source.includes('Bannière') || logo.source.includes('OpenGraph')) {
        score -= 50;
      }

      logo.score = score;
      return score;
    };

    finalLogos.sort((a, b) => calculateFidelityScore(b) - calculateFidelityScore(a));

    // Winner is primary
    finalLogos.forEach((l, idx) => {
      l.isPrimary = idx === 0;
    });

    return res.json({
      success: true,
      meta: siteMeta,
      count: finalLogos.length,
      logos: finalLogos,
    });
  });

  // Serve with Vite in dev, static in prod
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
