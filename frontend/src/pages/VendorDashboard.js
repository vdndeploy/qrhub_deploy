import { useState, useEffect } from 'react';
import { useVendorAuth } from '@/contexts/VendorAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { LogOut, Eye, MousePointerClick, ExternalLink, Save, Upload, X, Image as ImageIcon, FolderOpen } from 'lucide-react';
import axios from 'axios';
import AnalyticsDetailed from './AnalyticsDetailed';
import MediaPicker from '@/components/MediaPicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const VendorDashboard = () => {
  const { vendor, logout, refreshVendor } = useVendorAuth();
  const [stats, setStats] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    profile_image_url: '',
    profile_image_enabled: false,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (vendor) {
      setFormData({
        name: vendor.name,
        bio: vendor.bio || '',
        profile_image_url: vendor.profile_image_url || '',
        profile_image_enabled: !!vendor.profile_image_enabled,
      });
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor]);

  const fetchStats = async () => {
    try {
      const { data } = await axios.get(`${API}/vendor/stats`, {
        withCredentials: true,
      });
      setStats(data);
    } catch (e) {
      console.error('Error fetching stats:', e);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await axios.put(`${API}/vendor/profile`, formData, {
        withCredentials: true,
      });
      toast.success('Profilo aggiornato');
      await refreshVendor();
    } catch (e) {
      toast.error('Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Immagine troppo grande (max 5 MB)');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', `vendors/${vendor?.id || 'profile'}`);
      const { data } = await axios.post(`${API}/upload`, fd, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFormData((prev) => ({ ...prev, profile_image_url: data.url }));
      toast.success('Foto caricata — clicca Salva per applicare');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeImage = () => {
    setFormData((prev) => ({ ...prev, profile_image_url: '', profile_image_enabled: false }));
  };

  const openLandingPage = () => {
    const url = `${window.location.origin}/v/${vendor.id}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b]">
      <header className="bg-[#131316] border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-black tracking-tighter text-white">
              Area Venditore
            </h1>
            <p className="text-xs sm:text-sm text-[#8a8a92] truncate">{vendor?.name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={openLandingPage}
              data-testid="view-landing-button"
            >
              <ExternalLink className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Vedi Pagina</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="vendor-logout-button"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Esci</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white mb-6">
              Le Tue Statistiche
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div
                className="bg-[#131316] rounded-lg border border-white/10 p-6"
                data-testid="vendor-stat-views"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Eye className="h-6 w-6 text-[#4A2D8C]" />
                  </div>
                  <div>
                    <p className="text-sm text-[#8a8a92] uppercase tracking-widest">
                      Visite Totali
                    </p>
                    <p className="text-3xl font-black tracking-tighter">
                      {stats?.views || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className="bg-[#131316] rounded-lg border border-white/10 p-6"
                data-testid="vendor-stat-clicks"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#D2FA46]/10 rounded-lg">
                    <MousePointerClick className="h-6 w-6 text-[#D2FA46]" />
                  </div>
                  <div>
                    <p className="text-sm text-[#8a8a92] uppercase tracking-widest">
                      Click Totali
                    </p>
                    <p className="text-3xl font-black tracking-tighter">
                      {stats?.total_clicks || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {stats?.click_breakdown && (
              <div className="bg-[#131316] rounded-lg border border-white/10 p-6 mt-6">
                <h3 className="text-lg font-semibold mb-4 text-white">
                  Dettaglio Click
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-7 gap-4">
                  <div className="text-center"><p className="text-2xl font-bold text-[#25D366]">{stats.click_breakdown.whatsapp_click || 0}</p><p className="text-xs text-[#8a8a92]">WhatsApp</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-[#E1306C]">{stats.click_breakdown.instagram_click || 0}</p><p className="text-xs text-[#8a8a92]">Instagram</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-[#1877F2]">{stats.click_breakdown.facebook_click || 0}</p><p className="text-xs text-[#8a8a92]">Facebook</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-[#FBBC04]">{stats.click_breakdown.review_click || 0}</p><p className="text-xs text-[#8a8a92]">Recensioni</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-black">{stats.click_breakdown.tiktok_click || 0}</p><p className="text-xs text-[#8a8a92]">TikTok</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-[#D2FA46]">{stats.click_breakdown.maps_click || 0}</p><p className="text-xs text-[#8a8a92]">Maps</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-[#4A2D8C]">{stats.click_breakdown.post_cta_click || 0}</p><p className="text-xs text-[#8a8a92]">CTA Post</p></div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 pt-6">
            <AnalyticsDetailed mode="vendor" />
          </div>

          <div className="bg-[#131316] rounded-lg border border-white/10 p-6">
            <h2 className="text-2xl font-bold tracking-tight text-white mb-6">
              Modifica Profilo
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  data-testid="vendor-profile-name-input"
                />
              </div>

              <div>
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData({ ...formData, bio: e.target.value })
                  }
                  data-testid="vendor-profile-bio-input"
                />
              </div>

              {/* Foto profilo (stile Instagram) */}
              <div className="border border-white/10 rounded-lg p-4 bg-gradient-to-br from-orange-50 to-pink-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <Label className="font-semibold text-[#e6e6ea] flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-[#D2FA46]" />
                      Foto profilo
                    </Label>
                    <p className="text-xs text-[#8a8a92] mt-1">
                      Carica una foto che apparirà come avatar sulla tua landing pubblica.
                      Formati JPG/PNG, max 5 MB. Consigliato: foto quadrata, viso ben visibile.
                    </p>
                  </div>
                  {/* Toggle visibilità */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Switch
                      checked={formData.profile_image_enabled}
                      onCheckedChange={(v) =>
                        setFormData({ ...formData, profile_image_enabled: v })
                      }
                      disabled={!formData.profile_image_url}
                      data-testid="vendor-profile-image-toggle"
                      className="data-[state=checked]:bg-[#D2FA46]"
                    />
                    <span className="text-[10px] text-[#6a6a72] uppercase tracking-wide">
                      {formData.profile_image_enabled ? 'Pubblica' : 'Nascosta'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-4">
                  {/* Avatar preview */}
                  <div className="relative">
                    <div className={`w-24 h-24 rounded-full overflow-hidden ring-2 ${formData.profile_image_enabled && formData.profile_image_url ? 'ring-[#D2FA46]' : 'ring-gray-300'} bg-white shadow-md`}>
                      {formData.profile_image_url ? (
                        <img
                          src={formData.profile_image_url}
                          alt="profilo"
                          className="w-full h-full object-cover"
                          data-testid="vendor-profile-image-preview"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#1a1a1c] text-[#5a5a62]">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    {formData.profile_image_url && (
                      <button
                        type="button"
                        onClick={removeImage}
                        title="Rimuovi foto"
                        data-testid="vendor-profile-image-remove"
                        className="absolute -top-1 -right-1 bg-[#131316] border border-white/15 rounded-full p-1 hover:bg-red-50 hover:border-red-300 shadow-sm"
                      >
                        <X className="h-3 w-3 text-red-500" />
                      </button>
                    )}
                  </div>

                  {/* Upload button */}
                  <div className="flex-1">
                    <label
                      htmlFor="vendor-profile-upload"
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md border-2 border-dashed cursor-pointer transition
                        ${uploading
                          ? 'border-white/15 bg-gray-100 cursor-wait opacity-60'
                          : 'border-[#D2FA46] bg-white hover:bg-orange-50 text-[#D2FA46]'}`}
                    >
                      <Upload className={`h-4 w-4 ${uploading ? 'animate-pulse' : ''}`} />
                      <span className="text-sm font-medium">
                        {uploading
                          ? 'Caricamento...'
                          : formData.profile_image_url
                          ? 'Cambia foto'
                          : 'Carica foto'}
                      </span>
                      <input
                        id="vendor-profile-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={uploading}
                        data-testid="vendor-profile-image-input"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPickerOpen(true)}
                      className="ml-2 h-9 text-xs"
                      data-testid="vendor-profile-from-library"
                    >
                      <FolderOpen className="h-4 w-4 mr-1" />Scegli dalla libreria
                    </Button>
                    <p className="text-xs text-[#6a6a72] mt-2">
                      {formData.profile_image_url && !formData.profile_image_enabled && (
                        <span className="text-amber-700">⚠ Foto caricata ma nascosta — attiva il toggle a destra per mostrarla.</span>
                      )}
                      {formData.profile_image_url && formData.profile_image_enabled && (
                        <span className="text-emerald-700">✓ Foto visibile pubblicamente. Clicca Salva per applicare.</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0a0a0b] rounded-lg p-4 border border-white/10">
                <p className="text-sm font-medium text-[#a8a8b0] mb-2">
                  Link Social (gestiti dal negozio)
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-[#8a8a92]">WhatsApp:</span>{' '}
                    <span className="text-white">
                      {vendor?.whatsapp ? '✓ Configurato' : '✗ Non configurato'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8a8a92]">Instagram:</span>{' '}
                    <span className="text-white">
                      {vendor?.instagram ? '✓ Configurato' : '✗ Non configurato'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8a8a92]">Facebook:</span>{' '}
                    <span className="text-white">
                      {vendor?.facebook ? '✓ Configurato' : '✗ Non configurato'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8a8a92]">Google Review:</span>{' '}
                    <span className="text-white">
                      {vendor?.google_review ? '✓ Configurato' : '✗ Non configurato'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#6a6a72] mt-2">
                  Contatta l'amministratore per modificare i link social
                </p>
              </div>

              <Button
                type="submit"
                disabled={saving}
                className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
                data-testid="vendor-profile-submit-button"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Salvataggio...' : 'Salva Modifiche'}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => {
          setFormData((prev) => ({ ...prev, profile_image_url: item.url }));
          toast.success('Foto selezionata. Clicca Salva per applicare.');
        }}
        kind="uploads"
        hidePostsTab
        title="Foto profilo della libreria"
      />
    </div>
  );
};

export default VendorDashboard;