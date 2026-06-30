/**
 * Test suite for issue #72: Import dry-run reporting, autodetect fallback, and edge cases.
 *
 * Tests cover:
 * - Dry-run report generation with correct counts and breakdown
 * - Autodetect fallback when detection fails
 * - Edge cases: empty file, all-unsupported-types file
 * - Adapter registry behavior
 */

import { describe, it, expect } from 'bun:test';
import {
  detectClaudeMemFormat,
  adaptClaudeMemToTotalRecall,
} from '../../src/services/sqlite/adapters/claude-mem.js';
import {
  getAdapter,
  detectAdapter,
  listAdapters,
} from '../../src/services/sqlite/adapters/index.js';
import type { AdaptedImport } from '../../src/services/sqlite/adapters/index.js';

// ── Test data fixtures ──

const MEMORY_RECORD = (id: string, content: string, project?: string) =>
  JSON.stringify({
    id: `mem_${id}`,
    type: 'memory',
    content,
    source: 'assistant',
    created_at: '2025-06-15T10:00:00Z',
    tags: ['test'],
    project: project ?? 'test-project',
  });

const SUMMARY_RECORD = (id: string, content: string) =>
  JSON.stringify({
    id: `mem_${id}`,
    type: 'summary',
    content,
    source: 'assistant',
    created_at: '2025-06-15T11:00:00Z',
    tags: [],
    project: 'test-project',
  });

const PROMPT_RECORD = (id: string, content: string) =>
  JSON.stringify({
    id: `mem_${id}`,
    type: 'prompt',
    content,
    source: 'user',
    created_at: '2025-06-15T09:00:00Z',
    tags: [],
    project: 'test-project',
  });

const UNSUPPORTED_RECORD = (id: string, type: string) =>
  JSON.stringify({
    id: `mem_${id}`,
    type,
    content: `Some ${type} content`,
    source: 'assistant',
    created_at: '2025-06-15T10:00:00Z',
  });

// ── Dry-run output formatting tests ──

describe('Import — Dry-run report data', () => {
  it('produces correct counts for a mixed-type file', () => {
    const content = [
      MEMORY_RECORD('1', 'First observation'),
      MEMORY_RECORD('2', 'Second observation'),
      SUMMARY_RECORD('3', 'A summary of the session'),
      PROMPT_RECORD('4', 'User asked something'),
      PROMPT_RECORD('5', 'User asked again'),
    ].join('\n');

    const result = adaptClaudeMemToTotalRecall(content);

    expect(result.observations).toHaveLength(2);
    expect(result.summaries).toHaveLength(1);
    expect(result.prompts).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);

    // Total records = sum of all
    const total = result.observations.length + result.summaries.length +
      result.prompts.length + result.skipped.length;
    expect(total).toBe(5);
  });

  it('separates importable from rejected in dry-run counts', () => {
    const content = [
      MEMORY_RECORD('1', 'Valid observation'),
      UNSUPPORTED_RECORD('2', 'context'),
      UNSUPPORTED_RECORD('3', 'annotation'),
      SUMMARY_RECORD('4', 'Valid summary'),
      UNSUPPORTED_RECORD('5', 'reaction'),
    ].join('\n');

    const result = adaptClaudeMemToTotalRecall(content);

    const importable = result.observations.length + result.summaries.length + result.prompts.length;
    expect(importable).toBe(2); // 1 memory + 1 summary
    expect(result.skipped).toHaveLength(3); // 3 unsupported types
  });

  it('provides rejection reasons for each skipped record', () => {
    const content = [
      UNSUPPORTED_RECORD('1', 'context'),
      JSON.stringify({ id: 'mem_2', type: 'memory', content: '', created_at: '2025-01-01T00:00:00Z' }),
      'not valid json at all',
    ].join('\n');

    const result = adaptClaudeMemToTotalRecall(content);

    expect(result.skipped).toHaveLength(3);

    // Unsupported type
    expect(result.skipped[0]!.reason).toContain('Unsupported type');
    expect(result.skipped[0]!.type).toBe('context');
    expect(result.skipped[0]!.line).toBe(1);

    // Empty content
    expect(result.skipped[1]!.reason).toBe('Empty content field');
    expect(result.skipped[1]!.line).toBe(2);

    // Invalid JSON
    expect(result.skipped[2]!.reason).toContain('Invalid JSON');
    expect(result.skipped[2]!.line).toBe(3);
  });

  it('dry-run data includes project breakdown for multi-project files', () => {
    const content = [
      MEMORY_RECORD('1', 'Obs in project A', 'project-a'),
      MEMORY_RECORD('2', 'Obs in project A again', 'project-a'),
      MEMORY_RECORD('3', 'Obs in project B', 'project-b'),
      SUMMARY_RECORD('4', 'Summary'),  // defaults to "test-project"
    ].join('\n');

    const result = adaptClaudeMemToTotalRecall(content);

    // Count by project
    const projects = new Map<string, number>();
    for (const obs of result.observations) {
      projects.set(obs.project, (projects.get(obs.project) ?? 0) + 1);
    }
    for (const sum of result.summaries) {
      projects.set(sum.project, (projects.get(sum.project) ?? 0) + 1);
    }

    expect(projects.get('project-a')).toBe(2);
    expect(projects.get('project-b')).toBe(1);
    expect(projects.get('test-project')).toBe(1);
  });

  it('categorizes rejection reasons into groups', () => {
    const content = [
      UNSUPPORTED_RECORD('1', 'context'),
      UNSUPPORTED_RECORD('2', 'annotation'),
      UNSUPPORTED_RECORD('3', 'context'),
      JSON.stringify({ id: 'mem_4', type: 'memory', content: '', created_at: '2025-01-01T00:00:00Z' }),
      JSON.stringify({ id: 'mem_5', type: 'memory', content: '  ', created_at: '2025-01-01T00:00:00Z' }),
    ].join('\n');

    const result = adaptClaudeMemToTotalRecall(content);

    // Group skipped by reason pattern
    const unsupportedType = result.skipped.filter(s => s.reason.startsWith('Unsupported type:'));
    const emptyContent = result.skipped.filter(s => s.reason === 'Empty content field');

    expect(unsupportedType).toHaveLength(3);
    expect(emptyContent).toHaveLength(2);
  });
});

// ── Autodetect fallback behavior tests ──

describe('Import — Autodetect fallback behavior', () => {
  it('detects Claude Mem format when content matches', () => {
    const content = MEMORY_RECORD('1', 'Test content');
    const adapter = detectAdapter(content);

    expect(adapter).toBeDefined();
    expect(adapter!.name).toBe('claude-mem');
  });

  it('returns undefined for unrecognized formats', () => {
    // Random CSV-like data
    const csvContent = 'name,value,date\nfoo,bar,2025-01-01\nbaz,qux,2025-01-02';
    expect(detectAdapter(csvContent)).toBeUndefined();
  });

  it('returns undefined for empty content', () => {
    expect(detectAdapter('')).toBeUndefined();
    expect(detectAdapter('   \n   ')).toBeUndefined();
  });

  it('returns undefined for plain text', () => {
    expect(detectAdapter('This is just a plain text file with no JSON at all.')).toBeUndefined();
  });

  it('returns undefined for JSON that is not a known format', () => {
    const unknownJson = [
      JSON.stringify({ action: 'click', target: '#btn', timestamp: 1234 }),
      JSON.stringify({ action: 'type', value: 'hello', timestamp: 1235 }),
    ].join('\n');
    expect(detectAdapter(unknownJson)).toBeUndefined();
  });

  it('does NOT detect native Total Recall JSONL as external format', () => {
    const nativeRecord = JSON.stringify({
      _type: 'observation',
      id: 1,
      memory_session_id: 'sess-1',
      project: 'test',
      type: 'research',
      title: 'Test',
      subtitle: null,
      text: null,
      narrative: 'Content',
      facts: null,
      concepts: null,
      files_read: null,
      files_modified: null,
      prompt_number: 1,
      content_hash: 'abc123',
      discovery_tokens: 10,
      auto_category: null,
      created_at: '2025-01-01T00:00:00Z',
      created_at_epoch: 1735689600000,
    });

    expect(detectAdapter(nativeRecord)).toBeUndefined();
  });

  it('listAdapters returns all registered adapter names', () => {
    const names = listAdapters();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('claude-mem');
    // All names should be non-empty strings
    for (const name of names) {
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('getAdapter returns undefined for unknown names', () => {
    expect(getAdapter('unknown-adapter')).toBeUndefined();
    expect(getAdapter('')).toBeUndefined();
    expect(getAdapter('claude')).toBeUndefined(); // partial match should NOT work
  });

  it('getAdapter returns valid adapter for known names', () => {
    const adapter = getAdapter('claude-mem');
    expect(adapter).toBeDefined();
    expect(adapter!.name).toBe('claude-mem');
    expect(typeof adapter!.detect).toBe('function');
    expect(typeof adapter!.adapt).toBe('function');
  });
});

// ── Edge case: empty file ──

describe('Import — Edge case: empty file', () => {
  it('adapt returns empty result for empty string', () => {
    const result = adaptClaudeMemToTotalRecall('');

    expect(result.observations).toHaveLength(0);
    expect(result.summaries).toHaveLength(0);
    expect(result.prompts).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('adapt returns empty result for whitespace-only content', () => {
    const result = adaptClaudeMemToTotalRecall('   \n  \n   ');

    expect(result.observations).toHaveLength(0);
    expect(result.summaries).toHaveLength(0);
    expect(result.prompts).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('detect returns false for empty file', () => {
    expect(detectClaudeMemFormat('')).toBe(false);
    expect(detectClaudeMemFormat('   ')).toBe(false);
    expect(detectClaudeMemFormat('\n\n\n')).toBe(false);
  });
});

// ── Edge case: file with all unsupported types ──

describe('Import — Edge case: file with all unsupported types', () => {
  it('all records go to skipped, none imported', () => {
    const content = [
      UNSUPPORTED_RECORD('1', 'context'),
      UNSUPPORTED_RECORD('2', 'annotation'),
      UNSUPPORTED_RECORD('3', 'reaction'),
      UNSUPPORTED_RECORD('4', 'bookmark'),
      UNSUPPORTED_RECORD('5', 'preference'),
    ].join('\n');

    const result = adaptClaudeMemToTotalRecall(content);

    expect(result.observations).toHaveLength(0);
    expect(result.summaries).toHaveLength(0);
    expect(result.prompts).toHaveLength(0);
    expect(result.skipped).toHaveLength(5);

    // All have unsupported type reasons
    for (const skip of result.skipped) {
      expect(skip.reason).toContain('Unsupported type');
    }
  });

  it('each rejected record includes its type', () => {
    const content = [
      UNSUPPORTED_RECORD('1', 'context'),
      UNSUPPORTED_RECORD('2', 'annotation'),
    ].join('\n');

    const result = adaptClaudeMemToTotalRecall(content);

    expect(result.skipped[0]!.type).toBe('context');
    expect(result.skipped[1]!.type).toBe('annotation');
  });

  it('file with unsupported types is still detected as Claude Mem format', () => {
    // These still have Claude Mem structure (mem_ prefix, content, source)
    const content = [
      JSON.stringify({
        id: 'mem_1',
        type: 'context',
        content: 'Some context data',
        source: 'assistant',
        created_at: '2025-01-01T00:00:00Z',
      }),
      JSON.stringify({
        id: 'mem_2',
        type: 'annotation',
        content: 'Some annotation',
        source: 'user',
        created_at: '2025-01-01T00:00:00Z',
      }),
    ].join('\n');

    // Detection is based on structure, not type validity
    expect(detectClaudeMemFormat(content)).toBe(true);
  });

  it('preserves line numbers for all rejected records', () => {
    const content = [
      UNSUPPORTED_RECORD('1', 'context'),
      '',  // empty line — skipped
      UNSUPPORTED_RECORD('2', 'annotation'),
      '',  // empty line — skipped
      UNSUPPORTED_RECORD('3', 'reaction'),
    ].join('\n');

    const result = adaptClaudeMemToTotalRecall(content);

    expect(result.skipped).toHaveLength(3);
    expect(result.skipped[0]!.line).toBe(1);
    expect(result.skipped[1]!.line).toBe(3);
    expect(result.skipped[2]!.line).toBe(5);
  });

  it('handles mixed invalid JSON and unsupported types', () => {
    const content = [
      'totally not json',
      UNSUPPORTED_RECORD('1', 'context'),
      '{"broken": true',  // invalid JSON (incomplete)
      UNSUPPORTED_RECORD('2', 'bookmark'),
    ].join('\n');

    const result = adaptClaudeMemToTotalRecall(content);

    expect(result.observations).toHaveLength(0);
    expect(result.summaries).toHaveLength(0);
    expect(result.prompts).toHaveLength(0);
    expect(result.skipped).toHaveLength(4);

    // Check that invalid JSON and unsupported types have different reasons
    const invalidJson = result.skipped.filter(s => s.reason.includes('Invalid JSON'));
    const unsupported = result.skipped.filter(s => s.reason.includes('Unsupported type'));
    expect(invalidJson).toHaveLength(2);
    expect(unsupported).toHaveLength(2);
  });
});

// ── AdaptedImport structure validation ──

describe('Import — AdaptedImport structure for dry-run reporting', () => {
  it('each observation has required fields for display', () => {
    const content = MEMORY_RECORD('1', 'Test observation content');
    const result = adaptClaudeMemToTotalRecall(content);

    const obs = result.observations[0]!;
    expect(obs._type).toBe('observation');
    expect(obs.project).toBeTruthy();
    expect(obs.title).toBeTruthy();
    expect(obs.created_at).toBeTruthy();
    expect(typeof obs.created_at_epoch).toBe('number');
  });

  it('each summary has required fields for display', () => {
    const content = SUMMARY_RECORD('1', 'Test summary content');
    const result = adaptClaudeMemToTotalRecall(content);

    const sum = result.summaries[0]!;
    expect(sum._type).toBe('summary');
    expect(sum.project).toBeTruthy();
    expect(sum.learned).toBeTruthy();
  });

  it('each prompt has required fields for display', () => {
    const content = PROMPT_RECORD('1', 'Test prompt');
    const result = adaptClaudeMemToTotalRecall(content);

    const pmt = result.prompts[0]!;
    expect(pmt._type).toBe('prompt');
    expect(pmt.project).toBeTruthy();
    expect(pmt.prompt_text).toBeTruthy();
    expect(pmt.prompt_number).toBeGreaterThan(0);
  });

  it('skipped records always have line number and reason', () => {
    const content = [
      UNSUPPORTED_RECORD('1', 'unknown'),
      JSON.stringify({ id: 'mem_2', type: 'memory', content: '', created_at: '2025-01-01T00:00:00Z' }),
    ].join('\n');

    const result = adaptClaudeMemToTotalRecall(content);

    for (const skip of result.skipped) {
      expect(typeof skip.line).toBe('number');
      expect(skip.line).toBeGreaterThan(0);
      expect(typeof skip.reason).toBe('string');
      expect(skip.reason.length).toBeGreaterThan(0);
    }
  });
});
