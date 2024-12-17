import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

test('database backup', () => {
  const db = new DatabaseSync(':memory:');

  console.log(db.backup('dest-filename.db', {
    sourceDbName: 'edy was here',
    destDbName: 'backup',
  }));
});
