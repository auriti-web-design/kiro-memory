/**
 * Comando kiroMemory.quickSearch — Ricerca rapida con Ctrl+Shift+K.
 *
 * A differenza del comando search standard, questo:
 * - Ha un keybinding dedicato (Ctrl+Shift+K / Cmd+Shift+K)
 * - Mostra un QuickPick con filtro inline in tempo reale
 * - Items formattati: [type] title - project (date)
 * - Selezione apre il contenuto completo in un editor tab
 */

import * as vscode from 'vscode';
import type { TotalRecallClient, Observation } from '../api-client';

// ── Tipo item QuickPick ────────────────────────────────────────────────────

interface QuickSearchItem extends vscode.QuickPickItem {
  observation: Observation;
}

// ── Comando principale ─────────────────────────────────────────────────────

export async function quickPickCommand(client: TotalRecallClient): Promise<void> {
  const qp = vscode.window.createQuickPick<QuickSearchItem>();
  qp.placeholder = 'Type to search observations... (Ctrl+Shift+K)';
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;

  // Debounce per evitare troppe richieste durante la digitazione
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  qp.onDidChangeValue((value) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (value.length < 2) {
      qp.items = [];
      qp.busy = false;
      return;
    }

    qp.busy = true;
    debounceTimer = setTimeout(async () => {
      try {
        const results = await client.search(value);
        const items: QuickSearchItem[] = results.observations.map(obs => ({
          label: `$(${getIconForType(obs.type)}) ${obs.title || '(untitled)'}`,
          description: `[${obs.type}] ${obs.project}`,
          detail: formatDate(obs.created_at) + (obs.narrative ? ` — ${obs.narrative.slice(0, 80)}` : ''),
          observation: obs
        }));

        qp.items = items;
      } catch {
        qp.items = [{
          label: '$(warning) Worker not reachable',
          description: 'Ensure Total Recall worker is running',
          detail: 'Start with: npx totalrecall serve',
          observation: undefined as unknown as Observation
        }];
      }
      qp.busy = false;
    }, 300);
  });

  qp.onDidAccept(async () => {
    const selected = qp.selectedItems[0];
    qp.hide();

    if (!selected?.observation) {
      return;
    }

    await openObservationTab(selected.observation);
  });

  qp.onDidHide(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    qp.dispose();
  });

  qp.show();
}

// ── Comando: mostra osservazioni per un file (da CodeLens) ─────────────────

export async function showFileObservationsCommand(
  observations: Observation[],
  _filePath: string
): Promise<void> {
  if (observations.length === 0) {
    vscode.window.showInformationMessage('No observations found for this file.');
    return;
  }

  const items: QuickSearchItem[] = observations.map(obs => ({
    label: `$(${getIconForType(obs.type)}) ${obs.title || '(untitled)'}`,
    description: `[${obs.type}] ${obs.project}`,
    detail: formatDate(obs.created_at) + (obs.narrative ? ` — ${obs.narrative.slice(0, 80)}` : ''),
    observation: obs
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `${observations.length} observation(s) for this file`,
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (selected) {
    await openObservationTab(selected.observation);
  }
}

// ── Helper: apri osservazione in editor tab ───────────────────────────────

async function openObservationTab(obs: Observation): Promise<void> {
  const content = buildMarkdown(obs);
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: 'markdown'
  });
  await vscode.window.showTextDocument(doc, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside
  });
}

function buildMarkdown(obs: Observation): string {
  const lines: string[] = [
    `# ${obs.title || '(untitled)'}`,
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Project** | \`${obs.project}\` |`,
    `| **Type** | \`${obs.type}\` |`,
    `| **Date** | ${new Date(obs.created_at).toLocaleString()} |`,
    `| **ID** | ${obs.id} |`,
  ];

  if (obs.file_path) {
    lines.push(`| **File** | \`${obs.file_path}\` |`);
  }
  if (obs.tool_name) {
    lines.push(`| **Tool** | \`${obs.tool_name}\` |`);
  }
  if (obs.concepts) {
    lines.push(`| **Concepts** | ${obs.concepts} |`);
  }

  lines.push('');

  if (obs.narrative) {
    lines.push('## Narrative', '', obs.narrative, '');
  }

  if (obs.content) {
    lines.push('## Content', '', '```', obs.content, '```', '');
  }

  if (obs.files) {
    try {
      const filesArr = JSON.parse(obs.files) as string[];
      if (filesArr.length > 0) {
        lines.push('## Related Files', '');
        for (const f of filesArr) {
          lines.push(`- \`${f}\``);
        }
        lines.push('');
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  return lines.join('\n');
}

// ── Utility ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getIconForType(type: string): string {
  const map: Record<string, string> = {
    'file-write': 'file-code',
    file_write: 'file-code',
    file_read: 'file',
    command: 'terminal',
    decision: 'lightbulb',
    constraint: 'lock',
    heuristic: 'compass',
    rejected: 'close',
    research: 'search',
    knowledge: 'book',
    summary: 'list-tree',
    tool_use: 'tools',
    git: 'git-commit',
    prompt: 'comment',
  };
  return map[type] ?? 'circle-outline';
}
