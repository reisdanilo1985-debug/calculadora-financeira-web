/** Utilitários do modo app (PWA): detecção de plataforma e memória do convite de instalação. */

export const INSTALL_DISMISS_KEY = 'correcao-financeira:pwa-install-dismissed:v1';
const DISMISS_DAYS = 14;

/** Convite de instalação dispensado há menos de 14 dias? */
export function isInstallDismissed(): boolean {
  try {
    const raw = localStorage.getItem(INSTALL_DISMISS_KEY);
    if (!raw) return false;
    const t = Date.parse(raw);
    return Number.isFinite(t) && Date.now() - t < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(INSTALL_DISMISS_KEY, new Date().toISOString());
  } catch {
    /* armazenamento indisponível (modo privado) — ignora */
  }
}

/** App aberto em tela cheia (instalado na tela inicial). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ se apresenta como Mac, mas tem toque
  const iPadDesktopUA = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || iPadDesktopUA;
}

/** Safari no iOS: único navegador em que o "Adicionar à Tela de Início" instala o app. */
export function isIosSafari(): boolean {
  if (!isIos()) return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
}
