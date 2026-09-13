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
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import type { AxiosRequestConfig } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as tls from 'tls';

function proxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  );
}

/**
 * CA extra para hosts em que o proxy corporativo faz interceptação TLS
 * (ex.: Yahoo Finance — cert reassinado por CA interna que o Windows confia
 * mas o bundle Mozilla do Node não). Lê NODE_EXTRA_CA_CERTS se definida, ou
 * `%USERPROFILE%\corp-ca.pem` (exportada do cert store do Windows).
 * Sem arquivo → undefined e o TLS segue com as CAs padrão do Node.
 *
 * Retorna a CA corporativa JUNTO com as raízes padrão do Node: a opção `ca`
 * do TLS substitui (não complementa) o bundle default.
 */
function extraCa(): string[] | undefined {
  const candidates = [
    process.env.NODE_EXTRA_CA_CERTS,
    path.join(os.homedir(), 'corp-ca.pem'),
  ];
  for (const file of candidates) {
    try {
      if (file && fs.existsSync(file)) {
        return [...tls.rootCertificates, fs.readFileSync(file, 'utf8')];
      }
    } catch {
      /* segue para o próximo candidato */
    }
  }
  return undefined;
}

let cached: Pick<AxiosRequestConfig, 'proxy' | 'httpsAgent'> | null = null;

/** Config extra de axios para atravessar proxy corporativo via CONNECT. */
export function proxyConfig(): Pick<AxiosRequestConfig, 'proxy' | 'httpsAgent'> {
  if (cached) return cached;
  const url = proxyUrl();
  cached = url ? { proxy: false, httpsAgent: createHttpsProxyAgent(url) } : {};
  return cached;
}

type FetchProxyConfig = { fetch?: typeof undiciFetch };

let cachedFetch: FetchProxyConfig | null = null;

/**
 * Config equivalente para libs baseadas em `fetch` (ex.: yahoo-finance2 v3).
 * O fetch nativo do Node não lê HTTP(S)_PROXY; injetamos um fetch do undici
 * com ProxyAgent (CONNECT) já embutido — o dispatcher vai DENTRO do fetch
 * (o schema de opções do yahoo-finance2 rejeita `dispatcher` em fetchOptions)
 * e vem do MESMO pacote undici, sem misturar versões com o embutido no Node.
 */
export function fetchProxyConfig(): FetchProxyConfig {
  if (cachedFetch) return cachedFetch;
  const url = proxyUrl();
  if (!url) {
    cachedFetch = {};
  } else {
    const ca = extraCa();
    const dispatcher = new ProxyAgent({
      uri: url,
      ...(ca ? { requestTls: { ca } } : {}),
    });
    const proxiedFetch: typeof undiciFetch = (input, init) =>
      undiciFetch(input, { ...init, dispatcher });
    cachedFetch = { fetch: proxiedFetch };
  }
  return cachedFetch;
}
