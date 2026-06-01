import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3, Users, Settings as SettingsIcon, Store, FolderOpen,
  Building2, Sliders, FileText, Shield, Megaphone, Menu, X,
} from 'lucide-react';
import {
  Sheet, SheetContent, SheetTrigger, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

/**
 * Mobile drawer navigation — replaces the cramped horizontal scrollable
 * tab strip on small viewports.
 *
 * Each link is a full-width tappable row (≥ 56px height), tinted accent on
 * active, with the same iconography as the desktop nav for consistency.
 *
 * Desktop (md and up) keeps the inline nav rendered by the parent — this
 * component is rendered with `md:hidden` so it does NOT duplicate clicks.
 */
const ITEMS_ORG_ADMIN = [
  { path: '/dashboard',                exact: true,  icon: BarChart3,    label: 'Panoramica' },
  { path: '/dashboard/stores',         icon: Store,        label: 'Negozi' },
  { path: '/dashboard/vendors',        icon: Users,        label: 'Venditori' },
  { path: '/dashboard/posts',          icon: Megaphone,    label: 'Annunci',  badge: 'NEW' },
  { path: '/dashboard/media',          icon: FolderOpen,   label: 'Media' },
  { path: '/dashboard/organization',   icon: Sliders,      label: 'Organizzazione' },
];

const ITEMS_SUPER = [
  { path: '/dashboard/organizations',  icon: Building2,    label: 'Organizzazioni' },
  { path: '/dashboard/settings',       icon: SettingsIcon, label: 'Deploy' },
];

const ITEMS_COMMON = [
  { path: '/dashboard/legal',          icon: FileText,     label: 'Note Legali' },
  { path: '/dashboard/audit',          icon: Shield,       label: 'Audit' },
  { path: '/dashboard/account',        icon: Users,        label: 'Account' },
];

const MobileNavDrawer = ({ isSuper, dpaNeeded }) => {
  const [open, setOpen] = React.useState(false);
  const location = useLocation();

  const items = [
    ...(isSuper ? ITEMS_SUPER : ITEMS_ORG_ADMIN),
    ...ITEMS_COMMON,
  ];

  const isActive = (item) => {
    if (item.exact) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  };

  // Find the current page label so the trigger shows it instead of just "Menu".
  const current = items.find(isActive);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="md:hidden flex items-center gap-2 px-3 h-10 min-w-[44px]"
          data-testid="mobile-nav-trigger"
          aria-label="Apri menu"
        >
          <Menu className="h-5 w-5" />
          {current && (
            <span className="text-sm font-semibold truncate max-w-[120px]">
              {current.label}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[88%] max-w-[340px] p-0 bg-white dark:bg-[#131316] border-r border-gray-200 dark:border-white/10"
        data-testid="mobile-nav-drawer"
      >
        <SheetTitle className="sr-only">Menu di navigazione</SheetTitle>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-[#D2FA46] flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="w-5 h-5">
                  <rect x="3" y="3" width="7" height="7" rx="1.2"/>
                  <rect x="14" y="3" width="7" height="7" rx="1.2"/>
                  <rect x="3" y="14" width="7" height="7" rx="1.2"/>
                  <line x1="14" y1="14" x2="21" y2="14"/>
                  <line x1="14" y1="18" x2="18" y2="18"/>
                  <line x1="14" y1="21" x2="21" y2="21"/>
                </svg>
              </div>
              <div>
                <p className="text-base font-black tracking-tight text-gray-900 dark:text-white leading-tight">QRHub</p>
                <p className="text-[11px] text-gray-500 dark:text-[#6a6a72]">{isSuper ? 'Super Admin' : 'Admin'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
              aria-label="Chiudi"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-[#8a8a92]" />
            </button>
          </div>

          {dpaNeeded && !isSuper && (
            <Link
              to="/dashboard/dpa"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 m-3 p-3 rounded-xl bg-amber-50 border-l-4 border-amber-400 text-amber-900 text-xs"
              data-testid="mobile-dpa-banner"
            >
              <span className="font-semibold">Devi accettare il DPA per attivare le landing</span>
            </Link>
          )}

          <nav className="flex-1 overflow-y-auto py-2" aria-label="Navigazione principale">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3.5 mx-2 rounded-xl
                    min-h-[56px] transition-colors
                    ${active
                      ? 'bg-[#D2FA46] text-[#0a0a0b] font-semibold'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5'
                    }
                  `}
                  data-testid={`mobile-nav-${item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-base">{item.label}</span>
                  {item.badge && (
                    <span className={`ml-auto inline-flex items-center rounded-full text-[10px] font-bold leading-none px-2 py-1 uppercase tracking-wider ${
                      active ? 'bg-[#0a0a0b] text-[#D2FA46]' : 'bg-[#D2FA46] text-[#0a0a0b]'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNavDrawer;
