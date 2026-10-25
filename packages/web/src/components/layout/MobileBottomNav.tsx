import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { NAV_ITEMS, PRIMARY_TABS } from '@/lib/navItems';

/** Altura da barra (sem a área segura inferior). Usada também no espaçador da HomePage. */
export const BOTTOM_NAV_HEIGHT = 56;

interface MobileBottomNavProps {
  activeTab: string;
  onSelect: (key: string) => void;
  /** Abre o menu lateral com as demais seções. */
  onMore: () => void;
}

/** Barra de abas fixa no rodapé — só no celular (`md:hidden`). */
export function MobileBottomNav({ activeTab, onSelect, onMore }: MobileBottomNavProps) {
  const items = NAV_ITEMS.filter(i => PRIMARY_TABS.includes(i.key));
  const moreActive = !PRIMARY_TABS.includes(activeTab);

  const itemClass = (active: boolean) =>
    `w-full h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium leading-none transition-colors active:scale-95 ${
      active ? 'text-primary' : 'text-muted-foreground'
    }`;

  return (
    <nav
      aria-label="Navegação principal"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/95 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5" style={{ height: BOTTOM_NAV_HEIGHT }}>
        {items.map(({ key, short, label, icon: Icon }) => {
          const active = activeTab === key;
          return (
            <li key={key} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={itemClass(active)}
              >
                <Icon className={`h-5 w-5 ${active ? 'stroke-[2.25]' : ''}`} />
                <span className="truncate max-w-full px-1">{short}</span>
              </button>
            </li>
          );
        })}
        <li className="min-w-0">
          <button
            type="button"
            onClick={onMore}
            aria-label="Mais seções"
            aria-haspopup="menu"
            className={itemClass(moreActive)}
          >
            <MoreHorizontal className={`h-5 w-5 ${moreActive ? 'stroke-[2.25]' : ''}`} />
            <span className="truncate max-w-full px-1">Mais</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
