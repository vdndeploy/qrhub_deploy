/* eslint-disable react/prop-types */
/**
 * PushBroadcastDialog — admin-only modal for "Lancia messaggio offerta".
 * Sends a one-off web push without creating an announcement on the carousel
 * (use when you want a flash sale notification with no permanent post).
 *
 * Scope:
 *   - vendor_id provided → push reaches that vendor's subscribers + the
 *     org-wide subscribers (broadcast_push handles the OR).
 *   - vendor_id empty    → org-wide push (all subs of the admin's org).
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Megaphone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export const PushBroadcastDialog = ({ open, onOpenChange, vendors = [] }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/');
  const [vendorId, setVendorId] = useState('all');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Titolo e messaggio sono obbligatori');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        url: url.trim() || '/',
      };
      if (vendorId && vendorId !== 'all') payload.vendor_id = vendorId;
      const { data } = await axios.post(`${API}/push/broadcast`, payload, { withCredentials: true });
      toast.success(`Push inviata a ${data.sent} dispositivi${data.cleaned_stale ? ` • ${data.cleaned_stale} scaduti puliti` : ''}`);
      // Reset form so the next broadcast starts fresh
      setTitle(''); setBody(''); setUrl('/'); setVendorId('all');
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Invio fallito');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="push-broadcast-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-amber-600" />
            Lancia messaggio offerta
          </DialogTitle>
          <DialogDescription>
            Invia una notifica push istantanea agli iscritti. Non crea un annuncio sulla landing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Destinatari</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger className="mt-1" data-testid="push-broadcast-vendor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli iscritti dell&apos;organizzazione</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Titolo notifica</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Offerta lampo WindTre"
              maxLength={80}
              data-testid="push-broadcast-title"
            />
          </div>

          <div>
            <Label>Messaggio</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Es. 50€ di sconto su tutte le offerte fibra solo oggi!"
              maxLength={160}
              rows={3}
              data-testid="push-broadcast-body"
            />
            <p className="text-[11px] text-gray-500 mt-1">{body.length}/160 caratteri</p>
          </div>

          <div>
            <Label>Link al tap (opzionale)</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/v/vendor-id o URL completo"
              maxLength={400}
              data-testid="push-broadcast-url"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Dove portare l&apos;utente quando tocca la notifica. Default: homepage.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Annulla</Button>
          <Button
            onClick={send}
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-600 text-white"
            data-testid="push-broadcast-send"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Megaphone className="h-4 w-4 mr-1.5" />}
            Invia notifica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PushBroadcastDialog;
