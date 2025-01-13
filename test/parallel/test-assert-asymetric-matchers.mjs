import assert from 'node:assert';

assert.deepStrictEqual({ name: 'edy' }, { name: assert.asymetric.any(String) })
