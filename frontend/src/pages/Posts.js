import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, Edit, Upload, X, Image as ImgIcon, Video, Calendar, Clock, FolderOpen,
  Megaphone, Store as StoreIcon, CheckSquare, Square, Search,
} from 'lucide-react';
import MediaPicker from '@/components/MediaPicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emptyForm = () => ({
  title: '', text: '', media_url: '', media_public_id: '',
  media_resource_type: '', aspect_ratio: null,
  cta_text: '', cta_whatsapp_message: '',
  start_at: null, end_at: null,
  store_ids: [],
});

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};
const fromLocalInput = (val) => val ? new Date(val).toISOString() : null;

const formatScheduleSummary = (s, e) => {
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const a = fmt(s), b = fmt(e);
  if (a && b) return `Dal ${a} al ${b}`;
  if (a) return `Dal ${a}`;
  if (b) return `Fino al ${b}`;
  return '';
};

const StatusBadge = ({ status }) => {
  const cfg = {
    active: { bg: 'bg-green-100 text-green-700', label: 'Attivo' },
    scheduled: { bg: 'bg-blue-100 text-blue-700', label: 'Programmato' },
    expired: { bg: 'bg-gray-200 text-gray-600 dark:text-[#8a8a92]', label: 'Scaduto' },
  }[status || 'active'] || { bg: 'bg-green-100 text-green-700', label: 'Attivo' };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.bg}`}>{cfg.label}</span>;
};

const StoreMultiSelect = ({ stores, value, onChange }) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? stores.filter(s => (s.name || '').toLowerCase().includes(needle)) : stores;
  }, [stores, q]);
  const allSelected = filtered.length > 0 && filtered.every(s => value.includes(s.id));
  const someSelected = filtered.some(s => value.includes(s.id)) && !allSelected;

  const toggle = (id) => {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  };
  const toggleAllFiltered = () => {
    if (allSelected) {
      onChange(value.filter(x => !filtered.some(s => s.id === x)));
    } else {
      const merged = Array.from(new Set([...value, ...filtered.map(s => s.id)]));
      onChange(merged);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-[#0a0a0b]">
      <div className="flex items-center gap-2 p-2 border-b border-gray-100 dark:border-white/5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca negozio…"
            className="h-8 pl-8 text-sm"
            data-testid="store-multi-search"
          />
        </div>
        <button
          type="button"
          onClick={toggleAllFiltered}
          className="text-xs font-medium text-[#D2FA46] hover:underline px-2"
          data-testid="store-multi-toggle-all"
        >
          {allSelected ? 'Deseleziona' : 'Seleziona tutti'}
        </button>
      </div>
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-6">Nessun negozio</div>
        ) : (
          filtered.map(s => {
            const checked = value.includes(s.id);
            return (
              <label
                key={s.id}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 ${checked ? 'bg-[#D2FA46]/5' : ''}`}
                data-testid={`store-multi-row-${s.id}`}
              >
                {checked
                  ? <CheckSquare className="h-4 w-4 text-[#D2FA46] flex-shrink-0" />
                  : <Square className="h-4 w-4 text-gray-400 flex-shrink-0" />}
                <input type="checkbox" className="hidden" checked={checked}
                       onChange={() => toggle(s.id)} />
                <span className="text-gray-900 dark:text-white">{s.name || s.id}</span>
              </label>
            );
          })
        )}
      </div>
      <div className="px-3 py-2 border-t border-gray-100 dark:border-white/5 text-[11px] text-gray-500 dark:text-[#8a8a92]">
        {value.length === 0
          ? <>Seleziona almeno un negozio <span className="text-amber-600 ml-1">·</span></>
          : <>Pubblica su <strong className="text-gray-900 dark:text-white">{value.length}</strong> {value.length === 1 ? 'negozio' : 'negozi'} {someSelected ? '(filtrato)' : ''}</>}
      </div>
    </div>
  );
};

const Posts = () => {
  const [groups, setGroups] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | groupObj
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [g, s] = await Promise.all([
        axios.get(`${API}/posts`, { withCredentials: true }),
        axios.get(`${API}/stores`, { withCredentials: true }),
      ]);
      setGroups(g.data);
      setStores(s.data);
    } catch (e) {
      toast.error('Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openNew = () => { setForm(emptyForm()); setEditing('new'); };
  const openEdit = (g) => {
    setForm({
      title: g.title || '', text: g.text || '',
      media_url: g.media_url || '', media_public_id: g.media_public_id || '',
      media_resource_type: g.media_resource_type || '',
      aspect_ratio: g.aspect_ratio || null,
      cta_text: g.cta_text || '', cta_whatsapp_message: g.cta_whatsapp_message || '',
      start_at: g.start_at || null, end_at: g.end_at || null,
      store_ids: (g.stores || []).map(s => s.store_id),
    });
    setEditing(g);
  };
  const cancelEdit = () => { setEditing(null); setForm(emptyForm()); };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'posts');
    try {
      const { data } = await axios.post(`${API}/upload`, fd, { withCredentials: true });
      const ar = data.width && data.height ? data.width / data.height : null;
      setForm(f => ({
        ...f,
        media_url: data.url, media_public_id: data.public_id,
        media_resource_type: data.resource_type || 'image', aspect_ratio: ar,
      }));
      toast.success('Media caricato');
    } catch {
      toast.error('Errore upload');
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = () => setForm(f => ({
    ...f, media_url: '', media_public_id: '', media_resource_type: '', aspect_ratio: null,
  }));

  const handleSave = async () => {
    if (!form.store_ids || form.store_ids.length === 0) {
      toast.error('Seleziona almeno un negozio');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing === 'new') {
        const { data } = await axios.post(`${API}/posts`, payload, { withCredentials: true });
        toast.success(`Annuncio creato su ${data.stores_count} ${data.stores_count === 1 ? 'negozio' : 'negozi'}`);
      } else {
        const { data } = await axios.put(`${API}/posts/group/${editing.group_id}`, payload, { withCredentials: true });
        const parts = [];
        if (data.updated) parts.push(`${data.updated} aggiornato`);
        if (data.added) parts.push(`${data.added} aggiunto`);
        if (data.removed) parts.push(`${data.removed} rimosso`);
        toast.success(`Annuncio salvato: ${parts.join(', ') || 'nessuna modifica'}`);
      }
      cancelEdit();
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g) => {
    if (!window.confirm(`Eliminare l'annuncio "${g.title || '(senza titolo)'}" da ${g.stores.length} ${g.stores.length === 1 ? 'negozio' : 'negozi'}?`)) return;
    try {
      await axios.delete(`${API}/posts/group/${g.group_id}`, { withCredentials: true });
      toast.success('Annuncio eliminato');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore eliminazione');
    }
  };

  return (
    <div className="space-y-6" data-testid="posts-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Annunci
          </h2>
          <p className="text-sm text-gray-600 dark:text-[#8a8a92] mt-1">
            Crea un annuncio unico e pubblicalo su più negozi contemporaneamente.
          </p>
        </div>
        <Button
          onClick={openNew}
          className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
          data-testid="posts-new-button"
        >
          <Plus className="h-4 w-4 mr-2" />Nuovo Annuncio
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-[#6a6a72]">Caricamento…</div>
      ) : groups.length === 0 ? (
        <div className="border border-dashed rounded-3xl py-16 text-center bg-white dark:bg-[#131316]">
          <Megaphone className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-[#6a6a72]">
            Nessun annuncio. Crea il primo con il pulsante in alto a destra.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g, i) => (
            <div
              key={g.group_id}
              className="bg-white dark:bg-[#131316] border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 sm:items-center"
              data-testid={`post-group-row-${i}`}
            >
              <div className="w-full sm:w-20 h-32 sm:h-20 flex-shrink-0 bg-gray-100 dark:bg-[#0a0a0b] rounded-xl overflow-hidden">
                {g.media_url ? (
                  g.media_resource_type === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center bg-black"><Video className="h-7 w-7 text-white" /></div>
                  ) : (
                    <img src={g.media_url} alt="" className="w-full h-full object-cover" />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400"><ImgIcon className="h-7 w-7" /></div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-gray-900 dark:text-white truncate">
                    {g.title || '(senza titolo)'}
                  </span>
                  <StatusBadge status={g.status} />
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#D2FA46]/15 text-[#0a0a0b] dark:text-[#D2FA46] border border-[#D2FA46]/30">
                    <StoreIcon className="h-3 w-3" />
                    {g.stores.length} {g.stores.length === 1 ? 'negozio' : 'negozi'}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-[#8a8a92] line-clamp-2">
                  {g.text || '—'}
                </p>
                {(g.start_at || g.end_at) && (
                  <div className="text-[10px] text-gray-500 dark:text-[#6a6a72] mt-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {formatScheduleSummary(g.start_at, g.end_at)}
                  </div>
                )}
                {g.stores.length > 0 && (
                  <div className="text-[10px] text-gray-400 dark:text-[#5a5a62] mt-1 truncate">
                    {g.stores.map(s => s.store_name).filter(Boolean).slice(0, 4).join(' · ')}
                    {g.stores.length > 4 && ` +${g.stores.length - 4}`}
                  </div>
                )}
              </div>

              <div className="flex gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon" onClick={() => openEdit(g)} title="Modifica" data-testid={`post-group-edit-${i}`}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(g)} title="Elimina" data-testid={`post-group-delete-${i}`}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(v) => !v && cancelEdit()}>
        <DialogContent
          className="max-w-3xl w-[95vw] p-0 gap-0 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden"
          data-testid="post-edit-dialog"
        >
          <DialogHeader className="px-4 sm:px-6 pt-5 pb-4 pr-12 border-b border-gray-100 dark:border-white/10 flex-shrink-0">
            <DialogTitle>
              {editing === 'new' ? 'Nuovo Annuncio' : 'Modifica Annuncio'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              L'annuncio sarà mostrato nel carosello della landing di ogni venditore dei negozi selezionati.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
            <div>
              <Label>Pubblica sui negozi</Label>
              <div className="mt-1.5">
                <StoreMultiSelect
                  stores={stores}
                  value={form.store_ids}
                  onChange={(ids) => setForm({ ...form, store_ids: ids })}
                />
              </div>
            </div>

            <div>
              <Label>Titolo</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Es. Promo Estate"
                data-testid="post-title-input"
              />
            </div>
            <div>
              <Label>Testo</Label>
              <Textarea
                rows={3}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder="Descrizione dell'annuncio…"
                data-testid="post-text-input"
              />
            </div>

            <div>
              <Label>Media (immagine o video)</Label>
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm"
                        onClick={() => document.getElementById('multi-post-media-upload').click()}
                        disabled={uploading}>
                  <Upload className="h-4 w-4 mr-2" />{uploading ? 'Caricamento…' : 'Carica File'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)} disabled={uploading}>
                  <FolderOpen className="h-4 w-4 mr-2" />Libreria
                </Button>
                {form.media_url && (
                  <Button type="button" variant="ghost" size="sm" onClick={removeMedia}>
                    <X className="h-4 w-4 mr-1" />Rimuovi
                  </Button>
                )}
              </div>
              <input id="multi-post-media-upload" type="file" accept="image/*,video/*"
                      onChange={handleUpload} className="hidden" />
              {form.media_url && (
                <div className="mt-2 border rounded-lg overflow-hidden bg-black/5" style={{ maxHeight: 240 }}>
                  {form.media_resource_type === 'video' ? (
                    <video src={form.media_url} controls className="w-full max-h-60" />
                  ) : (
                    <img src={form.media_url} alt="" className="w-full max-h-60 object-contain" />
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <Label>Testo Bottone CTA</Label>
                <Input
                  value={form.cta_text}
                  onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
                  placeholder="Es. Scopri di più"
                  className="w-full"
                />
              </div>
              <div className="min-w-0">
                <Label>Messaggio WhatsApp CTA</Label>
                <Input
                  value={form.cta_whatsapp_message}
                  onChange={(e) => setForm({ ...form, cta_whatsapp_message: e.target.value })}
                  placeholder="Ciao, info su…"
                  className="w-full"
                />
              </div>
            </div>

            <div className="border rounded-lg p-3 bg-gray-50 dark:bg-[#0a0a0b]/50">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-[#D2FA46]" />
                <span className="text-sm font-medium">Programmazione (opzionale)</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-[#6a6a72] mb-3">
                L'annuncio sarà visibile solo nell'intervallo. Lascia vuoto per "sempre attivo".
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <Label className="text-xs">Inizio</Label>
                  <Input type="datetime-local"
                          value={toLocalInput(form.start_at)}
                          onChange={(e) => setForm({ ...form, start_at: fromLocalInput(e.target.value) })}
                          className="w-full" />
                </div>
                <div className="min-w-0">
                  <Label className="text-xs">Fine</Label>
                  <Input type="datetime-local"
                          value={toLocalInput(form.end_at)}
                          onChange={(e) => setForm({ ...form, end_at: fromLocalInput(e.target.value) })}
                          className="w-full" />
                </div>
              </div>
            </div>
          </div>

          {/* Sticky footer — keeps Save/Cancel always reachable on small
              screens. pb-[env(safe-area-inset-bottom)] avoids overlap with
              the iPhone home indicator. */}
          <div
            className="flex-shrink-0 flex flex-col-reverse sm:flex-row justify-end gap-2 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-white/10 bg-white dark:bg-[#131316]"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            <Button variant="outline" onClick={cancelEdit} className="h-11 sm:h-10" data-testid="post-cancel-button">
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || form.store_ids.length === 0}
              className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b] h-11 sm:h-10 font-semibold"
              data-testid="post-save-button"
            >
              {saving
                ? 'Salvataggio…'
                : (editing === 'new'
                    ? `Pubblica su ${form.store_ids.length || 0} ${form.store_ids.length === 1 ? 'negozio' : 'negozi'}`
                    : 'Salva')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => {
          setForm(f => ({
            ...f,
            media_url: item.url, media_public_id: item.public_id,
            media_resource_type: item.resource_type || 'image',
            aspect_ratio: item.width && item.height ? item.width / item.height : null,
          }));
          toast.success('Immagine selezionata');
        }}
        kind="posts"
        title="Immagini per gli annunci"
      />
    </div>
  );
};

export default Posts;
