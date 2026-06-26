/**
 * LandingVariants — manages additional landing variants for a single store.
 *
 * Rendered inside the Landings dialog (Landings.js) below the primary form.
 * Provides list + create/edit/delete UX so an org admin can spin up
 * separate marketing funnels for the same physical store, e.g.
 * "WindTre Protetti" + "Passa a Fibra", each with its own slug, title,
 * hero, CTA color, logo and WhatsApp message.
 *
 * Backend contract:
 *   GET    /api/stores/{storeId}/landings              → list
 *   POST   /api/stores/{storeId}/landings              → create
 *   PATCH  /api/stores/{storeId}/landings/{variantId}  → update
 *   DELETE /api/stores/{storeId}/landings/{variantId}  → delete
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ExternalLink, Copy, Check, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import MediaPicker from '@/components/MediaPicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Slugify mirrors the backend `_slugify` so the user sees the same final
// slug we'll persist. Keeps the URL preview deterministic.
const slugify = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const emptyForm = () => ({
  id: '',
  name: '',
  slug: '',
  title: '',
  subtitle: '',
  hero_image: '',
  logo_url: '',
  cta_color: '',
  whatsapp_message: '',
  enabled: true,
});

const LandingVariants = ({ storeId, storeName }) => {
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // form state when adding/editing
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  // Which field is the media picker targeting? 'hero_image' | 'logo_url'
  const [pickerTarget, setPickerTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/stores/${storeId}/landings`,
        { withCredentials: true });
      setVariants(data || []);
    } catch (e) {
      toast.error('Errore caricamento varianti');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const startAdd = () => setEditing(emptyForm());
  const startEdit = (v) => setEditing({
    id: v.id,
    name: v.name || '',
    slug: v.slug || '',
    title: v.title || '',
    subtitle: v.subtitle || '',
    hero_image: v.hero_image || '',
    logo_url: v.logo_url || '',
    cta_color: v.cta_color || '',
    whatsapp_message: v.whatsapp_message || '',
    enabled: v.enabled !== false,
  });
  const cancelEdit = () => setEditing(null);

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!editing.name.trim()) {
      toast.error('Il nome della variante è obbligatorio'); return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        slug: editing.slug.trim() || editing.name.trim(),
        title: editing.title,
        subtitle: editing.subtitle,
        hero_image: editing.hero_image,
        logo_url: editing.logo_url,
        cta_color: editing.cta_color,
        whatsapp_message: editing.whatsapp_message,
        enabled: editing.enabled,
      };
      if (editing.id) {
        await axios.patch(`${API}/stores/${storeId}/landings/${editing.id}`,
          payload, { withCredentials: true });
        toast.success('Variante aggiornata');
      } else {
        await axios.post(`${API}/stores/${storeId}/landings`,
          payload, { withCredentials: true });
        toast.success('Variante creata');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Eliminare la landing "${v.name}"?`)) return;
    try {
      await axios.delete(`${API}/stores/${storeId}/landings/${v.id}`,
        { withCredentials: true });
      toast.success('Variante eliminata');
      load();
    } catch (e) {
      toast.error('Errore eliminazione');
    }
  };

  const copyLink = async (url, id) => {
    try {
      await navigator.clipboard.writeText(
        url.startsWith('http') ? url : `${window.location.origin}${url}`
      );
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 1200);
    } catch { toast.error('Copy fallito'); }
  };

  return (
    <section
      className="space-y-3 border-t border-gray-200 dark:border-white/10 pt-5 mt-5"
      data-testid="landing-variants-section"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            Landing extra di {storeName}
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-[#6a6a72] mt-0.5">
            Crea pagine separate per campagne diverse (es. &quot;Passa a Fibra&quot;). Ognuna ha il proprio slug e CTA.
          </p>
        </div>
        {!editing && (
          <Button
            type="button"
            size="sm"
            onClick={startAdd}
            className="bg-gray-900 hover:bg-gray-700 text-white"
            data-testid="landing-variant-add-btn"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 py-2">Caricamento…</p>
      ) : (
        <>
          {variants.length === 0 && !editing && (
            <p className="text-xs text-gray-400 dark:text-[#6a6a72] py-3 italic" data-testid="landing-variants-empty">
              Nessuna variante. Crea la prima per affiancare un funnel diverso a questo negozio.
            </p>
          )}
          <div className="space-y-2">
            {variants.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0a0b]"
                data-testid={`landing-variant-row-${v.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[13px] text-gray-900 dark:text-white truncate">
                      {v.name}
                    </span>
                    {!v.enabled && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                        Off
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-[#8a8a92] truncate">
                    /s/{v.slug}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => copyLink(v.landing_url, v.id)}
                    className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                    title="Copia link"
                    data-testid={`landing-variant-copy-${v.id}`}
                  >
                    {copiedId === v.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <a
                    href={v.landing_url.startsWith('http') ? v.landing_url : `${window.location.origin}${v.landing_url}`}
                    target="_blank" rel="noopener noreferrer"
                    className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                    title="Apri"
                    data-testid={`landing-variant-open-${v.id}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => startEdit(v)}
                    className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                    title="Modifica"
                    data-testid={`landing-variant-edit-${v.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(v)}
                    className="p-2 text-gray-500 hover:text-red-600"
                    title="Elimina"
                    data-testid={`landing-variant-delete-${v.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editing && (
        // Inline editor — rendered as a soft-card to avoid stacking another
        // modal on top of the existing Landings dialog (which would trigger
        // Radix focus-trap stacking issues).
        <div
          className="space-y-3 p-4 rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/15 bg-gray-50 dark:bg-[#0a0a0b]"
          data-testid="landing-variant-form"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome (interno)</Label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value,
                  // Auto-populate slug while it tracks the name (only if user hasn't
                  // hand-edited it). Stops as soon as `slug` diverges from a fresh
                  // slugify(name) — preserves the user's manual override.
                  slug: (!editing.id && (editing.slug === '' || editing.slug === slugify(editing.name)))
                    ? slugify(e.target.value) : editing.slug })}
                placeholder="Es. Passa a Fibra"
                maxLength={80}
                data-testid="landing-variant-name"
              />
            </div>
            <div>
              <Label className="text-xs">Slug URL</Label>
              <Input
                value={editing.slug}
                onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })}
                placeholder="passa-a-fibra"
                maxLength={80}
                data-testid="landing-variant-slug"
              />
              <p className="text-[10px] text-gray-500 mt-0.5">
                URL: <code>/s/{editing.slug || 'slug-qui'}</code>
              </p>
            </div>
          </div>

          <div>
            <Label className="text-xs">Titolo Hero (override)</Label>
            <Input
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              placeholder="Es. Passa a Fibra con 50€ di sconto"
              maxLength={120}
              data-testid="landing-variant-title"
            />
          </div>

          <div>
            <Label className="text-xs">Sottotitolo (override)</Label>
            <Input
              value={editing.subtitle}
              onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
              placeholder="Es. Solo questa settimana, attivazione gratis"
              maxLength={200}
              data-testid="landing-variant-subtitle"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Colore CTA</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={editing.cta_color || '#7B1FA2'}
                  onChange={(e) => setEditing({ ...editing, cta_color: e.target.value })}
                  className="w-12 h-10 p-1 cursor-pointer"
                  data-testid="landing-variant-cta-color-picker"
                />
                <Input
                  value={editing.cta_color}
                  onChange={(e) => setEditing({ ...editing, cta_color: e.target.value })}
                  placeholder="#7B1FA2 (vuoto = default)"
                  maxLength={24}
                  data-testid="landing-variant-cta-color"
                />
              </div>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.enabled}
                  onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                  className="h-4 w-4"
                  data-testid="landing-variant-enabled"
                />
                <span className="text-xs text-gray-700 dark:text-gray-200">Variante attiva</span>
              </label>
            </div>
          </div>

          <div>
            <Label className="text-xs">Messaggio WhatsApp (override)</Label>
            <Textarea
              value={editing.whatsapp_message}
              onChange={(e) => setEditing({ ...editing, whatsapp_message: e.target.value })}
              placeholder="Es. Vorrei info su Passa a Fibra"
              maxLength={600}
              rows={2}
              data-testid="landing-variant-wa"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ImagePicker
              label="Hero image (override)"
              value={editing.hero_image}
              onPick={() => setPickerTarget('hero_image')}
              onClear={() => setEditing({ ...editing, hero_image: '' })}
              testId="landing-variant-hero"
            />
            <ImagePicker
              label="Logo dedicato (override)"
              value={editing.logo_url}
              onPick={() => setPickerTarget('logo_url')}
              onClear={() => setEditing({ ...editing, logo_url: '' })}
              testId="landing-variant-logo"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
              Annulla
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
              data-testid="landing-variant-save"
            >
              {saving ? 'Salvataggio…' : (editing.id ? 'Salva modifiche' : 'Crea variante')}
            </Button>
          </div>
        </div>
      )}

      <MediaPicker
        open={!!pickerTarget}
        onClose={() => setPickerTarget(null)}
        onSelect={(it) => {
          setEditing((f) => f ? { ...f, [pickerTarget]: it.url } : f);
          setPickerTarget(null);
        }}
        kind="landings"
        title={pickerTarget === 'logo_url' ? 'Scegli logo' : 'Scegli hero image'}
      />
    </section>
  );
};

const ImagePicker = ({ label, value, onPick, onClear, testId }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    {value ? (
      <div className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#131316]">
        <img src={value} alt="" className="w-10 h-10 rounded object-cover" />
        <span className="text-[10px] text-gray-500 truncate flex-1">{value}</span>
        <button
          type="button"
          onClick={onClear}
          className="p-1 text-gray-400 hover:text-red-600"
          title="Rimuovi"
          data-testid={`${testId}-clear`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={onPick}
        className="w-full p-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-white/15 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 flex items-center justify-center gap-1.5"
        data-testid={`${testId}-pick`}
      >
        <ImageIcon className="h-3.5 w-3.5" /> Scegli immagine
      </button>
    )}
  </div>
);

export default LandingVariants;
