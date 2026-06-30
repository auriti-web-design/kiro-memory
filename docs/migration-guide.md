# Migration Guide: Importing External Memory into Total Recall

This guide covers how to migrate data from other AI memory systems into Total Recall.

## Supported Sources

| Source | Adapter Name | Status |
|--------|--------------|--------|
| Claude Mem | `claude-mem` | ✅ Supported |

> More adapters will be added over time. See [Adding Custom Adapters](#adding-custom-adapters) below.

---

## Importing from Claude Mem

### Step 1: Export from Claude Mem

Export your Claude memories to a JSONL file. The export should contain one JSON object per line:

```jsonl
{"id":"mem_abc123","type":"memory","content":"User prefers TypeScript strict mode","source":"assistant","created_at":"2025-06-15T10:30:00Z","tags":["typescript"],"project":"my-project"}
{"id":"mem_def456","type":"summary","content":"Session focused on auth implementation","source":"assistant","created_at":"2025-06-15T11:00:00Z","tags":[],"project":"my-project"}
{"id":"mem_ghi789","type":"prompt","content":"Help me implement login with bcrypt","source":"user","created_at":"2025-06-15T09:00:00Z","tags":[],"project":"my-project"}
```

### Step 2: Validate with Dry Run

Before importing, always validate your export file with `--dry-run`:

```bash
totalrecall import claude-export.jsonl --dry-run
```

This shows:
- Total records found
- Breakdown by type (observations, summaries, prompts)
- Records that would be imported vs rejected
- Rejection reasons (unsupported types, empty content, etc.)

Example output:

```
  ✓ Detected format: claude-mem

  [DRY RUN] Analisi di "claude-export.jsonl"...
  Adapter: claude-mem

  ─── Dry Run Report ───

  Source:   claude-export.jsonl
  Adapter:  claude-mem

  Records found:        150

  By type:
    Observations:       98
    Summaries:          32
    Prompts:            15

  Would be imported:    145
  Would be rejected:    5

  Rejection reasons:
       3  Unsupported record type
       2  Empty content field

  Examples of rejected records:
    Line 42 (mem_x1) [type=context]: Unsupported type: "context". Only "memory", "summary", and "prompt" are supported.
    Line 87 (mem_x2) [type=annotation]: Unsupported type: "annotation". Only "memory", "summary", and "prompt" are supported.

  (Dry run: nessun dato inserito. Rimuovi --dry-run per applicare.)
```

### Step 3: Review the Report

Check the dry-run output for:

1. **Record counts** — Do they match what you expect? If the total is much lower than expected, your export might be incomplete.
2. **Rejected records** — Unsupported types are normal (Claude Mem may have types Total Recall doesn't use). Empty content rejections might indicate corrupted records.
3. **Project breakdown** — If you see records going to `claude-mem-import` as the project, consider using `--project` to assign them.

### Step 4: Import

Once satisfied with the dry-run results, import for real:

```bash
totalrecall import claude-export.jsonl
```

Or specify a target project for records that don't have one:

```bash
totalrecall import claude-export.jsonl --project my-project
```

Example output:

```
  ✓ Detected format: claude-mem

  Importazione di "claude-export.jsonl"...
  Adapter: claude-mem

  Import complete.
  Imported: 98 observations, 32 summaries, 15 prompts
  Skipped:  0 duplicates
  Rejected: 5 unsupported
```

---

## Data Mapping

### Claude Mem → Total Recall

| Claude Mem Field | Total Recall Field | Notes |
|------------------|-------------------|-------|
| `type: "memory"` | Observation (type: `research`) | Main knowledge records |
| `type: "summary"` | Summary | Session summaries |
| `type: "prompt"` | Prompt | User prompts |
| `type: "<other>"` | Skipped | Only memory/summary/prompt are supported |
| `id` | Preserved in `facts` field | For provenance tracking |
| `content` | `narrative` (obs), `learned` (sum), `prompt_text` (prompt) | Main content field |
| `content` (first line) | `title` | First line up to 200 chars used as title |
| `project` | `project` | Preserved as-is, or `--project` fallback |
| `tags` | `concepts` | Joined with commas |
| `source` | Preserved in `facts` field | "user" or "assistant" |
| `created_at` | `created_at` + `created_at_epoch` | ISO string + epoch ms |
| `metadata` | Preserved in `facts` field | Extra metadata kept for provenance |

### Session Grouping

Records are grouped into sessions by date. All records created on the same day (YYYY-MM-DD) are assigned to the same session:

- `mem_abc` (2025-06-15T10:00:00Z) → session `claude-mem-2025-06-15`
- `mem_def` (2025-06-15T14:00:00Z) → session `claude-mem-2025-06-15` (same day)
- `mem_ghi` (2025-06-16T09:00:00Z) → session `claude-mem-2025-06-16` (next day)

### Deduplication

Total Recall uses content hashes (SHA-256 of `project|type|title|narrative`) to detect duplicates. If you import the same file twice, duplicate records will be skipped automatically.

---

## Workflow: Validate → Review → Import

The recommended workflow for any migration:

```
1. Export from source     →  claude-export.jsonl
2. Dry run               →  totalrecall import claude-export.jsonl --dry-run
3. Review report         →  Check counts, rejections, projects
4. Fix issues (if any)   →  Edit export file or use --project flag
5. Import                →  totalrecall import claude-export.jsonl
6. Verify                →  totalrecall search "recent import" --project <name>
```

---

## Command Reference

```bash
# Basic import (auto-detects format)
totalrecall import <file.jsonl>

# Explicit adapter selection
totalrecall import <file.jsonl> --source claude-mem

# Dry run (validate without importing)
totalrecall import <file.jsonl> --dry-run

# Specify default project for records without one
totalrecall import <file.jsonl> --project my-project

# Combine flags
totalrecall import claude-export.jsonl --dry-run --project my-project --source claude-mem
```

### Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate and report without inserting any data |
| `--source <name>` | Explicitly select an import adapter |
| `--project <name>` | Default project for records that don't specify one |

---

## Troubleshooting

### "Could not auto-detect the file format"

The file doesn't match any known import format. Possible causes:
- The file is not in JSONL format (one JSON object per line)
- The file is a JSON array instead of JSONL
- The records don't have Claude Mem structure (missing `id`, `type`, `content`, etc.)

**Fix:** Use `--source claude-mem` to force the adapter, or check your export format.

### "Adapter not found"

You specified `--source <name>` but the adapter doesn't exist.

**Fix:** Run without `--source` to see available adapters listed in the error message.

### All records rejected as "Unsupported type"

Your export only contains record types that Total Recall doesn't map (e.g., `context`, `annotation`).

**Fix:** Only `memory`, `summary`, and `prompt` types are imported. This is expected if your export only contains other types.

### "Empty content field" rejections

Records with empty or whitespace-only `content` fields are skipped.

**Fix:** These are typically useless records. If you need them, add content before importing.

### Import ran but I don't see any data

Check:
1. Did the records have a `project` field? If not, they went to `claude-mem-import`.
2. Search with: `totalrecall search "" --project claude-mem-import`
3. Use `totalrecall stats` to verify total observation count increased.

### Duplicate records skipped

Total Recall deduplicates by content hash. If you already imported these records, re-importing will skip them. This is intentional and safe.

---

## Adding Custom Adapters

To add support for a new import source, implement the `ImportAdapter` interface:

```typescript
// src/services/sqlite/adapters/my-adapter.ts
import type { ImportAdapter, AdaptedImport, AdaptOptions } from './index.js';

export const myAdapter: ImportAdapter = {
  name: 'my-source',

  detect(content: string): boolean {
    // Return true if content looks like your format
    // Check first few lines for distinctive structure
  },

  adapt(content: string, options?: AdaptOptions): AdaptedImport {
    // Transform your format into Total Recall records
    // Return { observations, summaries, prompts, skipped }
  },
};
```

Then register it in `src/services/sqlite/adapters/index.ts`:

```typescript
import { myAdapter } from './my-adapter.js';

const adapters: ImportAdapter[] = [
  claudeMemAdapter,
  myAdapter,  // Add here
];
```

### Adapter Interface

```typescript
interface ImportAdapter {
  /** Human-readable name used with --source flag */
  name: string;

  /** Returns true if content matches this format (used for auto-detection) */
  detect(content: string): boolean;

  /** Transform foreign format into Total Recall records */
  adapt(content: string, options?: AdaptOptions): AdaptedImport;
}

interface AdaptedImport {
  observations: JsonlObservation[];
  summaries: JsonlSummary[];
  prompts: JsonlPrompt[];
  skipped: SkippedRecord[];  // Records that couldn't be adapted
}

interface SkippedRecord {
  line: number;          // 1-based line number in source file
  originalId?: string;   // Original record ID if available
  type?: string;         // Original record type if available
  reason: string;        // Human-readable reason for skipping
}
```

### Detection Guidelines

- Sample the first 10 non-empty lines (don't scan the whole file)
- Check for distinctive structural markers (unique field names, ID prefixes)
- Return `false` for Total Recall's native JSONL format (records with `_type` field)
- Require >50% of sampled lines to match for confidence

### Testing Your Adapter

Add tests in `tests/adapters/<name>.test.ts` covering:
- Format detection (positive and negative cases)
- Record transformation for each supported type
- Edge cases (empty content, missing fields, unsupported sub-types)
- Provenance preservation
- Integration with the adapter registry
