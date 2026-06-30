/**
 * Test suite for Team Sync — markdown serialization, import/export, merge conflicts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  knowledgeToMarkdown,
  markdownToKnowledge,
  generateFilename,
  generateKnowledgeHash,
} from '../../src/services/team/TeamFormatter.js';
import {
  exportKnowledge,
  importKnowledge,
} from '../../src/services/team/TeamSync.js';
import { TotalRecallDatabase } from '../../src/services/sqlite/Database.js';
import type { KnowledgeExportItem } from '../../src/services/team/TeamFormatter.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────────

function makeExportItem(overrides: Partial<KnowledgeExportItem> = {}): KnowledgeExportItem {
  return {
    id: 1,
    type: 'decision',
    project: 'test-project',
    title: 'Use PostgreSQL over MySQL',
    content: 'We chose PostgreSQL for its JSONB support and better concurrency model.',
    created_at: '2025-06-15T10:30:00.000Z',
    importance: 4,
    concepts: ['database', 'architecture', 'postgresql'],
    reason: 'Better JSONB support, MVCC concurrency, and PostGIS for future geo needs.',
    alternatives: ['MySQL 8.0', 'CockroachDB', 'SQLite'],
    ...overrides,
  };
}

function makeConstraintItem(): KnowledgeExportItem {
  return {
    id: 2,
    type: 'constraint',
    project: 'govbee',
    title: 'RA 10173 consent required before PII collection',
    content: 'All applications collecting PII must obtain explicit consent from the data subject before processing.',
    created_at: '2025-01-10T08:00:00.000Z',
    importance: 5,
    concepts: ['data-privacy', 'RA-10173', 'compliance'],
    severity: 'hard',
  };
}

function makeHeuristicItem(): KnowledgeExportItem {
  return {
    id: 3,
    type: 'heuristic',
    project: 'beerespond',
    title: 'Prefer composable fixtures over POM for Playwright',
    content: 'Composable fixtures are easier to maintain and parallelize than Page Object Model.',
    created_at: '2025-03-20T14:00:00.000Z',
    importance: 3,
    concepts: ['testing', 'playwright', 'architecture'],
    confidence: 'high',
    context: 'When writing new E2E test suites from scratch',
  };
}

function makeLowImportanceItem(): KnowledgeExportItem {
  return {
    id: 4,
    type: 'heuristic',
    project: 'misc',
    title: 'Use tabs for indentation in Go',
    content: 'Go uses tabs by convention (gofmt enforces it).',
    created_at: '2025-02-01T09:00:00.000Z',
    importance: 2,
    concepts: ['go', 'formatting'],
  };
}

// ─── Test Helpers ───────────────────────────────────────────────────────────────

let tmpDir: string;

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'team-test-'));
}

function cleanupTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── TeamFormatter Tests ────────────────────────────────────────────────────────

describe('TeamFormatter', () => {
  describe('generateKnowledgeHash', () => {
    it('produces consistent hash for same input', () => {
      const h1 = generateKnowledgeHash('proj', 'title', 'decision');
      const h2 = generateKnowledgeHash('proj', 'title', 'decision');
      expect(h1).toBe(h2);
    });

    it('produces different hash for different input', () => {
      const h1 = generateKnowledgeHash('proj', 'title', 'decision');
      const h2 = generateKnowledgeHash('proj', 'title', 'constraint');
      expect(h1).not.toBe(h2);
    });

    it('hash is 12 characters long', () => {
      const hash = generateKnowledgeHash('project', 'some title', 'heuristic');
      expect(hash.length).toBe(12);
    });
  });

  describe('generateFilename', () => {
    it('produces safe filename with hash prefix', () => {
      const filename = generateFilename('project', 'Use PostgreSQL over MySQL', 'decision');
      expect(filename).toMatch(/^[a-f0-9]{12}-use-postgresql-over-mysql\.md$/);
    });

    it('truncates long titles', () => {
      const longTitle = 'A'.repeat(100);
      const filename = generateFilename('proj', longTitle, 'decision');
      // 12 (hash) + 1 (dash) + max 50 (title) + 3 (.md) = max 66 chars
      expect(filename.length).toBeLessThanOrEqual(66);
    });

    it('handles special characters in titles', () => {
      const filename = generateFilename('proj', 'RA 10173: Data Privacy (§5)', 'constraint');
      expect(filename).not.toMatch(/[^a-z0-9\-\.]/);
    });
  });

  describe('knowledgeToMarkdown', () => {
    it('serializes a decision item with all fields', () => {
      const item = makeExportItem();
      const md = knowledgeToMarkdown(item);

      expect(md).toContain('---\n');
      expect(md).toContain('type: decision');
      expect(md).toContain('project: test-project');
      expect(md).toContain('title: Use PostgreSQL over MySQL');
      expect(md).toContain('importance: 4');
      expect(md).toContain('concepts: [database, architecture, postgresql]');
      expect(md).toContain('We chose PostgreSQL');
      expect(md).toContain('## Reason');
      expect(md).toContain('Better JSONB support');
      expect(md).toContain('## Alternatives');
      expect(md).toContain('- MySQL 8.0');
      expect(md).toContain('- CockroachDB');
      expect(md).toContain('- SQLite');
    });

    it('serializes a constraint item with severity', () => {
      const item = makeConstraintItem();
      const md = knowledgeToMarkdown(item);

      expect(md).toContain('type: constraint');
      expect(md).toContain('severity: hard');
      expect(md).toContain('importance: 5');
      expect(md).not.toContain('## Alternatives');
    });

    it('serializes a heuristic item with context and confidence', () => {
      const item = makeHeuristicItem();
      const md = knowledgeToMarkdown(item);

      expect(md).toContain('type: heuristic');
      expect(md).toContain('confidence: high');
      expect(md).toContain('context: When writing new E2E test suites from scratch');
    });
  });

  describe('markdownToKnowledge', () => {
    it('parses a serialized decision item (roundtrip)', () => {
      const original = makeExportItem();
      const md = knowledgeToMarkdown(original);
      const parsed = markdownToKnowledge(md, 'test.md');

      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe('decision');
      expect(parsed!.project).toBe('test-project');
      expect(parsed!.title).toBe('Use PostgreSQL over MySQL');
      expect(parsed!.importance).toBe(4);
      expect(parsed!.concepts).toEqual(['database', 'architecture', 'postgresql']);
      expect(parsed!.reason).toContain('Better JSONB support');
      expect(parsed!.alternatives).toEqual(['MySQL 8.0', 'CockroachDB', 'SQLite']);
    });

    it('parses a constraint item (roundtrip)', () => {
      const original = makeConstraintItem();
      const md = knowledgeToMarkdown(original);
      const parsed = markdownToKnowledge(md, 'test.md');

      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe('constraint');
      expect(parsed!.severity).toBe('hard');
      expect(parsed!.importance).toBe(5);
    });

    it('parses a heuristic item (roundtrip)', () => {
      const original = makeHeuristicItem();
      const md = knowledgeToMarkdown(original);
      const parsed = markdownToKnowledge(md, 'test.md');

      expect(parsed).not.toBeNull();
      expect(parsed!.type).toBe('heuristic');
      expect(parsed!.confidence).toBe('high');
      expect(parsed!.context).toBe('When writing new E2E test suites from scratch');
    });

    it('returns null for invalid markdown (no frontmatter)', () => {
      const result = markdownToKnowledge('Just some text without frontmatter', 'bad.md');
      expect(result).toBeNull();
    });

    it('returns null for incomplete frontmatter (missing required fields)', () => {
      const md = '---\nid: abc123\n---\nSome content\n';
      const result = markdownToKnowledge(md, 'incomplete.md');
      expect(result).toBeNull();
    });

    it('defaults importance to 3 if not specified', () => {
      const md = '---\ntype: decision\nproject: proj\ntitle: Test\n---\nContent here\n';
      const result = markdownToKnowledge(md, 'no-importance.md');
      expect(result).not.toBeNull();
      expect(result!.importance).toBe(3);
    });
  });
});

// ─── Export/Import Integration Tests ────────────────────────────────────────────

describe('TeamSync export/import', () => {
  let db: TotalRecallDatabase;
  let targetDir: string;

  beforeEach(() => {
    db = new TotalRecallDatabase(':memory:');
    targetDir = createTmpDir();
  });

  afterEach(() => {
    db.close();
    cleanupTmpDir(targetDir);
  });

  /** Insert a knowledge observation directly into the test DB */
  function insertKnowledge(opts: {
    project: string;
    type: string;
    title: string;
    content: string;
    importance?: number;
    concepts?: string;
  }): void {
    const metadata = JSON.stringify({
      knowledgeType: opts.type,
      importance: opts.importance ?? 3,
    });
    db.db.run(
      `INSERT INTO observations
       (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens, auto_category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'test-session', opts.project, opts.type, opts.title, null,
        opts.content, null, metadata, opts.concepts ?? null, null, null,
        0, new Date().toISOString(), Date.now(), null, 0, 'knowledge',
      ]
    );
  }

  describe('exportKnowledge', () => {
    it('exports knowledge items with importance >= 3', () => {
      insertKnowledge({ project: 'proj', type: 'decision', title: 'High importance', content: 'Content A', importance: 4 });
      insertKnowledge({ project: 'proj', type: 'constraint', title: 'Medium importance', content: 'Content B', importance: 3 });
      insertKnowledge({ project: 'proj', type: 'heuristic', title: 'Low importance', content: 'Content C', importance: 2 });

      const count = exportKnowledge(db.db, targetDir, 3);

      expect(count).toBe(2);
      const knowledgeDir = path.join(targetDir, 'knowledge');
      const files = fs.readdirSync(knowledgeDir);
      expect(files.length).toBe(2);
    });

    it('creates markdown files with proper content', () => {
      insertKnowledge({ project: 'myproj', type: 'decision', title: 'Choose Zig', content: 'Zig is fast and safe.', importance: 5 });

      exportKnowledge(db.db, targetDir, 3);

      const knowledgeDir = path.join(targetDir, 'knowledge');
      const files = fs.readdirSync(knowledgeDir);
      expect(files.length).toBe(1);

      const content = fs.readFileSync(path.join(knowledgeDir, files[0]!), 'utf8');
      expect(content).toContain('type: decision');
      expect(content).toContain('project: myproj');
      expect(content).toContain('title: Choose Zig');
      expect(content).toContain('Zig is fast and safe.');
    });

    it('skips non-knowledge observation types', () => {
      // Insert a regular observation (not knowledge type)
      db.db.run(
        `INSERT INTO observations
         (memory_session_id, project, type, title, subtitle, text, narrative, facts, concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash, discovery_tokens, auto_category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['s', 'proj', 'file-write', 'Updated config', null, 'Modified settings', null, null, null, null, null, 0, new Date().toISOString(), Date.now(), null, 0, null]
      );

      const count = exportKnowledge(db.db, targetDir, 3);
      expect(count).toBe(0);
    });
  });

  describe('importKnowledge', () => {
    it('imports markdown files into the database', () => {
      // Create a knowledge markdown file in the target dir
      const knowledgeDir = path.join(targetDir, 'knowledge');
      fs.mkdirSync(knowledgeDir, { recursive: true });

      const md = `---
type: decision
project: imported-proj
title: Use TypeScript strict mode
created: 2025-05-01T00:00:00.000Z
importance: 4
concepts: [typescript, config]
---

Enable strict mode in all TypeScript projects for better type safety.

## Reason

Catches more bugs at compile time.

## Alternatives
- JavaScript with JSDoc
- Flow
`;
      fs.writeFileSync(path.join(knowledgeDir, 'abc123-use-typescript-strict.md'), md, 'utf8');

      const result = importKnowledge(db.db, targetDir);

      expect(result.imported).toBe(1);
      expect(result.conflicts).toHaveLength(0);
      expect(result.errors).toHaveLength(0);

      // Verify it was inserted in the DB
      const row = db.db.query('SELECT * FROM observations WHERE title = ?').get('Use TypeScript strict mode') as any;
      expect(row).not.toBeNull();
      expect(row.project).toBe('imported-proj');
      expect(row.type).toBe('decision');
      expect(row.text).toContain('Enable strict mode');
    });

    it('reports conflict when local already has the same item (local wins)', () => {
      // Insert existing knowledge
      insertKnowledge({ project: 'proj', type: 'decision', title: 'Use Redis', content: 'Local version.' });

      // Create a conflicting markdown file
      const knowledgeDir = path.join(targetDir, 'knowledge');
      fs.mkdirSync(knowledgeDir, { recursive: true });

      const md = `---
type: decision
project: proj
title: Use Redis
created: 2025-06-01T00:00:00.000Z
importance: 4
concepts: [caching]
---

Remote version — should be skipped.
`;
      fs.writeFileSync(path.join(knowledgeDir, 'hash-use-redis.md'), md, 'utf8');

      const result = importKnowledge(db.db, targetDir);

      expect(result.imported).toBe(0);
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0]).toContain('Use Redis');
      expect(result.conflicts[0]).toContain('local wins');

      // Verify local version is unchanged
      const row = db.db.query('SELECT * FROM observations WHERE title = ?').get('Use Redis') as any;
      expect(row.text).toBe('Local version.');
    });

    it('handles invalid markdown files gracefully', () => {
      const knowledgeDir = path.join(targetDir, 'knowledge');
      fs.mkdirSync(knowledgeDir, { recursive: true });
      fs.writeFileSync(path.join(knowledgeDir, 'bad.md'), 'not a valid file', 'utf8');

      const result = importKnowledge(db.db, targetDir);

      expect(result.imported).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('bad.md');
    });

    it('returns empty result when knowledge directory does not exist', () => {
      const emptyDir = createTmpDir();
      try {
        const result = importKnowledge(db.db, emptyDir);
        expect(result.imported).toBe(0);
        expect(result.conflicts).toHaveLength(0);
      } finally {
        cleanupTmpDir(emptyDir);
      }
    });
  });

  describe('roundtrip export → import', () => {
    it('exports then imports into a fresh DB preserving data', () => {
      // Insert knowledge
      insertKnowledge({ project: 'roundtrip', type: 'decision', title: 'Use Bun for tests', content: 'Bun is fast for testing.', importance: 4, concepts: 'bun, testing' });
      insertKnowledge({ project: 'roundtrip', type: 'constraint', title: 'Never use eval', content: 'eval() is a security risk.', importance: 5, concepts: 'security' });

      // Export
      const exportCount = exportKnowledge(db.db, targetDir, 3);
      expect(exportCount).toBe(2);

      // Create fresh DB and import
      const db2 = new TotalRecallDatabase(':memory:');
      try {
        const result = importKnowledge(db2.db, targetDir);
        expect(result.imported).toBe(2);

        // Verify content
        const rows = db2.db.query('SELECT * FROM observations ORDER BY title').all() as any[];
        expect(rows.length).toBe(2);
        expect(rows[0].title).toBe('Never use eval');
        expect(rows[0].type).toBe('constraint');
        expect(rows[1].title).toBe('Use Bun for tests');
        expect(rows[1].type).toBe('decision');
      } finally {
        db2.close();
      }
    });
  });
});
