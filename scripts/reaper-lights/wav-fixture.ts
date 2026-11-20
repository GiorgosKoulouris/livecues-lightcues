// Test helper: writes small WAV files from a sample function.
import { writeFileSync } from 'node:fs';

export interface WavSpec {
  sampleRate: number;
  channels: number;
  /** 16, 24 or 32 for integer PCM; 32 or 64 with `float`. */
  bits: 16 | 24 | 32 | 64;
  float?: boolean;
  /** WAVE_FORMAT_EXTENSIBLE header instead of a plain one. */
  extensible?: boolean;
  /** Extra chunk placed before `data`, to check chunks are skipped. */
  junk?: number;
  frames: number;
  /** A sample in -1..1 for a frame and channel. */
  sample: (frame: number, channel: number) => number;
}

export function wavBytes(spec: WavSpec): Buffer {
  const bytes = spec.bits / 8;
  const dataSize = spec.frames * spec.channels * bytes;
  const fmtSize = spec.extensible ? 40 : 16;
  const junk = spec.junk ?? 0;
  const junkChunk = junk > 0 ? 8 + junk + (junk % 2) : 0;
  const buf = Buffer.alloc(12 + 8 + fmtSize + junkChunk + 8 + dataSize);
  let o = 0;
  buf.write('RIFF', o);
  buf.writeUInt32LE(buf.length - 8, (o += 4));
  buf.write('WAVE', (o += 4));
  buf.write('fmt ', (o += 4));
  buf.writeUInt32LE(fmtSize, (o += 4));
  o += 4;
  const tag = spec.float ? 3 : 1;
  buf.writeUInt16LE(spec.extensible ? 0xfffe : tag, o);
  buf.writeUInt16LE(spec.channels, o + 2);
  buf.writeUInt32LE(spec.sampleRate, o + 4);
  buf.writeUInt32LE(spec.sampleRate * spec.channels * bytes, o + 8);
  buf.writeUInt16LE(spec.channels * bytes, o + 12);
  buf.writeUInt16LE(spec.bits, o + 14);
  if (spec.extensible) {
    buf.writeUInt16LE(22, o + 16);
    buf.writeUInt16LE(spec.bits, o + 18);
    buf.writeUInt16LE(tag, o + 24); // first two bytes of the sub-format GUID
  }
  o += fmtSize;
  if (junk > 0) {
    buf.write('junk', o);
    buf.writeUInt32LE(junk, o + 4);
    o += junkChunk;
  }
  buf.write('data', o);
  buf.writeUInt32LE(dataSize, o + 4);
  o += 8;
  for (let f = 0; f < spec.frames; f++) {
    for (let c = 0; c < spec.channels; c++) {
      const v = Math.max(-1, Math.min(1, spec.sample(f, c)));
      if (spec.float) {
        if (bytes === 4) buf.writeFloatLE(v, o);
        else buf.writeDoubleLE(v, o);
      } else if (bytes === 2) buf.writeInt16LE(Math.round(v * 32767), o);
      else if (bytes === 3) buf.writeIntLE(Math.round(v * 8388607), o, 3);
      else buf.writeInt32LE(Math.round(v * 2147483647), o);
      o += bytes;
    }
  }
  return buf;
}

export function writeWav(path: string, spec: WavSpec): void {
  writeFileSync(path, wavBytes(spec));
}
