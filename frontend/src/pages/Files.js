import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Trash2, Search, RefreshCw, FileVideo, AlertCircle, CheckCircle2, FolderOpen } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 24;

const Files = () => {
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [folder, setFolder] = useState('all');
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

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
          <h2 className="text-2xl sm:text-3xl font-bold">Gestione File</h2>
          <p className="text-sm text-gray-600 mt-1">Storage Cloudinary · {total} file totali</p>
        </div>
        <Button variant="outline" onClick={fetchFiles}><RefreshCw className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Aggiorna</span></Button>
      </div>

      <div className="bg-white border rounded-lg p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-full sm:min-w-[200px]">
          <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
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
        <div className="text-center py-12 text-gray-500">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed rounded-lg py-16 text-center text-gray-500 flex flex-col items-center gap-2">
          <FolderOpen className="h-10 w-10 text-gray-300" />
          Nessun file
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
            <span>Seleziona tutti ({filtered.length})</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filtered.map(f => (
              <FileCard key={f.public_id} f={f} fmtSize={fmtSize} fmtDate={fmtDate}
                         selected={selected.has(f.public_id)}
                         onToggleSelect={() => toggleSelect(f.public_id)}
                         onDelete={() => deleteOne(f.public_id, f.in_use)} />
            ))}
          </div>

          {total > PAGE_SIZE && (
            <div className="flex justify-center items-center gap-3 pt-2">
              <Button variant="outline" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>← Precedente</Button>
              <span className="text-sm text-gray-600">{skip + 1}–{Math.min(skip + PAGE_SIZE, total)} di {total}</span>
              <Button variant="outline" disabled={skip + PAGE_SIZE >= total} onClick={() => setSkip(skip + PAGE_SIZE)}>Successiva →</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const FileCard = ({ f, fmtSize, fmtDate, selected, onToggleSelect, onDelete }) => {
  const isVideo = f.resource_type === 'video';
  return (
    <div className={`border rounded-lg overflow-hidden bg-white transition-shadow hover:shadow-md ${selected ? 'ring-2 ring-[#F96815]' : ''}`} data-testid="file-card">
      <div className="relative aspect-square bg-gray-100">
        {isVideo ? (
          <div className="w-full h-full flex items-center justify-center bg-black text-white">
            <FileVideo className="h-10 w-10" />
          </div>
        ) : (
          <img src={f.url} alt={f.original_filename || ''} className="w-full h-full object-cover" loading="lazy" />
        )}
        <div className="absolute top-2 left-2">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="bg-white border-2" />
        </div>
        <div className="absolute top-1.5 right-1.5 z-10">
          {f.in_use ? (
            <span title="In uso" className="bg-green-500 text-white rounded-full p-0.5 flex items-center justify-center shadow-md"><CheckCircle2 className="h-3.5 w-3.5" /></span>
          ) : (
            <span title="Orfano" className="bg-yellow-500 text-white rounded-full p-0.5 flex items-center justify-center shadow-md"><AlertCircle className="h-3.5 w-3.5" /></span>
          )}
        </div>
      </div>
      <div className="p-2 text-xs">
        <div className="font-medium truncate" title={f.original_filename}>{f.original_filename || f.public_id}</div>
        <div className="text-gray-500 flex justify-between mt-0.5">
          <span>{fmtSize(f.bytes)}</span>
          <span>{f.folder}</span>
        </div>
        <div className="text-gray-400 text-[10px] mt-0.5">{fmtDate(f.created_at)}</div>
        <Button variant="ghost" size="sm" className="w-full mt-1 h-7 text-xs" onClick={onDelete}>
          <Trash2 className="h-3 w-3 mr-1 text-red-500" />Elimina
        </Button>
      </div>
    </div>
  );
};

export default Files;
