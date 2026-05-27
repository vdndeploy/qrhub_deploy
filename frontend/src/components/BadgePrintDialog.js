import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Printer, X, ImagePlus, Trash2, FolderOpen } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import MediaPicker from '@/components/MediaPicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ROLE_PRESETS = [
  { value: 'Store Specialist', label: 'Store Specialist' },
  { value: 'Store Manager', label: 'Store Manager' },
  { value: '__custom__', label: 'Personalizzato…' },
];

// Recommended banner ratio matches the hero block: 86mm × 48mm ≈ 16:9.
const BANNER_RECOMMENDED = '1024×576 px (rapporto 16:9)';

const BadgePrintDialog = ({ open, onClose, vendor, organization, landingUrl }) => {
  const [rolePreset, setRolePreset] = useState('Store Specialist');
  const [customRole, setCustomRole] = useState('');
  const [bannerDataUrl, setBannerDataUrl] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const resolvedRole = useMemo(() => {
    if (rolePreset === '__custom__') return customRole.trim();
    return rolePreset;
  }, [rolePreset, customRole]);

  const fetchQrDataUrl = async () => {
    const res = await axios.get(`${API}/vendors/${vendor.id}/qr`, {
      withCredentials: true,
      responseType: 'blob',
    });
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(res.data);
    });
  };

  /**
   * Fetch an arbitrary image URL and return its dataURL. Used to inline the
   * organization logo into the printable popup — iOS Safari refuses to fetch
   * cross-origin images from a freshly-opened popup and would otherwise show
   * the logo as a broken placeholder in the saved PDF.
   */
  const fetchImageAsDataUrl = async (url) => {
    if (!url) return '';
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (!r.ok) return url; // fall back to remote URL
      const blob = await r.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return url;
    }
  };

  /**
   * Render the brand-gradient hero background to a PNG dataURL using a
   * 2D canvas. PNG is the only image format every print engine renders
   * reliably (incl. iOS Safari "Save as PDF"), so the badge keeps the
   * gradient look on every device.
   */
  const generateHeroGradient = (brand, brandSoft) => {
    try {
      const cnv = document.createElement('canvas');
      cnv.width = 800;
      cnv.height = 400;
      const ctx = cnv.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, cnv.width, cnv.height);
      grad.addColorStop(0, brand);
      grad.addColorStop(1, brandSoft);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cnv.width, cnv.height);
      // Soft top-left highlight for a glassy feel
      const hl = ctx.createRadialGradient(160, 80, 0, 160, 80, 480);
      hl.addColorStop(0, 'rgba(255,255,255,0.22)');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl;
      ctx.fillRect(0, 0, cnv.width, cnv.height);
      return cnv.toDataURL('image/png');
    } catch {
      return '';
    }
  };

  /**
   * Resize and compress an uploaded image to a manageable JPEG dataURL so the
   * printable popup never exceeds the size budget that mobile rasterisers
   * silently drop (iOS Safari "Save as PDF" caps inline images around 1-2 MB).
   * We target the canonical hero aspect ratio (2:1) at 1024×512 — way enough
   * resolution for a 86×46 mm badge header even on glossy print.
   */
  const resizeImageToBannerDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const targetW = 1024;
            const targetH = 512;
            const cnv = document.createElement('canvas');
            cnv.width = targetW;
            cnv.height = targetH;
            const ctx = cnv.getContext('2d');
            // Cover-fit (like CSS object-fit: cover) so the badge hero is full-bleed
            const r = Math.max(targetW / img.width, targetH / img.height);
            const w = img.width * r;
            const h = img.height * r;
            ctx.drawImage(img, (targetW - w) / 2, (targetH - h) / 2, w, h);
            resolve(cnv.toDataURL('image/jpeg', 0.85));
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleBannerSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Formato non valido — usa JPG o PNG');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Massimo 4 MB');
      return;
    }
    setUploading(true);
    try {
      // Two parallel jobs:
      //  1. Upload the original file to Cloudinary so it's reusable later
      //     from "Sfoglia caricati".
      //  2. Resize+compress locally so the printable popup gets a small
      //     dataURL (≈40-80 KB) instead of a multi-MB blob, which mobile PDF
      //     rasterisers silently drop (= black banner in the saved PDF).
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'uploads');
      const up = axios.post(`${API}/upload`, fd, { withCredentials: true });
      const resizePromise = resizeImageToBannerDataUrl(file);
      const [, resized] = await Promise.all([up, resizePromise]);
      setBannerDataUrl(resized);
      toast.success('Banner caricato e salvato in libreria');
    } catch {
      toast.error('Errore upload del banner');
    } finally {
      setUploading(false);
    }
  };

  const handleBannerFromLibrary = async (item) => {
    // Fetch the remote URL, then resize+compress so the printable popup gets
    // a lightweight dataURL (mobile PDF rasterisers drop oversized inline
    // images). We pipe the blob through the same canvas resize used by
    // freshly-uploaded files.
    try {
      const res = await fetch(item.url, { mode: 'cors' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const file = new File([blob], 'lib-banner', { type: blob.type || 'image/jpeg' });
      const resized = await resizeImageToBannerDataUrl(file);
      setBannerDataUrl(resized);
      toast.success('Banner selezionato');
    } catch {
      // Last-resort fallback: original URL. The popup might still drop it
      // on iOS, but at least desktop browsers will print it correctly.
      setBannerDataUrl(item.url);
      toast.success('Banner selezionato');
    }
  };

  const handleGenerate = async () => {
    if (!resolvedRole) {
      toast.error('Inserisci o seleziona un ruolo');
      return;
    }
    // Safari blocks any window.open() that runs after the first await in an
    // async handler. We open the popup SYNCHRONOUSLY inside the user gesture
    // and paint a quick loader while the QR fetch finishes.
    const win = window.open('about:blank', '_blank');
    if (!win) {
      toast.error('Il browser ha bloccato la finestra. Consenti i popup per qrhub.it');
      return;
    }
    win.document.open();
    win.document.write(buildLoaderHtml(vendor?.name || 'Venditore'));
    win.document.close();

    setGenerating(true);
    try {
      const primaryColor = organization?.primary_color || '#F96815';
      const brandSoft = softenHex(primaryColor, 0.42);
      const [qrDataUrl, orgLogoDataUrl] = await Promise.all([
        fetchQrDataUrl(),
        fetchImageAsDataUrl(organization?.logo_url || ''),
      ]);
      const heroGradientDataUrl = generateHeroGradient(primaryColor, brandSoft);
      const html = buildBadgeHtml({
        vendorName: vendor.name || 'Venditore',
        role: resolvedRole,
        orgBrand: organization?.brand_name || organization?.name || '',
        orgLogoUrl: orgLogoDataUrl,
        primaryColor,
        brandSoft,
        qrDataUrl,
        bannerDataUrl,
        heroGradientDataUrl,
        landingUrl: landingUrl || vendor.landing_url || '',
      });
      if (win.closed) {
        toast.error('Finestra chiusa prima del completamento');
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.addEventListener('load', () => {
        try { win.focus(); win.print(); } catch { /* manual print fallback */ }
      });
      onClose();
    } catch (e) {
      if (!win.closed) win.close();
      toast.error('Errore nella generazione del cartellino');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="badge-print-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-[#D2FA46]" />
            Stampa cartellino {vendor?.name}
          </DialogTitle>
          <DialogDescription>
            Genera un PDF fronte/retro identico con QR e colori dell'organizzazione.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Ruolo</Label>
            <RadioGroup value={rolePreset} onValueChange={setRolePreset} className="space-y-2">
              {ROLE_PRESETS.map((r) => (
                <div key={r.value} className="flex items-center gap-2">
                  <RadioGroupItem value={r.value} id={`role-${r.value}`} data-testid={`role-${r.value}`} />
                  <Label htmlFor={`role-${r.value}`} className="cursor-pointer font-normal">{r.label}</Label>
                </div>
              ))}
            </RadioGroup>
            {rolePreset === '__custom__' && (
              <Input
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="Es. Brand Ambassador, Customer Care…"
                maxLength={32}
                className="mt-2"
                data-testid="custom-role-input"
                autoFocus
              />
            )}
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">Banner header (opzionale)</Label>
            <p className="text-xs text-gray-500 dark:text-[#8a8a92] mb-2">
              Sostituisce lo sfondo colorato in cima al cartellino. Consigliato: <strong>{BANNER_RECOMMENDED}</strong>, JPG/PNG.
            </p>
            {bannerDataUrl ? (
              <div className="relative w-full rounded-lg overflow-hidden border border-gray-200 dark:border-white/10" data-testid="banner-preview-wrap">
                <img src={bannerDataUrl} alt="banner" className="w-full h-24 object-cover" />
                <button
                  type="button"
                  onClick={() => setBannerDataUrl('')}
                  className="absolute top-1.5 right-1.5 bg-white/95 hover:bg-red-50 text-red-600 border border-red-200 rounded-md p-1 shadow-sm"
                  title="Rimuovi banner"
                  data-testid="banner-remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <label
                  htmlFor="badge-banner-input"
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md border-2 border-dashed text-sm font-medium ${
                    uploading
                      ? 'border-gray-300 dark:border-white/15 bg-gray-100 dark:bg-[#1a1a1c] text-gray-400 cursor-wait'
                      : 'border-[#D2FA46] bg-white dark:bg-[#0a0a0b] hover:bg-[#D2FA46]/10 text-[#D2FA46] cursor-pointer'
                  }`}
                  data-testid="banner-upload-label"
                >
                  <ImagePlus className={`h-4 w-4 ${uploading ? 'animate-pulse' : ''}`} />
                  {uploading ? 'Caricamento…' : 'Carica nuovo'}
                  <input
                    id="badge-banner-input"
                    type="file"
                    accept="image/*"
                    onChange={handleBannerSelect}
                    className="hidden"
                    disabled={uploading}
                    data-testid="banner-upload-input"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                  className="h-auto py-2 text-sm"
                  data-testid="banner-browse-library"
                  disabled={uploading}
                >
                  <FolderOpen className="h-4 w-4 mr-1.5" />
                  Sfoglia caricati
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-sky-200/60 dark:border-sky-500/20 bg-sky-50/50 dark:bg-sky-500/[0.04] p-3 text-xs text-sky-900 dark:text-sky-200">
            <strong>Tip stampa:</strong> nella finestra di stampa attiva{' '}
            <em>"Grafica di sfondo"</em> ({/* macOS */}Più impostazioni → Stampa sfondi) per
            non perdere i colori del cartellino quando salvi come PDF.
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}><X className="h-4 w-4 mr-1" />Annulla</Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || !resolvedRole}
            className="bg-[#D2FA46] hover:bg-[#bce63d] text-black"
            data-testid="badge-generate-button"
          >
            <Printer className="h-4 w-4 mr-1" />
            {generating ? 'Generazione…' : 'Genera cartellino'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => { setPickerOpen(false); handleBannerFromLibrary(item); }}
        kind="uploads"
        hidePostsTab
        title="Scegli un banner dalla libreria"
      />
    </Dialog>
  );
};

function buildLoaderHtml(vendorName) {
  const safe = String(vendorName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8" /><title>Cartellino — ${safe}</title>
<style>
  html,body{margin:0;padding:0;height:100%;background:#0a0a0b;color:#e6e6ea;font-family:'Helvetica Neue',Arial,sans-serif;display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center;padding:24px}
  .spinner{width:48px;height:48px;border:4px solid rgba(210,250,70,0.15);border-top-color:#D2FA46;border-radius:50%;animation:spin 0.9s linear infinite;margin:0 auto 18px}
  h1{font-size:16px;font-weight:700;margin:0 0 4px}
  p{font-size:13px;color:#8a8a92;margin:0}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head>
<body><div class="wrap"><div class="spinner"></div><h1>Generazione cartellino…</h1><p>${safe}</p></div></body></html>`;
}

/**
 * Convert a hex color to RGB ints. Tolerates 3-char and 6-char hex with or
 * without leading "#". Returns null if the input is unparseable.
 */
function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Mix the brand color with white at the given strength (0..1, where 0 = pure
 * brand, 1 = pure white). Replaces the CSS color-mix() helper for print
 * engines that don't support it yet (Safari macOS ≤15, several PDF
 * rasterisers). The output is a 6-char hex string ready to embed in CSS.
 */
function softenHex(hex, mix = 0.45) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffd9c1';
  const m = Math.max(0, Math.min(1, mix));
  const r = Math.round(rgb.r + (255 - rgb.r) * m);
  const g = Math.round(rgb.g + (255 - rgb.g) * m);
  const b = Math.round(rgb.b + (255 - rgb.b) * m);
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function buildBadgeHtml({
  vendorName,
  role,
  orgBrand,
  orgLogoUrl,
  primaryColor,
  brandSoft,
  qrDataUrl,
  bannerDataUrl,
  heroGradientDataUrl,
  landingUrl,
}) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const brandHex = primaryColor || '#F96815';
  const brandSoftHex = brandSoft || softenHex(brandHex, 0.42);
  // The hero gradient is a PNG dataURL generated client-side via <canvas>.
  // Raster bitmaps print reliably on every engine (iOS Safari, mobile Chrome,
  // wkhtmltopdf) — unlike CSS linear-gradient() or inline SVG, which several
  // mobile PDF rasterisers silently drop, leaving the user with "black stripes".
  const heroBg = heroGradientDataUrl || '';

  const cssVar = `:root{--brand:${esc(brandHex)};--brand-soft:${esc(brandSoftHex)}}`;
  // CRITICAL: force background colors and images to print in Safari/Chrome.
  // Without this rule, "Save as PDF" produces a black-and-white badge.
  const printColorRule = `*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important}`;

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Cartellino — ${esc(vendorName)}</title>
<style>
  ${cssVar}
  ${printColorRule}
  @page { size: A4; margin: 14mm; }
  *,*::before,*::after { box-sizing: border-box; }
  html,body { margin:0; padding:0; background:#f0f0f0; font-family: 'Helvetica Neue', Arial, sans-serif; color:#1a1a1a; }
  .sheet {
    width: 182mm; margin: 0 auto; padding: 8mm;
    display: grid; grid-template-columns: 86mm 86mm; gap: 10mm; justify-content:center;
  }
  .badge {
    width: 86mm; height: 132mm; background:#fff; border-radius: 6mm; overflow:hidden;
    position:relative; box-shadow: 0 0 0 0.4mm rgba(0,0,0,0.10);
    page-break-inside: avoid;
  }
  .hero {
    position:relative; height: 46mm;
    /* Solid brand color base, in case the print engine drops the foreground
       gradient/banner image (older mobile rasterisers). */
    background-color: var(--brand);
    display:flex; align-items:flex-end; justify-content:center;
    overflow:hidden;
  }
  .hero-bg {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; display: block;
    pointer-events: none; z-index: 0;
  }
  .hero-overlay {
    position: absolute; inset: 0; pointer-events: none; z-index: 1;
    background: linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 100%);
  }
  .hero::before { content: none; }
  .hero-logo {
    position:absolute; top: 5mm; left: 5mm; z-index: 2;
    display:flex; align-items:center; gap: 3mm;
  }
  .hero-logo img { height: 8mm; width:auto; filter: brightness(0) invert(1); opacity:0.95; }
  .hero-logo span {
    color: #fff; font-size: 8pt; font-weight: 700; letter-spacing: 0.6pt; text-transform: uppercase;
    text-shadow: 0 0.4mm 1mm rgba(0,0,0,0.30);
  }
  .body {
    position: absolute; top: 46mm; left: 0; right: 0; bottom: 26mm;
    padding: 3mm 6mm; display:flex; flex-direction:column; align-items:center;
    justify-content: center; gap: 3mm; text-align:center;
  }
  .vendor-name {
    margin:0; font-size: 14pt; font-weight: 900; color:#0a0a0b;
    letter-spacing: -0.2pt; line-height: 1; text-transform: uppercase;
  }
  .qr-wrap {
    position:relative; padding: 4mm; background:#fff; border-radius: 5mm;
    box-shadow:
      0 0 0 0.35mm var(--brand-soft),
      0 1.5mm 5mm rgba(0,0,0,0.08),
      0 0.3mm 1.2mm rgba(0,0,0,0.04);
  }
  .qr-wrap::before, .qr-wrap::after {
    content:''; position:absolute; width: 4mm; height: 4mm; border: 0.5mm solid var(--brand);
    border-radius: 0.8mm;
  }
  .qr-wrap::before { top:-0.5mm; left:-0.5mm; border-right:0; border-bottom:0; border-top-left-radius: 2.2mm; }
  .qr-wrap::after { bottom:-0.5mm; right:-0.5mm; border-left:0; border-top:0; border-bottom-right-radius: 2.2mm; }
  .qr-wrap img { display:block; width: 36mm; height: 36mm; border-radius: 1.6mm; }
  .scan-label {
    font-size: 6.5pt; color:#666; font-weight: 600; letter-spacing: 0.4pt; text-transform: uppercase;
  }
  .footer {
    position:absolute; left:0; right:0; bottom:0; height: 26mm;
    padding: 4mm 5mm 6mm; text-align:center;
    background: #f5f5f7;
    border-top: 0.25mm solid #e0e0e3;
    color: #1a1a1a;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5mm;
  }
  .footer-role { font-size: 10pt; font-weight: 800; letter-spacing: 0.5pt; text-transform: uppercase; line-height:1.1; color: var(--brand); }
  .footer-brand { font-size: 7.5pt; font-weight: 500; color:#666; letter-spacing: 0.3pt; }
  .footer-sep { display:inline-block; margin: 0 1.5mm; opacity: 0.55; }
  /* Crop marks for cutting after print */
  .cut-mark { position:absolute; width: 2mm; height: 2mm; }
  .cut-mark.tl { top:-1mm; left:-1mm; border-left: 0.2mm solid #999; border-top: 0.2mm solid #999; }
  .cut-mark.tr { top:-1mm; right:-1mm; border-right: 0.2mm solid #999; border-top: 0.2mm solid #999; }
  .cut-mark.bl { bottom:-1mm; left:-1mm; border-left: 0.2mm solid #999; border-bottom: 0.2mm solid #999; }
  .cut-mark.br { bottom:-1mm; right:-1mm; border-right: 0.2mm solid #999; border-bottom: 0.2mm solid #999; }

  @media screen {
    body { padding: 20px 0; }
    .sheet { background:#fff; box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
    .toolbar {
      max-width: 182mm; margin: 0 auto 16px; padding: 12px 20px;
      background:#fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      display:flex; align-items:center; justify-content:space-between; gap: 16px;
      font-size: 13px; color:#333;
    }
    .toolbar b { color: var(--brand); }
    .toolbar button {
      background: var(--brand); color:#fff; border:0; padding: 8px 18px; border-radius: 999px;
      font-weight: 700; cursor:pointer; font-size: 13px;
    }
    .toolbar small { display:block; color:#666; font-size:11px; margin-top:2px; }
  }
  @media print {
    .toolbar { display:none; }
    body { background:#fff; padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div>
      Anteprima cartellino di <b>${esc(vendorName)}</b>
      <small>⚠️ Per mantenere i colori in PDF, attiva <em>"Grafica di sfondo"</em> nelle opzioni di stampa.</small>
    </div>
    <button onclick="window.print()">Stampa / PDF</button>
  </div>
  <div class="sheet">
    ${renderSide({ vendorName, role, orgBrand, orgLogoUrl, qrDataUrl, landingUrl, esc, heroBg, bannerDataUrl })}
    ${renderSide({ vendorName, role, orgBrand, orgLogoUrl, qrDataUrl, landingUrl, esc, heroBg, bannerDataUrl })}
  </div>
</body>
</html>`;
}

function renderSide({ vendorName, role, orgBrand, orgLogoUrl, qrDataUrl, esc, heroBg, bannerDataUrl }) {
  const brandLine = orgBrand
    ? `<div class="footer-brand">${esc(orgBrand)}</div>`
    : '';
  // Pick the hero "fill image": the user-uploaded banner has priority, then
  // the canvas-generated gradient PNG. Both are PNG dataURLs so they print on
  // every device.
  const heroFill = bannerDataUrl || heroBg || '';
  return `
    <div class="badge">
      <span class="cut-mark tl"></span>
      <span class="cut-mark tr"></span>
      <span class="cut-mark bl"></span>
      <span class="cut-mark br"></span>
      <div class="hero">
        ${heroFill ? `<img class="hero-bg" src="${esc(heroFill)}" alt="" />` : ''}
        ${bannerDataUrl ? `<div class="hero-overlay"></div>` : ''}
        <div class="hero-logo">
          ${orgLogoUrl
            ? `<img src="${esc(orgLogoUrl)}" alt="${esc(orgBrand)}" />`
            : (orgBrand ? `<span>${esc(orgBrand)}</span>` : '')}
        </div>
      </div>
      <div class="body">
        <h1 class="vendor-name">${esc(vendorName)}</h1>
        <div class="qr-wrap"><img src="${esc(qrDataUrl)}" alt="QR code" /></div>
        <div class="scan-label">Inquadra per saperne di più</div>
      </div>
      <div class="footer">
        <div class="footer-role">${esc(role)}</div>
        ${brandLine}
      </div>
    </div>
  `;
}

export default BadgePrintDialog;
