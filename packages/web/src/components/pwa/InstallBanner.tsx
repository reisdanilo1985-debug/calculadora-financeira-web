import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useStandalone } from '@/hooks/useStandalone';
import { dismissInstall, isInstallDismissed } from '@/lib/pwa';
import { IosInstallSheet } from './IosInstallSheet';

/**
 * Convite "Instalar aplicativo" — só no celular (`md:hidden`), fora do modo instalado
 * e enquanto não for dispensado (memória de 14 dias em localStorage).
 */
export function InstallBanner() {
  const standalone = useStandalone();
  const { canInstall, installed, iosSafari, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState<boolean>(isInstallDismissed);
  const [iosOpen, setIosOpen] = useState(false);

  if (standalone || installed || dismissed || !(canInstall || iosSafari)) return null;

  const onInstall = async () => {
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome === 'dismissed') dismiss();
      return;
    }
    setIosOpen(true);
  };

  const dismiss = () => {
    dismissInstall();
    setDismissed(true);
  };

  return (
    <>
      <div className="md:hidden mx-4 mt-3 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2.5 flex items-center gap-3 animate-fade-in">
        <Smartphone className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">Instalar o aplicativo</p>
          <p className="text-[11px] text-muted-foreground">Acesso rápido na tela inicial, em tela cheia.</p>
        </div>
        <button
          type="button"
          onClick={onInstall}
          className="shrink-0 flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:scale-95 transition-transform"
        >
          <Download className="h-3.5 w-3.5" />
          Instalar
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar convite de instalação"
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <IosInstallSheet open={iosOpen} onOpenChange={setIosOpen} />
    </>
  );
}
