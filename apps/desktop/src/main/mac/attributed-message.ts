const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const NEW = 0x84;
const NIL = 0x85;
const END = 0x86;
const FIRST_REFERENCE = -110;

interface ArchivedClass {
  name: string;
  version: number;
  parent?: ArchivedClass | undefined;
}

/**
 * Read only the root attributed string's text, never its attribute dictionary. Messages uses
 * NSArchiver's version-4 typedstream: lengths and references are binary values, not text.
 * Unknown/truncated archives fail closed rather than turning metadata into a phone command.
 * No Objective-C objects are instantiated. Synthetic Foundation archives cover this subset.
 */
export function decodeAttributedBody(value: unknown): string | undefined {
  if (!(value instanceof Uint8Array) || value.length > MAX_ARCHIVE_BYTES) return undefined;
  try {
    const reader = new MessageArchiveReader(Buffer.from(value));
    reader.header();
    reader.expectType('@');
    reader.object(['NSMutableAttributedString', 'NSAttributedString', 'NSObject']);
    reader.expectType('@');
    reader.object(['NSMutableString', 'NSString', 'NSObject']);
    reader.expectType('+');
    const text = reader.string(MAX_TEXT_BYTES);
    reader.expectByte(END);
    return text;
  } catch {
    return undefined;
  }
}

class MessageArchiveReader {
  #offset = 0;
  #littleEndian = true;
  #strings: string[] = [];
  #objects: (ArchivedClass | undefined)[] = [];

  constructor(private readonly buffer: Buffer) {}

  #bytes(length: number): Buffer {
    if (length < 0 || this.#offset + length > this.buffer.length)
      throw new Error('Truncated message archive.');
    const bytes = this.buffer.subarray(this.#offset, this.#offset + length);
    this.#offset += length;
    return bytes;
  }

  #byte(): number {
    return this.#bytes(1)[0]!;
  }

  expectByte(expected: number): void {
    if (this.#byte() !== expected) throw new Error('Unexpected message archive value.');
  }

  #integer(signed = false, head = this.#byte()): number {
    if (head === 0x81 || head === 0x82) {
      const bytes = this.#bytes(head === 0x81 ? 2 : 4);
      if (signed)
        return this.#littleEndian
          ? bytes.readIntLE(0, bytes.length)
          : bytes.readIntBE(0, bytes.length);
      return this.#littleEndian
        ? bytes.readUIntLE(0, bytes.length)
        : bytes.readUIntBE(0, bytes.length);
    }
    if (head >= 0x80 && head <= 0x91) throw new Error('Unsupported message archive tag.');
    return signed && head >= 0x80 ? head - 256 : head;
  }

  header(): void {
    this.expectByte(4);
    this.expectByte(11);
    const signature = this.#bytes(11).toString('ascii');
    if (signature !== 'streamtyped' && signature !== 'typedstream')
      throw new Error('Unsupported message archive.');
    this.#littleEndian = signature === 'streamtyped';
    if (this.#integer() !== 1000) throw new Error('Unsupported archive system version.');
  }

  string(limit: number): string {
    const length = this.#integer();
    if (length > limit) throw new Error('Message archive string is too large.');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      this.#bytes(length),
    );
  }

  #sharedString(): string {
    const head = this.#byte();
    if (head === NEW) {
      const value = this.string(128);
      this.#strings.push(value);
      return value;
    }
    const value = this.#strings[this.#integer(true, head) - FIRST_REFERENCE];
    if (value === undefined) throw new Error('Invalid archive string reference.');
    return value;
  }

  expectType(type: string): void {
    if (this.#sharedString() !== type) throw new Error('Unexpected message archive type.');
  }

  #class(depth = 0): ArchivedClass | undefined {
    if (depth > 4) throw new Error('Unsupported message class hierarchy.');
    const head = this.#byte();
    if (head === NIL) return undefined;
    if (head === NEW) {
      const value: ArchivedClass = { name: this.#sharedString(), version: this.#integer(true) };
      this.#objects.push(value);
      value.parent = this.#class(depth + 1);
      return value;
    }
    const value = this.#objects[this.#integer(true, head) - FIRST_REFERENCE];
    if (!value) throw new Error('Invalid archive class reference.');
    return value;
  }

  object(allowed: readonly string[]): void {
    this.expectByte(NEW);
    this.#objects.push(undefined); // Objects and class descriptors share one reference table.
    let value = this.#class();
    // The mutable subclass is optional; the concrete Foundation base and NSObject are required.
    let index = value?.name === allowed[0] ? 0 : 1;
    for (; index < allowed.length; index++) {
      if (!value || value.name !== allowed[index] || value.version < 0 || value.version > 1)
        throw new Error('Unsupported message archive class.');
      value = value.parent;
    }
    if (value) throw new Error('Unexpected message archive superclass.');
  }
}
