/**
 * Claude Mem Import Adapter for Total Recall.
 *
 * Transforms Claude Mem JSONL export files into Total Recall's native format.
 *
 * Claude Mem export format (JSONL — one JSON object per line):
 * ```jsonl
 * {"id":"mem_xxx","type":"memory","content":"...","source":"user","created_at":"2025-01-01T00:00:00Z","tags":["tag1"],"project":"myproject"}
 * {"id":"mem_xxx","type":"summary","content":"...","source":"assistant","created_at":"2025-01-01T00:00:00Z","tags":[],"project":"myproject"}
 * {"id":"mem_xxx","type":"prompt","content":"...","source":"user","created_at":"2025-01-01T00:00:00Z","tags":[],"project":"myproject"}
 * ```
 *
 * Mapping:
 * - Claude `memory` → Total Recall `observation` (type: "research")
 * - Claude `summary` → Total Recall `summary`
 * - Claude `prompt` → Total Recall `prompt`
 * - Unsupported types → added to `skipped` array
 */

import { createHash } from 'node:crypto';
import type { JsonlObservation, JsonlSummary, JsonlPrompt } from '../ImportExport.js';
import type { ImportAdapter, AdaptedImport, AdaptOptions, SkippedRecord } from './index.js';

// ── Claude Mem types ──

/** A single record from a Claude Mem JSONL export */
interface ClaudeMemRecord {
  id?: string;
  type?: string;
  content?: string;
  source?: string;
  created_at?: string;
  tags?: string[];
  project?: string;
  /** Some exports include additional metadata */
  metadata?: Record<string, unknown>;
}

// ── Detection ──

/**
 * Checks if file content looks like a Claude Mem export.
 * Detection heuristics:
 * 1. Must have at least one valid JSON line
 * 2. At least one record must have a Claude Mem-like structure:
 *    - `id` field starting with "mem_" OR
 *    - `type` field with value "memory" and a `content` field OR
 *    - `source` field with value "user" or "assistant" combined with `content`
 */
export function detectClaudeMemFormat(content: string): boolean {
  if (!content || content.trim().length === 0) return false;

  const lines = content.split('\n');
  // Sample first 10 non-empty lines for detection
  const sampleSize = Math.min(10, lines.length);
  let claudeMemLikeCount = 0;
  let validJsonCount = 0;

  for (let i = 0; i < lines.length && validJsonCount < sampleSize; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== 'object') continue;
    validJsonCount++;

    const record = parsed as Record<string, unknown>;

    // Skip _meta records from Total Recall's own export
    if ('_meta' in record) continue;
    // Skip records that already have _type (native Total Recall JSONL)
    if ('_type' in record) return false;

    const isClaudeMem = (
      (typeof record['id'] === 'string' && record['id'].startsWith('mem_')) ||
      (record['type'] === 'memory' && typeof record['content'] === 'string') ||
      (record['type'] === 'summary' && typeof record['content'] === 'string') ||
      (record['type'] === 'prompt' && typeof record['content'] === 'string') ||
      (
        typeof record['content'] === 'string' &&
        (record['source'] === 'user' || record['source'] === 'assistant') &&
        typeof record['created_at'] === 'string'
      )
    );

    if (isClaudeMem) claudeMemLikeCount++;
  }

  // At least 1 valid JSON line and >50% look like Claude Mem
  return validJsonCount > 0 && claudeMemLikeCount > 0 && (claudeMemLikeCount / validJsonCount) > 0.5;
}

// ── Adaptation ──

const DEFAULT_PROJECT = 'claude-mem-import';
const IMPORTED_SESSION_PREFIX = 'claude-mem-';

/**
 * Transform Claude Mem JSONL content into Total Recall records.
 *
 * Records are mapped as follows:
 * - `memory` → observation with type "research"
 * - `summary` → summary record
 * - `prompt` → prompt record
 * - Other types → skipped with reason
 *
 * Original Claude Mem metadata (id, source, tags) is preserved in the
 * `facts` field as JSON for provenance tracking.
 */
export function adaptClaudeMemToTotalRecall(
  content: string,
  options?: AdaptOptions
): AdaptedImport {
  const result: AdaptedImport = {
    observations: [],
    summaries: [],
    prompts: [],
    skipped: [],
  };

  if (!content || content.trim().length === 0) return result;

  const defaultProject = options?.defaultProject ?? DEFAULT_PROJECT;
  const lines = content.split('\n');
  let promptCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]?.trim();
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      result.skipped.push({
        line: i + 1,
        reason: `Invalid JSON: ${raw.substring(0, 60)}`,
      });
      continue;
    }

    if (!parsed || typeof parsed !== 'object') {
      result.skipped.push({
        line: i + 1,
        reason: 'Record is not a JSON object',
      });
      continue;
    }

    const record = parsed as ClaudeMemRecord;

    // Skip empty content
    if (!record.content || record.content.trim().length === 0) {
      result.skipped.push({
        line: i + 1,
        originalId: record.id,
        type: record.type,
        reason: 'Empty content field',
      });
      continue;
    }

    const project = record.project || defaultProject;
    const createdAt = record.created_at || new Date().toISOString();
    const createdAtEpoch = parseEpoch(createdAt);
    const sessionId = generateSessionId(record.id, createdAt);
    const provenance = buildProvenance(record);

    const type = record.type ?? 'memory';

    switch (type) {
      case 'memory': {
        const obs = adaptToObservation(record, {
          project,
          createdAt,
          createdAtEpoch,
          sessionId,
          provenance,
        });
        result.observations.push(obs);
        break;
      }
      case 'summary': {
        const sum = adaptToSummary(record, {
          project,
          createdAt,
          createdAtEpoch,
          sessionId,
        });
        result.summaries.push(sum);
        break;
      }
      case 'prompt': {
        promptCounter++;
        const pmt = adaptToPrompt(record, {
          project,
          createdAt,
          createdAtEpoch,
          sessionId,
          promptNumber: promptCounter,
        });
        result.prompts.push(pmt);
        break;
      }
      default: {
        result.skipped.push({
          line: i + 1,
          originalId: record.id,
          type,
          reason: `Unsupported type: "${type}". Only "memory", "summary", and "prompt" are supported.`,
        });
        break;
      }
    }
  }

  return result;
}

// ── Internal helpers ──

interface AdaptContext {
  project: string;
  createdAt: string;
  createdAtEpoch: number;
  sessionId: string;
  provenance?: string;
  promptNumber?: number;
}

function adaptToObservation(
  record: ClaudeMemRecord,
  ctx: AdaptContext
): JsonlObservation {
  const content = record.content ?? '';
  // Use first line of content as title, rest as narrative
  const firstNewline = content.indexOf('\n');
  const title = firstNewline > 0 && firstNewline <= 200
    ? content.substring(0, firstNewline).trim()
    : content.substring(0, 200).trim();
  const narrative = content;

  // Build concepts from tags
  const concepts = record.tags && record.tags.length > 0
    ? record.tags.join(', ')
    : null;

  // Compute content hash for deduplication
  const contentHash = computeContentHash(ctx.project, 'research', title, narrative);

  return {
    _type: 'observation',
    id: 0, // Will be assigned on insert
    memory_session_id: ctx.sessionId,
    project: ctx.project,
    type: 'research',
    title,
    subtitle: null,
    text: null,
    narrative,
    facts: ctx.provenance ?? null,
    concepts,
    files_read: null,
    files_modified: null,
    prompt_number: 0,
    content_hash: contentHash,
    discovery_tokens: estimateTokens(content),
    auto_category: 'imported',
    created_at: ctx.createdAt,
    created_at_epoch: ctx.createdAtEpoch,
  };
}

function adaptToSummary(
  record: ClaudeMemRecord,
  ctx: AdaptContext
): JsonlSummary {
  const content = record.content ?? '';

  return {
    _type: 'summary',
    id: 0,
    session_id: ctx.sessionId,
    project: ctx.project,
    request: null,
    investigated: null,
    learned: content,
    completed: null,
    next_steps: null,
    notes: record.id ? `Imported from Claude Mem (${record.id})` : 'Imported from Claude Mem',
    discovery_tokens: estimateTokens(content),
    created_at: ctx.createdAt,
    created_at_epoch: ctx.createdAtEpoch,
  };
}

function adaptToPrompt(
  record: ClaudeMemRecord,
  ctx: AdaptContext & { promptNumber: number }
): JsonlPrompt {
  return {
    _type: 'prompt',
    id: 0,
    content_session_id: ctx.sessionId,
    project: ctx.project,
    prompt_number: ctx.promptNumber,
    prompt_text: record.content ?? '',
    created_at: ctx.createdAt,
    created_at_epoch: ctx.createdAtEpoch,
  };
}

/**
 * Build provenance JSON to store original Claude Mem metadata.
 * Stored in the `facts` field of observations.
 */
function buildProvenance(record: ClaudeMemRecord): string {
  const provenance: Record<string, unknown> = {
    _source: 'claude-mem',
  };
  if (record.id) provenance['original_id'] = record.id;
  if (record.source) provenance['source'] = record.source;
  if (record.tags && record.tags.length > 0) provenance['tags'] = record.tags;
  if (record.metadata) provenance['metadata'] = record.metadata;
  return JSON.stringify(provenance);
}

/**
 * Generate a deterministic session ID from Claude Mem record metadata.
 * Groups records from the same day into the same session.
 */
function generateSessionId(id: string | undefined, createdAt: string): string {
  // Use date portion to group into day-sessions
  const datePart = createdAt.substring(0, 10); // YYYY-MM-DD
  return `${IMPORTED_SESSION_PREFIX}${datePart}`;
}

/**
 * Compute SHA256 content hash matching Total Recall's deduplication scheme.
 * Uses: project|type|title|narrative
 */
function computeContentHash(
  project: string,
  type: string,
  title: string,
  narrative: string
): string {
  const payload = [project, type, title, narrative].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

/** Parse ISO date string to epoch milliseconds */
function parseEpoch(dateStr: string): number {
  const ts = Date.parse(dateStr);
  return Number.isNaN(ts) ? Date.now() : ts;
}

/** Rough token estimation (~4 chars per token) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Adapter export ──

export const claudeMemAdapter: ImportAdapter = {
  name: 'claude-mem',
  detect: detectClaudeMemFormat,
  adapt: adaptClaudeMemToTotalRecall,
};
