import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/**
 * Gera os ícones PNG do PWA a partir de public/icon.svg.
 * Uso (na pasta packages/web): npx -y @vite-pwa/assets-generator@1
 * Saída: public/pwa-64x64.png, pwa-192x192.png, pwa-512x512.png,
 *        maskable-icon-512x512.png, apple-touch-icon-180x180.png, favicon.ico
 */
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Maskable: fundo navy sólido e padding para o símbolo ficar na zona segura (80% central)
    maskable: { sizes: [512], padding: 0.3, resizeOptions: { background: '#0b1326' } },
    // iOS não aceita transparência no ícone da tela inicial
    apple: { sizes: [180], padding: 0.3, resizeOptions: { background: '#0b1326' } },
  },
  images: ['public/icon.svg'],
});
