const { styleText } = require('node:util');

function printMessage(message) {
  const text = styleText(['cyanBright', 'bold'], `\t\t\t\t${message}\n`)
  process.stdout.write(text);
}

// microtask queue is drained before the next event loop phase

new Promise((resolve) => {
  printMessage('(0) Promise constructor was called')
  resolve('(1) Promise resolved'); // this schedules a callback - the one in .then - that will be executed in the microtask queue
}).then(printMessage);

setTimeout(() => { // schedules a callback to be executed in timers phase
  printMessage('(2) settimeout was called');
  process.nextTick(() => { // schedules a callback to be executed in the microtask queue
    printMessage('(2.1) nextTick inside setTimeout was called');
  });

  setTimeout(() => {
    printMessage('(2.2) setTimeout inside setTimeout was called');
  }, 0)
}, 100);

setImmediate(() => {
  printMessage('(3) setImmediate was called');
  process.nextTick(() => {
    printMessage('(3.1) nextTick inside setImmediate was called');
  });
});

process.nextTick(() => {
  printMessage('(4) nextTick was called');
});

printMessage('(5) This log comes first, then node will drain the microtask queue running Promise and nextTick handlers.');
