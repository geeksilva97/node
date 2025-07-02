'use strict';

const {
  Array,
  FunctionPrototypeBind,
  Symbol,
} = primordials;

const {
  // For easy access to the nextTick state in the C++ land,
  // and to avoid unnecessary calls into JS land.
  tickInfo,
  // Used to run V8's micro task queue.
  runMicrotasks,
  setTickCallback,
  enqueueMicrotask,
} = internalBinding('task_queue');

const {
  setHasRejectionToWarn,
  hasRejectionToWarn,
  listenForRejections,
  processPromiseRejections,
} = require('internal/process/promises');

const {
  getDefaultTriggerAsyncId,
  newAsyncId,
  initHooksExist,
  destroyHooksExist,
  emitInit,
  emitBefore,
  emitAfter,
  emitDestroy,
  symbols: { async_id_symbol, trigger_async_id_symbol },
} = require('internal/async_hooks');
const FixedQueue = require('internal/fixed_queue');

const {
  validateFunction,
} = require('internal/validators');

const { AsyncResource } = require('async_hooks');

const AsyncContextFrame = require('internal/async_context_frame');

const async_context_frame = Symbol('kAsyncContextFrame');

// *Must* match Environment::TickInfo::Fields in src/env.h.
const kHasTickScheduled = 0;

function hasTickScheduled() {
  return tickInfo[kHasTickScheduled] === 1;
}

function setHasTickScheduled(value) {
  tickInfo[kHasTickScheduled] = value ? 1 : 0;
}

let qLength = -1; // definindo como -1 já que aparentement já starta com um nextTick pendente
const queue = new FixedQueue();

// Should be in sync with RunNextTicksNative in node_task_queue.cc
function runNextTicks() {
  if (!hasTickScheduled() && !hasRejectionToWarn())
    runMicrotasks();
  if (!hasTickScheduled() && !hasRejectionToWarn())
    return;

  processTicksAndRejections();
}

function processTicksAndRejections() {
  let tock;
  // console.log('Processing ticks and rejections...', qLength);
  // all the next tick callbacks are processed here
  do {
    while ((tock = queue.shift()) !== null) {
      const priorContextFrame =
        AsyncContextFrame.exchange(tock[async_context_frame]);

      const asyncId = tock[async_id_symbol];
      emitBefore(asyncId, tock[trigger_async_id_symbol], tock);

      try {
        const callback = tock.callback;
        if (tock.args === undefined) {
          // console.log('ticks queue length', qLength)
          callback();
          qLength--;
        } else {
          const args = tock.args;
          switch (args.length) {
            case 1: callback(args[0]); break;
            case 2: callback(args[0], args[1]); break;
            case 3: callback(args[0], args[1], args[2]); break;
            case 4: callback(args[0], args[1], args[2], args[3]); break;
            default: callback(...args);
          }
        }
      } finally {
        if (destroyHooksExist())
          emitDestroy(asyncId);
      }

      emitAfter(asyncId);

      AsyncContextFrame.set(priorContextFrame);
    }
    runMicrotasks();
  } while (!queue.isEmpty() || processPromiseRejections());
  // console.log('Finished processing ticks and rejections.', qLength);
  setHasTickScheduled(false);
  setHasRejectionToWarn(false);
}

// `nextTick()` will not enqueue any callback when the process is about to
// exit since the callback would not have a chance to be executed.
function nextTick(callback) {
  validateFunction(callback, 'callback');

  if (process._exiting)
    return;

  let args;
  switch (arguments.length) {
    case 1: break;
    case 2: args = [arguments[1]]; break;
    case 3: args = [arguments[1], arguments[2]]; break;
    case 4: args = [arguments[1], arguments[2], arguments[3]]; break;
    default:
      args = new Array(arguments.length - 1);
      for (let i = 1; i < arguments.length; i++)
        args[i - 1] = arguments[i];
  }

  if (queue.isEmpty())
    setHasTickScheduled(true);
  const asyncId = newAsyncId();
  const triggerAsyncId = getDefaultTriggerAsyncId();
  const tickObject = {
    [async_id_symbol]: asyncId,
    [trigger_async_id_symbol]: triggerAsyncId,
    [async_context_frame]: AsyncContextFrame.current(),
    callback,
    args,
  };
  if (initHooksExist())
    emitInit(asyncId, 'TickObject', triggerAsyncId, tickObject);
  queue.push(tickObject);
  qLength++;
}

function nesteTick(callback) {
  nextTick(callback);
}

function runMicrotask() {
  this.runInAsyncScope(() => {
    const callback = this.callback;
    try {
      callback();
    } finally {
      this.emitDestroy();
    }
  });
}

const defaultMicrotaskResourceOpts = { requireManualDestroy: true };

function queueMicrotask(callback) {
  validateFunction(callback, 'callback');

  const asyncResource = new AsyncResource(
    'Microtask',
    defaultMicrotaskResourceOpts,
  );
  asyncResource.callback = callback;

  enqueueMicrotask(FunctionPrototypeBind(runMicrotask, asyncResource));
}

module.exports = {
  setupTaskQueue() {
    // Sets the per-isolate promise rejection callback
    listenForRejections();
    // Sets the callback to be run in every tick.
    setTickCallback(processTicksAndRejections);
    return {
      nextTick,
      nesteTick,
      runNextTicks,
    };
  },
  nesteTick,
  queueMicrotask,
};
