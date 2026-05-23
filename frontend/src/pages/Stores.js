import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Store as StoreIcon, Megaphone } from 'lucide-react';
import PostsManager from '@/components/PostsManager';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Stores = () => {
  const [stores, setStores] = useState([]);
  const [postsCounts, setPostsCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [postsManagerStore, setPostsManagerStore] = useState(null);
  const [formData, setFormData] = useState(empty());

  useEffect(() => { fetchStores(); }, []);

  const fetchStores = async () => {
    try {
      const { data } = await axios.get(`${API}/stores`, { withCredentials: true });
      setStores(data);
      // Fetch posts counts for each store in parallel
      const counts = {};
      await Promise.all(data.map(async (s) => {
        try {
          const r = await axios.get(`${API}/stores/${s.id}/posts`, { withCredentials: true });
          counts[s.id] = r.data.length;
        } catch { counts[s.id] = 0; }
      }));
      setPostsCounts(counts);
    } catch (e) {
      toast.error('Errore caricamento');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (store = null) => {
    if (store) {
      setEditingStore(store);
      setFormData({
        name: store.name, whatsapp: store.whatsapp || '', whatsapp_message: store.whatsapp_message || '',
        instagram: store.instagram || '', facebook: store.facebook || '', tiktok: store.tiktok || '',
        google_review: store.google_review || '', google_maps_url: store.google_maps_url || '',
        hours_text: store.hours_text || '',
      });
    } else {
      setEditingStore(null);
      setFormData(empty());
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Preserve legacy post fields when updating (they'll be ignored after migration)
      const payload = { ...formData, post_title: '', post_text: '', post_media_url: '', post_cta_text: '', post_whatsapp_message: '' };
      if (editingStore) {
        await axios.put(`${API}/stores/${editingStore.id}`, payload, { withCredentials: true });
        toast.success('Negozio aggiornato');
      } else {
        await axios.post(`${API}/stores`, payload, { withCredentials: true });
        toast.success('Negozio creato');
      }
      setIsDialogOpen(false);
      fetchStores();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminare?')) return;
    try {
      await axios.delete(`${API}/stores/${id}`, { withCredentials: true });
      toast.success('Eliminato');
      fetchStores();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
    }
  };

  if (loading) return <div className="text-center py-12">Caricamento...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl sm:text-3xl font-bold">Gestione Negozi</h2>
        <Button onClick={() => handleOpenDialog()} className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]" data-testid="store-new-button">
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Nuovo Negozio</span>
          <span className="sm:hidden">Nuovo</span>
        </Button>
      </div>
      <div className="bg-[#131316] rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Social attivi</TableHead>
              <TableHead>Annunci</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">Nessun negozio</TableCell></TableRow>
            ) : (
              stores.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-2"><StoreIcon className="h-4 w-4 text-[#D2FA46]" />{s.name}</div>
                  </TableCell>
                  <TableCell>{[s.whatsapp, s.instagram, s.facebook, s.tiktok].filter(Boolean).length}/4</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setPostsManagerStore(s)} data-testid={`store-posts-button-${s.id}`}>
                      <Megaphone className="h-4 w-4 sm:mr-2 text-[#D2FA46]" />
                      <span className="hidden sm:inline">{postsCounts[s.id] || 0} {(postsCounts[s.id] === 1) ? 'annuncio' : 'annunci'}</span>
                      <span className="sm:hidden ml-1">{postsCounts[s.id] || 0}</span>
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => handleOpenDialog(s)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(s.id)} className="ml-1 sm:ml-2"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingStore ? 'Modifica' : 'Nuovo'} Negozio</DialogTitle>
            <DialogDescription>Configura i social e i contatti del negozio. Gli annunci si gestiscono dal pulsante "Annunci" in tabella.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nome Negozio *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required placeholder="Es. Negozio Centro Milano" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>WhatsApp URL</Label><Input placeholder="https://wa.me/39..." value={formData.whatsapp} onChange={(e) => setFormData({...formData, whatsapp: e.target.value})} /></div>
              <div><Label>Messaggio WhatsApp</Label><Input placeholder="Ciao! Info..." value={formData.whatsapp_message} onChange={(e) => setFormData({...formData, whatsapp_message: e.target.value})} /></div>
              <div><Label>Instagram</Label><Input placeholder="https://instagram.com/..." value={formData.instagram} onChange={(e) => setFormData({...formData, instagram: e.target.value})} /></div>
              <div><Label>Facebook</Label><Input placeholder="https://facebook.com/..." value={formData.facebook} onChange={(e) => setFormData({...formData, facebook: e.target.value})} /></div>
              <div><Label>TikTok</Label><Input placeholder="https://tiktok.com/@..." value={formData.tiktok} onChange={(e) => setFormData({...formData, tiktok: e.target.value})} /></div>
              <div><Label>Google Review</Label><Input placeholder="https://g.page/..." value={formData.google_review} onChange={(e) => setFormData({...formData, google_review: e.target.value})} /></div>
              <div className="sm:col-span-2"><Label>Google Maps (Navigazione)</Label><Input placeholder="https://maps.app.goo.gl/..." value={formData.google_maps_url} onChange={(e) => setFormData({...formData, google_maps_url: e.target.value})} /></div>
            </div>
            <div className="border-t pt-4 space-y-3">
              <div className="text-sm font-semibold text-[#a8a8b0]">Scheda negozio (pulsante "Store" sulla landing)</div>
              <div>
                <Label>Orari di apertura</Label>
                <Textarea
                  placeholder={'Lun-Ven: 9:00-13:00 / 15:00-19:30\nSab: 9:00-13:00\nDom: Chiuso'}
                  value={formData.hours_text || ''}
                  onChange={(e) => setFormData({...formData, hours_text: e.target.value})}
                  rows={4}
                  maxLength={500}
                  data-testid="store-hours-input"
                />
                <p className="text-[11px] text-[#6a6a72] mt-1">
                  Formato libero, supporta più righe. Compare nel pulsante "Store" sulla landing del venditore insieme al nome del negozio. Le indicazioni stradali sono già disponibili tramite il pulsante "Mappa" (campo Google Maps qui sopra).
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Annulla</Button>
              <Button type="submit" className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]">{editingStore ? 'Aggiorna' : 'Crea'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PostsManager
        open={!!postsManagerStore}
        onClose={() => { setPostsManagerStore(null); fetchStores(); }}
        storeId={postsManagerStore?.id}
        storeName={postsManagerStore?.name}
      />
    </div>
  );
};

const empty = () => ({
  name: '', whatsapp: '', whatsapp_message: '', instagram: '', facebook: '', tiktok: '',
  google_review: '', google_maps_url: '', hours_text: '',
});

export default Stores;
