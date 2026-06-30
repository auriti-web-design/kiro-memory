/**
 * Test suite for the Claude Mem import adapter.
 *
 * Tests cover:
 * - Format detection (positive and negative cases)
 * - Transformation of memory, summary, and prompt types
 * - Edge cases: empty content, missing fields, unsupported types
 * - Provenance preservation
 * - Deduplication hash generation
 * - Auto-detection vs explicit source flag scenarios
 */

import { describe, it, expect } from 'bun:test';
import {
  detectClaudeMemFormat,
  adaptClaudeMemToTotalRecall,
  claudeMemAdapter,
} from '../../src/services/sqlite/adapters/claude-mem.js';
import {
  getAdapter,
  detectAdapter,
  listAdapters,
} from '../../src/services/sqlite/adapters/index.js';

// ── Sample data ──

const SAMPLE_MEMORY = JSON.stringify({
  id: 'mem_abc123',
  type: 'memory',
  content: 'The user prefers TypeScript with strict mode enabled.',
  source: 'assistant',
  created_at: '2025-06-15T10:30:00Z',
  tags: ['typescript', 'preferences'],
  project: 'my-project',
});

const SAMPLE_SUMMARY = JSON.stringify({
  id: 'mem_def456',
  type: 'summary',
  content: 'Session focused on implementing auth middleware using JWT tokens.',
  source: 'assistant',
  created_at: '2025-06-15T11:00:00Z',
  tags: ['auth'],
  project: 'my-project',
});

const SAMPLE_PROMPT = JSON.stringify({
  id: 'mem_ghi789',
  type: 'prompt',
  content: 'Help me implement a login endpoint with bcrypt password hashing.',
  source: 'user',
  created_at: '2025-06-15T09:00:00Z',
  tags: [],
  project: 'my-project',
});

const SAMPLE_FULL_EXPORT = [SAMPLE_MEMORY, SAMPLE_SUMMARY, SAMPLE_PROMPT].join('\n');

const NATIVE_JSONL = JSON.stringify({
  _type: 'observation',
  id: 1,
  memory_session_id: 'sess-1',
  project: 'test',
  type: 'research',
  title: 'Test',
  subtitle: null,
  text: null,
  narrative: 'Narrative',
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

// ── Detection tests ──

describe('Claude Mem Adapter — detectClaudeMemFormat', () => {
  it('detects valid Claude Mem export with mem_ id prefix', () => {
    const content = JSON.stringify({
      id: 'mem_test123',
      type: 'memory',
      content: 'Some memory content',
      source: 'user',
      created_at: '2025-01-01T00:00:00Z',
    });
    expect(detectClaudeMemFormat(content)).toBe(true);
  });

  it('detects Claude Mem by type+content combination', () => {
    const content = JSON.stringify({
      type: 'memory',
      content: 'A memory without an id prefix',
      created_at: '2025-01-01T00:00:00Z',
    });
    expect(detectClaudeMemFormat(content)).toBe(true);
  });

  it('detects Claude Mem by source+content+created_at', () => {
    const content = JSON.stringify({
      content: 'Content from user',
      source: 'user',
      created_at: '2025-01-01T00:00:00Z',
    });
    expect(detectClaudeMemFormat(content)).toBe(true);
  });

  it('detects multi-line Claude Mem export', () => {
    expect(detectClaudeMemFormat(SAMPLE_FULL_EXPORT)).toBe(true);
  });

  it('returns false for native Total Recall JSONL', () => {
    expect(detectClaudeMemFormat(NATIVE_JSONL)).toBe(false);
  });

  it('returns false for empty content', () => {
    expect(detectClaudeMemFormat('')).toBe(false);
    expect(detectClaudeMemFormat('   ')).toBe(false);
  });

  it('returns false for non-JSON content', () => {
    expect(detectClaudeMemFormat('not json at all')).toBe(false);
  });

  it('returns false for unrelated JSON', () => {
    const unrelated = JSON.stringify({ name: 'John', age: 30 });
    expect(detectClaudeMemFormat(unrelated)).toBe(false);
  });

  it('returns false for JSON array (not JSONL)', () => {
    const arr = JSON.stringify([{ id: 'mem_1', type: 'memory', content: 'test' }]);
    expect(detectClaudeMemFormat(arr)).toBe(false);
  });
});

// ── Adaptation tests ──

describe('Claude Mem Adapter — adaptClaudeMemToTotalRecall', () => {
  it('transforms memory type to observation with type "research"', () => {
    const result = adaptClaudeMemToTotalRecall(SAMPLE_MEMORY);

    expect(result.observations).toHaveLength(1);
    expect(result.summaries).toHaveLength(0);
    expect(result.prompts).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);

    const obs = result.observations[0]!;
    expect(obs._type).toBe('observation');
    expect(obs.type).toBe('research');
    expect(obs.project).toBe('my-project');
    expect(obs.narrative).toBe('The user prefers TypeScript with strict mode enabled.');
    expect(obs.concepts).toBe('typescript, preferences');
    expect(obs.created_at).toBe('2025-06-15T10:30:00Z');
    expect(obs.created_at_epoch).toBe(Date.parse('2025-06-15T10:30:00Z'));
    expect(obs.auto_category).toBe('imported');
    expect(obs.content_hash).toBeTruthy();
  });

  it('preserves provenance in facts field', () => {
    const result = adaptClaudeMemToTotalRecall(SAMPLE_MEMORY);
    const obs = result.observations[0]!;

    expect(obs.facts).toBeTruthy();
    const provenance = JSON.parse(obs.facts!);
    expect(provenance._source).toBe('claude-mem');
    expect(provenance.original_id).toBe('mem_abc123');
    expect(provenance.source).toBe('assistant');
    expect(provenance.tags).toEqual(['typescript', 'preferences']);
  });

  it('transforms summary type to summary record', () => {
    const result = adaptClaudeMemToTotalRecall(SAMPLE_SUMMARY);

    expect(result.observations).toHaveLength(0);
    expect(result.summaries).toHaveLength(1);
    expect(result.prompts).toHaveLength(0);

    const sum = result.summaries[0]!;
    expect(sum._type).toBe('summary');
    expect(sum.project).toBe('my-project');
    expect(sum.learned).toBe('Session focused on implementing auth middleware using JWT tokens.');
    expect(sum.notes).toContain('Imported from Claude Mem');
    expect(sum.notes).toContain('mem_def456');
    expect(sum.session_id).toContain('claude-mem-');
  });

  it('transforms prompt type to prompt record', () => {
    const result = adaptClaudeMemToTotalRecall(SAMPLE_PROMPT);

    expect(result.observations).toHaveLength(0);
    expect(result.summaries).toHaveLength(0);
    expect(result.prompts).toHaveLength(1);

    const pmt = result.prompts[0]!;
    expect(pmt._type).toBe('prompt');
    expect(pmt.project).toBe('my-project');
    expect(pmt.prompt_text).toBe('Help me implement a login endpoint with bcrypt password hashing.');
    expect(pmt.prompt_number).toBe(1);
    expect(pmt.content_session_id).toContain('claude-mem-');
  });

  it('handles full multi-record export', () => {
    const result = adaptClaudeMemToTotalRecall(SAMPLE_FULL_EXPORT);

    expect(result.observations).toHaveLength(1);
    expect(result.summaries).toHaveLength(1);
    expect(result.prompts).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });

  it('uses defaultProject when record has no project', () => {
    const noProject = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: 'No project specified',
      source: 'user',
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = adaptClaudeMemToTotalRecall(noProject, { defaultProject: 'custom-project' });
    expect(result.observations[0]!.project).toBe('custom-project');
  });

  it('uses "claude-mem-import" as fallback project', () => {
    const noProject = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: 'No project specified',
      source: 'user',
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = adaptClaudeMemToTotalRecall(noProject);
    expect(result.observations[0]!.project).toBe('claude-mem-import');
  });

  it('generates deterministic session IDs from date', () => {
    const record1 = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: 'First',
      created_at: '2025-06-15T10:00:00Z',
    });
    const record2 = JSON.stringify({
      id: 'mem_2',
      type: 'memory',
      content: 'Second',
      created_at: '2025-06-15T14:00:00Z',
    });
    const content = `${record1}\n${record2}`;

    const result = adaptClaudeMemToTotalRecall(content);
    // Same day → same session
    expect(result.observations[0]!.memory_session_id).toBe(result.observations[1]!.memory_session_id);
    expect(result.observations[0]!.memory_session_id).toBe('claude-mem-2025-06-15');
  });

  it('groups different days into different sessions', () => {
    const day1 = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: 'Day 1',
      created_at: '2025-06-15T10:00:00Z',
    });
    const day2 = JSON.stringify({
      id: 'mem_2',
      type: 'memory',
      content: 'Day 2',
      created_at: '2025-06-16T10:00:00Z',
    });
    const content = `${day1}\n${day2}`;

    const result = adaptClaudeMemToTotalRecall(content);
    expect(result.observations[0]!.memory_session_id).toBe('claude-mem-2025-06-15');
    expect(result.observations[1]!.memory_session_id).toBe('claude-mem-2025-06-16');
  });

  it('computes content hash for deduplication', () => {
    const result = adaptClaudeMemToTotalRecall(SAMPLE_MEMORY);
    const obs = result.observations[0]!;
    expect(obs.content_hash).toBeTruthy();
    expect(obs.content_hash!.length).toBe(64); // SHA256 hex
  });

  it('produces unique hashes for different content', () => {
    const mem1 = JSON.stringify({ id: 'mem_1', type: 'memory', content: 'First memory', created_at: '2025-01-01T00:00:00Z', project: 'p1' });
    const mem2 = JSON.stringify({ id: 'mem_2', type: 'memory', content: 'Second memory', created_at: '2025-01-01T00:00:00Z', project: 'p1' });
    const content = `${mem1}\n${mem2}`;

    const result = adaptClaudeMemToTotalRecall(content);
    expect(result.observations[0]!.content_hash).not.toBe(result.observations[1]!.content_hash);
  });

  it('increments prompt numbers sequentially', () => {
    const p1 = JSON.stringify({ type: 'prompt', content: 'First', created_at: '2025-01-01T00:00:00Z' });
    const p2 = JSON.stringify({ type: 'prompt', content: 'Second', created_at: '2025-01-01T00:00:00Z' });
    const p3 = JSON.stringify({ type: 'prompt', content: 'Third', created_at: '2025-01-01T00:00:00Z' });
    const content = `${p1}\n${p2}\n${p3}`;

    const result = adaptClaudeMemToTotalRecall(content);
    expect(result.prompts[0]!.prompt_number).toBe(1);
    expect(result.prompts[1]!.prompt_number).toBe(2);
    expect(result.prompts[2]!.prompt_number).toBe(3);
  });

  it('uses first line as title when content is multi-line', () => {
    const record = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: 'Short title\nThis is the rest of the content that goes into narrative.',
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = adaptClaudeMemToTotalRecall(record);
    expect(result.observations[0]!.title).toBe('Short title');
    expect(result.observations[0]!.narrative).toContain('Short title');
    expect(result.observations[0]!.narrative).toContain('rest of the content');
  });

  it('truncates title to 200 chars for single-line content', () => {
    const longContent = 'A'.repeat(300);
    const record = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: longContent,
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = adaptClaudeMemToTotalRecall(record);
    expect(result.observations[0]!.title.length).toBe(200);
  });
});

// ── Edge cases ──

describe('Claude Mem Adapter — edge cases', () => {
  it('skips records with empty content', () => {
    const record = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: '',
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = adaptClaudeMemToTotalRecall(record);
    expect(result.observations).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('Empty content field');
    expect(result.skipped[0]!.originalId).toBe('mem_1');
  });

  it('skips records with whitespace-only content', () => {
    const record = JSON.stringify({
      id: 'mem_2',
      type: 'memory',
      content: '   \n  \t  ',
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = adaptClaudeMemToTotalRecall(record);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('Empty content field');
  });

  it('skips unsupported types with descriptive reason', () => {
    const record = JSON.stringify({
      id: 'mem_1',
      type: 'context',
      content: 'Some context data',
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = adaptClaudeMemToTotalRecall(record);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.type).toBe('context');
    expect(result.skipped[0]!.reason).toContain('Unsupported type');
    expect(result.skipped[0]!.reason).toContain('context');
  });

  it('handles records with missing fields gracefully', () => {
    // Minimal record — only content (treated as "memory" by default)
    const record = JSON.stringify({
      content: 'Just content, nothing else',
    });

    const result = adaptClaudeMemToTotalRecall(record);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]!.project).toBe('claude-mem-import');
  });

  it('handles invalid JSON lines by adding to skipped', () => {
    const content = `${SAMPLE_MEMORY}\nnot valid json\n${SAMPLE_SUMMARY}`;

    const result = adaptClaudeMemToTotalRecall(content);
    expect(result.observations).toHaveLength(1);
    expect(result.summaries).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.line).toBe(2);
    expect(result.skipped[0]!.reason).toContain('Invalid JSON');
  });

  it('handles non-object JSON values', () => {
    const content = `${SAMPLE_MEMORY}\n42\n"just a string"`;

    const result = adaptClaudeMemToTotalRecall(content);
    expect(result.observations).toHaveLength(1);
    expect(result.skipped).toHaveLength(2);
  });

  it('skips empty lines without counting them', () => {
    const content = `\n${SAMPLE_MEMORY}\n\n\n${SAMPLE_SUMMARY}\n`;

    const result = adaptClaudeMemToTotalRecall(content);
    expect(result.observations).toHaveLength(1);
    expect(result.summaries).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });

  it('handles records with null tags', () => {
    const record = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: 'Content with null tags',
      tags: null,
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = adaptClaudeMemToTotalRecall(record);
    expect(result.observations[0]!.concepts).toBeNull();
  });

  it('handles records with empty tags array', () => {
    const record = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: 'Content with empty tags',
      tags: [],
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = adaptClaudeMemToTotalRecall(record);
    expect(result.observations[0]!.concepts).toBeNull();
  });

  it('returns empty result for empty input', () => {
    const result = adaptClaudeMemToTotalRecall('');
    expect(result.observations).toHaveLength(0);
    expect(result.summaries).toHaveLength(0);
    expect(result.prompts).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('handles records with invalid created_at by using current time', () => {
    const record = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: 'Content with bad date',
      created_at: 'not-a-date',
    });

    const before = Date.now();
    const result = adaptClaudeMemToTotalRecall(record);
    const after = Date.now();

    const epoch = result.observations[0]!.created_at_epoch;
    expect(epoch).toBeGreaterThanOrEqual(before);
    expect(epoch).toBeLessThanOrEqual(after);
  });

  it('preserves additional metadata in provenance', () => {
    const record = JSON.stringify({
      id: 'mem_1',
      type: 'memory',
      content: 'Content with metadata',
      source: 'assistant',
      created_at: '2025-01-01T00:00:00Z',
      metadata: { conversation_id: 'conv_123', model: 'claude-3' },
    });

    const result = adaptClaudeMemToTotalRecall(record);
    const provenance = JSON.parse(result.observations[0]!.facts!);
    expect(provenance.metadata).toEqual({ conversation_id: 'conv_123', model: 'claude-3' });
  });

  it('estimates tokens based on content length', () => {
    const content100chars = 'x'.repeat(100);
    const record = JSON.stringify({
      type: 'memory',
      content: content100chars,
      created_at: '2025-01-01T00:00:00Z',
    });

    const result = adaptClaudeMemToTotalRecall(record);
    expect(result.observations[0]!.discovery_tokens).toBe(25); // 100/4 = 25
  });
});

// ── Registry tests ──

describe('Claude Mem Adapter — registry', () => {
  it('is registered and retrievable by name', () => {
    const adapter = getAdapter('claude-mem');
    expect(adapter).toBeDefined();
    expect(adapter!.name).toBe('claude-mem');
  });

  it('is auto-detected for Claude Mem content', () => {
    const adapter = detectAdapter(SAMPLE_FULL_EXPORT);
    expect(adapter).toBeDefined();
    expect(adapter!.name).toBe('claude-mem');
  });

  it('is NOT auto-detected for native JSONL', () => {
    const adapter = detectAdapter(NATIVE_JSONL);
    expect(adapter).toBeUndefined();
  });

  it('lists all adapters', () => {
    const names = listAdapters();
    expect(names).toContain('claude-mem');
  });

  it('returns undefined for unknown adapter name', () => {
    expect(getAdapter('nonexistent')).toBeUndefined();
  });

  it('adapter.adapt() matches standalone function', () => {
    const standaloneResult = adaptClaudeMemToTotalRecall(SAMPLE_FULL_EXPORT);
    const adapterResult = claudeMemAdapter.adapt(SAMPLE_FULL_EXPORT);

    expect(adapterResult.observations).toHaveLength(standaloneResult.observations.length);
    expect(adapterResult.summaries).toHaveLength(standaloneResult.summaries.length);
    expect(adapterResult.prompts).toHaveLength(standaloneResult.prompts.length);
  });
});
