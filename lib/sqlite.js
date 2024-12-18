'use strict';
const { emitExperimentalWarning } = require('internal/util');

emitExperimentalWarning('SQLite');
module.exports = internalBinding('sqlite');

const SQLiteBackup = internalBinding('sqlite_backup').SQLiteBackup;

const backup = new SQLiteBackup();

console.log({ backup })
