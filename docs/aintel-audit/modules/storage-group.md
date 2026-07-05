# Module group: storage (files, photos) + uploads infrastructure

Reviewed at `c0afad8` — depth: survey. Upload serving re-reviewed and updated by
AIN-P0-03.

## files (~160 lines) — `/api/files` + authenticated `/uploads/*`
Generic upload via `utils/fileUpload.ts` (multer disk storage to
`/var/www/aintel/uploads/{entityType}/{entityId}`, image MIME filter, 10MB,
filename sanitized `timestamp-original`). Auth required; no role gate; no ownership
check on entityType/entityId (any user can attach to any entity — Low/Medium).
AIN-P0-03 added the authenticated legacy read shim for `/uploads/*` in
`modules/files/upload-stream.ts`.

## photos (549) — `/api/photos`
Execution/requirement photos with `sharp` processing (resize/thumbnail — Probable),
photo schema records linked to entities; used heavily by zahteve UI (PhotoCapture /
PhotoManager in packages/ui) and execution evidence.

## Shared infrastructure & risks
- All artifacts are on local disk. Legacy `/uploads/...` reads now require an
  authenticated session and reject traversal attempts (S2 resolved by AIN-P0-03);
  per-entity read authorization is still future work.
- No backup/retention policy visible (Needs verification).
- Web-inquiries implements its own separate multer config (duplication P9-adjacent);
  three upload configurations exist (files util, photos, web-inquiries).
- Path traversal on reads: resolved in the authenticated `/uploads/*` handler. Write
  paths still deserve a later storage-service cleanup because entityType/entityId are
  interpolated by multiple upload implementations.

## Recommendation
One storage service (quota, ownership, auth, signed URLs, backup) consumed by all
modules. The legacy `/uploads` auth shim now exists; next hardening is per-entity
ownership checks and consolidation of upload implementations.

Reuse: High (core capability). Confidence: High on structure, Probable on internals.
