#!/usr/bin/env node
/**
 * Total Recall MCP Server — API v2
 *
 * MCP (Model Context Protocol) server che espone i tool di memoria.
 * Proxy leggero: delega tutte le operazioni al Worker HTTP (porta 3001).
 *
 * Migrato da API v1 (Server + setRequestHandler) a API v2 (McpServer + registerTool).
 *
 * Utilizzo: registra in ~/.kiro/settings/mcp.json o nella config dell'agente.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { TOTALRECALL_VERSION } from '../shared/version.js';

// Redirige console.log su stderr per non rompere il protocollo MCP (usa stdio)
const originalLog = console.log;
console.log = (...args: any[]) => console.error('[totalrecall-mcp]', ...args);

const WORKER_HOST = process.env.TOTALRECALL_WORKER_HOST || '127.0.0.1';
const WORKER_PORT = process.env.TOTALRECALL_WORKER_PORT || '3001';
const WORKER_BASE = `http://${WORKER_HOST}:${WORKER_PORT}`;

// ============================================================================
// Helper HTTP per comunicare con il Worker
// ============================================================================

async function callWorkerGET(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(endpoint, WORKER_BASE);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`Worker ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function callWorkerPOST(endpoint: string, body: any): Promise<any> {
  const url = new URL(endpoint, WORKER_BASE);
  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  if (!resp.ok) throw new Error(`Worker ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ============================================================================
// Helper per gestione errori uniforme nei tool handler
// ============================================================================

function buildErrorResult(error: any): { content: Array<{ type: 'text'; text: string }> } {
  const msg = error?.message || String(error);

  // Se il Worker non è raggiungibile, suggerisci come avviarlo
  if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
    return {
      content: [{
        type: 'text',
        text: `Total Recall worker non raggiungibile su ${WORKER_BASE}.\nAvvia il worker con: cd <totalrecall-dir> && npm run worker:start`
      }]
    };
  }

  // Sanitizza il messaggio: non esporre dettagli interni
  const safeMsg = msg.includes('Worker')
    ? 'Errore di comunicazione con il Worker'
    : 'Errore interno nell\'elaborazione della richiesta';

  return {
    content: [{ type: 'text', text: `Errore: ${safeMsg}` }]
  };
}

// ============================================================================
// Setup MCP Server — API v2
// ============================================================================

async function main() {
  const server = new McpServer({
    name: 'totalrecall',
    version: TOTALRECALL_VERSION
  });

  // --------------------------------------------------------------------------
  // Tool: search
  // Ricerca osservazioni e sommari tramite query keyword
  // --------------------------------------------------------------------------

  // @ts-ignore — MCP SDK registerTool types cause TS2589 without stubs (see issue #67)
  server.registerTool(
    'search',
    {
      description: 'Cerca in Total Recall. Restituisce osservazioni e sommari che corrispondono alla query. Usa questo tool per trovare contesto dalle sessioni precedenti.',
      inputSchema: {
        query: z.string().describe('Testo da cercare in osservazioni e sommari'),
        project: z.string().optional().describe('Filtra per nome progetto (opzionale)'),
        type: z.string().optional().describe('Filtra per tipo di osservazione: file-write, command, research, tool-use, constraint, decision, heuristic, rejected (opzionale)'),
        limit: z.number().optional().default(20).describe('Numero massimo di risultati (default: 20)')
      }
    },
    async (args) => {
      try {
        const result = await callWorkerGET('/api/search', {
          q: args.query,
          project: args.project || '',
          type: args.type || '',
          limit: String(args.limit ?? 20)
        });

        const obs = result.observations || [];
        const sums = result.summaries || [];

        if (obs.length === 0 && sums.length === 0) {
          return {
            content: [{ type: 'text', text: 'Nessun risultato trovato per la query.' }]
          };
        }

        let output = `## Risultati ricerca: "${args.query}"\n\n`;

        if (obs.length > 0) {
          output += `### Osservazioni (${obs.length})\n\n`;
          output += '| ID | Tipo | Titolo | Data |\n|---|---|---|---|\n';
          obs.forEach((o: any) => {
            output += `| ${o.id} | ${o.type} | ${o.title} | ${o.created_at?.split('T')[0] || ''} |\n`;
          });
          output += '\n';
        }

        if (sums.length > 0) {
          output += `### Sommari (${sums.length})\n\n`;
          sums.forEach((s: any) => {
            if (s.learned) output += `- **Appreso**: ${s.learned}\n`;
            if (s.completed) output += `- **Completato**: ${s.completed}\n`;
          });
        }

        return { content: [{ type: 'text', text: output }] };
      } catch (error) {
        return buildErrorResult(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Tool: timeline
  // Mostra il contesto cronologico attorno a un'osservazione specifica
  // --------------------------------------------------------------------------

  server.registerTool(
    'timeline',
    {
      description: 'Mostra il contesto cronologico attorno a una specifica osservazione. Utile per capire cosa è successo prima e dopo un evento.',
      inputSchema: {
        anchor: z.number().describe('ID dell\'osservazione come punto di riferimento'),
        depth_before: z.number().optional().default(5).describe('Numero di osservazioni prima (default: 5)'),
        depth_after: z.number().optional().default(5).describe('Numero di osservazioni dopo (default: 5)')
      }
    },
    async (args) => {
      try {
        const result = await callWorkerGET('/api/timeline', {
          anchor: String(args.anchor),
          depth_before: String(args.depth_before ?? 5),
          depth_after: String(args.depth_after ?? 5)
        });

        const entries = result.timeline || result || [];
        if (!Array.isArray(entries) || entries.length === 0) {
          return {
            content: [{ type: 'text', text: `Nessun contesto trovato attorno all'osservazione ${args.anchor}.` }]
          };
        }

        let output = `## Timeline attorno all'osservazione #${args.anchor}\n\n`;
        entries.forEach((e: any) => {
          const marker = e.id === args.anchor ? '→ ' : '  ';
          output += `${marker}**#${e.id}** [${e.type}] ${e.title} (${e.created_at?.split('T')[0] || ''})\n`;
          if (e.content) output += `  ${e.content.substring(0, 200)}\n`;
          output += '\n';
        });

        return { content: [{ type: 'text', text: output }] };
      } catch (error) {
        return buildErrorResult(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Tool: get_observations
  // Recupera i dettagli completi di osservazioni specifiche per ID
  // --------------------------------------------------------------------------

  // @ts-ignore — MCP SDK registerTool types cause TS2589 without stubs (see issue #67)
  server.registerTool(
    'get_observations',
    {
      description: 'Recupera i dettagli completi di osservazioni specifiche per ID. Da usare dopo "search" per ottenere il contenuto completo.',
      inputSchema: {
        ids: z.array(z.number()).describe('Array di ID osservazioni da recuperare')
      }
    },
    async (args) => {
      try {
        const result = await callWorkerPOST('/api/observations/batch', { ids: args.ids });
        const obs = result.observations || result || [];

        if (!Array.isArray(obs) || obs.length === 0) {
          return {
            content: [{ type: 'text', text: 'Nessuna osservazione trovata per gli ID specificati.' }]
          };
        }

        let output = `## Dettagli Osservazioni\n\n`;
        obs.forEach((o: any) => {
          output += `### #${o.id}: ${o.title}\n`;
          output += `- **Tipo**: ${o.type}\n`;
          output += `- **Progetto**: ${o.project}\n`;
          output += `- **Data**: ${o.created_at}\n`;
          if (o.text) output += `- **Contenuto**: ${o.text}\n`;
          if (o.narrative) output += `- **Narrativa**: ${o.narrative}\n`;
          if (o.concepts) output += `- **Concetti**: ${o.concepts}\n`;
          if (o.files_read) output += `- **File letti**: ${o.files_read}\n`;
          if (o.files_modified) output += `- **File modificati**: ${o.files_modified}\n`;
          output += '\n';
        });

        return { content: [{ type: 'text', text: output }] };
      } catch (error) {
        return buildErrorResult(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Tool: get_context
  // Recupera il contesto recente per un progetto
  // --------------------------------------------------------------------------

  server.registerTool(
    'get_context',
    {
      description: 'Recupera il contesto recente per un progetto: osservazioni, sommari e prompt recenti.',
      inputSchema: {
        project: z.string().describe('Nome del progetto')
      }
    },
    async (args) => {
      try {
        const result = await callWorkerGET(`/api/context/${encodeURIComponent(args.project)}`);

        const obs = result.observations || [];
        const sums = result.summaries || [];

        let output = `## Contesto: ${args.project}\n\n`;

        if (sums.length > 0) {
          output += `### Sommari Recenti\n\n`;
          sums.forEach((s: any) => {
            if (s.request) output += `**Richiesta**: ${s.request}\n`;
            if (s.learned) output += `- Appreso: ${s.learned}\n`;
            if (s.completed) output += `- Completato: ${s.completed}\n`;
            if (s.next_steps) output += `- Prossimi passi: ${s.next_steps}\n\n`;
          });
        }

        if (obs.length > 0) {
          output += `### Osservazioni Recenti (${obs.length})\n\n`;
          obs.slice(0, 10).forEach((o: any) => {
            output += `- **${o.title}** [${o.type}]: ${(o.text || '').substring(0, 100)}\n`;
          });
        }

        return { content: [{ type: 'text', text: output }] };
      } catch (error) {
        return buildErrorResult(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Tool: semantic_search
  // Ricerca semantica tramite embedding vettoriali
  // --------------------------------------------------------------------------

  server.registerTool(
    'semantic_search',
    {
      description: 'Ricerca semantica tramite embedding vettoriali. Trova osservazioni per significato, non solo per parole chiave. Es. cercare "correzione autenticazione" trova anche "aggiornamento token OAuth". Fallback su ricerca keyword se gli embedding non sono disponibili.',
      inputSchema: {
        query: z.string().describe('Query in linguaggio naturale per la ricerca semantica'),
        project: z.string().optional().describe('Filtra per nome progetto (opzionale)'),
        limit: z.number().optional().default(10).describe('Numero massimo di risultati (default: 10)')
      }
    },
    async (args) => {
      try {
        const result = await callWorkerGET('/api/hybrid-search', {
          q: args.query,
          project: args.project || '',
          limit: String(args.limit ?? 10)
        });

        const hits = result.results || [];

        if (hits.length === 0) {
          return {
            content: [{ type: 'text', text: 'Nessun risultato semantico trovato per la query.' }]
          };
        }

        let output = `## Ricerca Semantica: "${args.query}"\n\n`;
        output += `Trovati ${hits.length} risultati:\n\n`;

        hits.forEach((h: any) => {
          const scorePercent = Math.round((h.score || 0) * 100);
          const source = h.source || 'unknown';
          output += `- **#${h.id}** [${h.type}] ${h.title} (score: ${scorePercent}%, sorgente: ${source})\n`;
          if (h.content) output += `  ${h.content.substring(0, 150)}\n`;
          output += '\n';
        });

        return { content: [{ type: 'text', text: output }] };
      } catch (error) {
        return buildErrorResult(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Tool: embedding_stats
  // Mostra statistiche sugli embedding vettoriali
  // --------------------------------------------------------------------------

  server.registerTool(
    'embedding_stats',
    {
      description: 'Mostra statistiche sugli embedding: totale osservazioni, quante hanno embedding, info sul provider.',
      inputSchema: {}
    },
    async (_args) => {
      try {
        const result = await callWorkerGET('/api/embeddings/stats');

        let output = `## Statistiche Embedding\n\n`;
        output += `- **Totale osservazioni**: ${result.total}\n`;
        output += `- **Con embedding**: ${result.embedded}\n`;
        output += `- **Copertura**: ${result.percentage}%\n`;
        output += `- **Provider**: ${result.provider || 'nessuno'}\n`;
        output += `- **Dimensioni**: ${result.dimensions}\n`;
        output += `- **Disponibile**: ${result.available ? 'sì' : 'no'}\n`;

        if (result.percentage < 100 && result.total > 0) {
          output += `\n_Suggerimento: esegui \`totalrecall embeddings backfill\` per generare gli embedding mancanti._\n`;
        }

        return { content: [{ type: 'text', text: output }] };
      } catch (error) {
        return buildErrorResult(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Tool: store_knowledge
  // Salva conoscenza strutturata: constraint, decision, heuristic, rejected
  // --------------------------------------------------------------------------

  // @ts-ignore — MCP SDK registerTool types cause TS2589 without stubs (see issue #67)
  server.registerTool(
    'store_knowledge',
    {
      description: 'Salva conoscenza strutturata: constraint (regole), decision (scelte architetturali), heuristic (preferenze soft), o rejected (soluzioni scartate). La conoscenza è valorizzata nei ranking di ricerca.',
      inputSchema: {
        knowledge_type: z.enum(['constraint', 'decision', 'heuristic', 'rejected']).describe('Tipo di conoscenza: constraint (regole hard/soft), decision (scelte architetturali con alternative), heuristic (preferenze soft), rejected (soluzioni scartate con motivo)'),
        title: z.string().describe('Titolo breve e descrittivo per la voce di conoscenza'),
        content: z.string().describe('Contenuto dettagliato che spiega la conoscenza'),
        project: z.string().describe('Nome del progetto (obbligatorio)'),
        severity: z.enum(['hard', 'soft']).optional().describe('Per i constraint: hard (non deve mai essere violato) o soft (preferibile seguire)'),
        alternatives: z.array(z.string()).optional().describe('Per decision/rejected: opzioni alternative considerate'),
        reason: z.string().optional().describe('Per decision/rejected: perché questa scelta è stata fatta o scartata'),
        context: z.string().optional().describe('Per heuristic: quando questa preferenza si applica'),
        confidence: z.enum(['high', 'medium', 'low']).optional().describe('Per heuristic: livello di confidenza'),
        concepts: z.array(z.string()).optional().describe('Concetti/tag correlati (opzionale)'),
        files: z.array(z.string()).optional().describe('File correlati (opzionale)')
      }
    },
    async (args) => {
      try {
        const result = await callWorkerPOST('/api/knowledge', args);

        return {
          content: [{
            type: 'text',
            text: `Conoscenza salvata con successo.\n- **ID**: ${result.id}\n- **Tipo**: ${result.knowledge_type}\n- **Titolo**: ${args.title}`
          }]
        };
      } catch (error) {
        return buildErrorResult(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Tool: resume_session
  // Riprende una sessione di coding precedente
  // --------------------------------------------------------------------------

  // @ts-ignore — MCP SDK registerTool types cause TS2589 without stubs (see issue #67)
  server.registerTool(
    'resume_session',
    {
      description: 'Riprende una sessione di coding precedente. Restituisce il checkpoint con task, progresso, prossimi passi e file rilevanti dall\'ultima sessione su questo progetto. Da usare all\'inizio di una nuova sessione per continuare il lavoro precedente.',
      inputSchema: {
        project: z.string().optional().describe('Nome del progetto (opzionale, usa il progetto auto-rilevato dall\'ambiente)'),
        session_id: z.number().optional().describe('ID sessione specifica da riprendere (opzionale, usa l\'ultimo checkpoint per il progetto)')
      }
    },
    async (args) => {
      try {
        let checkpoint: any;

        if (args.session_id) {
          // Resume di una sessione specifica
          checkpoint = await callWorkerGET(`/api/sessions/${args.session_id}/checkpoint`);
        } else {
          // Resume dell'ultimo checkpoint per progetto
          const project = args.project || process.env.TOTALRECALL_PROJECT || '';
          if (!project) {
            return {
              content: [{
                type: 'text',
                text: 'Nessun progetto specificato e impossibile auto-rilevarlo. Fornisci un nome progetto o un session_id.'
              }]
            };
          }
          checkpoint = await callWorkerGET('/api/checkpoint', { project });
        }

        if (!checkpoint || checkpoint.error) {
          return {
            content: [{
              type: 'text',
              text: 'Nessun checkpoint trovato. Non c\'è nessuna sessione precedente da riprendere per questo progetto.'
            }]
          };
        }

        // Formatta come markdown leggibile dall'AI
        const parts = [
          `## Checkpoint Sessione — ${checkpoint.project}`,
          `**Task**: ${checkpoint.task}`,
        ];

        if (checkpoint.progress) parts.push(`**Progresso**: ${checkpoint.progress}`);
        if (checkpoint.next_steps) parts.push(`**Prossimi Passi**: ${checkpoint.next_steps}`);
        if (checkpoint.open_questions) parts.push(`**Domande Aperte**: ${checkpoint.open_questions}`);
        if (checkpoint.relevant_files) parts.push(`**File Rilevanti**: ${checkpoint.relevant_files}`);
        if (checkpoint.created_at) parts.push(`\n_Checkpoint creato: ${checkpoint.created_at}_`);

        return { content: [{ type: 'text', text: parts.join('\n') }] };
      } catch (error) {
        return buildErrorResult(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Tool: save_memory
  // Salva manualmente un ricordo/osservazione
  // --------------------------------------------------------------------------

  // @ts-ignore — MCP SDK registerTool types cause TS2589 without stubs (see issue #67)
  server.registerTool(
    'save_memory',
    {
      description: 'Salva manualmente un ricordo/osservazione. Usa per persistere informazioni importanti, apprendimenti, decisioni o contesto da ricordare tra le sessioni.',
      inputSchema: {
        project: z.string().describe('Nome del progetto (obbligatorio)'),
        title: z.string().describe('Titolo breve e descrittivo per il ricordo'),
        content: z.string().describe('Contenuto completo del ricordo da salvare'),
        type: z.string().optional().default('research').describe('Tipo di osservazione: research, file-write, command, ecc. (default: research)'),
        concepts: z.array(z.string()).optional().describe('Concetti/tag correlati (opzionale)')
      }
    },
    async (args) => {
      try {
        const result = await callWorkerPOST('/api/memory/save', {
          project: args.project,
          title: args.title,
          content: args.content,
          type: args.type || 'research',
          concepts: args.concepts,
        });

        return {
          content: [{
            type: 'text',
            text: `Ricordo salvato con successo.\n- **ID**: ${result.id}\n- **Progetto**: ${args.project}\n- **Titolo**: ${args.title}`
          }]
        };
      } catch (error) {
        return buildErrorResult(error);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Tool: generate_report
  // Genera un report di attività per un progetto
  // --------------------------------------------------------------------------

  // @ts-ignore — MCP SDK registerTool types cause TS2589 without stubs (see issue #67)
  server.registerTool(
    'generate_report',
    {
      description: 'Genera un report di attività per un progetto. Restituisce un riepilogo markdown con osservazioni, sessioni, apprendimenti, task completati e file hotspot per il periodo specificato.',
      inputSchema: {
        project: z.string().optional().describe('Nome del progetto (opzionale, usa il progetto auto-rilevato)'),
        period: z.enum(['weekly', 'monthly']).optional().default('weekly').describe('Periodo: "weekly" (default) o "monthly"')
      }
    },
    async (args) => {
      try {
        const project = args.project || process.env.TOTALRECALL_PROJECT || '';
        const period = args.period === 'monthly' ? 'monthly' : 'weekly';

        const params: Record<string, string> = { period, format: 'markdown' };
        if (project) params.project = project;

        const result = await callWorkerGET('/api/report', params);

        // Se il worker ritorna una stringa (es. markdown diretto)
        if (typeof result === 'string') {
          return { content: [{ type: 'text', text: result }] };
        }
        if (result?.error) {
          return { content: [{ type: 'text', text: `Generazione report fallita: ${result.error}` }] };
        }

        // Costruisce un riepilogo dai dati strutturati
        const d = result;
        const parts = [
          `# Report Attività — ${d.period?.label || period}`,
          `**Periodo**: ${d.period?.start} → ${d.period?.end} (${d.period?.days} giorni)`,
          '',
          '## Panoramica',
          `- Osservazioni: ${d.overview?.observations || 0}`,
          `- Sommari: ${d.overview?.summaries || 0}`,
          `- Sessioni: ${d.overview?.sessions || 0}`,
          `- Voci di conoscenza: ${d.overview?.knowledgeCount || 0}`,
        ];

        if (d.sessionStats?.total > 0) {
          const pct = Math.round((d.sessionStats.completed / d.sessionStats.total) * 100);
          parts.push('', '## Sessioni');
          parts.push(`- Totale: ${d.sessionStats.total} | Completate: ${d.sessionStats.completed} (${pct}%)`);
          if (d.sessionStats.avgDurationMinutes > 0) {
            parts.push(`- Durata media: ${d.sessionStats.avgDurationMinutes} min`);
          }
        }

        if (d.topLearnings?.length > 0) {
          parts.push('', '## Apprendimenti Principali');
          d.topLearnings.forEach((l: string) => parts.push(`- ${l}`));
        }

        if (d.completedTasks?.length > 0) {
          parts.push('', '## Completato');
          d.completedTasks.forEach((t: string) => parts.push(`- ${t}`));
        }

        if (d.nextSteps?.length > 0) {
          parts.push('', '## Prossimi Passi');
          d.nextSteps.forEach((s: string) => parts.push(`- ${s}`));
        }

        if (d.fileHotspots?.length > 0) {
          parts.push('', '## File Hotspot');
          d.fileHotspots.slice(0, 10).forEach((f: any) => parts.push(`- \`${f.file}\` (${f.count}x)`));
        }

        return { content: [{ type: 'text', text: parts.join('\n') }] };
      } catch (error) {
        return buildErrorResult(error);
      }
    }
  );

  // Avvia il trasporto stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('Total Recall MCP server avviato su stdio (API v2)');
}

main().catch((err) => {
  console.error('Errore di avvio MCP server:', err);
  process.exit(1);
});
