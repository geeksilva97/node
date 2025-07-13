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

db.prepare('INSERT INTO test (name) VALUES (?);').run('Sync stuff');
const p = db.prepare(`INSERT INTO test (name) VALUES (?);`, true).run('Async stuff');

p.then((result) => {
  console.log(result)
  console.log(
    db.prepare('SELECT * FROM test;').all()
  )
}).catch((err) => {
  console.error('Error running statement:', err);
});
