/**
 * Suporte a proxy corporativo para os fetchers de market data.
 *
 * O suporte nativo do axios a HTTP(S)_PROXY envia requisições https em forma
 * absoluta SEM túnel CONNECT — muitos proxies corporativos respondem 502.
 * Quando há proxy no ambiente, usamos `https-proxy-agent` (CONNECT) e
 * desligamos o handling interno do axios (`proxy: false`).
 *
 * Sem proxy no ambiente, devolve `{}` e nada muda (conexão direta).
 */

// v5 (CJS): export = createHttpsProxyAgent — compatível com moduleResolution clássica.
import createHttpsProxyAgent from 'https-proxy-agent';
import type { AxiosRequestConfig } from 'axios';

let cached: Pick<AxiosRequestConfig, 'proxy' | 'httpsAgent'> | null = null;

/** Config extra de axios para atravessar proxy corporativo via CONNECT. */
export function proxyConfig(): Pick<AxiosRequestConfig, 'proxy' | 'httpsAgent'> {
  if (cached) return cached;
  const url =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  cached = url ? { proxy: false, httpsAgent: createHttpsProxyAgent(url) } : {};
  return cached;
}
