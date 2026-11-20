import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openWav, WavError } from './wav';
import { wavBytes, writeWav, type WavSpec } from './wav-fixture';

const dir = mkdtempSync(join(tmpdir(), 'wav-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ramp = (frame: number, channel: number) =>
  (channel === 0 ? 0.5 : -0.25) * (frame % 2 ? 1 : -1);
const base: WavSpec = { sampleRate: 8000, channels: 2, bits: 16, frames: 10, sample: ramp };

function roundTrip(name: string, spec: WavSpec, tolerance: number) {
  const path = join(dir, `${name}.wav`);
  writeWav(path, spec);
  const wav = openWav(path);
  try {
    expect(wav.sampleRate).toBe(spec.sampleRate);
    expect(wav.channels).toBe(spec.channels);
    expect(wav.frames).toBe(spec.frames);
    const got = wav.readFrames(0, spec.frames);
    expect(got).toHaveLength(spec.frames * spec.channels);
    for (let f = 0; f < spec.frames; f++) {
      for (let c = 0; c < spec.channels; c++) {
        expect(Math.abs((got[f * spec.channels + c] ?? 99) - spec.sample(f, c))).toBeLessThan(
          tolerance,
        );
      }
    }
  } finally {
    wav.close();
  }
}

describe('openWav', () => {
  it.each([
    ['pcm16', { ...base, bits: 16 as const }, 1e-4],
    ['pcm24', { ...base, bits: 24 as const }, 1e-6],
    ['pcm32', { ...base, bits: 32 as const }, 1e-8],
    ['float32', { ...base, bits: 32 as const, float: true }, 1e-7],
    ['float64', { ...base, bits: 64 as const, float: true }, 1e-12],
    ['mono', { ...base, channels: 1 }, 1e-4],
    ['extensible', { ...base, bits: 24 as const, extensible: true }, 1e-6],
    ['junk chunk before data', { ...base, junk: 5 }, 1e-4],
  ])('reads %s', (name, spec, tolerance) => roundTrip(name, spec, tolerance));

  it('reads a range of frames and clamps at the end', () => {
    const path = join(dir, 'range.wav');
    writeWav(path, { ...base, channels: 1, bits: 32, float: true, sample: (f) => f / 20 });
    const wav = openWav(path);
    expect(Array.from(wav.readFrames(3, 2))).toEqual([3 / 20, 4 / 20].map(Math.fround));
    expect(wav.readFrames(8, 5)).toHaveLength(2);
    expect(wav.readFrames(20, 5)).toHaveLength(0);
    wav.close();
  });

  it('clamps a data size that runs past the end of the file', () => {
    const path = join(dir, 'truncated.wav');
    const bytes = wavBytes({ ...base, channels: 1 });
    writeFileSync(path, bytes.subarray(0, bytes.length - 6));
    const wav = openWav(path);
    expect(wav.frames).toBe(7);
    wav.close();
  });

  it('rejects files it cannot read', () => {
    const notWav = join(dir, 'x.wav');
    writeFileSync(notWav, 'this is not a wav file at all');
    expect(() => openWav(notWav)).toThrow(WavError);
    const eightBit = join(dir, 'eight.wav');
    const bytes = wavBytes({ ...base, bits: 16 });
    bytes.writeUInt16LE(8, 34);
    writeFileSync(eightBit, bytes);
    expect(() => openWav(eightBit)).toThrow(/8-bit/);
    expect(() => openWav(join(dir, 'missing.wav'))).toThrow(WavError);
  });
});
