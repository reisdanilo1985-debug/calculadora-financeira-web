import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

/**
 * Registra o service worker e avisa quando há uma versão nova publicada.
 * O SW novo fica em espera até o usuário tocar em "Atualizar" (registerType: 'prompt').
 */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Verifica atualização a cada hora enquanto o app fica aberto
      if (registration) setInterval(() => registration.update(), HOUR);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // inset-x + mx-auto (e não translate): a animação fade-in sobrescreve `transform`
      className="fixed inset-x-4 mx-auto z-[70] max-w-sm rounded-lg border border-primary/30 bg-popover shadow-2xl animate-fade-in bottom-[calc(72px+env(safe-area-inset-bottom))] md:bottom-6"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <RefreshCw className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Nova versão disponível</p>
          <p className="text-xs text-muted-foreground">Atualize para receber as últimas correções.</p>
        </div>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Atualizar
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Depois"
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
