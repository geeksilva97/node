import { skipIfSQLiteMissing } from '../common/index.mjs';
import tmpdir from '../common/tmpdir.js';
import { join } from 'node:path';
import { describe, test } from 'node:test';
skipIfSQLiteMissing();
const { backup, DatabaseSync } = await import('node:sqlite');

tmpdir.refresh();

let cnt = 0;
function nextDb() {
  return join(tmpdir.path, `concurrent-${cnt++}.db`);
}

const ROWS = 5000;
// Padded so the source spans a few thousand pages. With rate: 1 that is a few
// thousand threadpool round-trips, which is what gives the main thread time to
// interleave with sqlite3_backup_step().
const PADDING = 'x'.repeat(512);

// backup() copies pages on the libuv threadpool via sqlite3_backup_step(),
// using the *same* connection the main thread runs queries on. Anything that
// removes SQLite's own per-connection serialization has to replace it, or the
// two threads race on the connection's Btree and Pager state.
//
// These tests keep JavaScript hammering the connection for the whole duration
// of a backup. They check the shape of every row that comes back, not just
// that the process survived: a race here can hand back a row whose TEXT column
// is not a string long before it segfaults.
describe('backup() concurrent connection access', () => {
  test('serves queries on the source connection during a backup', async (t) => {
    const sourcePath = nextDb();
    const destPath = nextDb();

    const database = new DatabaseSync(sourcePath);
    t.after(() => { database.close(); });

    database.exec('PRAGMA journal_mode = WAL');
    database.exec(`
      CREATE TABLE data(
        key INTEGER PRIMARY KEY,
        value TEXT,
        num INTEGER
      ) STRICT
    `);

    const insert = database.prepare(
      'INSERT INTO data (key, value, num) VALUES (?, ?, ?)');
    database.exec('BEGIN');
    for (let i = 1; i <= ROWS; i++) {
      insert.run(i, `value-${i}-${PADDING}`, i);
    }
    database.exec('COMMIT');

    const select = database.prepare(
      'SELECT * FROM data WHERE num > ? LIMIT 50');
    const update = database.prepare(
      'UPDATE data SET num = num + 1 WHERE key = ?');

    let queries = 0;
    let backupFinished = false;

    // Keep the main thread on the same connection until the backup resolves.
    // Any corrupt row rejects the returned promise.
    const hammering = new Promise((resolve, reject) => {
      function hammer() {
        if (backupFinished) {
          resolve();
          return;
        }

        try {
          for (let i = 0; i < 40; i++) {
            const rows = select.all(Math.floor(Math.random() * (ROWS - 100)));
            for (const row of rows) {
              if (typeof row.value !== 'string' ||
                  typeof row.num !== 'number' ||
                  typeof row.key !== 'number') {
                throw new Error(
                  `corrupt row during backup: ${JSON.stringify(row)}`);
              }
            }
            update.run(1 + Math.floor(Math.random() * ROWS));
            queries++;
          }
        } catch (err) {
          reject(err);
          return;
        }

        setImmediate(hammer);
      }

      setImmediate(hammer);
    });

    // rate: 1 copies a single page per step, which maximizes the number of
    // threadpool round-trips and therefore the window for a race.
    const totalPages = await backup(database, destPath, {
      rate: 1,
      progress: () => {},
    });
    backupFinished = true;

    await hammering;

    t.assert.ok(totalPages > 0, 'backup copied at least one page');
    t.assert.ok(queries > 0, 'queries ran while the backup was in flight');

    // The copy has to be readable and complete.
    const copy = new DatabaseSync(destPath);
    t.after(() => { copy.close(); });
    const { n } = copy.prepare('SELECT COUNT(*) AS n FROM data').get();
    t.assert.strictEqual(n, ROWS);

    const row = copy.prepare('SELECT * FROM data WHERE key = 1').get();
    t.assert.strictEqual(typeof row.value, 'string');
  });

  test('runs a user-defined function during a backup', async (t) => {
    const sourcePath = nextDb();
    const destPath = nextDb();

    const database = new DatabaseSync(sourcePath);
    t.after(() => { database.close(); });

    database.exec('PRAGMA journal_mode = WAL');
    database.exec('CREATE TABLE data(key INTEGER PRIMARY KEY, value TEXT) STRICT');

    const insert = database.prepare('INSERT INTO data (key, value) VALUES (?, ?)');
    database.exec('BEGIN');
    for (let i = 1; i <= ROWS; i++) {
      insert.run(i, `value-${i}-${PADDING}`);
    }
    database.exec('COMMIT');

    // A JavaScript function invoked from inside sqlite3_step() re-enters the
    // binding while the connection is already in use on this thread.
    let calls = 0;
    database.function('js_tag', (value) => {
      calls++;
      return `${value}!`;
    });

    const select = database.prepare(
      'SELECT js_tag(value) AS tagged FROM data LIMIT 25');

    let backupFinished = false;
    const hammering = new Promise((resolve, reject) => {
      function hammer() {
        if (backupFinished) {
          resolve();
          return;
        }

        try {
          for (let i = 0; i < 20; i++) {
            for (const row of select.all()) {
              if (typeof row.tagged !== 'string' || !row.tagged.endsWith('!')) {
                throw new Error(
                  `corrupt udf result during backup: ${JSON.stringify(row)}`);
              }
            }
          }
        } catch (err) {
          reject(err);
          return;
        }

        setImmediate(hammer);
      }

      setImmediate(hammer);
    });

    const totalPages = await backup(database, destPath, {
      rate: 1,
      progress: () => {},
    });
    backupFinished = true;

    await hammering;

    t.assert.ok(totalPages > 0);
    t.assert.ok(calls > 0, 'the user-defined function ran during the backup');
  });
});
