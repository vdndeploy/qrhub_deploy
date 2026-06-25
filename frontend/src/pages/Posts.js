import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, Edit, Upload, X, Image as ImgIcon, Video, Calendar, Clock, FolderOpen,
  Megaphone, Store as StoreIcon, CheckSquare, Square, Search, MoveUp, MoveDown,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import MediaPicker from '@/components/MediaPicker';
import AnnouncementPreview from '@/components/AnnouncementPreview';
import MobileActionBtn from '../components/MobileActionBtn';
import { useDirtyForm, DirtyDot } from '../hooks/useDirtyForm';
import PushBroadcastDialog from '../components/PushBroadcastDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const emptyForm = () => ({
  title: '', text: '', media_url: '', media_public_id: '',
  media_resource_type: '', aspect_ratio: null,
  cta_text: '', cta_whatsapp_message: '',
  start_at: null, end_at: null,
  enabled: true,
  // Default ON: every new announcement notifies subscribers automatically.
  notify_subscribers: true,
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
    disabled: { bg: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300', label: 'Disattivato' },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const filterStoreId = searchParams.get('store') || '';

  const [groups, setGroups] = useState([]);
  const [storePosts, setStorePosts] = useState([]); // posts for filterStoreId, ordered
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [vendors, setVendors] = useState([]);

  // Dirty-state tracking → amber dot on Save when the form has unsaved
  // changes. `editing` is non-null whenever the post editor modal is open.
  const { isDirty } = useDirtyForm(form, !!editing);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const calls = [
        axios.get(`${API}/posts`, { withCredentials: true }),
        axios.get(`${API}/stores`, { withCredentials: true }),
      ];
      if (filterStoreId) {
        calls.push(axios.get(`${API}/stores/${filterStoreId}/posts`, { withCredentials: true }));
      }
      const [g, s, sp] = await Promise.all(calls);
      setGroups(g.data);
      setStores(s.data);
      if (sp) setStorePosts(sp.data); else setStorePosts([]);
    } catch (e) {
      toast.error('Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [filterStoreId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Load vendors once for the "Lancia offerta" broadcast dialog. We don't
  // block the main feed on this — failure just means the picker shows the
  // org-wide option only, which is still useful.
  useEffect(() => {
    let cancelled = false;
    axios.get(`${API}/vendors`, { withCredentials: true })
      .then(({ data }) => { if (!cancelled) setVendors(Array.isArray(data) ? data : []); })
      .catch(() => { /* silent — broadcast still works org-wide */ });
    return () => { cancelled = true; };
  }, []);

  const setStoreFilter = (sid) => {
    if (sid) {
      setSearchParams({ store: sid }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const movePost = async (idx, dir) => {
    const next = [...storePosts];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setStorePosts(next);
    try {
      await axios.post(
        `${API}/stores/${filterStoreId}/posts/reorder`,
        { post_ids: next.map(p => p.id) },
        { withCredentials: true }
      );
    } catch {
      toast.error('Errore riordino');
      fetchAll();
    }
  };

  const openNew = () => {
    const form0 = emptyForm();
    // Pre-fill store_ids if filtering by store
    if (filterStoreId) form0.store_ids = [filterStoreId];
    setForm(form0);
    setEditing('new');
  };
  const openEdit = (g) => {
    setForm({
      title: g.title || '', text: g.text || '',
      media_url: g.media_url || '', media_public_id: g.media_public_id || '',
      media_resource_type: g.media_resource_type || '',
      aspect_ratio: g.aspect_ratio || null,
      cta_text: g.cta_text || '', cta_whatsapp_message: g.cta_whatsapp_message || '',
      start_at: g.start_at || null, end_at: g.end_at || null,
      enabled: g.enabled !== false,
      // In edit-mode default to OFF — the original post has already triggered
      // its notification at first publish. Re-toggle ON only when the admin
      // explicitly wants to re-broadcast (e.g. major edit).
      notify_subscribers: false,
      store_ids: (g.stores || []).map(s => s.store_id),
    });
    setEditing(g);
  };
  // Open the edit dialog from a single per-store post by looking up its group
  const openEditFromStorePost = (post) => {
    const group = groups.find(g => g.group_id === post.group_id || g.stores?.some(s => s.post_id === post.id));
    if (group) openEdit(group);
    else toast.error('Annuncio non trovato');
  };

  // Group-by-store stats for the dropdown badge counts
  const storeFilterName = useMemo(() => {
    if (!filterStoreId) return '';
    return stores.find(s => s.id === filterStoreId)?.name || '';
  }, [stores, filterStoreId]);
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
        toast.success(
          `Annuncio creato su ${data.stores_count} ${data.stores_count === 1 ? 'negozio' : 'negozi'}` +
          (payload.notify_subscribers ? ' • notifiche push in invio 📣' : '')
        );
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

  // Quick enable/disable from list — sends a full update with only the
  // toggle flipped (keeps stores + content intact).
  const handleToggleEnabled = async (g) => {
    try {
      await axios.put(`${API}/posts/group/${g.group_id}`, {
        store_ids: (g.stores || []).map(s => s.store_id),
        title: g.title || '', text: g.text || '',
        media_url: g.media_url || '', media_public_id: g.media_public_id || '',
        media_resource_type: g.media_resource_type || '',
        aspect_ratio: g.aspect_ratio || null,
        cta_text: g.cta_text || '', cta_whatsapp_message: g.cta_whatsapp_message || '',
        start_at: g.start_at || null, end_at: g.end_at || null,
        enabled: g.enabled === false,
      }, { withCredentials: true });
      toast.success(g.enabled === false ? 'Annuncio riattivato' : 'Annuncio messo in pausa');
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore salvataggio');
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
        <div className="flex gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={() => setBroadcastOpen(true)}
            className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/10"
            data-testid="posts-broadcast-button"
          >
            <Megaphone className="h-4 w-4 mr-2" />Lancia offerta
          </Button>
          <Button
            onClick={openNew}
            className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
            data-testid="posts-new-button"
          >
            <Plus className="h-4 w-4 mr-2" />Nuovo Annuncio
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap text-sm">
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-[#1a1a1c] rounded-full p-0.5">
          <button
            type="button"
            onClick={() => setStoreFilter('')}
            data-testid="posts-filter-all"
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              !filterStoreId
                ? 'bg-white dark:bg-[#0a0a0b] text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-[#8a8a92] hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Tutti i negozi
          </button>
          <button
            type="button"
            onClick={() => {
              if (!filterStoreId && stores.length > 0) setStoreFilter(stores[0].id);
            }}
            data-testid="posts-filter-bystore-toggle"
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filterStoreId
                ? 'bg-white dark:bg-[#0a0a0b] text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-[#8a8a92] hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Ordina per negozio
          </button>
        </div>
        {filterStoreId && (
          <div className="relative">
            <StoreIcon className="h-4 w-4 text-gray-500 dark:text-[#8a8a92] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={filterStoreId}
              onChange={(e) => setStoreFilter(e.target.value)}
              data-testid="posts-filter-store-select"
              className="pl-8 pr-3 py-1.5 text-sm rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1a1a1c] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D2FA46]/40"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        {filterStoreId && (
          <span className="text-xs text-gray-500 dark:text-[#8a8a92]">
            Usa le frecce ↑↓ per riordinare il carosello di <strong>{storeFilterName}</strong>
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-[#6a6a72]">Caricamento…</div>
      ) : filterStoreId ? (
        // ─── PER-STORE MODE: linear ordered list with up/down arrows ───
        storePosts.length === 0 ? (
          <div className="border border-dashed rounded-3xl py-16 text-center bg-white dark:bg-[#131316]">
            <Megaphone className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-[#6a6a72]">
              Nessun annuncio per questo negozio.
            </p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="posts-list-bystore">
            {storePosts.map((p, i) => (
              <div
                key={p.id}
                className="bg-white dark:bg-[#131316] border border-gray-200 dark:border-white/10 rounded-2xl p-3 flex items-center gap-3"
                data-testid={`post-bystore-row-${i}`}
              >
                <div className="flex flex-col items-center justify-center text-[10px] font-bold text-gray-400 dark:text-[#6a6a72] w-7 flex-shrink-0">
                  #{i + 1}
                </div>
                <div className="w-14 h-14 flex-shrink-0 bg-gray-100 dark:bg-[#0a0a0b] rounded-lg overflow-hidden">
                  {p.media_url ? (
                    p.media_resource_type === 'video'
                      ? <div className="w-full h-full flex items-center justify-center bg-black"><Video className="h-5 w-5 text-white" /></div>
                      : <img src={p.media_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400"><ImgIcon className="h-5 w-5" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-medium text-sm truncate text-gray-900 dark:text-white">
                      {p.title || '(senza titolo)'}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-[#8a8a92] line-clamp-1">{p.text || '—'}</p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => movePost(i, -1)} disabled={i === 0} title="Sposta su" data-testid={`post-bystore-up-${i}`}>
                    <MoveUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => movePost(i, 1)} disabled={i === storePosts.length - 1} title="Sposta giù" data-testid={`post-bystore-down-${i}`}>
                    <MoveDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEditFromStorePost(p)} title="Modifica" data-testid={`post-bystore-edit-${i}`}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
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
              className={`bg-white dark:bg-[#131316] border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 sm:items-center transition-opacity ${g.enabled === false ? 'opacity-60' : ''}`}
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

              <div className="hidden">{/* desktop-only small icon row removed: actions are now visible on every viewport via the grid below */}</div>

              {/* Tap-friendly action row visible on every viewport. */}
              <div className="grid grid-cols-3 gap-2 mt-2 sm:mt-0 sm:w-72 sm:ml-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-white/5" role="group" aria-label={`Azioni per ${g.title || 'annuncio'}`}>
                <button
                  type="button"
                  onClick={() => handleToggleEnabled(g)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border min-h-[60px] py-2 active:scale-95 transition-transform touch-manipulation ${g.enabled !== false ? 'border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/[0.06]' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f0f12]'}`}
                  data-testid={`post-m-toggle-${i}`}
                >
                  <div className={`w-9 h-5 rounded-full p-0.5 flex items-center ${g.enabled !== false ? 'bg-emerald-500 justify-end' : 'bg-gray-300 dark:bg-white/20 justify-start'}`}>
                    <div className="w-4 h-4 rounded-full bg-white" />
                  </div>
                  <span className="text-[10px] font-medium text-gray-700 dark:text-[#a8a8b0]">
                    {g.enabled !== false ? 'Attivo' : 'In pausa'}
                  </span>
                </button>
                <MobileActionBtn
                  icon={Edit}
                  label="Modifica"
                  onClick={() => openEdit(g)}
                  data-testid={`post-m-edit-${i}`}
                />
                <MobileActionBtn
                  icon={Trash2}
                  label="Elimina"
                  tint="#ef4444"
                  onClick={() => handleDelete(g)}
                  data-testid={`post-m-delete-${i}`}
                />
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
            {/* Active toggle — always visible at the top so the admin can
                pause an announcement without deleting it. When disabled the
                post is hidden from the visitor's vendor landing carousel. */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-[#0a0a0b]/50">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {form.enabled ? 'Annuncio attivo' : 'Annuncio in pausa'}
                </div>
                <div className="text-xs text-gray-500 dark:text-[#8a8a92]">
                  {form.enabled
                    ? 'Visibile sulla landing dei venditori dei negozi selezionati'
                    : 'Nascosto dalla landing (nessun cliente lo vedrà)'}
                </div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
                data-testid="post-enabled-toggle"
              />
            </div>

            {/* Push notify toggle — when ON, the create endpoint fires an
                automatic web-push to every subscriber of the selected
                vendors. Hidden when editing an already-published group
                (default OFF in edit) to avoid double-broadcasts. */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                  📣 Notifica push subscriber
                </div>
                <div className="text-xs text-gray-500 dark:text-[#8a8a92]">
                  {form.notify_subscribers
                    ? 'Invierà una notifica push a tutti gli iscritti dei venditori dei negozi selezionati.'
                    : 'Nessuna notifica push verrà inviata al salvataggio.'}
                </div>
              </div>
              <Switch
                checked={!!form.notify_subscribers}
                onCheckedChange={(v) => setForm({ ...form, notify_subscribers: v })}
                data-testid="post-notify-subscribers-toggle"
              />
            </div>

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

            <div className="border rounded-lg p-3 bg-gray-50 dark:bg-[#0a0a0b]/50 overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-[#D2FA46]" />
                <span className="text-sm font-medium">Programmazione (opzionale)</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-[#6a6a72] mb-3">
                L'annuncio sarà visibile solo nell'intervallo. Lascia vuoto per "sempre attivo".
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <div className="min-w-0 w-full">
                  <Label className="text-xs">Inizio</Label>
                  <Input type="datetime-local"
                          value={toLocalInput(form.start_at)}
                          onChange={(e) => setForm({ ...form, start_at: fromLocalInput(e.target.value) })}
                          className="w-full max-w-full text-sm" />
                </div>
                <div className="min-w-0 w-full">
                  <Label className="text-xs">Fine</Label>
                  <Input type="datetime-local"
                          value={toLocalInput(form.end_at)}
                          onChange={(e) => setForm({ ...form, end_at: fromLocalInput(e.target.value) })}
                          className="w-full max-w-full text-sm" />
                </div>
              </div>
            </div>

            {/* Live preview — updates as the admin types */}
            <AnnouncementPreview form={form} />
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
              {isDirty && !saving && <DirtyDot />}
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

      <PushBroadcastDialog
        open={broadcastOpen}
        onOpenChange={setBroadcastOpen}
        vendors={vendors}
      />
    </div>
  );
};

export default Posts;
