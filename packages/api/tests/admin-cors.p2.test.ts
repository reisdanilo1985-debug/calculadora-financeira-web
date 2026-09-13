/**
 * E10 (auditoria 2026-09-12; casos V-ADM-1a, V-ADM-1b) — refresh administrativo
 * com credencial, limite por operação, deduplicação e CORS sem credenciais com
 * lista de origens.
 *
 * SGS simulado com msw; SQLite ':memory:'.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { http, HttpResponse } from 'msw';
import { server } from './setup';
import { createApp } from '../src/app';
import { closeDB } from '../src/services/DatabaseService';

const TOKEN = 'token-de-teste-com-mais-de-16-caracteres';
const HEADER = 'x-admin-token';

function simuladorSgsMensal(atrasoMs = 0) {
  const reqs: string[] = [];
  const handler = http.get(/https:\/\/api\.bcb\.gov\.br\/dados\/serie\/bcdata\.sgs\.(\d+)\/dados/, async ({ request }) => {
    const url = new URL(request.url);
    reqs.push(url.pathname);
    if (atrasoMs) await new Promise(r => setTimeout(r, atrasoMs));
    return HttpResponse.json([
      { data: '01/01/2025', valor: '0.27' },
      { data: '01/02/2025', valor: '1.06' },
    ]);
  });
  return { handler, reqs };
}

const envOriginal = {
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  DISABLE_RATE_LIMIT: process.env.DISABLE_RATE_LIMIT,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  CORS_STRICT: process.env.CORS_STRICT,
  DATABASE_PATH: process.env.DATABASE_PATH,
};

function restaurar(chave: keyof typeof envOriginal) {
  if (envOriginal[chave] === undefined) delete process.env[chave];
  else process.env[chave] = envOriginal[chave];
}

beforeAll(() => {
  closeDB();
  process.env.DATABASE_PATH = ':memory:';
});
beforeEach(() => closeDB());
afterEach(() => {
  restaurar('ADMIN_TOKEN');
  restaurar('DISABLE_RATE_LIMIT');
  restaurar('CORS_ORIGIN');
  restaurar('CORS_STRICT');
});
afterAll(() => {
  closeDB();
  restaurar('DATABASE_PATH');
});

describe('E10 — POST /api/indices/:tipo/refresh exige credencial administrativa', () => {
  it('sem ADMIN_TOKEN no servidor → 503 "refresh administrativo desabilitado", sem consultar a fonte', async () => {
    delete process.env.ADMIN_TOKEN;
    const sim = simuladorSgsMensal();
    server.use(sim.handler);

    const r = await request(createApp()).post('/api/indices/IGPM/refresh').set(HEADER, 'qualquer');

    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/Refresh administrativo desabilitado/);
    expect(sim.reqs).toHaveLength(0);
  });

  it('V-ADM-1b — sem credencial → 401', async () => {
    process.env.ADMIN_TOKEN = TOKEN;
    const sim = simuladorSgsMensal();
    server.use(sim.handler);

    const r = await request(createApp()).post('/api/indices/CDI/refresh').send({});

    expect([401, 403]).toContain(r.status);
    expect(r.status).toBe(401);
    expect(sim.reqs).toHaveLength(0);
  });

  it('credencial errada → 403, sem consultar a fonte', async () => {
    process.env.ADMIN_TOKEN = TOKEN;
    const sim = simuladorSgsMensal();
    server.use(sim.handler);

    const r = await request(createApp()).post('/api/indices/IGPM/refresh').set(HEADER, `${TOKEN}x`);

    expect(r.status).toBe(403);
    expect(sim.reqs).toHaveLength(0);
  });

  it('credencial correta → 200 com o refresh executado', async () => {
    process.env.ADMIN_TOKEN = TOKEN;
    const sim = simuladorSgsMensal();
    server.use(sim.handler);

    const r = await request(createApp()).post('/api/indices/IGPM/refresh').set(HEADER, TOKEN);

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, inserted: 2, deduplicated: false });
    expect(sim.reqs).toHaveLength(1);
  });

  it('tipo não suportado → 400 (validado antes da credencial)', async () => {
    delete process.env.ADMIN_TOKEN;
    const r = await request(createApp()).post('/api/indices/PREFIXADA/refresh');
    expect(r.status).toBe(400);
  });

  it('refresh simultâneo do mesmo índice: uma única carga; a outra resposta vem deduplicada', async () => {
    process.env.ADMIN_TOKEN = TOKEN;
    const sim = simuladorSgsMensal(150);
    server.use(sim.handler);
    const app = createApp();

    const [a, b] = await Promise.all([
      request(app).post('/api/indices/INCC/refresh').set(HEADER, TOKEN),
      request(app).post('/api/indices/INCC/refresh').set(HEADER, TOKEN),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(sim.reqs).toHaveLength(1);
    expect([a.body.deduplicated, b.body.deduplicated].sort()).toEqual([false, true]);
    expect(a.body.inserted).toBe(b.body.inserted);
  });

  it('limite por operação: 4ª execução em 10 min → 429 com Retry-After; chamadas sem credencial não consomem a cota', async () => {
    process.env.ADMIN_TOKEN = TOKEN;
    process.env.DISABLE_RATE_LIMIT = '0';
    server.use(simuladorSgsMensal().handler);
    const app = createApp();

    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/api/indices/SELIC_META/refresh')).status).toBe(401);
    }
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post('/api/indices/IPCA/refresh').set(HEADER, TOKEN)).status).toBe(200);
    }
    const bloqueado = await request(app).post('/api/indices/IPCA/refresh').set(HEADER, TOKEN);
    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);
    expect(bloqueado.body.error).toMatch(/Limite de 3 execuções/);

    // outra operação (outro índice) tem cota própria
    expect((await request(app).post('/api/indices/IGPM/refresh').set(HEADER, TOKEN)).status).toBe(200);
  });
});

describe('E10 — CORS sem credenciais e com lista de origens', () => {
  const TERCEIRO = 'https://qualquer-site-de-terceiro.vercel.app';
  const preflight = (app: ReturnType<typeof createApp>, origem: string) =>
    request(app)
      .options('/api/indices/CDI/refresh')
      .set('Origin', origem)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', `content-type,${HEADER}`);

  it('V-ADM-1a com CORS_STRICT=1: origem não listada → 403, sem Access-Control-Allow-Origin/Credentials', async () => {
    process.env.CORS_STRICT = '1';
    process.env.CORS_ORIGIN = 'https://calculadora.exemplo.com.br';
    const r = await preflight(createApp(), TERCEIRO);
    expect(r.status).toBe(403);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('padrão (sem CORS_STRICT): *.vercel.app segue aceito, mas nunca com Access-Control-Allow-Credentials', async () => {
    delete process.env.CORS_STRICT;
    const r = await preflight(createApp(), TERCEIRO);
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe(TERCEIRO);
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
    expect(String(r.headers['access-control-allow-headers'])).toContain(HEADER);
  });

  it('CORS_ORIGIN com várias origens e barra final: listadas continuam aceitas com CORS_STRICT=1', async () => {
    process.env.CORS_STRICT = '1';
    process.env.CORS_ORIGIN = 'https://calculadora.exemplo.com.br/, http://localhost:5173';
    const app = createApp();
    const a = await preflight(app, 'https://calculadora.exemplo.com.br');
    expect(a.status).toBe(204);
    expect(a.headers['access-control-allow-origin']).toBe('https://calculadora.exemplo.com.br');
    const b = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(b.status).toBe(200);
    expect(b.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('subdomínio de plataforma sem HTTPS é recusado; requisição sem Origin (curl/health check) é aceita', async () => {
    delete process.env.CORS_STRICT;
    const app = createApp();
    const r = await request(app).get('/health').set('Origin', 'http://site.vercel.app');
    expect(r.status).toBe(403);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    const semOrigem = await request(app).get('/health');
    expect(semOrigem.status).toBe(200);
  });
});
