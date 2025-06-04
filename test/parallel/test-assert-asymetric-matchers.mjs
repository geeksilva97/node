import assert from 'node:assert';

assert.equal('Node.js', assert.asymetric.any(String));
assert.equal(new String('Node.js'), assert.asymetric.any(String));
assert.equal(123, assert.asymetric.any(Number));
assert.equal(4.56, assert.asymetric.any(Number));
assert.equal(new Number(123), assert.asymetric.any(Number));
assert.equal({name: 'foo'}, { name: assert.asymetric.any(Number) });
assert.deepStrictEqual({
  a: {
    b: {
      c: 42,
      d: 'edy',
      e: {
        f: 'foo',
        g: 'bar'
      }
    }
  }
}, {
  a: {
    b: {
      c: assert.asymetric.any(Number),
      d: assert.asymetric.any(String),
      e: assert.asymetric.any(Object)
    }
  }
});

// assert.equal(123, assert.asymetric.any(String));
// assert.equal('123', assert.asymetric.any(Number));
// assert.strictEqual({name: 'foo'}, { name: assert.asymetric.any(String) });
// assert.equal({name: 'bar'}, { name: assert.asymetric.any(Number) });
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

