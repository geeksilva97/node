const { styleText } = require('node:util');

function printMessage(message) {
  const text = styleText(['cyanBright', 'bold'], `\t\t\t\t${message}\n`)
  process.stdout.write(text);
}

//  this loop looks like a bunch of nested nextTicks
// let counter = 1;

// while (counter > 0) {
//   (() => {
//     console.log('pretending this is a next tick')
//     // pretending there is an innter nexttick
//     counter++;
//   })();
// }

console.log(process.nesteTick)
printMessage('\n\n(0)hello world!\n')

Promise.resolve(42)
  .then(() => printMessage('Next tick vem primeiro que essa microtask'));

// it turns out that executing the nextTick will schedule more nextTicks which will be drained at that same moment
process.nextTick(() => {
  printMessage('\n\n(1) nextTick was called');

  process.nextTick(() => {
    printMessage('\n\n(2) inner nextTick was called');

    process.nextTick(() => {
      printMessage('\n\n(4) inner-inner nextTick was called');
    });
  });
});

setImmediate(() => {
  printMessage('\n\n(3) setImmediate was called');
});
