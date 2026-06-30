/**
 * Status Bar manager per Total Recall.
 *
 * Gestisce l'elemento nella barra di stato che mostra:
 * - Stato connessione al worker (online/offline)
 * - Progetto attivo (basato sulla workspace corrente)
 * - Conteggio osservazioni totali
 *
 * Aggiornamento periodico configurabile via kiroMemory.refreshInterval.
 */

import * as vscode from 'vscode';
import type { TotalRecallClient } from './api-client';

// ── Costanti ───────────────────────────────────────────────────────────────

const STATUS_BAR_PRIORITY = 100;

// ── Classe StatusBar ───────────────────────────────────────────────────────

export class TotalRecallStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;

  constructor(
    private readonly client: TotalRecallClient,
    refreshIntervalSec: number
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      STATUS_BAR_PRIORITY
    );
    this.item.command = 'kiroMemory.showDashboard';
    this.item.tooltip = 'Total Recall — Click to open dashboard';
    this.item.show();

    // Prima fetch immediata
    void this.update();

    // Timer periodico
    this.startTimer(refreshIntervalSec);
  }

  /**
   * Aggiorna l'intervallo del timer (es. dopo cambio impostazioni).
   */
  setRefreshInterval(seconds: number): void {
    this.stopTimer();
    this.startTimer(seconds);
  }

  /**
   * Forza un aggiornamento immediato della status bar.
   */
  async update(): Promise<void> {
    if (this.disposed) {
      return;
    }

    try {
      const health = await this.client.getHealth();

      if (health.status === 'ok') {
        // Tenta di ottenere il conteggio osservazioni dal progetto corrente
        const project = this.detectCurrentProject();
        let obsCount: number | undefined;

        if (project) {
          try {
            const stats = await this.client.getStats(project);
            obsCount = stats.total_observations;
          } catch {
            // Stats non disponibili, mostra solo lo stato online
          }
        }

        this.setOnline(project, obsCount);
      } else {
        this.setOffline();
      }
    } catch {
      this.setOffline();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopTimer();
    this.item.dispose();
  }

  // ── Private ────────────────────────────────────────────────────────────

  private setOnline(project: string | undefined, obsCount: number | undefined): void {
    if (project && obsCount !== undefined) {
      this.item.text = `$(brain) Total Recall: ${project} | ${obsCount} obs`;
      this.item.tooltip = `Total Recall — ${project}: ${obsCount} observations\nClick to open dashboard`;
    } else if (project) {
      this.item.text = `$(brain) Total Recall: ${project}`;
      this.item.tooltip = `Total Recall — ${project}\nClick to open dashboard`;
    } else {
      this.item.text = '$(brain) Total Recall';
      this.item.tooltip = 'Total Recall — Worker active\nClick to open dashboard';
    }
    this.item.color = undefined;
    this.item.backgroundColor = undefined;
  }

  private setOffline(): void {
    this.item.text = '$(warning) Total Recall';
    this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.item.tooltip = 'Total Recall — Worker not reachable\nClick to open dashboard';
  }

  /**
   * Rileva il progetto corrente basandosi sul nome della workspace folder.
   * Convenzione: il nome della cartella è il nome del progetto.
   */
  private detectCurrentProject(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0]?.name;
    }
    return undefined;
  }

  private startTimer(seconds: number): void {
    if (seconds > 0) {
      this.refreshTimer = setInterval(() => {
        void this.update();
      }, seconds * 1000);
    }
  }

  private stopTimer(): void {
    if (this.refreshTimer !== undefined) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }
}
