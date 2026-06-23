import { useState, useEffect } from 'react';
import { useVendorAuth } from '@/contexts/VendorAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { LogOut, Eye, MousePointerClick, ExternalLink, Save, Upload, X, Image as ImageIcon, FolderOpen, Sun, Moon, Trash2 } from 'lucide-react';
import ConsultantAvatar from '@/components/ConsultantAvatar';
import axios from 'axios';
import AnalyticsDetailed from './AnalyticsDetailed';
import MediaPicker from '@/components/MediaPicker';
import { useTheme } from '@/hooks/useTheme';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const VendorDashboard = () => {
  const { vendor, logout, refreshVendor } = useVendorAuth();
  const { isDark, toggle: toggleTheme } = useTheme();
  const [stats, setStats] = useState(null);
  const [clickPeriod, setClickPeriod] = useState('all');
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    profile_image_url: '',
    profile_image_enabled: false,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('select'); // 'select' | 'manage'

  // ── Store Manager team picker ────────────────────────────────────────
  // When the logged-in vendor has store_role === 'manager' we let them
  // pick which teammate's analytics to view. `team` is fetched once and
  // `viewVendorId` swaps the analytics scope without touching the rest
  // of the dashboard (profile editing stays scoped to "me").
  const [team, setTeam] = useState({ is_manager: false, members: [] });
  const [viewVendorId, setViewVendorId] = useState('');
  const isManager = !!team.is_manager;
  // ID currently used for analytics queries (empty string = self).
  const analyticsTargetId = viewVendorId && viewVendorId !== vendor?.id ? viewVendorId : '';

  useEffect(() => {
    if (vendor) {
      setFormData({
        name: vendor.name,
        bio: vendor.bio || '',
        profile_image_url: vendor.profile_image_url || '',
        profile_image_enabled: !!vendor.profile_image_enabled,
      });
      setViewVendorId(vendor.id);
      // Manager-only: fetch the team list. Specialists get a single-item
      // payload back (themselves) — we just don't surface the picker UI.
      axios.get(`${API}/vendor/team`, { withCredentials: true })
        .then(({ data }) => setTeam(data))
        .catch(() => setTeam({ is_manager: false, members: [] }));
    }
  }, [vendor]);

  useEffect(() => {
    if (vendor) fetchStats(clickPeriod, analyticsTargetId);
  }, [vendor, clickPeriod, analyticsTargetId]);

  const fetchStats = async (period = 'all', targetVendorId = '') => {
    try {
      const params = { period };
      if (targetVendorId) params.vendor_id = targetVendorId;
      const { data } = await axios.get(`${API}/vendor/stats`, {
        params,
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
    // Prefer the effective public URL computed by the backend: that's the org's
    // verified custom domain (e.g. https://app.tenant-example.com/v/abc) so the link the
    // vendor copies/shares matches what their customers will actually see. The
    // local `window.location.origin` is only a fallback (typically qrhub.it for
    // unconfigured orgs or local development).
    let url = (vendor?.landing_url || '').trim();
    if (!url) {
      const path = (vendor?.slug || '').trim() || vendor?.id;
      url = `${window.location.origin}/v/${path}`;
    }
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0b]">
      <header className="bg-white dark:bg-[#131316] border-b border-gray-200 dark:border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-black tracking-tighter text-gray-900 dark:text-white">
              Area Venditore
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-[#8a8a92] truncate">{vendor?.name}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              aria-label={isDark ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
              title={isDark ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
              data-testid="vendor-theme-toggle"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
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
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-6">
              Le Tue Statistiche
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div
                className="bg-white dark:bg-[#131316] rounded-lg border border-gray-200 dark:border-white/10 p-6"
                data-testid="vendor-stat-views"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Eye className="h-6 w-6 text-[#4A2D8C]" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-[#8a8a92] uppercase tracking-widest">
                      Visite Totali
                    </p>
                    <p className="text-3xl font-black tracking-tighter">
                      {stats?.views || 0}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className="bg-white dark:bg-[#131316] rounded-lg border border-gray-200 dark:border-white/10 p-6"
                data-testid="vendor-stat-clicks"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#D2FA46]/15 dark:bg-[#D2FA46]/10 rounded-lg">
                    <MousePointerClick className="h-6 w-6 text-[#D2FA46]" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-[#8a8a92] uppercase tracking-widest">
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
              <div className="bg-white dark:bg-[#131316] rounded-lg border border-gray-200 dark:border-white/10 p-6 mt-6" data-testid="vendor-click-breakdown">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Dettaglio Click
                  </h3>
                  {/* Period filter — segmented control matching the rest of
                      the platform's analytics filters (Conta persone, Analytics
                      Dettagliata). Same scope is also passed to the backend so
                      the counters reflect only the selected window. */}
                  <div className="inline-flex items-center bg-gray-100 dark:bg-[#1a1a1c] rounded-full p-0.5" data-testid="vendor-click-period-tabs">
                    {[
                      { v: 'today',     l: 'Oggi'     },
                      { v: 'yesterday', l: 'Ieri'     },
                      { v: '7d',        l: '7 giorni' },
                      { v: 'month',     l: 'Mese'     },
                      { v: 'all',       l: 'Sempre'   },
                    ].map(opt => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setClickPeriod(opt.v)}
                        data-testid={`vendor-click-period-${opt.v}`}
                        className={`px-3 py-1 text-xs font-medium rounded-full transition ${
                          clickPeriod === opt.v
                            ? 'bg-white dark:bg-[#0a0a0b] text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-[#8a8a92] hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  <ClickStat color="#25D366" label="WhatsApp"     value={stats.click_breakdown.whatsapp_click} testid="vendor-c-whatsapp"     />
                  <ClickStat color="#FBBC04" label="Recensione"   value={stats.click_breakdown.review_click}   testid="vendor-c-review"       />
                  <ClickStat color="#0EA5E9" label="Appuntamento" value={stats.click_breakdown.appointment_click} testid="vendor-c-appointment" />
                  <ClickStat color="#34A853" label="Google Maps"  value={stats.click_breakdown.maps_click}     testid="vendor-c-maps"         />
                  <ClickStat color="#9B7BFF" label="CTA Annunci"  value={stats.click_breakdown.post_cta_click} testid="vendor-c-cta"          />
                  <ClickStat color="#E1306C" label="Instagram"    value={stats.click_breakdown.instagram_click} testid="vendor-c-instagram"   />
                  <ClickStat color="#1877F2" label="Facebook"     value={stats.click_breakdown.facebook_click} testid="vendor-c-facebook"     />
                  <ClickStat color="#000000" label="TikTok"       value={stats.click_breakdown.tiktok_click}   testid="vendor-c-tiktok"       />
                  <ClickStat color="#D2FA46" label="Installa PWA" value={stats.click_breakdown.pwa_install}    testid="vendor-c-pwa"          />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-white/10 pt-6">
            {/* Store Manager team picker — only rendered when the logged-in
                vendor has role 'manager'. Specialists see the regular
                self-only analytics block. */}
            {isManager && team.members.length > 1 && (
              <div className="mb-5 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      Vista Store Manager
                    </div>
                    <div className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
                      Sei un manager: puoi visualizzare le analitiche di ogni venditore assegnato al tuo negozio.
                    </div>
                  </div>
                  <div className="sm:w-72">
                    <Label htmlFor="manager-team-select" className="text-xs text-amber-900 dark:text-amber-100 mb-1 block">
                      Visualizza analytics di:
                    </Label>
                    <select
                      id="manager-team-select"
                      data-testid="manager-team-select"
                      value={viewVendorId}
                      onChange={(e) => setViewVendorId(e.target.value)}
                      className="w-full h-9 px-2 rounded-md border border-amber-300 dark:border-amber-500/50 bg-white dark:bg-[#1a1a1c] text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      {team.members.map((m) => (
                        <option key={m.id} value={m.id} data-testid={`manager-team-opt-${m.id}`}>
                          {m.name}{m.id === vendor?.id ? ' (io)' : ''} — {m.store_role === 'manager' ? 'Manager' : 'Specialist'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
            <AnalyticsDetailed mode="vendor" targetVendorId={analyticsTargetId} />
          </div>

          <div className="bg-white dark:bg-[#131316] rounded-lg border border-gray-200 dark:border-white/10 p-6">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-6">
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
              <div className="border border-gray-200 dark:border-white/10 rounded-lg p-4 bg-gradient-to-br from-orange-50 to-pink-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <Label className="font-semibold text-gray-800 dark:text-[#e6e6ea] flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-[#D2FA46]" />
                      Foto profilo
                    </Label>
                    <p className="text-xs text-gray-600 dark:text-[#8a8a92] mt-1">
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
                    <span className="text-[10px] text-gray-500 dark:text-[#6a6a72] uppercase tracking-wide">
                      {formData.profile_image_enabled ? 'Pubblica' : 'Nascosta'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-4">
                  {/* Avatar preview */}
                  <div className="relative">
                    <div className={`w-24 h-24 rounded-full overflow-hidden ring-2 ${formData.profile_image_enabled && formData.profile_image_url ? 'ring-[#D2FA46]' : 'ring-gray-300 dark:ring-white/15'} bg-white dark:bg-[#0a0a0b] shadow-md`}>
                      {formData.profile_image_url ? (
                        <img
                          src={formData.profile_image_url}
                          alt="profilo"
                          className="w-full h-full object-cover"
                          data-testid="vendor-profile-image-preview"
                        />
                      ) : (
                        // Default vector mascot — brand-tinted, replaces the
                        // empty placeholder so the avatar slot is never blank.
                        <ConsultantAvatar
                          brandColor={vendor?.organization?.primary_color || '#F96815'}
                          className="w-full h-full"
                          testId="vendor-profile-image-default"
                        />
                      )}
                    </div>
                    {formData.profile_image_url && (
                      <button
                        type="button"
                        onClick={removeImage}
                        title="Rimuovi foto"
                        data-testid="vendor-profile-image-remove"
                        className="absolute -top-1 -right-1 bg-white dark:bg-[#131316] border border-gray-300 dark:border-white/15 rounded-full p-1 hover:bg-red-50 hover:border-red-300 shadow-sm"
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
                          ? 'border-gray-300 dark:border-white/15 bg-gray-100 dark:bg-[#1a1a1c] cursor-wait opacity-60'
                          : 'border-[#D2FA46] bg-white dark:bg-[#0a0a0b] hover:bg-orange-50 dark:hover:bg-[#D2FA46]/10 text-[#D2FA46]'}`}
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
                      onClick={() => { setPickerMode('select'); setPickerOpen(true); }}
                      className="ml-2 h-9 text-xs"
                      data-testid="vendor-profile-from-library"
                    >
                      <FolderOpen className="h-4 w-4 mr-1" />Scegli dalla libreria
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => { setPickerMode('manage'); setPickerOpen(true); }}
                      className="ml-1 h-9 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                      data-testid="vendor-manage-my-photos"
                      title="Gestisci ed elimina le foto che hai caricato"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />Le mie foto
                    </Button>
                    <p className="text-xs text-gray-500 dark:text-[#6a6a72] mt-2">
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

              <div className="bg-gray-50 dark:bg-[#0a0a0b] rounded-lg p-4 border border-gray-200 dark:border-white/10">
                <p className="text-sm font-medium text-gray-700 dark:text-[#a8a8b0] mb-2">
                  Link Social (gestiti dal negozio)
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-[#8a8a92]">WhatsApp:</span>{' '}
                    <span className="text-gray-900 dark:text-white">
                      {vendor?.whatsapp ? '✓ Configurato' : '✗ Non configurato'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-[#8a8a92]">Instagram:</span>{' '}
                    <span className="text-gray-900 dark:text-white">
                      {vendor?.instagram ? '✓ Configurato' : '✗ Non configurato'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-[#8a8a92]">Facebook:</span>{' '}
                    <span className="text-gray-900 dark:text-white">
                      {vendor?.facebook ? '✓ Configurato' : '✗ Non configurato'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-[#8a8a92]">Google Review:</span>{' '}
                    <span className="text-gray-900 dark:text-white">
                      {vendor?.google_review ? '✓ Configurato' : '✗ Non configurato'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-[#6a6a72] mt-2">
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
          if (pickerMode === 'manage') return;
          setFormData((prev) => ({ ...prev, profile_image_url: item.url }));
          toast.success('Foto selezionata. Clicca Salva per applicare.');
        }}
        kind="uploads"
        hidePostsTab
        mineOnly  /* Vendors only ever see their OWN uploads — never other vendors' profile pics */
        manageMode={pickerMode === 'manage'}
        title={pickerMode === 'manage' ? 'Le mie foto caricate' : 'Le mie foto'}
      />
    </div>
  );
};

// Single click-counter tile reused across the breakdown grid above.
// Centers the value with a brand-tinted color and a tiny label below.
const ClickStat = ({ color, label, value, testid }) => (
  <div className="text-center" data-testid={testid}>
    <p className="text-2xl font-bold tabular-nums" style={{ color }}>
      {value || 0}
    </p>
    <p className="text-xs text-gray-600 dark:text-[#8a8a92] truncate">{label}</p>
  </div>
);

export default VendorDashboard;