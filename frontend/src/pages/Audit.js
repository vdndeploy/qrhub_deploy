import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, RefreshCw, RotateCcw, Trash2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PAGE_SIZE = 50;

const ACTION_LABELS = {
  vendor_analytics_reset: { label: 'Reset statistiche', icon: RotateCcw, color: 'text-amber-500' },
  vendor_deleted: { label: 'Vendor eliminato', icon: Trash2, color: 'text-red-500' },
};

const fmtDate = (iso) => {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso.slice(0, 16).replace('T', ' '); }
};

const Audit = () => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/audit`, { params: { skip, limit: PAGE_SIZE }, withCredentials: true });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error('Errore caricamento audit log');
    } finally {
      setLoading(false);
    }
  }, [skip]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  return (
    <div className="space-y-6" data-testid="audit-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <Shield className="h-7 w-7 text-[#D2FA46]" />
            Audit Log
          </h2>
          <p className="text-sm text-gray-600 dark:text-[#8a8a92] mt-1">
            Registro delle azioni amministrative sensibili — utile in caso di contestazioni.
          </p>
        </div>
        <Button variant="outline" onClick={fetchAudit}>
          <RefreshCw className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Aggiorna</span>
        </Button>
      </div>

      <div className="relative overflow-hidden bg-white dark:bg-[#131316] rounded-3xl border border-gray-200 dark:border-white/10 shadow-sm">
        {loading ? (
          <div className="text-center py-12 text-gray-500 dark:text-[#6a6a72]">Caricamento...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-[#6a6a72]">
            <Shield className="h-10 w-10 mx-auto mb-3 text-gray-300 dark:text-[#3a3a42]" />
            Nessuna azione registrata
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Azione</TableHead>
                  <TableHead>Eseguita da</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Dettagli</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const meta = ACTION_LABELS[it.action] || { label: it.action, icon: ArrowRight, color: 'text-gray-500' };
                  const Icon = meta.icon;
                  const deleted = it.metadata?.deleted_count;
                  return (
                    <TableRow key={it.id} data-testid={`audit-row-${it.id}`}>
                      <TableCell className="text-xs whitespace-nowrap text-gray-700 dark:text-[#a8a8b0]">{fmtDate(it.timestamp)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${meta.color}`} />
                          <span className="text-sm font-medium">{meta.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{it.actor_email || '—'}</div>
                        {it.actor_role && <Badge variant="outline" className="text-[10px] mt-0.5 capitalize">{it.actor_role.replace('_', ' ')}</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{it.target_label || it.target_id || '—'}</div>
                        {it.target_type && <span className="text-[11px] text-gray-500 dark:text-[#6a6a72] capitalize">{it.target_type}</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs text-gray-600 dark:text-[#8a8a92]">
                        {typeof deleted === 'number' && (
                          <span>{deleted} eventi cancellati</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex justify-center items-center gap-3">
          <Button variant="outline" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>← Precedente</Button>
          <span className="text-sm text-gray-600 dark:text-[#8a8a92]">{skip + 1}–{Math.min(skip + PAGE_SIZE, total)} di {total}</span>
          <Button variant="outline" disabled={skip + PAGE_SIZE >= total} onClick={() => setSkip(skip + PAGE_SIZE)}>Successiva →</Button>
        </div>
      )}
    </div>
  );
};

export default Audit;
