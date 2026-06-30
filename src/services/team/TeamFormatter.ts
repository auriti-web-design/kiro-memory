/**
 * TeamFormatter — Serializes knowledge items to Git-friendly markdown
 * and parses them back for import.
 */

import { createHash } from 'node:crypto';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface KnowledgeExportItem {
  id: number;
  type: string;
  project: string;
  title: string;
  content: string;
  created_at: string;
  importance: number;
  concepts: string[];
  reason?: string;
  alternatives?: string[];
  severity?: string;
  context?: string;
  confidence?: string;
}

export interface KnowledgeImportItem {
  /** Short SHA256-based id from filename/frontmatter */
  hash: string;
  type: string;
  project: string;
  title: string;
  content: string;
  created: string;
  importance: number;
  concepts: string[];
  reason?: string;
  alternatives?: string[];
  severity?: string;
  context?: string;
  confidence?: string;
}

// ─── Export: DB record → Markdown ───────────────────────────────────────────────

/**
 * Generate a short hash for a knowledge item (used as filename and id).
 * Based on project + title + type for stable deduplication.
 */
export function generateKnowledgeHash(project: string, title: string, type: string): string {
  const input = `${project}::${type}::${title}`;
  return createHash('sha256').update(input).digest('hex').substring(0, 12);
}

/**
 * Convert a knowledge DB record to markdown with YAML frontmatter.
 */
export function knowledgeToMarkdown(item: KnowledgeExportItem): string {
  const hash = generateKnowledgeHash(item.project, item.title, item.type);

  // Build YAML frontmatter manually to avoid dependency on yaml stringify for simple cases
  const frontmatter: string[] = [
    '---',
    `id: ${hash}`,
    `type: ${item.type}`,
    `project: ${item.project}`,
    `title: ${yamlEscapeString(item.title)}`,
    `created: ${item.created_at}`,
    `importance: ${item.importance}`,
    `concepts: [${item.concepts.map(c => yamlEscapeString(c)).join(', ')}]`,
  ];

  if (item.severity) {
    frontmatter.push(`severity: ${item.severity}`);
  }
  if (item.confidence) {
    frontmatter.push(`confidence: ${item.confidence}`);
  }
  if (item.context) {
    frontmatter.push(`context: ${yamlEscapeString(item.context)}`);
  }

  frontmatter.push('---');

  // Build body
  const sections: string[] = [frontmatter.join('\n'), '', item.content];

  if (item.reason) {
    sections.push('', '## Reason', '', item.reason);
  }

  if (item.alternatives && item.alternatives.length > 0) {
    sections.push('', '## Alternatives', '');
    for (const alt of item.alternatives) {
      sections.push(`- ${alt}`);
    }
  }

  return sections.join('\n') + '\n';
}

// ─── Import: Markdown → DB-ready record ─────────────────────────────────────────

/**
 * Parse a markdown file (with YAML frontmatter) back to a knowledge import item.
 * Returns null if the file is not a valid knowledge markdown.
 */
export function markdownToKnowledge(content: string, filename: string): KnowledgeImportItem | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;

  const frontmatterRaw = frontmatterMatch[1] ?? '';
  const body = frontmatterMatch[2] ?? '';

  // Parse YAML frontmatter manually (simple key: value format)
  const fm = parseFrontmatter(frontmatterRaw);

  const type = fm['type'];
  const project = fm['project'];
  const title = fm['title'];
  const created = fm['created'];

  if (!type || !project || !title) return null;

  const hash = fm['id'] || generateKnowledgeHash(project, title, type);
  const importance = parseInt(fm['importance'] ?? '3', 10);
  const concepts = parseYamlArray(fm['concepts'] ?? '');

  // Parse body sections
  const { mainContent, reason, alternatives } = parseBodySections(body);

  const result: KnowledgeImportItem = {
    hash,
    type,
    project,
    title,
    content: mainContent,
    created: created || new Date().toISOString(),
    importance,
    concepts,
  };

  if (reason) result.reason = reason;
  if (alternatives.length > 0) result.alternatives = alternatives;
  if (fm['severity']) result.severity = fm['severity'];
  if (fm['confidence']) result.confidence = fm['confidence'];
  if (fm['context']) result.context = fm['context'];

  return result;
}

/**
 * Generate a safe filename from a knowledge item.
 */
export function generateFilename(project: string, title: string, type: string): string {
  const hash = generateKnowledgeHash(project, title, type);
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  return `${hash}-${safeTitle}.md`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Escape a string for YAML (wrap in quotes if needed) */
function yamlEscapeString(value: string): string {
  if (/[:#\[\]{},&*!|>'"@`]/.test(value) || value.includes('\n')) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** Parse simple YAML frontmatter (key: value per line) */
function parseFrontmatter(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const key = line.substring(0, colonIdx).trim();
    let value = line.substring(colonIdx + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** Parse a YAML array in bracket notation: [item1, item2] */
function parseYamlArray(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '[]') return [];
  // Remove brackets
  const inner = trimmed.startsWith('[') ? trimmed.slice(1, -1) : trimmed;
  return inner.split(',').map(s => {
    let item = s.trim();
    if ((item.startsWith('"') && item.endsWith('"')) ||
        (item.startsWith("'") && item.endsWith("'"))) {
      item = item.slice(1, -1);
    }
    return item;
  }).filter(Boolean);
}

/** Parse the body into main content, reason section, and alternatives */
function parseBodySections(body: string): {
  mainContent: string;
  reason: string | undefined;
  alternatives: string[];
} {
  const lines = body.split('\n');
  let mainContent = '';
  let reason: string | undefined;
  const alternatives: string[] = [];
  let currentSection: 'main' | 'reason' | 'alternatives' = 'main';

  for (const line of lines) {
    if (line.trim() === '## Reason') {
      currentSection = 'reason';
      continue;
    }
    if (line.trim() === '## Alternatives') {
      currentSection = 'alternatives';
      continue;
    }

    switch (currentSection) {
      case 'main':
        mainContent += line + '\n';
        break;
      case 'reason':
        if (reason === undefined) reason = '';
        reason += line + '\n';
        break;
      case 'alternatives':
        if (line.trim().startsWith('- ')) {
          alternatives.push(line.trim().substring(2));
        }
        break;
    }
  }

  return {
    mainContent: mainContent.trim(),
    reason: reason?.trim() || undefined,
    alternatives,
  };
}
