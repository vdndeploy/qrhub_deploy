import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, Building2, UserPlus, Users, KeyRound, ShieldCheck, ShieldAlert, ShieldX, Pencil, Upload, X as XIcon } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const GdprBadge = ({ gdpr }) => {
  if (!gdpr) return <span className="text-xs text-gray-400 dark:text-[#5a5a62]">—</span>;
  const { dpa_status, dpa_admins_accepted, dpa_admins_total, controller_fields_filled, controller_fields_required, controller_complete } = gdpr;

  let icon = ShieldX;
  let cls = 'bg-red-50 text-red-700 border-red-200';
  let label = 'DPA pending';
  if (dpa_status === 'accepted' && controller_complete) {
    icon = ShieldCheck;
    cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    label = `DPA OK · Titolare OK (${dpa_admins_accepted}/${dpa_admins_total})`;
  } else if (dpa_status === 'accepted') {
    icon = ShieldAlert;
    cls = 'bg-amber-50 text-amber-700 border-amber-200';
    label = `DPA OK (${dpa_admins_accepted}/${dpa_admins_total}) · Titolare incompleto`;
  }
  const Icon = icon;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border ${cls}`}
          title={`DPA ${dpa_admins_accepted}/${dpa_admins_total} admin · Titolare ${controller_fields_filled}/${controller_fields_required}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{controller_fields_filled}/{controller_fields_required}</span>
    </div>
  );
};

const Organizations = () => {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(null); // org obj for "add user" dialog
  const [usersList, setUsersList] = useState([]);
  const [form, setForm] = useState({ name: '', primary_color: '#D2FA46', brand_name: '', logo_url: '', logo_public_id: '' });
  const [userForm, setUserForm] = useState({ email: '', password: '', name: '' });
  const [pwdResetFor, setPwdResetFor] = useState(null); // user email being reset
  const [newPassword, setNewPassword] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [editOrg, setEditOrg] = useState(null); // org being edited
  const [editForm, setEditForm] = useState({ name: '', slug: '', brand_name: '', primary_color: '', logo_url: '', logo_public_id: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Upload helper used by both create and edit dialogs. Sends file under folder=uploads
  // and writes the resulting Cloudinary url/public_id back into the given setter.
  const handleLogoFile = async (e, setter) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Seleziona un file immagine');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Logo troppo grande (max 5MB)');
      e.target.value = '';
      return;
    }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'uploads');
      const { data } = await axios.post(`${API}/upload`, fd, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setter((prev) => ({ ...prev, logo_url: data.url, logo_public_id: data.public_id || '' }));
      toast.success('Logo caricato');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore upload logo');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const fetchOrgs = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/organizations`, { withCredentials: true });
      setOrgs(data);
    } catch (e) {
      toast.error('Errore caricamento organizzazioni');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrgs(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/organizations`, form, { withCredentials: true });
      toast.success('Organizzazione creata');
      setCreateOpen(false);
      setForm({ name: '', primary_color: '#D2FA46', brand_name: '', logo_url: '', logo_public_id: '' });
      fetchOrgs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Eliminare "${name}"? Tutti i dati (stores, vendors, posts, files, analytics) verranno persi.`)) return;
    try {
      await axios.delete(`${API}/organizations/${id}`, { withCredentials: true });
      toast.success('Organizzazione eliminata');
      fetchOrgs();
    } catch (e) {
      toast.error('Errore');
    }
  };

  const openUsers = async (org) => {
    setUserOpen(org);
    try {
      const { data } = await axios.get(`${API}/organizations/${org.id}/users`, { withCredentials: true });
      setUsersList(data);
    } catch (e) {
      toast.error('Errore caricamento utenti');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/organizations/${userOpen.id}/users`, {
        ...userForm,
        organization_id: userOpen.id
      }, { withCredentials: true });
      toast.success('Utente creato');
      setUserForm({ email: '', password: '', name: '' });
      openUsers(userOpen);
      fetchOrgs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore');
    }
  };

  const deleteUser = async (email) => {
    if (!window.confirm(`Eliminare l'utente ${email}?`)) return;
    try {
      await axios.delete(`${API}/organizations/users/${encodeURIComponent(email)}`, { withCredentials: true });
      toast.success('Utente eliminato');
      openUsers(userOpen);
      fetchOrgs();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
    }
  };

  const openEdit = (org) => {
    setEditOrg(org);
    setEditForm({
      name: org.name || '',
      slug: org.slug || '',
      brand_name: org.brand_name || '',
      primary_color: org.primary_color || '#D2FA46',
      logo_url: org.logo_url || '',
      logo_public_id: org.logo_public_id || '',
    });
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editOrg) return;
    const newSlug = (editForm.slug || '').trim();
    if (newSlug && newSlug !== editOrg.slug) {
      const ok = window.confirm(
        `Stai per cambiare lo slug da "${editOrg.slug}" a "${newSlug}".\n\n` +
        `Le URL pubbliche delle landing dei venditori cambieranno. Procedere?`
      );
      if (!ok) return;
    }
    setEditSubmitting(true);
    try {
      await axios.put(`${API}/organizations/${editOrg.id}`, {
        name: editForm.name,
        slug: newSlug || undefined,
        brand_name: editForm.brand_name,
        primary_color: editForm.primary_color,
        logo_url: editForm.logo_url,
        logo_public_id: editForm.logo_public_id,
      }, { withCredentials: true });
      toast.success('Organizzazione aggiornata');
      setEditOrg(null);
      fetchOrgs();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore salvataggio');
    } finally {
      setEditSubmitting(false);
    }
  };

  const submitPasswordReset = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('La password deve avere almeno 6 caratteri');
      return;
    }
    setPwdSubmitting(true);
    try {
      await axios.put(
        `${API}/organizations/users/${encodeURIComponent(pwdResetFor)}/password`,
        { password: newPassword },
        { withCredentials: true }
      );
      toast.success(`Password aggiornata per ${pwdResetFor}`);
      setPwdResetFor(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore reset password');
    } finally {
      setPwdSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-12">Caricamento...</div>;

  return (
    <div className="space-y-6" data-testid="organizations-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold">Organizzazioni</h2>
          <p className="text-sm text-gray-600 dark:text-[#8a8a92] mt-1">Gestisci i tenant della piattaforma QRHub</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]" data-testid="org-new-button">
          <Plus className="h-4 w-4 mr-2" />Nuova Organizzazione
        </Button>
      </div>

      <div className="bg-white dark:bg-[#131316] rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Colore</TableHead>
              <TableHead>Utenti</TableHead>
              <TableHead>Negozi</TableHead>
              <TableHead>Venditori</TableHead>
              <TableHead>GDPR</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">Nessuna organizzazione</TableCell></TableRow>
            ) : (
              orgs.map(o => (
                <TableRow key={o.id} data-testid={`org-row-${o.id}`}>
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" style={{color: o.primary_color}} />
                      {o.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 dark:text-[#6a6a72] font-mono">{o.slug}</TableCell>
                  <TableCell><div className="w-6 h-6 rounded border" style={{backgroundColor: o.primary_color}} /></TableCell>
                  <TableCell>{o.users_count}</TableCell>
                  <TableCell>{o.stores_count}</TableCell>
                  <TableCell>{o.vendors_count}</TableCell>
                  <TableCell data-testid={`org-gdpr-${o.id}`}>
                    <GdprBadge gdpr={o.gdpr} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="outline" size="sm" onClick={() => openEdit(o)} title="Modifica nome / slug" data-testid={`org-edit-${o.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openUsers(o)} className="ml-1"><Users className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(o.id, o.name)} className="ml-1"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create org */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle>Nuova Organizzazione</DialogTitle>
            <DialogDescription>Crea un nuovo tenant. Dopo, aggiungi gli utenti admin di quella organizzazione.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="Es. Nome Azienda" data-testid="org-name-input" />
            </div>
            <div>
              <Label>Brand name (display, opzionale)</Label>
              <Input value={form.brand_name} onChange={(e) => setForm({...form, brand_name: e.target.value})} placeholder="Es. Nome Brand" maxLength={200} data-testid="org-create-brand-input" />
              <p className="text-xs text-gray-500 dark:text-[#6a6a72] mt-1">Nome mostrato nelle landing dei venditori. Se vuoto, usa il nome dell'organizzazione.</p>
            </div>
            <div>
              <Label>Logo (opzionale)</Label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded border bg-gray-50 dark:bg-[#0a0a0b] flex items-center justify-center overflow-hidden flex-shrink-0">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="logo" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="h-6 w-6 text-gray-300" />
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button type="button" variant="outline" size="sm"
                          onClick={() => document.getElementById('org-create-logo-input').click()}
                          disabled={uploadingLogo}
                          data-testid="org-create-logo-upload">
                    <Upload className={`h-4 w-4 mr-1 ${uploadingLogo ? 'animate-pulse' : ''}`} />
                    {uploadingLogo ? 'Caricamento…' : (form.logo_url ? 'Cambia logo' : 'Carica logo')}
                  </Button>
                  {form.logo_url && (
                    <Button type="button" variant="ghost" size="sm"
                            onClick={() => setForm({...form, logo_url: '', logo_public_id: ''})}
                            data-testid="org-create-logo-remove">
                      <XIcon className="h-4 w-4 mr-1" />Rimuovi
                    </Button>
                  )}
                  <input id="org-create-logo-input" type="file" accept="image/*" className="hidden"
                          onChange={(e) => handleLogoFile(e, setForm)} />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-[#6a6a72] mt-1">PNG/JPG/SVG con sfondo trasparente. Max 5MB. Compare nell'header pubblico delle landing.</p>
            </div>
            <div>
              <Label>Colore primario</Label>
              <div className="flex gap-2 items-center">
                <Input type="color" value={form.primary_color} onChange={(e) => setForm({...form, primary_color: e.target.value})} className="w-16 h-10 cursor-pointer" />
                <Input value={form.primary_color} onChange={(e) => setForm({...form, primary_color: e.target.value})} placeholder="#D2FA46" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annulla</Button>
              <Button type="submit" className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]">Crea</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manage users */}
      <Dialog open={!!userOpen} onOpenChange={(v) => !v && setUserOpen(null)}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Utenti di "{userOpen?.name}"</DialogTitle>
            <DialogDescription>Aggiungi admin che possono gestire negozi, venditori e annunci di questa organizzazione.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-3 border rounded-lg p-3 bg-gray-50 dark:bg-[#0a0a0b]/50">
            <div className="text-sm font-medium flex items-center gap-2"><UserPlus className="h-4 w-4" />Aggiungi admin</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input type="email" placeholder="email@dominio.it" required value={userForm.email} onChange={(e) => setUserForm({...userForm, email: e.target.value})} data-testid="org-user-email" />
              <Input placeholder="Nome (opzionale)" value={userForm.name} onChange={(e) => setUserForm({...userForm, name: e.target.value})} />
              <Input type="password" placeholder="Password" required minLength={6} value={userForm.password} onChange={(e) => setUserForm({...userForm, password: e.target.value})} className="sm:col-span-2" data-testid="org-user-password" />
            </div>
            <Button type="submit" size="sm" className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]">Crea utente</Button>
          </form>

          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">Utenti esistenti ({usersList.length})</h4>
            {usersList.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-[#6a6a72] text-center py-4">Nessun utente. Crea il primo admin sopra.</p>
            ) : (
              <div className="space-y-2">
                {usersList.map(u => (
                  <div key={u.email} className="flex items-center justify-between border rounded p-2 text-sm">
                    <div>
                      <div className="font-medium">{u.email}</div>
                      <div className="text-xs text-gray-500 dark:text-[#6a6a72]">{u.name || '—'} · {u.role}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon"
                              onClick={() => { setPwdResetFor(u.email); setNewPassword(''); }}
                              title="Cambia password"
                              data-testid={`reset-pwd-${u.email}`}>
                        <KeyRound className="h-4 w-4 text-indigo-600" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteUser(u.email)}
                              title="Elimina utente">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit organization (name + slug) */}
      <Dialog open={!!editOrg} onOpenChange={(v) => !v && setEditOrg(null)}>
        <DialogContent className="max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-[#D2FA46]" />
              Modifica "{editOrg?.name}"
            </DialogTitle>
            <DialogDescription>
              <strong>Attenzione</strong>: cambiando lo <code>slug</code> cambia il path pubblico delle landing
              e le URL dei venditori. Comunicalo agli amministratori dell'organizzazione prima di salvare.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-3" data-testid="org-edit-form">
            <div>
              <Label>Nome organizzazione *</Label>
              <Input value={editForm.name}
                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      placeholder="Es. Nome Azienda SRL"
                      required maxLength={200}
                      data-testid="org-edit-name" />
            </div>
            <div>
              <Label>Slug (kebab-case, solo a-z 0-9 e trattini)</Label>
              <Input value={editForm.slug}
                      onChange={(e) => setEditForm({...editForm,
                          slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-')})}
                      placeholder="nome-azienda"
                      className="font-mono"
                      data-testid="org-edit-slug" />
              <p className="text-xs text-gray-500 dark:text-[#6a6a72] mt-1">Univoco tra tutti i tenant. Deve essere identificativo, breve.</p>
            </div>
            <div>
              <Label>Brand name (display)</Label>
              <Input value={editForm.brand_name}
                      onChange={(e) => setEditForm({...editForm, brand_name: e.target.value})}
                      placeholder="Es. Nome Brand"
                      maxLength={200}
                      data-testid="org-edit-brand" />
            </div>
            <div>
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded border bg-gray-50 dark:bg-[#0a0a0b] flex items-center justify-center overflow-hidden flex-shrink-0">
                  {editForm.logo_url ? (
                    <img src={editForm.logo_url} alt="logo" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="h-6 w-6 text-gray-300" />
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button type="button" variant="outline" size="sm"
                          onClick={() => document.getElementById('org-edit-logo-input').click()}
                          disabled={uploadingLogo}
                          data-testid="org-edit-logo-upload">
                    <Upload className={`h-4 w-4 mr-1 ${uploadingLogo ? 'animate-pulse' : ''}`} />
                    {uploadingLogo ? 'Caricamento…' : (editForm.logo_url ? 'Cambia' : 'Carica')}
                  </Button>
                  {editForm.logo_url && (
                    <Button type="button" variant="ghost" size="sm"
                            onClick={() => setEditForm({...editForm, logo_url: '', logo_public_id: ''})}
                            data-testid="org-edit-logo-remove">
                      <XIcon className="h-4 w-4 mr-1" />Rimuovi
                    </Button>
                  )}
                  <input id="org-edit-logo-input" type="file" accept="image/*" className="hidden"
                          onChange={(e) => handleLogoFile(e, setEditForm)} />
                </div>
              </div>
            </div>
            <div>
              <Label>Colore primario</Label>
              <div className="flex items-center gap-2">
                <Input type="color" value={editForm.primary_color}
                        onChange={(e) => setEditForm({...editForm, primary_color: e.target.value})}
                        className="w-16 h-10 p-1" />
                <Input value={editForm.primary_color}
                        onChange={(e) => setEditForm({...editForm, primary_color: e.target.value})}
                        className="font-mono" />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setEditOrg(null)}>Annulla</Button>
              <Button type="submit" disabled={editSubmitting}
                      className="bg-[#D2FA46] hover:bg-[#bce63d] text-[#0a0a0b]"
                      data-testid="org-edit-save">
                {editSubmitting ? 'Salvataggio…' : 'Salva modifiche'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Password reset dialog */}
      <Dialog open={!!pwdResetFor} onOpenChange={(v) => !v && setPwdResetFor(null)}>
        <DialogContent className="max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-indigo-600" />
              Cambia password
            </DialogTitle>
            <DialogDescription>
              Imposta una nuova password per <span className="font-mono font-medium">{pwdResetFor}</span>.
              L'utente dovrà usare questa password al prossimo login.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPasswordReset} className="space-y-3">
            <div>
              <Label htmlFor="new-pwd">Nuova password (min 6 caratteri)</Label>
              <Input id="new-pwd" type="text" autoFocus required minLength={6}
                     value={newPassword}
                     onChange={(e) => setNewPassword(e.target.value)}
                     placeholder="Es. NuovaPass2026!"
                     className="font-mono"
                     data-testid="new-password-input" />
              <p className="text-xs text-gray-500 dark:text-[#6a6a72] mt-1">
                Suggerimento: comunica all'utente la nuova password tramite un canale sicuro.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline"
                      onClick={() => setPwdResetFor(null)}>
                Annulla
              </Button>
              <Button type="submit" disabled={pwdSubmitting || newPassword.length < 6}
                      className="bg-indigo-600 hover:bg-indigo-700"
                      data-testid="submit-password-reset">
                {pwdSubmitting ? 'Aggiorno...' : 'Aggiorna password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Organizations;
