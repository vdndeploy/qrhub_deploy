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
import { Printer, X } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ROLE_PRESETS = [
  { value: 'Store Specialist', label: 'Store Specialist' },
  { value: 'Store Manager', label: 'Store Manager' },
  { value: '__custom__', label: 'Personalizzato…' },
];

/**
 * Opens a print-ready HTML document in a new window with a vertical credit-card
 * style badge for a vendor. The user can preview, then Cmd/Ctrl+P → "Save as
 * PDF" to obtain a printable file. No client-side PDF library is needed.
 */
const BadgePrintDialog = ({ open, onClose, vendor, organization, landingUrl }) => {
  const [rolePreset, setRolePreset] = useState('Store Specialist');
  const [customRole, setCustomRole] = useState('');
  const [generating, setGenerating] = useState(false);

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

  const handleGenerate = async () => {
    if (!resolvedRole) {
      toast.error('Inserisci o seleziona un ruolo');
      return;
    }
    setGenerating(true);
    try {
      const qrDataUrl = await fetchQrDataUrl();
      const html = buildBadgeHtml({
        vendorName: vendor.name || 'Venditore',
        role: resolvedRole,
        orgBrand: organization?.brand_name || organization?.name || '',
        orgLogoUrl: organization?.logo_url || '',
        primaryColor: organization?.primary_color || '#F96815',
        qrDataUrl,
        landingUrl: landingUrl || vendor.landing_url || '',
      });
      const win = window.open('', '_blank');
      if (!win) {
        toast.error('Il browser ha bloccato la finestra. Consenti i popup per qrhub.it');
        setGenerating(false);
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      // After the new window content has rendered images, automatically trigger
      // the native print dialog so the operator can save as PDF in one click.
      win.onload = () => {
        try {
          win.focus();
          win.print();
        } catch {
          /* user can still press Cmd/Ctrl+P manually */
        }
      };
      onClose();
    } catch (e) {
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
            Scegli il ruolo da stampare sul cartellino. Sarà generato un PDF
            fronte/retro identico con QR code, logo e colori dell'organizzazione.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Ruolo</Label>
            <RadioGroup
              value={rolePreset}
              onValueChange={setRolePreset}
              className="space-y-2"
            >
              {ROLE_PRESETS.map((r) => (
                <div key={r.value} className="flex items-center gap-2">
                  <RadioGroupItem
                    value={r.value}
                    id={`role-${r.value}`}
                    data-testid={`role-${r.value}`}
                  />
                  <Label htmlFor={`role-${r.value}`} className="cursor-pointer font-normal">
                    {r.label}
                  </Label>
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
          <div className="rounded-lg border border-sky-200/60 dark:border-sky-500/20 bg-sky-50/50 dark:bg-sky-500/[0.04] p-3 text-xs text-sky-900 dark:text-sky-200">
            <strong>Tip:</strong> dopo l'apertura della finestra, il browser
            mostrerà direttamente la finestra di stampa. Seleziona{' '}
            <em>"Salva come PDF"</em> come destinazione per ottenere il file.
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
    </Dialog>
  );
};

/**
 * Build a self-contained printable HTML document for two identical front/back
 * badges. Uses CSS @page for an 86×54mm landscape card (the canonical badge
 * size in Europe) wrapped inside a single A4 sheet so the user can cut along
 * the marks.
 */
function buildBadgeHtml({
  vendorName,
  role,
  orgBrand,
  orgLogoUrl,
  primaryColor,
  qrDataUrl,
  landingUrl,
}) {
  // Escape user-provided strings to prevent HTML injection in the new window.
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const cssVar = `:root{--brand:${esc(primaryColor)};--brand-soft:color-mix(in srgb, ${esc(primaryColor)} 65%, #fff)}`;

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Cartellino — ${esc(vendorName)}</title>
<style>
  ${cssVar}
  @page { size: A4; margin: 14mm; }
  *,*::before,*::after { box-sizing: border-box; }
  html,body { margin:0; padding:0; background:#f0f0f0; font-family: 'Helvetica Neue', Arial, sans-serif; color:#1a1a1a; }
  .sheet {
    width: 182mm; margin: 0 auto; padding: 8mm;
    display: grid; grid-template-columns: 86mm 86mm; gap: 10mm; justify-content:center;
  }
  .badge {
    width: 86mm; height: 132mm; background:#fff; border-radius: 6mm; overflow:hidden;
    position:relative; box-shadow: 0 0 0 0.4mm rgba(0,0,0,0.1);
    page-break-inside: avoid;
  }
  .hero {
    position:relative; height: 48mm;
    background: linear-gradient(135deg, var(--brand) 0%, var(--brand-soft) 100%);
    display:flex; align-items:center; justify-content:center;
    overflow:hidden;
  }
  .hero::before {
    content:''; position:absolute; inset:0;
    background: radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18) 0%, transparent 60%);
  }
  .hero::after {
    content:''; position:absolute; right:-18mm; bottom:-18mm; width:42mm; height:42mm; border-radius:50%;
    background: rgba(255,255,255,0.10);
  }
  .org-strip {
    position:absolute; top:0; left:0; right:0; padding: 4mm 5mm;
    display:flex; align-items:center; justify-content:space-between; color:#fff;
    font-size: 9pt; font-weight: 600; letter-spacing: 0.4pt; text-transform: uppercase;
    z-index: 2;
  }
  .org-strip img {
    height: 7mm; width:auto; filter: brightness(0) invert(1);
  }
  .hero-eyebrow {
    color: rgba(255,255,255,0.92); font-size: 7pt; font-weight: 700; letter-spacing: 1.4pt;
    text-transform: uppercase; text-align: center; position: relative; z-index:1;
    margin-top: 14mm;
  }
  .role-badge {
    display:inline-block; padding: 1.6mm 4mm; border-radius: 999px; background:rgba(255,255,255,0.92); color: var(--brand);
    font-size: 8pt; font-weight: 800; letter-spacing: 0.6pt; text-transform: uppercase;
    box-shadow: 0 0.8mm 2mm rgba(0,0,0,0.10);
  }
  .role-wrap {
    position:absolute; left:0; right:0; bottom:-5mm; display:flex; justify-content:center; z-index:3;
  }
  .body {
    padding: 9mm 6mm 4mm; display:flex; flex-direction:column; align-items:center; gap: 4mm;
  }
  .vendor-name {
    margin:0; font-size: 19pt; font-weight: 900; text-align:center; color:#0a0a0b;
    letter-spacing: -0.3pt; line-height: 1.05; text-transform: uppercase;
  }
  .qr-wrap {
    position:relative; padding: 4mm; background:#fff; border-radius: 4mm;
    box-shadow: 0 0 0 0.4mm var(--brand);
  }
  .qr-wrap::before, .qr-wrap::after {
    content:''; position:absolute; width: 5mm; height: 5mm; border: 0.8mm solid var(--brand);
  }
  .qr-wrap::before { top:-0.8mm; left:-0.8mm; border-right:0; border-bottom:0; border-top-left-radius: 2mm; }
  .qr-wrap::after { bottom:-0.8mm; right:-0.8mm; border-left:0; border-top:0; border-bottom-right-radius: 2mm; }
  .qr-wrap img { display:block; width: 38mm; height: 38mm; }
  .scan-label {
    font-size: 7pt; color:#555; font-weight: 600; letter-spacing: 0.4pt; text-transform: uppercase;
  }
  .footer {
    position:absolute; left:0; right:0; bottom:0; padding: 3mm 5mm;
    display:flex; align-items:center; justify-content:space-between;
    font-size: 6.5pt; color:#666; border-top: 0.2mm solid #e5e5e5;
  }
  .footer .url { font-family: 'Menlo', 'Courier New', monospace; color:#444; max-width: 50mm; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .footer .brand { color: var(--brand); font-weight: 800; letter-spacing: 0.6pt; text-transform: uppercase; font-size: 6.5pt;}
  .meta-label {
    font-size: 6.5pt; color:#888; letter-spacing: 0.5pt; text-transform: uppercase; font-weight: 600;
    margin-top: 1mm;
  }
  /* Crop marks for cutting after print */
  .cut-mark {
    position:absolute; width: 2mm; height: 2mm; border-color: #999;
  }
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
  }
  @media print {
    .toolbar { display:none; }
    body { background:#fff; padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span>Anteprima cartellino di <b>${esc(vendorName)}</b> — premi <kbd>Cmd/Ctrl + P</kbd> e seleziona "Salva come PDF"</span>
    <button onclick="window.print()">Stampa / PDF</button>
  </div>
  <div class="sheet">
    ${renderSide({ vendorName, role, orgBrand, orgLogoUrl, qrDataUrl, landingUrl, esc, side: 'Fronte' })}
    ${renderSide({ vendorName, role, orgBrand, orgLogoUrl, qrDataUrl, landingUrl, esc, side: 'Retro' })}
  </div>
</body>
</html>`;
}

function renderSide({ vendorName, role, orgBrand, orgLogoUrl, qrDataUrl, landingUrl, esc, side }) {
  return `
    <div class="badge">
      <span class="cut-mark tl"></span>
      <span class="cut-mark tr"></span>
      <span class="cut-mark bl"></span>
      <span class="cut-mark br"></span>
      <div class="hero">
        <div class="org-strip">
          ${orgLogoUrl ? `<img src="${esc(orgLogoUrl)}" alt="${esc(orgBrand)}" crossorigin="anonymous" />` : `<span>${esc(orgBrand)}</span>`}
          <span>${esc(side)}</span>
        </div>
        <div class="hero-eyebrow">${esc(orgBrand)}</div>
        <div class="role-wrap"><span class="role-badge">${esc(role)}</span></div>
      </div>
      <div class="body">
        <h1 class="vendor-name">${esc(vendorName)}</h1>
        <div class="qr-wrap"><img src="${esc(qrDataUrl)}" alt="QR code" /></div>
        <div class="scan-label">Inquadra per saperne di più</div>
      </div>
      <div class="footer">
        <span class="url">${esc((landingUrl || '').replace(/^https?:\/\//, ''))}</span>
        <span class="brand">${esc(orgBrand) || 'QRHub'}</span>
      </div>
    </div>
  `;
}

export default BadgePrintDialog;
