/**
 * Serviço de banco de dados SQLite para cache de índices.
 *
 * Tabelas:
 *   index_data: dados históricos de índices
 *   cache_meta: metadados de cada índice em cache (última atualização, etc.)
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
      last_updated TEXT DEFAULT (datetime('now'))
    );
  `);
}

/** Salva pontos de dados no cache (ignora duplicatas) */
export function saveIndexData(indexType: IndexType, data: IndexDataPoint[]): number {
  const database = getDB();
  const insert = database.prepare(`
    INSERT OR IGNORE INTO index_data (index_type, date, value)
    VALUES (?, ?, ?)
  `);

  const insertMany = database.transaction((points: IndexDataPoint[]) => {
    let count = 0;
    for (const point of points) {
      const isoDate = point.date.toISOString().slice(0, 10);
      const result = insert.run(indexType, isoDate, point.value);
      count += result.changes;
    }
    return count;
  });

  const inserted = insertMany(data);

  // Atualiza metadados
  if (data.length > 0) {
    const lastDate = data
      .map(d => d.date)
      .reduce((max, d) => (d > max ? d : max), data[0].date)
      .toISOString()
      .slice(0, 10);

    database.prepare(`
      INSERT OR REPLACE INTO cache_meta (index_type, last_date, total_records, last_updated)
      VALUES (
        ?,
        ?,
        (SELECT COUNT(*) FROM index_data WHERE index_type = ?),
        datetime('now')
      )
    `).run(indexType, lastDate, indexType);
  }

  return inserted;
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

/** Retorna metadados de todos os índices em cache */
export function getAllCacheMeta(): {
  indexType: string;
  lastDate: string | null;
  totalRecords: number;
  lastUpdated: string;
}[] {
  const database = getDB();
  return database.prepare(`
    SELECT index_type as indexType, last_date as lastDate,
           total_records as totalRecords, last_updated as lastUpdated
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
