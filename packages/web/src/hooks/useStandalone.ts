import { useEffect, useState } from 'react';
import { isStandalone } from '@/lib/pwa';

/** true quando o app está aberto em tela cheia (instalado na tela inicial). */
export function useStandalone(): boolean {
  const [standalone, setStandalone] = useState<boolean>(isStandalone);

  useEffect(() => {
    const mq = window.matchMedia?.('(display-mode: standalone)');
    if (!mq) return;
    const onChange = () => setStandalone(isStandalone());
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return standalone;
}
