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

const stmt = db.prepare(`INSERT INTO test (name) VALUES (?);`, true);

const p = stmt.run('Alice');
console.log({stmt, p})

p.then((message) => {
  console.log({message})
}).catch((err) => {
  console.error('Error running statement:', err);
});

// suite('Statement() constructor', () => {
//   test('Statement cannot be constructed directly', (t) => {
//     t.assert.throws(() => {
//       new StatementSync();
//     }, {
//       code: 'ERR_ILLEGAL_CONSTRUCTOR',
//       message: /Illegal constructor/,
//     });
//   });
// });
