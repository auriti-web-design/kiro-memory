/**
 * CodeLens provider per Total Recall.
 *
 * Mostra una lente in cima ai file che hanno osservazioni associate nel
 * database Total Recall. Il CodeLens mostra il conteggio e permette di
 * consultare le osservazioni tramite QuickPick al click.
 */

import * as vscode from 'vscode';
import type { TotalRecallClient, Observation } from '../api-client';

// ── Provider ───────────────────────────────────────────────────────────────

export class TotalRecallCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  /** Cache per evitare richieste ripetute sullo stesso file */
  private cache = new Map<string, { observations: Observation[]; timestamp: number }>();
  private readonly cacheTtlMs = 30_000; // 30 secondi

  constructor(private readonly client: TotalRecallClient) {}

  /**
   * Invalida la cache e notifica VS Code di ricaricare i CodeLens.
   */
  refresh(): void {
    this.cache.clear();
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const filePath = document.uri.fsPath;

    // Solo file nel workspace
    if (!vscode.workspace.workspaceFolders?.some(wf => filePath.startsWith(wf.uri.fsPath))) {
      return [];
    }

    const observations = await this.getObservationsForFile(filePath);

    if (observations.length === 0) {
      return [];
    }

    // Un unico CodeLens in riga 0 che indica quante osservazioni ci sono
    const topLine = new vscode.Range(0, 0, 0, 0);
    const lens = new vscode.CodeLens(topLine, {
      title: `📝 ${observations.length} observation${observations.length > 1 ? 's' : ''} for this file`,
      command: 'kiroMemory.showFileObservations',
      arguments: [observations, filePath],
      tooltip: 'Click to browse observations associated with this file'
    });

    return [lens];
  }

  /**
   * Recupera le osservazioni associate a un file dal worker API.
   * Usa cache locale per ridurre il traffico.
   */
  private async getObservationsForFile(filePath: string): Promise<Observation[]> {
    // Controlla cache
    const cached = this.cache.get(filePath);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.observations;
    }

    try {
      // Cerca osservazioni che menzionano questo file
      // Usa il nome del file relativo per matching più robusto
      const relativePath = this.getRelativePath(filePath);
      const results = await this.client.search(relativePath);
      const observations = results.observations.filter(
        obs => this.matchesFile(obs, filePath, relativePath)
      );

      this.cache.set(filePath, { observations, timestamp: Date.now() });
      return observations;
    } catch {
      // Se il worker non è raggiungibile, non mostrare nulla
      return [];
    }
  }

  /**
   * Verifica se un'osservazione è relativa al file dato.
   * Controlla sia il campo file_path che il campo files (JSON array).
   */
  private matchesFile(obs: Observation, absolutePath: string, relativePath: string): boolean {
    // Controlla campo file_path
    if (obs.file_path) {
      if (absolutePath.endsWith(obs.file_path) || obs.file_path.endsWith(relativePath)) {
        return true;
      }
    }

    // Controlla campo files (JSON array di path)
    if (obs.files) {
      try {
        const filesArr = JSON.parse(obs.files) as string[];
        return filesArr.some(f => absolutePath.endsWith(f) || f.endsWith(relativePath));
      } catch {
        // Non JSON valido, ignora
      }
    }

    return false;
  }

  /**
   * Ricava un percorso relativo dal workspace root.
   */
  private getRelativePath(filePath: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const root = workspaceFolder.uri.fsPath;
      if (filePath.startsWith(root)) {
        return filePath.slice(root.length + 1); // +1 per togliere il /
      }
    }
    // Fallback: usa solo il filename
    const parts = filePath.split('/');
    return parts[parts.length - 1] ?? filePath;
  }
}
