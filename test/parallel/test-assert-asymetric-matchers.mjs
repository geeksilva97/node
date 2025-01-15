import assert from 'node:assert';

assert.deepStrictEqual(
  {
    name: 'edy',
    age: 100
  },
  {
    name: assert.asymetric.any(String),
    age: assert.asymetric.any(Number)
  }
);
