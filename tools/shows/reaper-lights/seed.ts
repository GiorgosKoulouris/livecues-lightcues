/** A stable index below `count` for a seed text, so a pick is the same on every run. */
export function seededIndex(seed: string, count: number): number {
  // FNV-1a, then a final mix so that near-equal seeds spread out.
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) % count;
}
