import React, { useEffect, useState } from 'react';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { OfflineBanner } from './components/pwa/OfflineBanner';
import { UpdateToast } from './components/pwa/UpdateToast';

/** Service worker só existe no build de produção (ou em dev com VITE_PWA_DEV=1). */
const PWA_ENABLED = import.meta.env.PROD || import.meta.env.VITE_PWA_DEV === '1';

/** Abas válidas do terminal (HomePage). */
const VALID_TABS = new Set([
  'calculadora',
  'comparador',
  'cambio',
  'ptax',
  'tesouraria',
  'opcoes',
  'wacc',
  'aposentadoria',
  'indices',
]);

interface Route {
  page: 'landing' | 'app';
  tab?: string;
}

/** Resolve a rota a partir do hash: `#/` → landing; `#/app` ou `#/app/:tab` → terminal. */
function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, ''); // remove "#/" inicial
  if (hash === 'app' || hash.startsWith('app/')) {
    const tab = hash.split('/')[1];
    return { page: 'app', tab: tab && VALID_TABS.has(tab) ? tab : undefined };
  }
  return { page: 'landing' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateToApp = (view: string) => {
    window.location.hash = `#/app/${VALID_TABS.has(view) ? view : 'calculadora'}`;
  };

  return (
    <>
      {route.page === 'app' ? <HomePage initialTab={route.tab} /> : <LandingPage onNavigate={navigateToApp} />}
      <OfflineBanner />
      {PWA_ENABLED && <UpdateToast />}
    </>
  );
}
