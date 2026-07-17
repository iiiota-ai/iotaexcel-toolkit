export type IotaField = {
  fieldNo: number;
  name: string;
  type: string;
  kind: string;
  flags: number;
  key: boolean;
  required: boolean;
  unique: boolean;
};

export type IotaBytesFile = {
  version: number;
  schemaHash: string;
  keyFieldNo: number;
  selfDescribing: boolean;
  fields: IotaField[];
  rows: Record<string, unknown>[];
};

const bytesMagic = 'IOTB';
const bytesFormatVersion = 1;
const fieldFlagKey = 1;
const fieldFlagRequired = 2;
const fieldFlagUnique = 4;

class ByteReader {
  private offset = 0;

  public constructor(private readonly data: Uint8Array) {}

  public get position() {
    return this.offset;
  }

  public get remaining() {
    return this.data.length - this.offset;
  }

  public get done() {
    return this.offset >= this.data.length;
  }

  public readAscii(length: number): string {
    return Buffer.from(this.readN(length)).toString('ascii');
  }

  public readString(): string {
    return Buffer.from(this.readBytes()).toString('utf8');
  }

  public readBytes(): Uint8Array {
    const size = Number(this.readUvarint());
    return this.readN(size);
  }

  public readFloat32(): number {
    const start = this.take(4);
    return Buffer.from(this.data.buffer, this.data.byteOffset + start, 4).readFloatLE(0);
  }

  public readFloat64(): number {
    const start = this.take(8);
    return Buffer.from(this.data.buffer, this.data.byteOffset + start, 8).readDoubleLE(0);
  }

  public readUvarint(): bigint {
    let shift = 0n;
    let value = 0n;

    for (let i = 0; i < 10; i++) {
      if (this.offset >= this.data.length) {
        throw new Error(`Invalid varint at byte ${this.offset}`);
      }

      const byte = this.data[this.offset++];
      value |= BigInt(byte & 0x7f) << shift;

      if ((byte & 0x80) === 0) {
        return value;
      }

      shift += 7n;
    }

    throw new Error(`Invalid varint at byte ${this.offset}`);
  }

  public skip(wireType: bigint) {
    switch (Number(wireType)) {
      case 0:
        this.readUvarint();
        break;
      case 1:
        this.readN(8);
        break;
      case 2:
        this.readBytes();
        break;
      case 5:
        this.readN(4);
        break;
      default:
        throw new Error(`Unsupported wire type ${wireType.toString()}`);
    }
  }

  private readN(length: number): Uint8Array {
    const start = this.take(length);
    return this.data.subarray(start, start + length);
  }

  private take(length: number): number {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.data.length) {
      throw new Error(`Read beyond end: pos=${this.offset} n=${length} len=${this.data.length}`);
    }

    const start = this.offset;
    this.offset += length;
    return start;
  }
}

export function parseIotaBytes(data: Uint8Array): IotaBytesFile {
  try {
    return parseIotaBytesWithOptions(data, true);
  } catch (error) {
    try {
      return parseIotaBytesWithOptions(data, false);
    } catch {
      throw error;
    }
  }
}

function parseIotaBytesWithOptions(data: Uint8Array, readFieldFlags: boolean): IotaBytesFile {
  const reader = new ByteReader(data);
  const magic = reader.readAscii(bytesMagic.length);
  if (magic !== bytesMagic) {
    throw new Error(`Invalid magic "${magic}"`);
  }

  const version = toSafeNumber(reader.readUvarint(), 'version');
  if (version !== bytesFormatVersion) {
    throw new Error(`Unsupported bytes version ${version}, expected ${bytesFormatVersion}`);
  }

  const schemaHash = reader.readString();
  const keyFieldNo = toSafeNumber(reader.readUvarint(), 'key field number');
  const selfDescribing = reader.readUvarint() !== 0n;
  const fieldCount = toSafeNumber(reader.readUvarint(), 'field count');
  const fields: IotaField[] = [];
  const fieldsByNo = new Map<number, IotaField>();

  for (let i = 0; i < fieldCount; i++) {
    const fieldNo = toSafeNumber(reader.readUvarint(), 'field number');
    const name = selfDescribing ? reader.readString() : `field_${fieldNo}`;
    const type = selfDescribing ? reader.readString() : `wire`;
    const flags = selfDescribing && readFieldFlags ? toSafeNumber(reader.readUvarint(), 'field flags') : 0;
    const field = {
      fieldNo,
      name,
      type,
      kind: parseKind(type),
      flags,
      key: (flags & fieldFlagKey) !== 0,
      required: (flags & fieldFlagRequired) !== 0,
      unique: (flags & fieldFlagUnique) !== 0,
    };
    fields.push(field);
    fieldsByNo.set(fieldNo, field);
  }

  const rowCount = toSafeNumber(reader.readUvarint(), 'row count');
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < rowCount; i++) {
    rows.push(parseRow(reader.readBytes(), fieldsByNo));
  }

  if (!reader.done) {
    throw new Error(`Trailing bytes: ${reader.remaining}`);
  }

  return {
    version,
    schemaHash,
    keyFieldNo,
    selfDescribing,
    fields,
    rows,
  };
}

function parseRow(data: Uint8Array, fieldsByNo: Map<number, IotaField>): Record<string, unknown> {
  const reader = new ByteReader(data);
  const row: Record<string, unknown> = {};

  while (!reader.done) {
    const tag = reader.readUvarint();
    const fieldNo = toSafeNumber(tag >> 3n, 'field number');
    const wireType = tag & 7n;
    const field = fieldsByNo.get(fieldNo);

    if (!field) {
      reader.skip(wireType);
      continue;
    }

    row[field.name] = readValue(reader, field, wireType);
  }

  return row;
}

function readValue(reader: ByteReader, field: IotaField, wireType: bigint): unknown {
  switch (Number(wireType)) {
    case 0: {
      const raw = reader.readUvarint();
      if (field.kind === 'wire') {
        return stringifyInteger(raw);
      }
      return field.kind === 'bool' ? raw !== 0n : stringifyInteger(unzigzag(raw));
    }
    case 1:
      return reader.readFloat64();
    case 2:
      return reader.readString();
    case 5:
      return reader.readFloat32();
    default:
      throw new Error(`Field ${field.name}: unsupported wire type ${wireType.toString()}`);
  }
}

function parseKind(type: string): string {
  const text = type.trim().toLowerCase();
  const genericStart = text.indexOf('<');
  return genericStart === -1 ? text : text.slice(0, genericStart);
}

function unzigzag(value: bigint): bigint {
  return (value >> 1n) ^ -(value & 1n);
}

function stringifyInteger(value: bigint): number | string {
  const min = BigInt(Number.MIN_SAFE_INTEGER);
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (value >= min && value <= max) {
    return Number(value);
  }

  return value.toString();
}

function toSafeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is too large: ${value.toString()}`);
  }

  return Number(value);
}
