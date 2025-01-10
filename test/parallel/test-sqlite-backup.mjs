import common from '../common/index.js';
import { DatabaseSync } from 'node:sqlite';
import assert from 'assert';
import { test } from 'node:test';

test('database backup', async () => {
  const database = new DatabaseSync(':memory:');

  database.exec(`
    CREATE TABLE data(
      key INTEGER PRIMARY KEY,
      value TEXT
    ) STRICT
  `);

  const insert = database.prepare('INSERT INTO data (key, value) VALUES (?, ?)');

  insert.run(1, 'hello');
  insert.run(2, 'world');

  console.log(database.prepare('SELECT * FROM data').all());

  const p = await database.backup('backup.db', {
    sourceDb: 'main',
    targetDb: 'main',
    progress: (progress) => {
      console.log(progress);
    }
  });

  const backup = new DatabaseSync('backup.db');
  const rows = backup.prepare('SELECT * FROM data').all();

  assert.deepStrictEqual(rows, [
      { __proto__: null, key: 1, value: 'hello'},
      { __proto__: null, key: 2, value: 'world' },
  ]);
});
