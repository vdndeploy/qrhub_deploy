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

const BANNER_RECOMMENDED = '1024×576 px (rapporto 16:9)';

// Badge geometry (in pixels @ 10 px/mm — 1×1 mm = 10×10 px).
// Final canvas is 800 × 1200 px (covers 80 × 120 mm credit-card tall format).
const PX = 10;
const BADGE = {
  W: 80 * PX,            // 800
  H: 120 * PX,           // 1200
  HERO_H: 32 * PX,       // 320 — header banner più stretto in altezza
  FOOTER_H: 22 * PX,     // 220
  RADIUS: 6 * PX,        // 60
};

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

  const fetchImageAsDataUrl = async (url) => {
    if (!url) return '';
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (!r.ok) return '';
      const blob = await r.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  };

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  /**
   * Resize/compress uploaded banner so memory usage stays low and the popup
   * doesn't choke when iOS Safari prints. Returns a JPEG dataURL at 2:1
   * ratio (matches the badge hero geometry).
   */
  const resizeImageToBannerDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const W = 1024;
            const H = 512;
            const cnv = document.createElement('canvas');
            cnv.width = W;
            cnv.height = H;
            const ctx = cnv.getContext('2d');
            const r = Math.max(W / img.width, H / img.height);
            const w = img.width * r;
            const h = img.height * r;
            ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
            resolve(cnv.toDataURL('image/jpeg', 0.85));
          } catch (err) { reject(err); }
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
    if (!file.type.startsWith('image/')) return toast.error('Formato non valido — usa JPG o PNG');
    if (file.size > 4 * 1024 * 1024) return toast.error('Massimo 4 MB');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'uploads');
      const up = axios.post(`${API}/upload`, fd, { withCredentials: true });
      const resized = await resizeImageToBannerDataUrl(file);
      await up;
      setBannerDataUrl(resized);
      toast.success('Banner caricato e salvato in libreria');
    } catch {
      toast.error('Errore upload del banner');
    } finally {
      setUploading(false);
    }
  };

  const handleBannerFromLibrary = async (item) => {
    try {
      const res = await fetch(item.url, { mode: 'cors' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const file = new File([blob], 'lib-banner', { type: blob.type || 'image/jpeg' });
      const resized = await resizeImageToBannerDataUrl(file);
      setBannerDataUrl(resized);
      toast.success('Banner selezionato');
    } catch {
      setBannerDataUrl(item.url);
      toast.success('Banner selezionato');
    }
  };

  /**
   * Render the ENTIRE badge as a single canvas → JPEG dataURL.
   * iOS Safari "Save as PDF" reliably prints a single <img> tag with explicit
   * width/height attributes; everything else (CSS gradients, positioned
   * inner images, absolute overlays) is dropped. So we collapse the whole
   * badge into one bitmap.
   */
  const renderBadgeBitmap = async ({
    vendorName, role, brand, brandSoft, brandName, logoDataUrl,
    bannerDataUrl: bannerSrc, qrDataUrl,
  }) => {
    const { W, H, HERO_H, FOOTER_H, RADIUS } = BADGE;
    const cnv = document.createElement('canvas');
    cnv.width = W;
    cnv.height = H;
    const ctx = cnv.getContext('2d');

    // Card background — rounded white
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 0, 0, W, H, RADIUS);
    ctx.fill();

    // Clip everything to the rounded card so the hero & footer don't bleed
    ctx.save();
    roundRect(ctx, 0, 0, W, H, RADIUS);
    ctx.clip();

    // ── HERO ────────────────────────────────────────────────────────
    if (bannerSrc) {
      try {
        const img = await loadImage(bannerSrc);
        const r = Math.max(W / img.width, HERO_H / img.height);
        const dw = img.width * r;
        const dh = img.height * r;
        ctx.drawImage(img, (W - dw) / 2, (HERO_H - dh) / 2, dw, dh);
      } catch {
        drawBrandGradient(ctx, brand, brandSoft, W, HERO_H);
      }
    } else {
      drawBrandGradient(ctx, brand, brandSoft, W, HERO_H);
    }

    // Logo overlay (top-left, white tinted)
    if (logoDataUrl) {
      try {
        const logo = await loadImage(logoDataUrl);
        const targetH = 80;
        const ratio = logo.width / logo.height;
        const targetW = Math.min(targetH * ratio, 280);
        const x = 50;
        const y = 50;
        // Draw logo on offscreen canvas, then tint to white via source-in
        const tmp = document.createElement('canvas');
        tmp.width = targetW;
        tmp.height = targetH;
        const tctx = tmp.getContext('2d');
        tctx.drawImage(logo, 0, 0, targetW, targetH);
        tctx.globalCompositeOperation = 'source-in';
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, 0, targetW, targetH);
        // Soft shadow so it pops on light gradients
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.drawImage(tmp, x, y);
        ctx.restore();
      } catch { /* skip logo if it fails */ }
    } else if (brandName) {
      // Fallback: render brand name text top-left in white
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 28px -apple-system, "Helvetica Neue", Arial, sans-serif';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillText(brandName.toUpperCase(), 50, 60);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    // ── BODY (white area) — vendor name + QR + scan label ───────────
    const bodyTop = HERO_H;
    const bodyBottom = H - FOOTER_H;
    const bodyH = bodyBottom - bodyTop;
    const bodyCenterY = bodyTop + bodyH / 2;
    const cx = W / 2;

    // Vendor name (uppercase) above the QR
    ctx.fillStyle = '#0a0a0b';
    ctx.font = '900 42px -apple-system, "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nameY = bodyTop + 55;
    ctx.fillText((vendorName || '').toUpperCase(), cx, nameY);

    // QR block — centered between name and scan label
    const qrSize = 360;
    const qrPad = 40;
    const qrX = cx - qrSize / 2;
    const qrY = nameY + 95;
    // White rounded card behind QR with soft shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.10)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, qrX - qrPad, qrY - qrPad, qrSize + 2 * qrPad, qrSize + 2 * qrPad, 32);
    ctx.fill();
    ctx.restore();
    // Soft brand ring
    ctx.strokeStyle = brandSoft;
    ctx.lineWidth = 3;
    roundRect(ctx, qrX - qrPad, qrY - qrPad, qrSize + 2 * qrPad, qrSize + 2 * qrPad, 32);
    ctx.stroke();
    // QR image
    if (qrDataUrl) {
      try {
        const qr = await loadImage(qrDataUrl);
        ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
      } catch { /* skip QR if it fails */ }
    }
    // Corner decorations (brand color)
    drawCorner(ctx, qrX - qrPad, qrY - qrPad, 36, 8, brand, 'tl');
    drawCorner(ctx, qrX + qrSize + qrPad, qrY + qrSize + qrPad, 36, 8, brand, 'br');

    // Scan label
    ctx.fillStyle = '#666666';
    ctx.font = '600 18px -apple-system, "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('INQUADRA PER SAPERNE DI PIÙ', cx, qrY + qrSize + qrPad + 30);

    // ── FOOTER (light grey, centred role + brand name) ──────────────
    const footerTop = H - FOOTER_H;
    ctx.fillStyle = '#f5f5f7';
    ctx.fillRect(0, footerTop, W, FOOTER_H);
    ctx.strokeStyle = '#e0e0e3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, footerTop);
    ctx.lineTo(W, footerTop);
    ctx.stroke();

    // Role text in brand color, uppercase, centered
    ctx.fillStyle = brand;
    ctx.font = '800 28px -apple-system, "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const footerCenter = footerTop + FOOTER_H / 2;
    ctx.fillText((role || '').toUpperCase(), cx, footerCenter - 16);

    // Brand name underneath, grey
    if (brandName) {
      ctx.fillStyle = '#666666';
      ctx.font = '500 20px -apple-system, "Helvetica Neue", Arial, sans-serif';
      ctx.fillText(brandName, cx, footerCenter + 22);
    }

    ctx.restore();

    return cnv.toDataURL('image/jpeg', 0.92);
  };

  const handleGenerate = async () => {
    if (!resolvedRole) {
      toast.error('Inserisci o seleziona un ruolo');
      return;
    }
    // Open popup synchronously to keep Safari user-gesture context.
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
      const badgeBitmap = await renderBadgeBitmap({
        vendorName: vendor.name || 'Venditore',
        role: resolvedRole,
        brand: primaryColor,
        brandSoft,
        brandName: organization?.brand_name || organization?.name || '',
        logoDataUrl: orgLogoDataUrl,
        bannerDataUrl,
        qrDataUrl,
      });
      const html = buildBadgeHtml({ badgeBitmap });

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
    } catch {
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
            Genera un PDF fronte/retro con QR e colori dell'organizzazione.
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
              Sostituisce lo sfondo colorato. Consigliato: <strong>{BANNER_RECOMMENDED}</strong>, JPG/PNG.
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
            <strong>Tip stampa:</strong> il cartellino è renderizzato come bitmap unica
            per garantire colori e logo su qualsiasi stampante. Nessuna opzione
            "Grafica di sfondo" richiesta.
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />Annulla
          </Button>
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

// ── Pure helpers ─────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBrandGradient(ctx, brand, brandSoft, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, brand);
  g.addColorStop(1, brandSoft);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const hl = ctx.createRadialGradient(W * 0.2, H * 0.2, 0, W * 0.2, H * 0.2, W * 0.7);
  hl.addColorStop(0, 'rgba(255,255,255,0.22)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, W, H);
}

function drawCorner(ctx, x, y, size, weight, color, kind) {
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (kind === 'tl') {
    ctx.moveTo(x, y + size);
    ctx.lineTo(x, y);
    ctx.lineTo(x + size, y);
  } else if (kind === 'br') {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y);
    ctx.lineTo(x - size, y);
  }
  ctx.stroke();
}

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

function softenHex(hex, mix = 0.42) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffd9c1';
  const m = Math.max(0, Math.min(1, mix));
  const r = Math.round(rgb.r + (255 - rgb.r) * m);
  const g = Math.round(rgb.g + (255 - rgb.g) * m);
  const b = Math.round(rgb.b + (255 - rgb.b) * m);
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function buildLoaderHtml(vendorName) {
  const safe = String(vendorName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8" /><title>Cartellino — ${safe}</title>
<style>
  html,body{margin:0;padding:0;height:100%;background:#0a0a0b;color:#e6e6ea;font-family:-apple-system,Arial,sans-serif;display:flex;align-items:center;justify-content:center}
  .wrap{text-align:center;padding:24px}
  .spinner{width:48px;height:48px;border:4px solid rgba(210,250,70,0.15);border-top-color:#D2FA46;border-radius:50%;animation:spin 0.9s linear infinite;margin:0 auto 18px}
  h1{font-size:16px;font-weight:700;margin:0 0 4px}
  p{font-size:13px;color:#8a8a92;margin:0}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head>
<body><div class="wrap"><div class="spinner"></div><h1>Generazione cartellino…</h1><p>${safe}</p></div></body></html>`;
}

/**
 * Print HTML: two identical static <img> tags side by side (front/back).
 * No position:absolute, no CSS gradients, no overlays. The whole badge is
 * already baked into the bitmap, which iOS Safari prints reliably.
 */
function buildBadgeHtml({ badgeBitmap }) {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Cartellino</title>
<style>
  @page { size: A4; margin: 14mm; }
  *,*::before,*::after { box-sizing: border-box; }
  html,body { margin: 0; padding: 0; background: #f0f0f0; }
  .sheet {
    width: 170mm; margin: 0 auto; padding: 0;
    display: flex; flex-direction: row; flex-wrap: nowrap; gap: 6mm;
    justify-content: center; align-items: flex-start;
  }
  .badge {
    width: 80mm; height: 120mm; display: block;
    page-break-inside: avoid;
    flex: 0 0 80mm;
  }
  .badge img {
    width: 80mm; height: 120mm; display: block;
    border-radius: 6mm;
  }
  @media screen {
    body { padding: 20px 0; }
    .sheet { background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
    .toolbar {
      max-width: 170mm; margin: 0 auto 16px; padding: 12px 20px;
      background: #fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      font-size: 13px; color: #333;
    }
    .toolbar button {
      background: #0a0a0b; color: #D2FA46; border: 0; padding: 8px 18px; border-radius: 999px;
      font-weight: 700; cursor: pointer; font-size: 13px;
    }
  }
  @media print {
    .toolbar { display: none; }
    body { background: #fff; padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span>Anteprima cartellino — premi <kbd>Cmd/Ctrl + P</kbd> e salva come PDF</span>
    <button onclick="window.print()">Stampa / PDF</button>
  </div>
  <div class="sheet">
    <div class="badge"><img src="${badgeBitmap}" width="100%" height="100%" alt="cartellino" /></div>
    <div class="badge"><img src="${badgeBitmap}" width="100%" height="100%" alt="cartellino" /></div>
  </div>
</body>
</html>`;
}

export default BadgePrintDialog;
