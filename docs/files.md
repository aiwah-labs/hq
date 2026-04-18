# Files & folders

A filesystem-shaped file system. Every piece of binary data lives inside a
folder, folders nest arbitrarily, and any registered object can reference files
through `file`, `files`, or `folder` field types. Storage is pluggable: local
disk in dev, S3/R2/MinIO in production, both behind the same interface.

## The mental model

| Concept            | In code           | In the DB       |
| ------------------ | ----------------- | --------------- |
| A folder           | `Folder`          | `folders` table |
| A file             | `FileObject`      | `file_objects` table |
| Where bytes live   | `StorageAdapter`  | your bucket / disk |
| Reference from X   | `file`/`files`/`folder` field types | `Json` columns holding `{id, storageKey, ...}` |

Folders are denormalized with a `path` column (`/Projects/Acme/Logos`). Drilling
down is a prefix query. Each file points at exactly one folder via `folderId`.

## Folder kinds

```ts
kind: 'USER'   // user-created, shown in the file explorer
kind: 'SYSTEM' // created by the platform, immutable in the UI
kind: 'TEMP'   // scratch space with retentionDays — swept on a schedule
```

`SYSTEM` folders are the right home for anything the platform needs to manage
on behalf of the user (e.g. an integration's cached downloads). `TEMP` folders
exist to make cleanup boring: set `retentionDays`, drop files in, they vanish
once they age out. See "Lifecycle" below.

## Storage drivers

Driver selection is one env var:

```bash
STORAGE_DRIVER=local   # default — writes to disk, no presigned URLs
STORAGE_DRIVER=s3      # S3 / R2 / MinIO, direct browser uploads
```

### Local driver

```bash
STORAGE_LOCAL_ROOT=.hq-storage       # directory on disk (default)
STORAGE_PUBLIC_URL=                  # optional, if the dir is served statically
```

The local driver streams bytes through the API for every read and write —
it does **not** mint presigned URLs. Good for dev and single-node self-hosted
deployments; for anything with concurrent uploads, use S3.

### S3 driver

```bash
STORAGE_BUCKET=my-bucket
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
STORAGE_REGION=auto                  # 'auto' for R2; 'us-east-1' etc. for AWS
STORAGE_ENDPOINT=                    # optional; set for R2/MinIO custom endpoints
STORAGE_PUBLIC_URL=                  # optional; for public buckets
```

S3 mints presigned URLs so browsers upload directly to the bucket. The API
never proxies the bytes.

### Writing a new driver

Implement [`StorageAdapter`](../shared/storage/src/adapter.ts). The interface is
small (`write` / `readBuffer` / `readStream` / `delete` / `publicUrl` /
`presignedPut` / `presignedGet`). Drop it into
[`createStorageAdapter`](../shared/storage/src/factory.ts) behind a new driver
name. The service layer and the API are driver-agnostic.

## Upload flow

There is exactly one control plane — `POST /v1/files` — and two data planes
depending on whether the driver supports presigned URLs.

### Presigned (S3/R2)

```
Client → POST /v1/files { folderId, name, mime, size }
       ← { fileId, uploadUrl, method: 'presigned', expiresInSeconds }
Client → PUT <uploadUrl>  (body = bytes)
Client → POST /v1/files/:fileId/complete { checksum?, size? }
       ← { fileId, ...metadata }
```

Bytes go browser → bucket. The API only mints URLs and records metadata.

### Passthrough (local)

```
Client → POST /v1/files { folderId, name, mime, size }
       ← { fileId, method: 'passthrough', uploadUrl: null }
Client → POST /v1/files/:fileId/upload  (multipart, field 'file')
       ← { fileId, ...metadata }
```

Same 2-step handshake, but the API reads the bytes itself and forwards them to
the adapter. No presigned URL exists to hand out.

## Downloads

```
GET /v1/files/:id/download
```

- Presigned-capable driver → `302` redirect to a time-limited URL.
- Local driver → streams the bytes with `Content-Type` and `Content-Disposition`.

The Workshop uses the same route at `/api/files/:id/download`, which proxies
through to the API so the browser's cookie auth works without CORS.

## Referencing files from other objects

The object registry exposes three field types you can drop into any object's
schema:

```ts
{ kind: 'file',   label: 'Contract' }                 // a single file
{ kind: 'files',  label: 'Attachments', min: 0, max: 8 }
{ kind: 'folder', label: 'Working dir' }              // a folder handle
```

There is no polymorphic `Attachment` join table. Each field stores either a
file id + cached metadata or a folder id. Rendering, validation, form widgets
and API serialization are free — the registry handles them.

When a referenced file is deleted, inbound references are cleaned up lazily on
the next read. Hard-delete an object and its owned folder gets deleted; the
orphan sweep handles the rest.

## Search

File search is pluggable. `searchFiles(ctx, { q, folderId?, mime?, tags?, limit?, cursor? })` delegates to the currently registered backend. The default
backend does a simple `ILIKE` over `name` and a membership check against `tags`
— enough to power the Workshop's file picker without adding a hard dependency.

Swap in a real backend (Postgres full-text, Typesense, Meilisearch, …) via
`setFileSearchBackend()` at startup. The API route at `GET /v1/files/search`
and the `files` field type both read through the registered backend, so you
upgrade once and everything benefits.

## Events

Every state change fires through `@hq/events`:

| Event             | When                                                       |
| ----------------- | ---------------------------------------------------------- |
| `file.created`    | after `completeUpload` / `uploadDirect` finalises metadata |
| `file.moved`      | `moveFile` changes `folderId`                              |
| `file.updated`    | `renameFile` or `updateFileMetadata`                       |
| `file.deleted`    | hard delete from API or `deleteFile` service call          |
| `folder.created`  | `createFolder` / `ensureFolder`                            |
| `folder.updated`  | `renameFolder` / `moveFolder`                              |
| `folder.deleted`  | `deleteFolder`                                             |

Subscribers receive `{ objectType: 'file' | 'folder', objectId, payload }`.
Wire virus scanning, thumbnail generation, or index refresh as plain event
subscribers — never patch the service functions.

## Lifecycle — `files.sweep-temp`

A recurring job (`apps/api/src/workers/files.ts`) walks every `TEMP` folder
with a `retentionDays` value and deletes files whose `uploadedAt` is past the
cutoff. Folders themselves are left in place. Runs hourly by default:

```bash
FILES_SWEEP_CRON="0 * * * *"   # override if you want a different cadence
```

The sweep is idempotent — a restart mid-run just picks up the remaining files
on the next tick. Errors per file are captured and reported in the job result
so one bad key doesn't abort the batch.

## Enrichment cookbook

Small recipes you can drop into your own module. All of them subscribe to
events — no service-layer edits required.

Each example uses `subscribe()` from [`@hq/events/router`](../shared/events/src/router.ts).
The handler receives a `PlatformEventNotification` (id, type, objectType,
objectId). Build a `ServiceContext` for the work — a system principal is fine
for background enrichment (see the sweep worker for the pattern).

### Anti-virus scan before surfacing a file

```ts
import { subscribe } from '@hq/events/router';

subscribe('file.created', async (event) => {
  if (!event.objectId) return;
  const ctx = await makeSystemContext();
  const file = await getFile(ctx, event.objectId);
  const stream = await openFileStream(ctx, file.id);
  const verdict = await scan(stream);
  if (verdict.infected) {
    await deleteFile(ctx, file.id);
    await notifyQuarantine(ctx, { fileId: file.id, threat: verdict.signature });
  }
}, { source: 'av-scanner' });
```

### Image thumbnails

```ts
subscribe('file.created', async (event) => {
  if (!event.objectId) return;
  const ctx = await makeSystemContext();
  const file = await getFile(ctx, event.objectId);
  if (!file.mime.startsWith('image/')) return;
  const stream = await openFileStream(ctx, file.id);
  const thumb = await resize(stream, { width: 320 });
  const thumbsFolder = await ensureFolder(ctx, { path: '/System/thumbnails', kind: 'SYSTEM' });
  await uploadDirect(ctx, {
    folderId: thumbsFolder.id,
    name: `${file.id}.jpg`,
    mime: 'image/jpeg',
    bytes: thumb,
    metadata: { sourceFileId: file.id },
  });
}, { source: 'thumbnailer' });
```

### Full-text extraction into search

```ts
subscribe('file.created', async (event) => {
  if (!event.objectId) return;
  const ctx = await makeSystemContext();
  const file = await getFile(ctx, event.objectId);
  if (file.mime !== 'application/pdf') return;
  const text = await extractPdfText(await openFileStream(ctx, file.id));
  await updateFileMetadata(ctx, file.id, { indexStatus: 'INDEXED' });
  await getFileSearchBackend().index(ctx, { fileId: file.id, text });
}, { source: 'pdf-indexer' });
```

### Auto-folder uploads by type

```ts
subscribe('file.created', async (event) => {
  if (!event.objectId) return;
  const ctx = await makeSystemContext();
  const file = await getFile(ctx, event.objectId);
  if (!file.mime.startsWith('image/')) return;
  const images = await ensureFolder(ctx, { path: '/Images', kind: 'USER' });
  if (file.folderId !== images.id) await moveFile(ctx, file.id, images.id);
}, { source: 'image-router' });
```

## Code map

| Concern           | Module                                                   |
| ----------------- | -------------------------------------------------------- |
| Storage adapters  | [`shared/storage/`](../shared/storage/src/)              |
| Folder & file services | [`shared/files/`](../shared/files/src/)             |
| Search backend    | [`shared/files/src/search.ts`](../shared/files/src/search.ts) |
| API routes        | [`apps/api/src/routes/files.ts`](../apps/api/src/routes/files.ts) |
| Sweep worker      | [`apps/api/src/workers/files.ts`](../apps/api/src/workers/files.ts) |
| Workshop explorer | [`apps/workshop/src/app/(app)/files/`](../apps/workshop/src/app/\(app\)/files/) |
| Object field types | [`shared/objects/src/fields/`](../shared/objects/src/fields/) |
