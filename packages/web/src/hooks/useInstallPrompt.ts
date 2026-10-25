import { useCallback, useEffect, useState } from 'react';
import { isIosSafari } from '@/lib/pwa';

/**
 * Convite de instalação do PWA.
 * - Chrome/Android (e desktop): captura `beforeinstallprompt` e expõe `promptInstall()`.
 * - Safari iOS não dispara o evento: `iosSafari` indica que o caminho é "Adicionar à Tela de Início".
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault(); // o convite passa a ser mostrado pela UI do app
      setDeferred(e);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome;
  }, [deferred]);

  return {
    canInstall: deferred !== null,
    installed,
    iosSafari: isIosSafari(),
    promptInstall,
  };
}
