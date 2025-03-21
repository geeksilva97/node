import assert from 'node:assert';

assert.equal('Node.js', assert.asymetric.any(String));
// assert.strictEqual('Node.js', assert.asymetric.any(String));

// assert.throws(() => {
//   assert.deepStrictEqual(
//     {
//       name: 'foo',
//     },
//     {
//       name: assert.asymetric.any(Number),
//     }
//   );
// });

// assert.deepStrictEqual({
//   a: {
//     b: {
//       c: 42
//     }
//   }
// }, {
//   a: {
//     b: {
//       c: assert.asymetric.any(Number)
//     }
//   }
// });

// assert.deepStrictEqual({
//   a: {
//     b: {
//       c: 42
//     }
//   }
// }, {
//   a: {
//     b: assert.asymetric.any(Object)
//   }
// });
