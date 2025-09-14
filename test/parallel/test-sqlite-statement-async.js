'use strict';
const { skipIfSQLiteMissing } = require('../common');
skipIfSQLiteMissing();
const tmpdir = require('../common/tmpdir');
const { join } = require('node:path');
const { DatabaseSync, Statement } = require('node:sqlite');
const { suite, test } = require('node:test');
let cnt = 0;

tmpdir.refresh();

function nextDb() {
  return join(tmpdir.path, `database-${cnt++}.db`);
}

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);`);

const syncStmt = db.prepare('INSERT INTO test (name) VALUES (?);');
syncStmt.run('Sync stuff');
// below an example to test failure: constraint violation
// const p = db.prepare(`INSERT INTO test (id, name) VALUES (1, ?);`, true).run('Async stuff');
const p = db.prepare(`INSERT INTO test (name) VALUES (?);`, true).run('Async stuff');

p.then((result) => {
  console.log(result)
  const asyncStmt = db.prepare('SELECT * FROM test;', true)
  // asyncStmt.setReturnArrays(true);
  asyncStmt.all().then((rows) => {
    console.log(rows)
  });

}).catch((err) => {
  console.error('Error running statement:', err);
});
