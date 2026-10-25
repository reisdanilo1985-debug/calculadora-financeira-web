import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useStandalone } from '@/hooks/useStandalone';
import { IosInstallSheet } from './IosInstallSheet';

/** Botão compacto "Instalar" para o cabeçalho da landing — só no celular, quando a instalação é possível. */
export function InstallButton() {
  const standalone = useStandalone();
  const { canInstall, installed, iosSafari, promptInstall } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);

  if (standalone || installed || !(canInstall || iosSafari)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (canInstall ? promptInstall() : setIosOpen(true))}
        aria-label="Instalar aplicativo"
        title="Instalar aplicativo"
        className="md:hidden h-9 w-9 flex items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary active:scale-95 transition-transform"
      >
        <Download className="h-4 w-4" />
      </button>
      <IosInstallSheet open={iosOpen} onOpenChange={setIosOpen} />
    </>
  );
}
