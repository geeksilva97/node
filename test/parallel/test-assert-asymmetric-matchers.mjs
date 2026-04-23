// Flags: --expose-internals
import '../common/index.mjs';
import assert from 'node:assert';
import { test } from 'node:test';

const { asymmetric } = assert;

test('asymmetric.any matches primitives and boxed versions', () => {
  assert.equal('Node.js', asymmetric.any(String));
  assert.equal(new String('Node.js'), asymmetric.any(String));
  assert.equal(123, asymmetric.any(Number));
  assert.equal(4.56, asymmetric.any(Number));
  assert.equal(new Number(123), asymmetric.any(Number));
  assert.equal(true, asymmetric.any(Boolean));
  assert.equal(1n, asymmetric.any(BigInt));
  assert.equal(() => {}, asymmetric.any(Function));
  assert.equal({}, asymmetric.any(Object));
  assert.equal([], asymmetric.any(Array));
});

test('asymmetric.any rejects wrong types', () => {
  assert.throws(() => assert.equal(123, asymmetric.any(String)), {
    name: 'AssertionError',
  });
  assert.throws(() => assert.equal('x', asymmetric.any(Number)), {
    name: 'AssertionError',
  });
});

test('asymmetric.any works with user-defined classes', () => {
  class Animal {}
  class Dog extends Animal {}
  assert.equal(new Dog(), asymmetric.any(Animal));
  assert.equal(new Dog(), asymmetric.any(Dog));
  assert.throws(() => assert.equal(new Animal(), asymmetric.any(Dog)));
});

test('asymmetric.any requires a constructor', () => {
  assert.throws(() => asymmetric.any(), { code: 'ERR_INVALID_ARG_VALUE' });
});

test('asymmetric matchers work inside deepStrictEqual', () => {
  assert.deepStrictEqual(
    { name: 'foo', age: 42 },
    { name: asymmetric.any(String), age: asymmetric.any(Number) },
  );

  assert.deepStrictEqual(
    { a: { b: { c: 42, d: 'edy', e: { f: 'foo', g: 'bar' } } } },
    {
      a: {
        b: {
          c: asymmetric.any(Number),
          d: asymmetric.any(String),
          e: asymmetric.any(Object),
        },
      },
    },
  );
});

test('asymmetric matchers work inside arrays', () => {
  assert.deepStrictEqual(
    [1, 'two', true],
    [asymmetric.any(Number), asymmetric.any(String), asymmetric.any(Boolean)],
  );
});

test('asymmetric matchers fail deepStrictEqual on mismatch', () => {
  assert.throws(
    () => assert.deepStrictEqual(
      { name: 'foo' },
      { name: asymmetric.any(Number) },
    ),
    { name: 'AssertionError' },
  );
});

test('asymmetric.anything matches anything except null/undefined', () => {
  assert.equal(0, asymmetric.anything());
  assert.equal('', asymmetric.anything());
  assert.equal(false, asymmetric.anything());
  assert.equal({}, asymmetric.anything());

  assert.throws(() => assert.equal(null, asymmetric.anything()));
  assert.throws(() => assert.equal(undefined, asymmetric.anything()));
});

test('asymmetric.stringContaining matches substring', () => {
  assert.equal('Node.js is fast', asymmetric.stringContaining('Node'));
  assert.throws(() => assert.equal('Python', asymmetric.stringContaining('Node')));
  assert.throws(() => assert.equal(42, asymmetric.stringContaining('4')));
});

test('asymmetric.stringMatching matches regex', () => {
  assert.equal('v20.1.0', asymmetric.stringMatching(/^v\d+\.\d+\.\d+$/));
  assert.equal('hello', asymmetric.stringMatching('hel'));
  assert.throws(() => assert.equal('x', asymmetric.stringMatching(/^y/)));
});

test('asymmetric.arrayContaining matches subset', () => {
  assert.deepStrictEqual(
    { list: [1, 2, 3, 4] },
    { list: asymmetric.arrayContaining([2, 3]) },
  );
  assert.throws(() => assert.deepStrictEqual(
    { list: [1, 2] },
    { list: asymmetric.arrayContaining([3]) },
  ));
});

test('asymmetric.objectContaining matches subset', () => {
  assert.deepStrictEqual(
    { name: 'foo', age: 42, extra: 'x' },
    asymmetric.objectContaining({ name: 'foo', age: 42 }),
  );
  assert.throws(() => assert.deepStrictEqual(
    { name: 'foo' },
    asymmetric.objectContaining({ name: 'foo', age: 42 }),
  ));
});

test('asymmetric.closeTo matches numeric proximity', () => {
  assert.equal(1.2345, asymmetric.closeTo(1.23));
  assert.equal(0.1 + 0.2, asymmetric.closeTo(0.3, 5));
  assert.throws(() => assert.equal(1.5, asymmetric.closeTo(1.0, 2)));
});

test('asymmetric.not* variants invert', () => {
  assert.equal('Python', asymmetric.stringNotContaining('Node'));
  assert.throws(() => assert.equal('Node.js', asymmetric.stringNotContaining('Node')));
});

test('error message shows matcher inline in diff', () => {
  let err;
  try {
    assert.deepStrictEqual(
      { name: 'foo' },
      { name: asymmetric.any(Number) },
    );
  } catch (e) {
    err = e;
  }
  assert(err, 'expected AssertionError to be thrown');
  // Matcher should appear without surrounding quotes in the diff.
  assert.match(err.message, /Any<Number>/);
  assert.doesNotMatch(err.message, /'Any<Number>'/);
});

test('error message for simple equal shows Any<X>', () => {
  let err;
  try {
    assert.equal('Node.js', asymmetric.any(Number));
  } catch (e) {
    err = e;
  }
  assert(err, 'expected AssertionError to be thrown');
  assert.match(err.message, /Any<Number>/);
});

test('strictEqual with asymmetric matcher', () => {
  assert.strictEqual('Node.js', asymmetric.any(String));
  assert.throws(() => assert.strictEqual(123, asymmetric.any(String)));
});

test('cycles in expected are handled', () => {
  const a = {};
  a.self = a;
  // Should match structurally — matcher comparison won't recurse into the cycle.
  assert.deepStrictEqual(
    { name: 'foo', ref: a },
    { name: asymmetric.any(String), ref: a },
  );
});

test('nested matcher inside objectContaining', () => {
  assert.deepStrictEqual(
    { id: 1, name: 'alice' },
    asymmetric.objectContaining({ name: asymmetric.any(String) }),
  );
});

test('asymmetric is also exposed on assert/strict', () => {
  const strict = assert.strict;
  assert.strictEqual(strict.asymmetric, asymmetric);
});

test('matcher used on the actual side also works', () => {
  assert.equal(asymmetric.any(String), 'foo');
  assert.throws(() => assert.equal(asymmetric.any(Number), 'foo'));
});

test('matchers integrate with node:test t.assert.asymmetric', (t) => {
  t.assert.deepStrictEqual(
    { name: 'foo', age: 42 },
    { name: t.assert.asymmetric.any(String), age: t.assert.asymmetric.any(Number) },
  );
});
