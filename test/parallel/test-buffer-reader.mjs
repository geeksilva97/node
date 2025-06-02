import '../common/index.mjs';
import { describe, it } from 'node:test';

describe('Buffer.prototype.getReader', () => {
  it('returns a BufferReader instance', (t) => {
    const buf = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
    const reader = buf.getReader();

    t.assert.strictEqual(typeof reader.read, 'function');
    t.assert.strictEqual(typeof reader.seek, 'function');
  });

  it('BufferReader.prototype.read gets n bytes from actual buffer', (t) => {
    const buf = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
    const reader = buf.getReader();
    const result1 = reader.read(2);
    const result2 = reader.read(2);

    t.assert.deepStrictEqual(result1, Buffer.from([0xca, 0xfe]));
    t.assert.deepStrictEqual(result2, Buffer.from([0xba, 0xbe]));
  });

  it('BufferReader.prototype.seek sets the position', (t) => {
    const buf = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
    const reader = buf.getReader();
    const result1 = reader.read(2);
    reader.seek(0);
    const result2 = reader.read(2);

    t.assert.deepStrictEqual(result1, Buffer.from([0xca, 0xfe]));
    t.assert.deepStrictEqual(result2, Buffer.from([0xca, 0xfe]));
  });
});

describe('Buffer.prototype.getCppReader', () => {
  it('returns a BufferReader instance', (t) => {
    const buf = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
    const reader = buf.getCppReader();

    t.assert.strictEqual(typeof reader.read, 'function');
    t.assert.strictEqual(typeof reader.seek, 'function');
  });

  it('BufferReader.prototype.read gets n bytes from actual buffer', (t) => {
    const buf = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
    const reader = buf.getCppReader();
    const result1 = reader.read(2);
    const result2 = reader.read(2);

    t.assert.deepEqual(result1, Buffer.from([0xca, 0xfe]));
    t.assert.deepEqual(result2, Buffer.from([0xba, 0xbe]));
  });

  it('BufferReader.prototype.seek sets the position', (t) => {
    const buf = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
    const reader = buf.getCppReader();
    const result1 = reader.read(2);
    reader.seek(0);
    const result2 = reader.read(2);

    t.assert.deepEqual(result1, Buffer.from([0xca, 0xfe]));
    t.assert.deepEqual(result2, Buffer.from([0xca, 0xfe]));
  });
});
