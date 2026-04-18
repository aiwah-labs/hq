# Import & Export

Every registered object supports **CSV + JSON export** and **CSV + JSON import**
with preview-validate-commit flow. Ships in the template — no per-object code.

## Export

Three ways to export:

- **Workshop UI:** on any object list page, click `Export CSV`.
- **Workshop route handler:** `GET /objects/<type>/export?format=csv|json`
- **API:** `GET /v1/objects/<type>/export?format=csv|json`

All three honor the acting principal's read policy — `own` readers only see
records they own, just like the list view.

### Query params

| Param    | Notes                                                |
| -------- | ---------------------------------------------------- |
| `format` | `csv` (default) or `json`                            |
| `fields` | Comma-separated field names. Omit for all list fields. |
| `limit`  | Max rows. Default 5000, hard cap 50000.              |
| `q`      | Search query (same behavior as list view)            |

CSV escapes follow RFC 4180: embedded commas, quotes, and newlines are
quoted; JSON values are serialized to strings inside CSV cells.

## Import

Three-step flow: **upload → preview → commit**.

1. Upload a CSV (first row = header) or JSON array.
2. Click `Preview`. The server parses the content, applies a default
   field map (source header → target field where names match), coerces
   values against field types, and returns the first 20 rows along with
   any errors.
3. Click `Import` to commit (synchronous, good for <1k rows) or
   `Queue as job` to run it via `@hq/jobs` as an `object.import` job —
   the Jobs page shows progress and the resulting summary.

### What the validator checks

- **Type coercion**: `"42"` → `42` for number fields, `"yes"/"1"/"true"` → `true` for boolean, ISO strings → `Date`, valid JSON strings → objects.
- **Enum values**: rejected if not in the field's `values` list.
- **Required fields**: flagged if missing and no `defaultValue` is set.
- **Unknown fields**: flagged so you can drop them from the mapping.
- **Readonly fields**: silently skipped.

Rows with any errors are **not** written. Error-free rows are written
one at a time through `objectCreate`, so policy + audit fire per row.

### API

```http
POST /v1/objects/<type>/import/preview
Content-Type: application/json

{ "format": "csv", "content": "name,count\nAlpha,1\n" }
```

```http
POST /v1/objects/<type>/import
Content-Type: application/json

{ "format": "csv", "content": "…", "async": true }
```

`async: true` returns `{ queued: true, jobId }`; the worker invokes
`executeImport` with a principal reconstructed from the requesting user.

## What's NOT in scope

- **No provider-specific importers.** (Stripe CSV, HubSpot export, …)
  Build them as actions that call `executeImport` with a remapped body.
- **No incremental sync.** Imports are always create-only. Updates belong
  in your own action that maps source rows → `objectUpdate` calls.
- **No hidden transforms.** The framework only coerces types it knows
  about. Trimming, lookups, or deduplication belong in a pre-process step
  before you hand content to `executeImport`.
