'use strict';

const {
  ArrayIsArray,
  ArrayPrototypeEvery,
  ArrayPrototypeSome,
  BigInt,
  Boolean,
  MathAbs,
  MathPow,
  Number,
  NumberIsNaN,
  ObjectGetPrototypeOf,
  ObjectKeys,
  ObjectPrototypeHasOwnProperty: hasOwn,
  RegExp,
  RegExpPrototypeTest,
  String,
  StringPrototypeIncludes,
  Symbol,
  SymbolFor,
} = primordials;

const {
  codes: {
    ERR_INVALID_ARG_TYPE,
    ERR_INVALID_ARG_VALUE,
  },
} = require('internal/errors');

let lazyInspectCustom;
function inspectCustom() {
  if (lazyInspectCustom === undefined) {
    lazyInspectCustom = require('internal/util/inspect').customInspectSymbol;
  }
  return lazyInspectCustom;
}

let lazyIsDeepStrictEqual;
function isDeepStrictEqual(a, b) {
  if (lazyIsDeepStrictEqual === undefined) {
    lazyIsDeepStrictEqual =
      require('internal/util/comparisons').isDeepStrictEqual;
  }
  return lazyIsDeepStrictEqual(a, b);
}

// A Symbol.for'd key so alternative implementations can still be recognized
// across realms. Detection uses `hasOwnProperty` so hostile Proxies that throw
// on unknown `get` traps (e.g. the `test/common` guard) don't break comparisons
// that walk arbitrary object graphs.
const kAsymmetricMatcher = SymbolFor('nodejs.assert.asymmetricMatcher');

function isAsymmetricMatcher(value) {
  return value !== null &&
         typeof value === 'object' &&
         hasOwn(value, kAsymmetricMatcher);
}

function fnNameFor(ctor) {
  if (typeof ctor === 'function' && ctor.name) {
    return ctor.name;
  }
  return String(ctor);
}

class AsymmetricMatcher {
  constructor(sample, inverse = false) {
    this.sample = sample;
    this.inverse = inverse;
    // Own property so `hasOwnProperty` can safely detect matchers without
    // tripping hostile Proxies in tests.
    this[kAsymmetricMatcher] = true;
  }

  asymmetricMatch(_other) { // eslint-disable-line no-unused-vars
    throw new Error('asymmetricMatch must be implemented by subclasses');
  }

  toString() {
    return 'AsymmetricMatcher';
  }

  getExpectedType() {
    return undefined;
  }

  toAsymmetricMatcher() {
    return this.toString();
  }
}


// Custom inspect so that `util.inspect(any(String))` renders as `Any<String>`
// instead of a structural object dump. This drives the diff output via
// assertion_error.js, which pre-walks matchers into inspect-friendly tokens.
function setInspect(proto) {
  proto[inspectCustom()] = function inspect() {
    return this.toAsymmetricMatcher();
  };
}

class Any extends AsymmetricMatcher {
  constructor(sample) {
    if (sample === undefined) {
      throw new ERR_INVALID_ARG_VALUE(
        'sample',
        sample,
        'any() expects to be passed a constructor function. ' +
          'Use anything() to match any value except null and undefined.',
      );
    }
    super(sample);
  }

  asymmetricMatch(other) {
    if (this.sample === String) {
      return typeof other === 'string' || other instanceof String;
    }
    if (this.sample === Number) {
      return typeof other === 'number' || other instanceof Number;
    }
    if (this.sample === Function) {
      return typeof other === 'function' || other instanceof Function;
    }
    if (this.sample === Boolean) {
      return typeof other === 'boolean' || other instanceof Boolean;
    }
    if (this.sample === BigInt) {
      return typeof other === 'bigint' || other instanceof BigInt;
    }
    if (this.sample === Symbol) {
      return typeof other === 'symbol' || other instanceof Symbol;
    }
    if (this.sample === Object) {
      return typeof other === 'object' && other !== null;
    }
    if (this.sample === Array) {
      return ArrayIsArray(other);
    }
    if (typeof this.sample !== 'function') {
      throw new ERR_INVALID_ARG_TYPE('sample', 'Function', this.sample);
    }
    return other instanceof this.sample;
  }

  toString() {
    return 'Any';
  }

  getExpectedType() {
    if (this.sample === String) return 'string';
    if (this.sample === Number) return 'number';
    if (this.sample === Function) return 'function';
    if (this.sample === Object) return 'object';
    if (this.sample === Boolean) return 'boolean';
    if (this.sample === BigInt) return 'bigint';
    if (this.sample === Symbol) return 'symbol';
    if (this.sample === Array) return 'array';
    return fnNameFor(this.sample);
  }

  toAsymmetricMatcher() {
    return `Any<${fnNameFor(this.sample)}>`;
  }
}
setInspect(Any.prototype);

class Anything extends AsymmetricMatcher {
  constructor() {
    super(undefined);
  }

  asymmetricMatch(other) {
    return other !== null && other !== undefined;
  }

  toString() {
    return 'Anything';
  }

  toAsymmetricMatcher() {
    return 'Anything';
  }
}
setInspect(Anything.prototype);

class StringContaining extends AsymmetricMatcher {
  constructor(sample, inverse = false) {
    if (typeof sample !== 'string') {
      throw new ERR_INVALID_ARG_TYPE('sample', 'string', sample);
    }
    super(sample, inverse);
  }

  asymmetricMatch(other) {
    const result = typeof other === 'string' &&
                   StringPrototypeIncludes(other, this.sample);
    return this.inverse ? !result : result;
  }

  toString() {
    return this.inverse ? 'StringNotContaining' : 'StringContaining';
  }

  getExpectedType() {
    return 'string';
  }

  toAsymmetricMatcher() {
    return `${this.toString()}<${JSON.stringify(this.sample)}>`;
  }
}
setInspect(StringContaining.prototype);

class StringMatching extends AsymmetricMatcher {
  constructor(sample, inverse = false) {
    if (typeof sample !== 'string' && !(sample instanceof RegExp)) {
      throw new ERR_INVALID_ARG_TYPE('sample', ['string', 'RegExp'], sample);
    }
    super(new RegExp(sample), inverse);
  }

  asymmetricMatch(other) {
    const result = typeof other === 'string' &&
                   RegExpPrototypeTest(this.sample, other);
    return this.inverse ? !result : result;
  }

  toString() {
    return this.inverse ? 'StringNotMatching' : 'StringMatching';
  }

  getExpectedType() {
    return 'string';
  }

  toAsymmetricMatcher() {
    return `${this.toString()}<${this.sample}>`;
  }
}
setInspect(StringMatching.prototype);

class ArrayContaining extends AsymmetricMatcher {
  constructor(sample, inverse = false) {
    if (!ArrayIsArray(sample)) {
      throw new ERR_INVALID_ARG_TYPE('sample', 'Array', sample);
    }
    super(sample, inverse);
  }

  asymmetricMatch(other) {
    const result = this.sample.length === 0 ||
      (ArrayIsArray(other) &&
        ArrayPrototypeEvery(this.sample, (item) =>
          ArrayPrototypeSome(other, (another) => isDeepStrictEqual(item, another)),
        ));
    return this.inverse ? !result : result;
  }

  toString() {
    return this.inverse ? 'ArrayNotContaining' : 'ArrayContaining';
  }

  getExpectedType() {
    return 'array';
  }

  toAsymmetricMatcher() {
    return this.toString();
  }
}
setInspect(ArrayContaining.prototype);

class ObjectContaining extends AsymmetricMatcher {
  constructor(sample, inverse = false) {
    if (sample === null || typeof sample !== 'object') {
      throw new ERR_INVALID_ARG_TYPE('sample', 'Object', sample);
    }
    super(sample, inverse);
  }

  asymmetricMatch(other) {
    if (other === null || typeof other !== 'object' || ArrayIsArray(other)) {
      return this.inverse ? true : false;
    }
    let result = true;
    const keys = ObjectKeys(this.sample);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!hasOwnProperty(other, key) ||
          !isDeepStrictEqual(this.sample[key], other[key])) {
        result = false;
        break;
      }
    }
    return this.inverse ? !result : result;
  }

  toString() {
    return this.inverse ? 'ObjectNotContaining' : 'ObjectContaining';
  }

  getExpectedType() {
    return 'object';
  }

  toAsymmetricMatcher() {
    return this.toString();
  }
}
setInspect(ObjectContaining.prototype);

function hasOwnProperty(obj, key) {
  let current = obj;
  while (current !== null && current !== undefined) {
    if (hasOwn(current, key)) return true;
    current = ObjectGetPrototypeOf(current);
  }
  return false;
}

class CloseTo extends AsymmetricMatcher {
  constructor(sample, precision = 2, inverse = false) {
    if (typeof sample !== 'number') {
      throw new ERR_INVALID_ARG_TYPE('sample', 'number', sample);
    }
    if (typeof precision !== 'number') {
      throw new ERR_INVALID_ARG_TYPE('precision', 'number', precision);
    }
    super(sample, inverse);
    this.precision = precision;
  }

  asymmetricMatch(other) {
    if (typeof other !== 'number' || NumberIsNaN(other)) {
      return this.inverse ? true : false;
    }
    let result;
    const posInf = 1 / 0;
    const negInf = -1 / 0;
    if (other === posInf && this.sample === posInf) {
      result = true;
    } else if (other === negInf && this.sample === negInf) {
      result = true;
    } else {
      result = MathAbs(this.sample - other) < MathPow(10, -this.precision) / 2;
    }
    return this.inverse ? !result : result;
  }

  toString() {
    return this.inverse ? 'NumberNotCloseTo' : 'NumberCloseTo';
  }

  getExpectedType() {
    return 'number';
  }

  toAsymmetricMatcher() {
    return `${this.toString()}<${this.sample}, precision=${this.precision}>`;
  }
}
setInspect(CloseTo.prototype);

module.exports = {
  kAsymmetricMatcher,
  isAsymmetricMatcher,
  AsymmetricMatcher,
  asymmetric: {
    any: (sample) => new Any(sample),
    anything: () => new Anything(),
    stringContaining: (sample) => new StringContaining(sample),
    stringNotContaining: (sample) => new StringContaining(sample, true),
    stringMatching: (sample) => new StringMatching(sample),
    stringNotMatching: (sample) => new StringMatching(sample, true),
    arrayContaining: (sample) => new ArrayContaining(sample),
    arrayNotContaining: (sample) => new ArrayContaining(sample, true),
    objectContaining: (sample) => new ObjectContaining(sample),
    objectNotContaining: (sample) => new ObjectContaining(sample, true),
    closeTo: (sample, precision) => new CloseTo(sample, precision),
    notCloseTo: (sample, precision) => new CloseTo(sample, precision, true),
  },
};
