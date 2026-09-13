/**
 * Serviço de banco de dados SQLite para cache de índices.
 *
 * Tabelas:
 *   index_data: dados históricos de índices
 *   cache_meta: metadados de cada índice em cache (última observação, contagem,
 *               última gravação e `fetched_at` — instante da última sincronização
 *               com a fonte, sobre o qual o TTL é aplicado)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { IndexType, IndexDataPoint } from '@correcao/core';

let db: Database.Database | null = null;

function getDB(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || './data/cache.db';
    const dir = path.dirname(dbPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
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
      last_updated TEXT DEFAULT (datetime('now')),
      fetched_at TEXT
    );
  `);
  migrarFetchedAt(database);
}

/**
 * Migração compatível com bancos criados antes de `fetched_at` existir:
 * adiciona a coluna e a preenche com `last_updated` (última gravação — melhor
 * aproximação disponível da última consulta à fonte). Idempotente.
 */
function migrarFetchedAt(database: Database.Database): void {
  const colunas = database.prepare(`PRAGMA table_info(cache_meta)`).all() as { name: string }[];
  if (colunas.some(c => c.name === 'fetched_at')) return;

  database.transaction(() => {
    database.exec(`ALTER TABLE cache_meta ADD COLUMN fetched_at TEXT`);
    database.exec(`
      UPDATE cache_meta
         SET fetched_at = strftime('%Y-%m-%dT%H:%M:%SZ', last_updated)
       WHERE last_updated IS NOT NULL
    `);
  })();
}

/** Data civil 'YYYY-MM-DD' de um ponto (mesma convenção histórica do cache). */
function isoDoPonto(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Grava pontos no cache: insere os novos e ATUALIZA os que a fonte revisou
 * (valor diferente do gravado). Atualiza os metadados.
 *
 * `marcarSincronizado` (padrão true): também grava `fetched_at` = agora, pois
 * gravar dados vindos da fonte equivale a tê-la consultado agora. Cargas em
 * várias janelas passam false e marcam só ao final de todas (setIndexFetchedAt),
 * para que um cache carregado pela metade não seja tomado como sincronizado.
 */
export function saveIndexDataDetailed(
  indexType: IndexType,
  data: IndexDataPoint[],
  { marcarSincronizado = true }: { marcarSincronizado?: boolean } = {}
): { inserted: number; updated: number } {
  const database = getDB();
  const insert = database.prepare(`
    INSERT OR IGNORE INTO index_data (index_type, date, value)
    VALUES (?, ?, ?)
  `);
  const revise = database.prepare(`
    UPDATE index_data SET value = ?
     WHERE index_type = ? AND date = ? AND value <> ?
  `);

  const upsertMany = database.transaction((points: IndexDataPoint[]) => {
    let inserted = 0;
    let updated = 0;
    for (const point of points) {
      const isoDate = isoDoPonto(point.date);
      const r = insert.run(indexType, isoDate, point.value);
      if (r.changes > 0) {
        inserted += r.changes;
      } else {
        updated += revise.run(point.value, indexType, isoDate, point.value).changes;
      }
    }
    return { inserted, updated };
  });

  const result = upsertMany(data);

  if (data.length > 0) {
    // last_date = maior data do índice no cache (não a maior do lote: uma carga
    // em janelas cronológicas não pode "recuar" a última observação).
    database.prepare(`
      INSERT INTO cache_meta (index_type, last_date, total_records, last_updated, fetched_at)
      VALUES (
        @tipo,
        (SELECT MAX(date) FROM index_data WHERE index_type = @tipo),
        (SELECT COUNT(*) FROM index_data WHERE index_type = @tipo),
        datetime('now'),
        @fetchedAt
      )
      ON CONFLICT(index_type) DO UPDATE SET
        last_date = excluded.last_date,
        total_records = excluded.total_records,
        last_updated = excluded.last_updated,
        fetched_at = COALESCE(excluded.fetched_at, cache_meta.fetched_at)
    `).run({ tipo: indexType, fetchedAt: marcarSincronizado ? new Date().toISOString() : null });
  }

  return result;
}

/** Salva pontos de dados no cache (novos inseridos, revisados atualizados). Retorna quantos foram INSERIDOS. */
export function saveIndexData(indexType: IndexType, data: IndexDataPoint[]): number {
  return saveIndexDataDetailed(indexType, data).inserted;
}

/** Busca dados de um índice no período */
export function getIndexData(
  indexType: IndexType,
  startDate: Date,
  endDate: Date
): IndexDataPoint[] {
  const database = getDB();
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  const rows = database.prepare(`
    SELECT date, value
    FROM index_data
    WHERE index_type = ? AND date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(indexType, start, end) as { date: string; value: number }[];

  return rows.map(r => ({
    date: new Date(r.date + 'T12:00:00'),
    value: r.value,
  }));
}

/** Retorna a data do último dado disponível em cache */
export function getLastCachedDate(indexType: IndexType): Date | null {
  const database = getDB();
  const row = database.prepare(`
    SELECT last_date FROM cache_meta WHERE index_type = ?
  `).get(indexType) as { last_date: string } | undefined;

  if (!row || !row.last_date) return null;
  return new Date(row.last_date + 'T12:00:00');
}

/**
 * Instante da última sincronização bem-sucedida com a fonte (base do TTL).
 * null = nunca sincronizado, ou a última tentativa falhou.
 */
export function getIndexFetchedAt(indexType: IndexType): Date | null {
  const database = getDB();
  const row = database.prepare(`
    SELECT fetched_at FROM cache_meta WHERE index_type = ?
  `).get(indexType) as { fetched_at: string | null } | undefined;

  if (!row || !row.fetched_at) return null;
  const d = new Date(row.fetched_at);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Define (ou limpa, com null) o instante da última sincronização. Só afeta
 * índices que já têm linha em cache_meta — um índice sem nenhum dado continua
 * aparecendo como "sem dados em cache".
 */
export function setIndexFetchedAt(indexType: IndexType, when: Date | null): void {
  const database = getDB();
  database.prepare(`
    UPDATE cache_meta SET fetched_at = ? WHERE index_type = ?
  `).run(when ? when.toISOString() : null, indexType);
}

/** Retorna metadados de todos os índices em cache */
export function getAllCacheMeta(): {
  indexType: string;
  lastDate: string | null;
  totalRecords: number;
  lastUpdated: string;
  fetchedAt: string | null;
}[] {
  const database = getDB();
  return database.prepare(`
    SELECT index_type as indexType, last_date as lastDate,
           total_records as totalRecords, last_updated as lastUpdated,
           fetched_at as fetchedAt
    FROM cache_meta
    ORDER BY index_type
  `).all() as any[];
}

/** Fecha a conexão com o banco de dados */
export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}
