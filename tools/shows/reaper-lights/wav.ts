// A WAV reader with no dependencies: PCM 16/24/32-bit and float 32/64-bit,
// any channel count. It reads ranges of frames from the file, so a long stem
// is never held in memory whole.
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { LightsError } from './errors';

export class WavError extends LightsError {}

export interface WavFile {
  sampleRate: number;
  channels: number;
  /** Frames in the data chunk (a frame is one sample per channel). */
  frames: number;
  /** Interleaved samples in -1..1 for `count` frames from `start`. Clamped to the file. */
  readFrames(start: number, count: number): Float32Array;
  close(): void;
}

const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  const got = readSync(fd, buf, 0, length, position);
  return got < length ? buf.subarray(0, got) : buf;
}

/** Opens a WAV file and reads its header. Close it when done. */
export function openWav(path: string): WavFile {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    throw new WavError(`Cannot open '${path}'`);
  }
  try {
    return readHeader(fd, path);
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function readHeader(fd: number, path: string): WavFile {
  const size = fstatSync(fd).size;
  const head = readAt(fd, 0, 12);
  const id = head.toString('latin1', 0, 4);
  if (id === 'RF64') throw new WavError(`'${path}' is RF64, which is not supported`);
  if (head.length < 12 || id !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WAVE') {
    throw new WavError(`'${path}' is not a WAV file`);
  }

  let fmt: { tag: number; channels: number; sampleRate: number; bits: number } | undefined;
  let dataStart = 0;
  let dataSize = 0;
  let pos = 12;
  while (pos + 8 <= size) {
    const chunk = readAt(fd, pos, 8);
    const name = chunk.toString('latin1', 0, 4);
    const chunkSize = chunk.readUInt32LE(4);
    if (name === 'fmt ') {
      const b = readAt(fd, pos + 8, Math.min(chunkSize, 40));
      if (b.length < 16) throw new WavError(`'${path}' has a short fmt chunk`);
      let tag = b.readUInt16LE(0);
      if (tag === EXTENSIBLE && b.length >= 26) tag = b.readUInt16LE(24);
      fmt = {
        tag,
        channels: b.readUInt16LE(2),
        sampleRate: b.readUInt32LE(4),
        bits: b.readUInt16LE(14),
      };
    } else if (name === 'data') {
      dataStart = pos + 8;
      // A size past the end of the file (or a streaming 0xFFFFFFFF) is clamped.
      dataSize = Math.min(chunkSize, size - dataStart);
      break;
    }
    pos += 8 + chunkSize + (chunkSize % 2);
  }
  if (!fmt) throw new WavError(`'${path}' has no fmt chunk`);
  if (dataStart === 0) throw new WavError(`'${path}' has no data chunk`);

  const { tag, channels, sampleRate, bits } = fmt;
  const supported =
    (tag === PCM && (bits === 16 || bits === 24 || bits === 32)) ||
    (tag === FLOAT && (bits === 32 || bits === 64));
  if (!supported || channels < 1 || sampleRate < 1) {
    const kind = tag === FLOAT ? 'float' : tag === PCM ? 'PCM' : `format ${tag}`;
    throw new WavError(
      `'${path}': ${bits}-bit ${kind} with ${channels} channel(s) is not supported`,
    );
  }

  const bytes = bits / 8;
  const frameBytes = bytes * channels;
  const frames = Math.floor(dataSize / frameBytes);
  const decode = (buf: Buffer, offset: number): number => {
    if (tag === FLOAT) return bytes === 4 ? buf.readFloatLE(offset) : buf.readDoubleLE(offset);
    if (bytes === 2) return buf.readInt16LE(offset) / 32768;
    if (bytes === 3) return buf.readIntLE(offset, 3) / 8388608;
    return buf.readInt32LE(offset) / 2147483648;
  };

  return {
    sampleRate,
    channels,
    frames,
    readFrames(start, count) {
      const from = Math.max(0, Math.floor(start));
      const n = Math.max(0, Math.min(Math.floor(count), frames - from));
      const buf = readAt(fd, dataStart + from * frameBytes, n * frameBytes);
      const out = new Float32Array(Math.floor(buf.length / bytes));
      for (let i = 0; i < out.length; i++) out[i] = decode(buf, i * bytes);
      return out;
    },
    close: () => closeSync(fd),
  };
}
