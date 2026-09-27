import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  Copy,
  Check,
  ExternalLink,
  Globe,
  Sparkles,
  Layers,
  History,
  Trash2,
  RefreshCw,
  Sun,
  Moon,
  Grid,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  FileCode,
  Image as ImageIcon
} from 'lucide-react';

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

interface ExtractionResponse {
  success: boolean;
  meta: SiteMeta;
  count: number;
  logos: ExtractedLogo[];
}

interface HistoryItem {
  domain: string;
  url: string;
  title?: string;
  logoUrl?: string;
  timestamp: number;
}

const PRESET_DOMAINS = [
  { name: 'Google', url: 'google.com' },
  { name: 'Apple', url: 'apple.com' },
  { name: 'GitHub', url: 'github.com' },
  { name: 'Stripe', url: 'stripe.com' },
  { name: 'Figma', url: 'figma.com' },
  { name: 'Spotify', url: 'spotify.com' },
  { name: 'Netflix', url: 'netflix.com' },
  { name: 'Airbnb', url: 'airbnb.com' },
  { name: 'Notion', url: 'notion.so' },
];

export default function App() {
  const [inputUrl, setInputUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExtractionResponse | null>(null);
  const [selectedLogo, setSelectedLogo] = useState<ExtractedLogo | null>(null);
  const [previewBg, setPreviewBg] = useState<'transparent' | 'light' | 'dark'>('transparent');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load history on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('logofinder_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to load history', e);
    }
  }, []);

  const saveToHistory = (item: HistoryItem) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.domain.toLowerCase() !== item.domain.toLowerCase());
      const updated = [item, ...filtered].slice(0, 12);
      try {
        localStorage.setItem('logofinder_history', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save history', e);
      }
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('logofinder_history');
    } catch (e) {
      console.warn(e);
    }
  };

  const handleExtract = async (targetUrlToFetch?: string) => {
    const raw = (targetUrlToFetch || inputUrl).trim();
    if (!raw) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/extract-logo?url=${encodeURIComponent(raw)}`);
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || "Impossible d'extraire les logos de ce site");
      }

      setData(result);
      if (result.logos && result.logos.length > 0) {
        const primary = result.logos.find((l: ExtractedLogo) => l.isPrimary) || result.logos[0];
        setSelectedLogo(primary);

        // Save to history
        saveToHistory({
          domain: result.meta.domain,
          url: result.meta.fullUrl,
          title: result.meta.title,
          logoUrl: primary.url,
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur inattendue est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleExtract();
  };

  const handleCopyLink = async (logo: ExtractedLogo) => {
    try {
      await navigator.clipboard.writeText(logo.url);
      setCopiedId(logo.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownload = async (logo: ExtractedLogo) => {
    setDownloadingId(logo.id);
    try {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(logo.url)}`;
      const res = await fetch(proxyUrl);
      const blob = await res.blob();

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;

      // generate clean filename
      const domainSlug = data?.meta.domain.replace(/[^a-z0-9]/gi, '_') || 'website';
      const ext = logo.type === 'svg' ? 'svg' : logo.type === 'ico' ? 'ico' : 'png';
      a.download = `${domainSlug}_logo_${logo.id}.${ext}`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed', err);
      // Fallback: open in new tab
      window.open(logo.url, '_blank');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopyImageToClipboard = async (logo: ExtractedLogo) => {
    try {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(logo.url)}`;
      const res = await fetch(proxyUrl);
      const blob = await res.blob();

      // If SVG, copy text content
      if (logo.type === 'svg') {
        const svgText = await blob.text();
        await navigator.clipboard.writeText(svgText);
        setCopiedId(`img-${logo.id}`);
        setTimeout(() => setCopiedId(null), 2000);
        return;
      }

      // Convert to PNG for clipboard API
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);
      img.src = objectUrl;

      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 200;
        canvas.height = img.naturalHeight || 200;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(async (pngBlob) => {
            if (pngBlob) {
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': pngBlob }),
                ]);
                setCopiedId(`img-${logo.id}`);
                setTimeout(() => setCopiedId(null), 2000);
              } catch (clipErr) {
                console.warn('Clipboard write failed', clipErr);
              }
            }
            URL.revokeObjectURL(objectUrl);
          }, 'image/png');
        }
      };
    } catch (err) {
      console.error('Failed to copy image', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent dark:from-white dark:to-slate-300">
                LogoFinder
              </span>
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                HD & SVG
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Extraction sans filigrane</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 space-y-10">
        {/* Hero & Search Input */}
        <section className="text-center max-w-2xl mx-auto space-y-4">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Extrayez le logo de{' '}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
              n&apos;importe quel site
            </span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base">
            Entrez une adresse de site web (ex : <span className="font-mono text-slate-800 dark:text-slate-200">google.com</span>) pour obtenir instantanément tous ses logos officiels, icônes haute résolution et formats vectoriels.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 relative">
            <div className="relative flex items-center shadow-lg shadow-indigo-500/5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all p-1.5 sm:p-2">
              <div className="pl-3 pr-2 text-slate-400">
                <Globe className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Entrez une URL (ex: google.com, figma.com, stripe.com)"
                className="w-full bg-transparent px-2 py-2.5 text-sm sm:text-base text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading || !inputUrl.trim()}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 sm:py-3 rounded-xl transition shadow-md shadow-indigo-600/20 text-sm whitespace-nowrap cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Extraction...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Obtenir le logo</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <span className="text-xs text-slate-400 mr-1">Exemples rapides :</span>
            {PRESET_DOMAINS.map((item) => (
              <button
                key={item.url}
                type="button"
                onClick={() => {
                  setInputUrl(item.url);
                  handleExtract(item.url);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200/60 dark:border-slate-800 transition cursor-pointer text-slate-600 dark:text-slate-300"
              >
                {item.name}
              </button>
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-sm flex items-center gap-3 text-left">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}
        </section>

        {/* Results Area */}
        {data && (
          <section className="space-y-8 animate-fade-in">
            {/* Meta Information Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {selectedLogo && (
                  <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 flex items-center justify-center shrink-0">
                    <img
                      src={selectedLogo.url}
                      alt={data.meta.domain}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white capitalize">
                      {data.meta.title || data.meta.domain}
                    </h2>
                    <a
                      href={data.meta.fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-indigo-600 transition"
                      title="Ouvrir le site web"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    {data.meta.domain}
                  </p>
                  {data.meta.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl line-clamp-1">
                      {data.meta.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                <span className="text-xs px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                  {data.count} variante{data.count > 1 ? 's' : ''} trouvée{data.count > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Featured Showcase Card */}
            {selectedLogo && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                {/* Visual Preview Box */}
                <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between pb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 uppercase tracking-wider">
                        {selectedLogo.type}
                      </span>
                      {selectedLogo.dimensions && (
                        <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {selectedLogo.dimensions}
                        </span>
                      )}
                    </div>

                    {/* Preview Background Switcher */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewBg('transparent')}
                        title="Fond Damier (Transparence)"
                        className={`p-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                          previewBg === 'transparent'
                            ? 'bg-white dark:bg-slate-700 shadow-xs text-indigo-600 dark:text-indigo-300'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <Grid className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewBg('light')}
                        title="Fond Blanc"
                        className={`p-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                          previewBg === 'light'
                            ? 'bg-white dark:bg-slate-700 shadow-xs text-indigo-600 dark:text-indigo-300'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewBg('dark')}
                        title="Fond Sombre"
                        className={`p-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                          previewBg === 'dark'
                            ? 'bg-white dark:bg-slate-700 shadow-xs text-indigo-600 dark:text-indigo-300'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Logo Display Canvas */}
                  <div
                    className={`min-h-[260px] sm:min-h-[320px] rounded-xl flex items-center justify-center p-8 transition-colors ${
                      previewBg === 'transparent'
                        ? 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] bg-slate-50/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800'
                        : previewBg === 'light'
                        ? 'bg-white border border-slate-200'
                        : 'bg-slate-950 border border-slate-800 text-white'
                    }`}
                  >
                    <img
                      src={selectedLogo.url}
                      alt={selectedLogo.label}
                      className="max-h-48 max-w-full object-contain filter drop-shadow-sm select-none"
                    />
                  </div>

                  <p className="text-xs text-slate-400 mt-4 text-center">
                    Source identifiée : <span className="font-medium text-slate-700 dark:text-slate-300">{selectedLogo.source}</span>
                  </p>
                </div>

                {/* Actions & Information Panel */}
                <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                        {selectedLogo.label}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">
                        {selectedLogo.url}
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Format d&apos;image :</span>
                        <span className="font-semibold uppercase text-slate-700 dark:text-slate-200">
                          {selectedLogo.type}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Origine :</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {selectedLogo.source}
                        </span>
                      </div>
                      {selectedLogo.dimensions && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Taille annoncée :</span>
                          <span className="font-mono text-slate-700 dark:text-slate-200">
                            {selectedLogo.dimensions}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => handleDownload(selectedLogo)}
                      disabled={downloadingId === selectedLogo.id}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl shadow-md shadow-indigo-600/20 transition cursor-pointer"
                    >
                      {downloadingId === selectedLogo.id ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Téléchargement...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>Télécharger le logo</span>
                        </>
                      )}
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(selectedLogo)}
                        className="flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer text-slate-700 dark:text-slate-200"
                      >
                        {copiedId === selectedLogo.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Lien copié !</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copier l&apos;URL</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyImageToClipboard(selectedLogo)}
                        className="flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer text-slate-700 dark:text-slate-200"
                      >
                        {copiedId === `img-${selectedLogo.id}` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Image copiée !</span>
                          </>
                        ) : (
                          <>
                            {selectedLogo.type === 'svg' ? (
                              <FileCode className="w-3.5 h-3.5" />
                            ) : (
                              <ImageIcon className="w-3.5 h-3.5" />
                            )}
                            <span>{selectedLogo.type === 'svg' ? 'Copier SVG' : 'Copier Image'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Logo Gallery (All detected versions) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  <span>Toutes les versions & formats détectés</span>
                </h3>
                <span className="text-xs text-slate-500">
                  Cliquez sur un logo pour l&apos;inspecter
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {data.logos.map((logo) => {
                  const isSelected = selectedLogo?.id === logo.id;
                  return (
                    <div
                      key={logo.id}
                      onClick={() => setSelectedLogo(logo)}
                      className={`group relative rounded-xl border p-3 flex flex-col items-center justify-between transition-all cursor-pointer bg-white dark:bg-slate-900 ${
                        isSelected
                          ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-md'
                          : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {logo.type}
                        </span>
                        {logo.isPrimary && (
                          <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-semibold px-1.5 py-0.5 rounded">
                            Principal
                          </span>
                        )}
                      </div>

                      {/* Thumbnail Image */}
                      <div className="w-full h-24 rounded-lg bg-slate-50 dark:bg-slate-950/60 p-2 flex items-center justify-center border border-slate-100 dark:border-slate-800/80 group-hover:scale-105 transition-transform">
                        <img
                          src={logo.url}
                          alt={logo.label}
                          className="max-h-full max-w-full object-contain"
                          loading="lazy"
                        />
                      </div>

                      <div className="w-full mt-2 text-center">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                          {logo.source}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {logo.dimensions || logo.label}
                        </p>
                      </div>

                      {/* Hover action overlay */}
                      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(logo);
                          }}
                          className="p-2 rounded-lg bg-white text-slate-900 hover:bg-indigo-50 transition shadow"
                          title="Télécharger"
                        >
                          <Download className="w-4 h-4 text-indigo-600" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLink(logo);
                          }}
                          className="p-2 rounded-lg bg-white text-slate-900 hover:bg-indigo-50 transition shadow"
                          title="Copier le lien"
                        >
                          <Copy className="w-4 h-4 text-slate-700" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* History Section */}
        {history.length > 0 && (
          <section className="border-t border-slate-200 dark:border-slate-800 pt-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                <span>Recherches récentes</span>
              </h3>
              <button
                type="button"
                onClick={clearHistory}
                className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Effacer l&apos;historique</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {history.map((item) => (
                <button
                  key={item.domain}
                  type="button"
                  onClick={() => {
                    setInputUrl(item.domain);
                    handleExtract(item.domain);
                  }}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 dark:hover:border-indigo-600 transition flex items-center gap-3 text-left cursor-pointer group"
                >
                  {item.logoUrl ? (
                    <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 p-1 flex items-center justify-center shrink-0 border border-slate-100 dark:border-slate-700">
                      <img
                        src={item.logoUrl}
                        alt={item.domain}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : (
                    <Globe className="w-5 h-5 text-slate-400" />
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {item.domain}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {new Date(item.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Feature Highlights when idle */}
        {!data && !isLoading && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 flex items-center justify-center font-bold">
                1
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                Détection Multi-Sources
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Analyse les balises Schema.org JSON-LD de l&apos;organisation, les Apple Touch Icons, les balises de favicon SVG et les en-têtes HTML.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 flex items-center justify-center font-bold">
                2
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                Haute Résolution & SVG
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Priorise les formats vectoriels SVG et les résolutions 512px / 256px pour une intégration parfaite dans vos projets et maquettes.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400 flex items-center justify-center font-bold">
                3
              </div>
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                Téléchargement & Copie Directe
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Téléchargez en un clic, copiez le lien CDN ou collez directement l&apos;image ou le code SVG dans Figma ou votre éditeur.
              </p>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>LogoFinder — Extraction instantanée de logos et marques web</p>
          <div className="flex items-center gap-4">
            <span>SVG • PNG • ICO • WebP</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
