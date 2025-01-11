'use strict';
const { emitExperimentalWarning } = require('internal/util');
const {
  FunctionPrototypeCall,
  ObjectDefineProperty,
  ObjectSetPrototypeOf,
  PromiseWithResolvers,
  Symbol,
} = primordials;

const { EventEmitter } = require('events');

emitExperimentalWarning('SQLite');
// module.exports = internalBinding('sqlite');
const { SQLiteBackup: _SQLiteBackup, ...rest } = internalBinding('sqlite');

function SQLiteBackup(bigint) {
  FunctionPrototypeCall(EventEmitter, this);

  this._handle = null;
}
ObjectSetPrototypeOf(SQLiteBackup.prototype, EventEmitter.prototype);
ObjectSetPrototypeOf(SQLiteBackup, EventEmitter);

SQLiteBackup.prototype.start = function start() {
  // if (this._handle !== null)
  //   throw new Error('Backup already started');

  this._handle ??= new _SQLiteBackup();
  this._handle.onsomething = function() {
    console.log('onsomething was called')
  };

  this._handle.step();
};

module.exports = {
  ...rest,
  SQLiteBackup,
};
