import path from 'path';
import os from 'os';
import fs from 'fs';
import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

// Precisa ser definido ANTES de qualquer import de ../src/app (DatabaseService lê
// DATABASE_PATH na primeira chamada, de forma lazy/singleton).
const testDbPath = path.join(os.tmpdir(), 'correcao-api-test-cache.db');
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.unlinkSync(testDbPath + suffix);
  } catch {
    /* arquivo não existe — ok */
  }
}
process.env.DATABASE_PATH = testDbPath;
process.env.DISABLE_RATE_LIMIT = '1';
process.env.NODE_ENV = 'test';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
