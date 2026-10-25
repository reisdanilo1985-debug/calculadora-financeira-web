/** Tipos do PWA: evento de instalação (Chrome/Android) e flag de app instalado no iOS. */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
  appinstalled: Event;
}

interface Navigator {
  /** Safari iOS: true quando aberto a partir da tela inicial. */
  standalone?: boolean;
}
