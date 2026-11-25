// Test helper: the sample brief's Show, generated in memory. Paths are from the repo root.
import { loadBrief } from './brief';
import { generateFiles } from './generate';

export const FIXTURES = 'tools/shows/make-shows/fixtures';
/** The brief and its made-up venue. */
export const sample = loadBrief(`${FIXTURES}/sample-brief.yaml`);
/** What `show:generate` writes for it. */
export const sampleFiles = generateFiles(sample.brief, sample.venue);
