const { styleText } = require('node:util');

function printMessage(message) {
  const text = styleText(['cyanBright', 'bold'], `\t\t\t\t${message}\n`)
  process.stdout.write(text);
}

printMessage('\n\n(0)hello world!\n')
process.nextTick(() => {
  printMessage('\n\n(2) nextTick was called');

  process.nextTick(() => {
    printMessage('\n\n(4) inner nextTick was called');
  });
});
Promise.resolve(42).then(printMessage.bind(null, '\n\n(3) Promise was resolved with value 42'));
printMessage('\n\n(1) Olá mundo!\n')

setTimeout(() => {
  Promise.resolve(100).then(printMessage.bind(null, '\n\n just one more microtask: Promise resolved with value 100'));
}, 1000);
