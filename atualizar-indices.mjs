/**
 * Script de atualização de índices financeiros.
 * Busca dados históricos do BCB (SGS) e armazena no cache SQLite local.
 *
 * Uso: node atualizar-indices.mjs
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'packages', 'api', 'data', 'cache.db');

// ── Séries SGS do Banco Central ──────────────────────────────────────────────
const SERIES = [
  { name: 'CDI',        code: 12,   type: 'CDI',       freq: 'diário'  },
  { name: 'Selic Meta', code: 432,  type: 'SELIC_META', freq: 'diário'  },
  { name: 'Selic Over', code: 1178, type: 'SELIC_OVER', freq: 'diário'  },
  { name: 'IPCA',       code: 433,  type: 'IPCA',       freq: 'mensal'  },
  { name: 'IGP-M',      code: 189,  type: 'IGPM',       freq: 'mensal'  },
  { name: 'INCC',       code: 192,  type: 'INCC',       freq: 'mensal'  },
];

// ── Utilitários ───────────────────────────────────────────────────────────────
function toddmmyyyy(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function parseDate(str) {
  // DD/MM/YYYY → Date
  const [d, m, y] = str.split('/').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 20000 }, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON inválido: ${data.slice(0, 200)}`)); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

// ── Banco de dados ────────────────────────────────────────────────────────────
function openDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS index_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      index_type TEXT NOT NULL,
      date TEXT NOT NULL,
      value REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(index_type, date)
    );
    CREATE INDEX IF NOT EXISTS idx_index_data_type_date ON index_data(index_type, date);
    CREATE TABLE IF NOT EXISTS cache_meta (
      index_type TEXT PRIMARY KEY,
      last_date TEXT,
      total_records INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function getLastCachedDate(db, indexType) {
  const row = db.prepare('SELECT last_date FROM cache_meta WHERE index_type = ?').get(indexType);
  return row?.last_date ? new Date(row.last_date + 'T12:00:00') : null;
}

function saveData(db, indexType, records) {
  const insert = db.prepare('INSERT OR IGNORE INTO index_data (index_type, date, value) VALUES (?, ?, ?)');
  const insertMany = db.transaction(rows => {
    let count = 0;
    for (const r of rows) {
      const res = insert.run(indexType, r.date, r.value);
      count += res.changes;
    }
    return count;
  });
  const inserted = insertMany(records);

  if (records.length > 0) {
    const lastDate = records.map(r => r.date).sort().at(-1);
    const total = db.prepare('SELECT COUNT(*) as n FROM index_data WHERE index_type = ?').get(indexType).n;
    db.prepare(`
      INSERT OR REPLACE INTO cache_meta (index_type, last_date, total_records, last_updated)
      VALUES (?, ?, ?, datetime('now'))
    `).run(indexType, lastDate, total);
  }
  return inserted;
}

// ── Busca BCB ─────────────────────────────────────────────────────────────────
async function fetchSeriesChunk(code, startDate, endDate) {
  const start = toddmmyyyy(startDate);
  const end   = toddmmyyyy(endDate);
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${start}&dataFinal=${end}`;

  const data = await fetchJSON(url);
  if (!Array.isArray(data)) {
    // 404 "Value(s) not found" = sem dados para o período (normal para datas recentes)
    const msg = JSON.stringify(data);
    if (msg.includes('not found') || msg.includes('404')) return [];
    throw new Error(`API retornou: ${msg.slice(0, 150)}`);
  }
  return data.map(item => ({
    date:  isoDate(parseDate(item.data)),
    value: parseFloat(item.valor.replace(',', '.')),
  }));
}

// Busca em blocos de 2 anos para séries diárias (evita limite da API)
async function fetchSeries(code, startDate, endDate, freq) {
  if (freq === 'mensal') {
    return fetchSeriesChunk(code, startDate, endDate);
  }

  // Para séries diárias, divide em chunks de 2 anos
  const CHUNK_YEARS = 2;
  const all = [];
  let current = new Date(startDate);

  while (current <= endDate) {
    const chunkEnd = new Date(current);
    chunkEnd.setFullYear(chunkEnd.getFullYear() + CHUNK_YEARS);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

    const records = await fetchSeriesChunk(code, current, chunkEnd);
    all.push(...records);

    current = new Date(chunkEnd);
    current.setDate(current.getDate() + 1);

    if (records.length > 0) process.stdout.write('.');
    // Pequena pausa para não sobrecarregar a API
    await new Promise(r => setTimeout(r, 300));
  }

  return all;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const db = openDB();
const today = new Date();
const historicalStart = new Date('2000-01-01');

console.log('━'.repeat(60));
console.log('  Atualização de Índices Financeiros — BCB SGS');
console.log('━'.repeat(60));

let totalInserted = 0;

for (const serie of SERIES) {
  process.stdout.write(`\n[${serie.name}] Verificando cache... `);

  const lastDate = getLastCachedDate(db, serie.type);
  const fetchStart = lastDate
    ? new Date(lastDate.getTime() + 86_400_000) // +1 dia após último dado
    : historicalStart;

  if (fetchStart > today) {
    console.log('já atualizado ✓');
    continue;
  }

  process.stdout.write(`buscando ${toddmmyyyy(fetchStart)} → ${toddmmyyyy(today)}... `);

  try {
    const records = await fetchSeries(serie.code, fetchStart, today, serie.freq);

    if (records.length === 0) {
      console.log('sem dados novos ✓');
      continue;
    }

    const inserted = saveData(db, serie.type, records);
    totalInserted += inserted;

    const total = db.prepare('SELECT COUNT(*) as n FROM index_data WHERE index_type = ?').get(serie.type).n;
    console.log(`${inserted} novos registros ✓  (total em cache: ${total.toLocaleString('pt-BR')})`);
  } catch (err) {
    console.log(`ERRO: ${err.message}`);
  }
}

console.log('\n' + '━'.repeat(60));
console.log(`  Total de novos registros inseridos: ${totalInserted}`);
console.log('  Cache atualizado em: ' + new Date().toLocaleString('pt-BR'));
console.log('━'.repeat(60) + '\n');

db.close();
