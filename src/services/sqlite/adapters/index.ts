/**
 * Import adapter registry for Total Recall.
 *
 * Each adapter transforms a third-party export format into native Total Recall JSONL
 * records that can be imported through the standard ImportExport pipeline.
 */

import type { JsonlObservation, JsonlSummary, JsonlPrompt } from '../ImportExport.js';

// ── Adapter types ──

/** Result of running an import adapter's transform step */
export interface AdaptedImport {
  observations: JsonlObservation[];
  summaries: JsonlSummary[];
  prompts: JsonlPrompt[];
  skipped: SkippedRecord[];
}

/** A record that could not be adapted, with reason */
export interface SkippedRecord {
  line: number;
  originalId?: string;
  type?: string;
  reason: string;
}

/** Interface that all import adapters implement */
export interface ImportAdapter {
  /** Human-readable name (e.g. "claude-mem") */
  name: string;
  /** Returns true if the content looks like this adapter's format */
  detect(content: string): boolean;
  /** Transform foreign format into Total Recall records */
  adapt(content: string, options?: AdaptOptions): AdaptedImport;
}

/** Options passed to the adapter's adapt() method */
export interface AdaptOptions {
  /** Default project name if the source record doesn't specify one */
  defaultProject?: string;
}

// ── Registry ──

import { claudeMemAdapter } from './claude-mem.js';

/** All registered import adapters */
const adapters: ImportAdapter[] = [
  claudeMemAdapter,
];

/**
 * Get an adapter by name.
 * Returns undefined if no adapter matches.
 */
export function getAdapter(name: string): ImportAdapter | undefined {
  return adapters.find(a => a.name === name);
}

/**
 * Auto-detect which adapter can handle the given content.
 * Returns the first matching adapter, or undefined if none match.
 */
export function detectAdapter(content: string): ImportAdapter | undefined {
  return adapters.find(a => a.detect(content));
}

/**
 * List all registered adapter names.
 */
export function listAdapters(): string[] {
  return adapters.map(a => a.name);
}

export { claudeMemAdapter } from './claude-mem.js';
