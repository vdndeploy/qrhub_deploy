import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Search, Trash2, Check, ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * MediaPicker — modal gallery for browsing & re-using org-scoped Cloudinary assets.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () -> void
 *  - onSelect: (item) -> void   // called when user picks an asset; receives {url, public_id, resource_type, ...}
 *  - kind: 'uploads' | 'posts' | undefined    // optional filter (admins). Vendors are always pinned to 'uploads'.
 *  - title?: string
 *  - hidePostsTab?: boolean      // useful from the vendor-photo context to declutter
 *  - allowDelete?: boolean       // default true; backend still enforces ACL
 */
const PAGE_SIZE = 60;

const formatBytes = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};

const MediaPicker = ({
  open,
  onClose,
  onSelect,
  kind: kindProp,
  title = 'Libreria media',
  hidePostsTab = false,
  allowDelete = true,
  mineOnly = false,
  manageMode = false,
  /**
   * `modal` defaults to true (Radix backdrop + focus trap). Set to false when
   * the picker is opened from inside another Radix `<Dialog>` (e.g. the
   * Landings editor), otherwise the outer dialog reacts to the picker's
   * focus capture by firing its own `onOpenChange(false)` and the editor
   * unmounts, losing all unsaved form state.
   */
  modal = true,
}) => {
  const [kind, setKind] = useState(kindProp || 'uploads');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const fetchPage = useCallback(async (nextSkip = 0, nextKind = kind, q = search) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/media`, {
        params: { kind: nextKind, skip: nextSkip, limit: PAGE_SIZE, search: q, mine_only: mineOnly },
        withCredentials: true,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSkip(nextSkip);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore caricamento libreria');
    } finally {
      setLoading(false);
    }
  }, [kind, search, mineOnly]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/media/stats`, { withCredentials: true });
      setStats(data);
    } catch {/* non-blocking */}
  }, []);

  useEffect(() => {
    if (open) {
      setKind(kindProp || 'uploads');
      setSearch('');
      fetchPage(0, kindProp || 'uploads', '');
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kindProp]);

  const handleKindChange = (k) => {
    setKind(k);
    fetchPage(0, k, search);
  };

  const handleSearch = (e) => {
    e?.preventDefault?.();
    fetchPage(0, kind, search);
  };

  const handleDelete = async (item) => {
    if (!item.can_delete) return;
    if (item.in_use) {
      toast.error('Questa immagine è usata in un post o foto profilo. Rimuovi prima il riferimento.');
      return;
    }
    if (!window.confirm(`Eliminare definitivamente "${item.original_filename || item.public_id}"?\nQuesta azione libera spazio Cloudinary ma non è reversibile.`)) return;
    setDeletingId(item.public_id);
    try {
      await axios.delete(`${API}/media/${encodeURIComponent(item.public_id)}`, { withCredentials: true });
      toast.success('Immagine eliminata');
      // Refresh current page (and stats)
      fetchPage(skip, kind, search);
      fetchStats();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore eliminazione');
    } finally {
      setDeletingId('');
    }
  };

  const handlePick = (item) => {
    onSelect?.({
      url: item.url,
      public_id: item.public_id,
      resource_type: item.resource_type || 'image',
      width: item.width,
      height: item.height,
      original_filename: item.original_filename || '',
    });
    onClose?.();
  };

  const canPrev = skip > 0;
  const canNext = skip + items.length < total;

  return (
    <Dialog open={open} modal={modal} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col" data-testid="media-picker-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-[#D2FA46]" />
            {title}
          </DialogTitle>
          <DialogDescription className="flex items-center justify-between gap-3 flex-wrap">
            <span>{manageMode
              ? 'Visualizzi solo le foto che hai caricato tu. Passa il cursore su una foto per eliminarla.'
              : 'Riutilizza foto già caricate per i tuoi venditori e annunci — risparmia spazio Cloudinary.'}</span>
            {stats && (
              <span className="text-xs font-mono text-gray-600 dark:text-[#8a8a92]">
                {stats.count} file · {formatBytes(stats.bytes)}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Tab + search */}
        <div className="flex items-center gap-2 flex-wrap pb-2 border-b">
          {!hidePostsTab && !kindProp && (
            <div className="inline-flex rounded-md border bg-gray-50 dark:bg-[#0a0a0b] p-0.5">
              <button
                type="button"
                onClick={() => handleKindChange('uploads')}
                className={`px-3 py-1 text-xs rounded-sm transition ${kind === 'uploads' ? 'bg-white shadow-sm font-semibold' : 'text-gray-600 dark:text-[#8a8a92]'}`}
                data-testid="media-tab-uploads"
              >Foto profilo</button>
              <button
                type="button"
                onClick={() => handleKindChange('posts')}
                className={`px-3 py-1 text-xs rounded-sm transition ${kind === 'posts' ? 'bg-white shadow-sm font-semibold' : 'text-gray-600 dark:text-[#8a8a92]'}`}
                data-testid="media-tab-posts"
              >Immagini post</button>
            </div>
          )}
          <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400 dark:text-[#5a5a62]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per nome file..."
                className="pl-8 h-8 text-sm"
                data-testid="media-search-input"
              />
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">Cerca</Button>
          </form>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto py-3">
          {loading ? (
            <div className="text-center text-sm text-gray-500 dark:text-[#6a6a72] py-12">Caricamento...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-sm text-gray-500 dark:text-[#6a6a72] py-12">
              {search ? 'Nessun risultato.' : 'Nessuna immagine caricata. Caricane una per iniziare.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {items.map((item) => (
                <div
                  key={item.public_id}
                  className="group relative aspect-square rounded-md overflow-hidden border bg-gray-50 dark:bg-[#0a0a0b]"
                  data-testid={`media-item-${item.public_id}`}
                >
                  {item.resource_type === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center bg-black/90 text-gray-900 dark:text-white text-[10px]">
                      VIDEO
                    </div>
                  ) : (
                    <img
                      src={item.url}
                      alt={item.original_filename || ''}
                      className="w-full h-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                  )}

                  {/* Badges */}
                  <div className="absolute top-1 left-1 flex flex-col gap-0.5">
                    {item.in_use && (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[9px] px-1.5 py-0">
                        in uso
                      </Badge>
                    )}
                    {!item.in_use && (
                      <Badge variant="outline" className="bg-white/80 text-gray-700 dark:text-[#a8a8b0] text-[9px] px-1.5 py-0 border-gray-300 dark:border-white/15">
                        libera
                      </Badge>
                    )}
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/55 transition flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                    {!manageMode && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handlePick(item)}
                        className="h-7 text-xs bg-[#D2FA46] hover:bg-[#E85A00]"
                        data-testid={`media-pick-${item.public_id}`}
                      >
                        <Check className="h-3 w-3 mr-1" />Usa
                      </Button>
                    )}
                    {allowDelete && item.can_delete && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.public_id || item.in_use}
                        className="h-7 text-xs bg-white/95 hover:bg-red-50 text-red-600 border-red-200"
                        title={item.in_use ? 'In uso, non eliminabile' : 'Elimina'}
                        data-testid={`media-delete-${item.public_id}`}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        {deletingId === item.public_id ? '...' : 'Elimina'}
                      </Button>
                    )}
                  </div>

                  {/* Filename footer */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[10px] text-gray-900 dark:text-white truncate" title={item.original_filename}>
                    {item.original_filename || item.public_id.split('/').pop()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t text-xs">
          <span className="text-gray-500 dark:text-[#6a6a72]">
            {total > 0 ? `${skip + 1}–${Math.min(skip + items.length, total)} di ${total}` : '0'}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canPrev}
              onClick={() => fetchPage(Math.max(0, skip - PAGE_SIZE), kind, search)}
              className="h-7 text-xs"
            >
              <ChevronLeft className="h-3 w-3" />Indietro
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canNext}
              onClick={() => fetchPage(skip + PAGE_SIZE, kind, search)}
              className="h-7 text-xs"
            >
              Avanti<ChevronRight className="h-3 w-3" />
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose} className="h-7 text-xs ml-1">
              <X className="h-3 w-3 mr-1" />Chiudi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MediaPicker;
