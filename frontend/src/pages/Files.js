import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Trash2, Search, RefreshCw, FileVideo, AlertCircle, CheckCircle2, FolderOpen, X, ImageIcon, HardDrive } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 24;

const fmtBytes = (b) => {
  if (!b) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b/1048576).toFixed(1)} MB`;
  return `${(b/1073741824).toFixed(2)} GB`;
};

const Files = () => {
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [folder, setFolder] = useState('all');
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [lightbox, setLightbox] = useState(null); // file obj currently zoomed

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/media/stats`, { withCredentials: true });
      setStats(data);
    } catch { /* non-blocking */ }
  }, []);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = { skip, limit: PAGE_SIZE };
      if (folder !== 'all') params.folder = folder;
      if (orphansOnly) params.orphans_only = true;
      const { data } = await axios.get(`${API}/files`, { params, withCredentials: true });
      setFiles(data.files);
      setTotal(data.total);
      setSelected(new Set());
    } catch (e) {
      toast.error('Errore caricamento file');
    } finally {
      setLoading(false);
    }
  }, [skip, folder, orphansOnly]);

  useEffect(() => { fetchFiles(); fetchStats(); }, [fetchFiles, fetchStats]);

  const filtered = files.filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (f.original_filename || '').toLowerCase().includes(q) ||
            (f.public_id || '').toLowerCase().includes(q);
  });

  const toggleSelect = (pid) => {
    const next = new Set(selected);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(f => f.public_id)));
  };

  const deleteOne = async (pid, isInUse) => {
    if (isInUse && !window.confirm('Questo file è in uso da un annuncio. Eliminarlo lo rimuoverà anche dall\'annuncio. Procedere?')) return;
    if (!isInUse && !window.confirm('Eliminare questo file?')) return;
    try {
      await axios.delete(`${API}/files/${encodeURIComponent(pid)}`, { withCredentials: true });
      toast.success('File eliminato');
      fetchFiles();
    } catch (e) {
      toast.error('Errore eliminazione');
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    const inUseCount = files.filter(f => selected.has(f.public_id) && f.in_use).length;
    const msg = inUseCount > 0
      ? `Eliminare ${selected.size} file? Attenzione: ${inUseCount} sono in uso da annunci e verranno staccati.`
      : `Eliminare ${selected.size} file?`;
    if (!window.confirm(msg)) return;
    try {
      const { data } = await axios.post(`${API}/files/bulk-delete`,
        { public_ids: Array.from(selected) }, { withCredentials: true });
      toast.success(`${data.deleted} file eliminati`);
      fetchFiles();
    } catch (e) {
      toast.error('Errore bulk delete');
    }
  };

  const fmtSize = (b) => {
    if (!b) return '-';
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1048576).toFixed(1)} MB`;
  };

  const fmtDate = (iso) => iso ? iso.slice(0, 16).replace('T', ' ') : '-';

  return (
    <div className="space-y-6" data-testid="files-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <ImageIcon className="h-7 w-7 text-[#D2FA46]" />
            Libreria Media
          </h2>
          <p className="text-sm text-[#8a8a92] mt-1">
            Tutti i file Cloudinary della tua organizzazione. Riutilizzali nei post e nelle foto profilo.
          </p>
        </div>
        <Button variant="outline" onClick={() => { fetchFiles(); fetchStats(); }}>
          <RefreshCw className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Aggiorna</span>
        </Button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="File totali" value={stats.count} hint={fmtBytes(stats.bytes)} />
          <StatCard label="Foto profilo" value={stats.by_kind?.uploads?.count || 0} hint={fmtBytes(stats.by_kind?.uploads?.bytes || 0)} />
          <StatCard label="Immagini post" value={stats.by_kind?.posts?.count || 0} hint={fmtBytes(stats.by_kind?.posts?.bytes || 0)} />
          <StatCard
            label="Orfani"
            value={files.filter(f => !f.in_use).length}
            hint={
              <button
                type="button"
                onClick={() => { setOrphansOnly(true); setSkip(0); }}
                className="text-[10px] text-[#D2FA46] hover:underline"
              >
                Mostra solo orfani →
              </button>
            }
            accent="amber"
          />
        </div>
      )}

      <div className="bg-[#131316] border rounded-lg p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-full sm:min-w-[200px]">
          <Search className="h-4 w-4 text-[#5a5a62] flex-shrink-0" />
          <Input placeholder="Cerca per nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 sm:max-w-xs" />
        </div>
        <Select value={folder} onValueChange={(v) => { setFolder(v); setSkip(0); }}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le cartelle</SelectItem>
            <SelectItem value="posts">Annunci (posts)</SelectItem>
            <SelectItem value="uploads">Generici (uploads)</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
          <Checkbox checked={orphansOnly} onCheckedChange={(v) => { setOrphansOnly(!!v); setSkip(0); }} />
          <span className="hidden sm:inline">Solo file orfani (non in uso)</span>
          <span className="sm:hidden">Orfani</span>
        </label>
        {selected.size > 0 && (
          <Button onClick={bulkDelete} variant="destructive" data-testid="bulk-delete-button" className="w-full sm:w-auto">
            <Trash2 className="h-4 w-4 mr-2" />Elimina {selected.size}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#6a6a72]">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed rounded-lg py-16 text-center text-[#6a6a72] flex flex-col items-center gap-2">
          <FolderOpen className="h-10 w-10 text-gray-300" />
          Nessun file
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-[#8a8a92]">
            <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
            <span>Seleziona tutti ({filtered.length})</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filtered.map(f => (
              <FileCard key={f.public_id} f={f} fmtSize={fmtSize} fmtDate={fmtDate}
                         selected={selected.has(f.public_id)}
                         onToggleSelect={() => toggleSelect(f.public_id)}
                         onDelete={() => deleteOne(f.public_id, f.in_use)}
                         onZoom={() => setLightbox(f)} />
            ))}
          </div>

          {total > PAGE_SIZE && (
            <div className="flex justify-center items-center gap-3 pt-2">
              <Button variant="outline" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>← Precedente</Button>
              <span className="text-sm text-[#8a8a92]">{skip + 1}–{Math.min(skip + PAGE_SIZE, total)} di {total}</span>
              <Button variant="outline" disabled={skip + PAGE_SIZE >= total} onClick={() => setSkip(skip + PAGE_SIZE)}>Successiva →</Button>
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          data-testid="media-lightbox"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2"
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="max-w-5xl w-full max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {lightbox.resource_type === 'video' ? (
              <video src={lightbox.url} controls className="max-w-full max-h-[80vh]" />
            ) : (
              <img src={lightbox.url} alt={lightbox.original_filename || ''} className="max-w-full max-h-[80vh] object-contain" />
            )}
            <div className="mt-3 px-4 py-2 rounded bg-white/10 text-white text-xs flex flex-wrap items-center gap-3">
              <span className="font-semibold">{lightbox.original_filename || lightbox.public_id}</span>
              <span className="opacity-70">·</span>
              <span>{fmtSize(lightbox.bytes)}</span>
              {lightbox.width && lightbox.height && (
                <>
                  <span className="opacity-70">·</span>
                  <span>{lightbox.width}×{lightbox.height}</span>
                </>
              )}
              <span className="opacity-70">·</span>
              <span className={lightbox.in_use ? 'text-emerald-300' : 'text-amber-300'}>
                {lightbox.in_use ? 'in uso' : 'orfano'}
              </span>
              {!lightbox.in_use && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => { deleteOne(lightbox.public_id, false); setLightbox(null); }}
                  className="h-7 text-xs ml-2"
                >
                  <Trash2 className="h-3 w-3 mr-1" />Elimina
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value, hint, accent = 'gray' }) => {
  const accentClasses = {
    gray: 'bg-white',
    amber: 'bg-amber-50 border-amber-200',
  };
  return (
    <div className={`border rounded-lg p-3 ${accentClasses[accent] || 'bg-white'}`}>
      <div className="flex items-start gap-2">
        <HardDrive className={`h-4 w-4 mt-0.5 ${accent === 'amber' ? 'text-amber-600' : 'text-[#5a5a62]'}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-[#6a6a72] font-semibold">{label}</div>
          <div className="text-xl font-bold">{value}</div>
          <div className="text-[11px] text-[#6a6a72] mt-0.5">{hint}</div>
        </div>
      </div>
    </div>
  );
};

const FileCard = ({ f, fmtSize, fmtDate, selected, onToggleSelect, onDelete, onZoom }) => {
  const isVideo = f.resource_type === 'video';
  return (
    <div className={`border rounded-lg overflow-hidden bg-white transition-shadow hover:shadow-md ${selected ? 'ring-2 ring-[#D2FA46]' : ''}`} data-testid="file-card">
      <button
        type="button"
        onClick={onZoom}
        className="block relative aspect-square bg-[#1a1a1c] w-full cursor-zoom-in"
        aria-label="Ingrandisci"
      >
        {isVideo ? (
          <div className="w-full h-full flex items-center justify-center bg-black text-white">
            <FileVideo className="h-10 w-10" />
          </div>
        ) : (
          <img src={f.url} alt={f.original_filename || ''} className="w-full h-full object-cover" loading="lazy" />
        )}
        <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="bg-[#131316] border-2" />
        </div>
        <div className="absolute top-1.5 right-1.5 z-10">
          {f.in_use ? (
            <span title="In uso" className="bg-green-500 text-white rounded-full p-0.5 flex items-center justify-center shadow-md"><CheckCircle2 className="h-3.5 w-3.5" /></span>
          ) : (
            <span title="Orfano" className="bg-yellow-500 text-white rounded-full p-0.5 flex items-center justify-center shadow-md"><AlertCircle className="h-3.5 w-3.5" /></span>
          )}
        </div>
      </button>
      <div className="p-2 text-xs">
        <div className="font-medium truncate" title={f.original_filename}>{f.original_filename || f.public_id}</div>
        <div className="text-[#6a6a72] flex justify-between mt-0.5">
          <span>{fmtSize(f.bytes)}</span>
          <span className="truncate ml-2 text-[10px]">{(f.kind || f.folder || '').toString().split('/').pop()}</span>
        </div>
        <div className="text-[#5a5a62] text-[10px] mt-0.5">{fmtDate(f.created_at)}</div>
        <Button variant="ghost" size="sm" className="w-full mt-1 h-7 text-xs" onClick={onDelete}>
          <Trash2 className="h-3 w-3 mr-1 text-red-500" />Elimina
        </Button>
      </div>
    </div>
  );
};

export default Files;
