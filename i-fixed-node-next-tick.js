const { styleText } = require('node:util');

function printMessage(message) {
  const text = styleText(['cyanBright', 'bold'], `\t\t\t\t${message}\n`)
  process.stdout.write(text);
}

process.nesteTick(() => {
  printMessage('(1) nesteTick was called');

  process.nesteTick(() => {
    printMessage('(2) inner nesteTick was called');

    process.nesteTick(() => {
      printMessage('(4) inner-inner nesteTick was called');
    });
  });
});

setImmediate(() => {
  printMessage('(3) setImmediate was called');
});
