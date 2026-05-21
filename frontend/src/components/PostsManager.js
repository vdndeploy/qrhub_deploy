import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Upload, MoveUp, MoveDown, X, Image as ImgIcon, Video, Calendar, Clock, FolderOpen } from 'lucide-react';
import MediaPicker from '@/components/MediaPicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * PostsManager — admin dialog to manage carousel announcements for a single store.
 * Props: open, onClose, storeId, storeName
 */
const PostsManager = ({ open, onClose, storeId, storeName }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // null = list view, otherwise post obj or 'new'
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const fetchPosts = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/stores/${storeId}/posts`, { withCredentials: true });
      setPosts(data);
    } catch (e) {
      toast.error('Errore caricamento annunci');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { if (open && storeId) fetchPosts(); }, [open, storeId, fetchPosts]);

  const openNew = () => { setForm(emptyForm()); setEditing('new'); };
  const openEdit = (p) => { setForm({ ...p }); setEditing(p); };
  const cancelEdit = () => { setEditing(null); setForm(emptyForm()); };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'posts');
    try {
      const { data } = await axios.post(`${API}/upload`, fd, { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } });
      const ar = data.width && data.height ? data.width / data.height : null;
      setForm(f => ({ ...f, media_url: data.url, media_public_id: data.public_id, media_resource_type: data.resource_type || 'image', aspect_ratio: ar }));
      toast.success('Media caricato');
    } catch (err) {
      toast.error('Errore upload');
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = () => setForm(f => ({ ...f, media_url: '', media_public_id: '', media_resource_type: '', aspect_ratio: null }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing === 'new') {
        await axios.post(`${API}/stores/${storeId}/posts`, form, { withCredentials: true });
        toast.success('Annuncio creato');
      } else {
        await axios.put(`${API}/posts/${editing.id}`, form, { withCredentials: true });
        toast.success('Annuncio aggiornato');
      }
      cancelEdit();
      fetchPosts();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminare questo annuncio?')) return;
    try {
      await axios.delete(`${API}/posts/${id}`, { withCredentials: true });
      toast.success('Annuncio eliminato');
      fetchPosts();
    } catch (e) {
      toast.error('Errore eliminazione');
    }
  };

  const move = async (idx, dir) => {
    const next = [...posts];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setPosts(next);
    try {
      await axios.post(`${API}/stores/${storeId}/posts/reorder`,
        { post_ids: next.map(p => p.id) }, { withCredentials: true });
    } catch (e) {
      toast.error('Errore riordino');
      fetchPosts();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] sm:w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6" data-testid="posts-manager-dialog">
        <DialogHeader>
          <DialogTitle>Gestione Annunci — {storeName}</DialogTitle>
          <DialogDescription>Crea un carosello di annunci per questo negozio. I clienti li vedranno sulla landing page del venditore.</DialogDescription>
        </DialogHeader>

        {editing === null ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">{posts.length} {posts.length === 1 ? 'annuncio' : 'annunci'} configurati</p>
              <Button onClick={openNew} className="bg-[#F96815] hover:bg-[#e05a0f]" data-testid="post-new-button">
                <Plus className="h-4 w-4 mr-2" />Nuovo Annuncio
              </Button>
            </div>
            {loading ? (
              <div className="text-center py-6 text-sm text-gray-500">Caricamento...</div>
            ) : posts.length === 0 ? (
              <div className="border border-dashed rounded-lg py-12 text-center text-sm text-gray-500">
                Nessun annuncio. Clicca "Nuovo Annuncio" per crearne uno.
              </div>
            ) : (
              <div className="space-y-2">
                {posts.map((p, i) => (
                  <div key={p.id} className="border rounded-lg p-3 flex flex-col sm:flex-row gap-3 sm:items-center" data-testid={`post-row-${i}`}>
                    <div className="flex gap-3 items-start min-w-0 flex-1">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                        {p.media_url ? (
                          p.media_resource_type === 'video' ? (
                            <div className="w-full h-full flex items-center justify-center bg-black text-white"><Video className="h-6 w-6" /></div>
                          ) : (
                            <img src={p.media_url} alt="" className="w-full h-full object-cover" />
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400"><ImgIcon className="h-6 w-6" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <div className="font-medium text-sm truncate max-w-full">{p.title || '(senza titolo)'}</div>
                          <StatusBadge status={p.status} />
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-2 break-words">{p.text || '—'}</div>
                        {(p.start_at || p.end_at) && (
                          <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                            <Calendar className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{formatScheduleSummary(p.start_at, p.end_at)}</span>
                          </div>
                        )}
                        {p.cta_text && <div className="text-[10px] text-[#F96815] uppercase mt-0.5 truncate">CTA: {p.cta_text}</div>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 justify-end sm:justify-start border-t sm:border-0 pt-2 sm:pt-0">
                      <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} title="Sposta su"><MoveUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === posts.length - 1} title="Sposta giù"><MoveDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Modifica"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} title="Elimina"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{editing === 'new' ? 'Nuovo Annuncio' : 'Modifica Annuncio'}</h3>
              <Button variant="ghost" size="sm" onClick={cancelEdit}><X className="h-4 w-4 mr-1" />Annulla</Button>
            </div>
            <div>
              <Label>Titolo</Label>
              <Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="Es. Promo Estate" data-testid="post-title-input" />
            </div>
            <div>
              <Label>Testo</Label>
              <Textarea rows={3} value={form.text} onChange={(e) => setForm({...form, text: e.target.value})} placeholder="Descrizione dell'annuncio..." data-testid="post-text-input" />
            </div>
            <div>
              <Label>Media (immagine o video)</Label>
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" onClick={() => document.getElementById('post-media-upload').click()} disabled={uploading}>
                  <Upload className="h-4 w-4 mr-2" />{uploading ? 'Caricamento...' : 'Carica File'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setPickerOpen(true)} disabled={uploading} data-testid="post-media-from-library">
                  <FolderOpen className="h-4 w-4 mr-2" />Scegli dalla libreria
                </Button>
                {form.media_url && <Button type="button" variant="ghost" onClick={removeMedia}><X className="h-4 w-4 mr-1" />Rimuovi</Button>}
              </div>
              <input id="post-media-upload" type="file" accept="image/*,video/*" onChange={handleUpload} className="hidden" />
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
              <div>
                <Label>Testo Bottone CTA (opzionale)</Label>
                <Input value={form.cta_text} onChange={(e) => setForm({...form, cta_text: e.target.value})} placeholder="Es. Scopri di più" />
              </div>
              <div>
                <Label>Messaggio WhatsApp CTA</Label>
                <Input value={form.cta_whatsapp_message} onChange={(e) => setForm({...form, cta_whatsapp_message: e.target.value})} placeholder="Ciao, info su..." />
              </div>
            </div>
            <div className="border rounded-lg p-3 bg-gray-50/50">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-[#F96815]" />
                <span className="text-sm font-medium">Programmazione (opzionale)</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">L'annuncio sarà visibile solo nell'intervallo. Lascia vuoto per "sempre attivo".</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Inizio</Label>
                  <Input type="datetime-local" value={toLocalInput(form.start_at)}
                          onChange={(e) => setForm({...form, start_at: fromLocalInput(e.target.value)})}
                          data-testid="post-start-input" />
                </div>
                <div>
                  <Label className="text-xs">Fine (scadenza)</Label>
                  <Input type="datetime-local" value={toLocalInput(form.end_at)}
                          onChange={(e) => setForm({...form, end_at: fromLocalInput(e.target.value)})}
                          data-testid="post-end-input" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={cancelEdit}>Annulla</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-[#F96815] hover:bg-[#e05a0f]" data-testid="post-save-button">
                {saving ? 'Salvataggio...' : (editing === 'new' ? 'Crea' : 'Salva')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => {
          setForm((f) => ({
            ...f,
            media_url: item.url,
            media_public_id: item.public_id,
            media_resource_type: item.resource_type || 'image',
            aspect_ratio: item.width && item.height ? item.width / item.height : null,
          }));
          toast.success('Immagine selezionata');
        }}
        kind="posts"
        title="Immagini per i post"
      />
    </Dialog>
  );
};

const emptyForm = () => ({
  title: '', text: '', media_url: '', media_public_id: '', media_resource_type: '', aspect_ratio: null,
  cta_text: '', cta_whatsapp_message: '', start_at: null, end_at: null
});

const StatusBadge = ({ status }) => {
  const cfg = {
    active: { bg: 'bg-green-100 text-green-700', label: 'Attivo' },
    scheduled: { bg: 'bg-blue-100 text-blue-700', label: 'Programmato' },
    expired: { bg: 'bg-gray-200 text-gray-600', label: 'Scaduto' }
  }[status || 'active'] || { bg: 'bg-green-100 text-green-700', label: 'Attivo' };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.bg}`}>{cfg.label}</span>;
};

const formatScheduleSummary = (s, e) => {
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const a = fmt(s), b = fmt(e);
  if (a && b) return `Dal ${a} al ${b}`;
  if (a) return `Dal ${a}`;
  if (b) return `Fino al ${b}`;
  return '';
};

// Convert ISO UTC <-> input[type=datetime-local] format
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};
const fromLocalInput = (val) => {
  if (!val) return null;
  return new Date(val).toISOString();
};

export default PostsManager;
