'use strict';
const { skipIfSQLiteMissing } = require('../common');
skipIfSQLiteMissing();
const { Database } = require('node:sqlite');
const { suite, test } = require('node:test');

function sleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // busy wait
  }
  return ms;
}

suite('SQLite Async Concurrency', () => {
  test('different connections run in parallel', async (t) => {
    const db1 = new Database(':memory:');
    const db2 = new Database(':memory:');

    // Create a custom sleep function
    db1.function('sleep', { deterministic: true }, sleep);
    db2.function('sleep', { deterministic: true }, sleep);

    const start = Date.now();

    const p1 = await db1.prepare('SELECT sleep(200) as val').get();
    const p2 = await db2.prepare('SELECT sleep(200) as val').get();
    // const p2 = db2.get('SELECT sleep(200) as val');

    await Promise.all([p1, p2]);

    const duration = Date.now() - start;

    db1.close();
    db2.close();

    // Both sleep 200ms. Parallel execution means total time ~200ms.
    // Sequential would be ~400ms.
    // We add some buffer for overhead.
    t.assert.ok(duration >= 200, `Duration ${duration}ms should be >= 200ms`);
    t.assert.ok(duration < 350, `Duration ${duration}ms should be < 350ms (Parallel)`);
  });

  // test('same connection runs sequentially', async (t) => {
  //   const db = new Database(':memory:');

  //   db.function('sleep', { deterministic: true }, sleep);

  //   const start = Date.now();

  //   const p1 = db.get('SELECT sleep(200) as val');
  //   const p2 = db.get('SELECT sleep(200) as val');

  //   await Promise.all([p1, p2]);

  //   const duration = Date.now() - start;

  //   db.close();

  //   // Both sleep 200ms. Sequential execution means total time ~400ms.
  //   t.assert.ok(duration >= 400, `Duration ${duration}ms should be >= 400ms (Sequential)`);
  // });
})
