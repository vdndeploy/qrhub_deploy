import { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, Building2, UserPlus, Users, KeyRound } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Organizations = () => {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(null); // org obj for "add user" dialog
  const [usersList, setUsersList] = useState([]);
  const [form, setForm] = useState({ name: '', primary_color: '#F96815' });
  const [userForm, setUserForm] = useState({ email: '', password: '', name: '' });
  const [pwdResetFor, setPwdResetFor] = useState(null); // user email being reset
  const [newPassword, setNewPassword] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

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
      setForm({ name: '', primary_color: '#F96815' });
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
          <p className="text-sm text-gray-600 mt-1">Gestisci i tenant della piattaforma QRHub</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-[#F96815] hover:bg-[#e05a0f]" data-testid="org-new-button">
          <Plus className="h-4 w-4 mr-2" />Nuova Organizzazione
        </Button>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Colore</TableHead>
              <TableHead>Utenti</TableHead>
              <TableHead>Negozi</TableHead>
              <TableHead>Venditori</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Nessuna organizzazione</TableCell></TableRow>
            ) : (
              orgs.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" style={{color: o.primary_color}} />
                      {o.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 font-mono">{o.slug}</TableCell>
                  <TableCell><div className="w-6 h-6 rounded border" style={{backgroundColor: o.primary_color}} /></TableCell>
                  <TableCell>{o.users_count}</TableCell>
                  <TableCell>{o.stores_count}</TableCell>
                  <TableCell>{o.vendors_count}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openUsers(o)}><Users className="h-4 w-4" /></Button>
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
              <Label>Colore primario</Label>
              <div className="flex gap-2 items-center">
                <Input type="color" value={form.primary_color} onChange={(e) => setForm({...form, primary_color: e.target.value})} className="w-16 h-10 cursor-pointer" />
                <Input value={form.primary_color} onChange={(e) => setForm({...form, primary_color: e.target.value})} placeholder="#F96815" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annulla</Button>
              <Button type="submit" className="bg-[#F96815] hover:bg-[#e05a0f]">Crea</Button>
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

          <form onSubmit={handleCreateUser} className="space-y-3 border rounded-lg p-3 bg-gray-50/50">
            <div className="text-sm font-medium flex items-center gap-2"><UserPlus className="h-4 w-4" />Aggiungi admin</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input type="email" placeholder="email@dominio.it" required value={userForm.email} onChange={(e) => setUserForm({...userForm, email: e.target.value})} data-testid="org-user-email" />
              <Input placeholder="Nome (opzionale)" value={userForm.name} onChange={(e) => setUserForm({...userForm, name: e.target.value})} />
              <Input type="password" placeholder="Password" required minLength={6} value={userForm.password} onChange={(e) => setUserForm({...userForm, password: e.target.value})} className="sm:col-span-2" data-testid="org-user-password" />
            </div>
            <Button type="submit" size="sm" className="bg-[#F96815] hover:bg-[#e05a0f]">Crea utente</Button>
          </form>

          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">Utenti esistenti ({usersList.length})</h4>
            {usersList.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Nessun utente. Crea il primo admin sopra.</p>
            ) : (
              <div className="space-y-2">
                {usersList.map(u => (
                  <div key={u.email} className="flex items-center justify-between border rounded p-2 text-sm">
                    <div>
                      <div className="font-medium">{u.email}</div>
                      <div className="text-xs text-gray-500">{u.name || '—'} · {u.role}</div>
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
              <p className="text-xs text-gray-500 mt-1">
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
