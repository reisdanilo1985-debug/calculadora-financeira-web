import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/** Faixa fina abaixo do cabeçalho (ticker 32px + navbar 64px) enquanto o aparelho está sem conexão. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 z-40 bg-amber-500/15 border-b border-amber-500/30 backdrop-blur-md"
      style={{ top: 'calc(96px + env(safe-area-inset-top))' }}
    >
      <p className="mx-auto max-w-[1600px] px-4 py-1.5 text-[11px] sm:text-xs text-amber-200 flex items-center gap-2">
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        <span>
          Sem conexão — exibindo dados em cache. Novos cálculos ficam indisponíveis até a conexão voltar.
        </span>
      </p>
    </div>
  );
}
