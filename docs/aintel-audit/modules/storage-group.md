# Module group: storage (files, photos) + uploads infrastructure

Reviewed at `c0afad8` — depth: survey.

## files (100 lines) — `/api/files`
Generic upload via `utils/fileUpload.ts` (multer disk storage to
`/var/www/aintel/uploads/{entityType}/{entityId}`, image MIME filter, 10MB,
filename sanitized `timestamp-original`). Auth required; no role gate; no ownership
check on entityType/entityId (any user can attach to any entity — Low/Medium).

## photos (549) — `/api/photos`
Execution/requirement photos with `sharp` processing (resize/thumbnail — Probable),
photo schema records linked to entities; used heavily by zahteve UI (PhotoCapture /
PhotoManager in packages/ui) and execution evidence.

## Shared infrastructure & risks
- All artifacts on local disk, served statically at `/uploads` **without auth (S2,
  High)** — includes customers' site photos and web-inquiry photos.
- No backup/retention policy visible (Needs verification).
- Web-inquiries implements its own separate multer config (duplication P9-adjacent);
  three upload configurations exist (files util, photos, web-inquiries).
- Path traversal: filenames sanitized; entityType/entityId interpolated into paths —
  entityId from body, `path.join` could escape with `../` (mitigated only by
  sanitization absence check — **Needs verification**; add explicit segment
  validation).

## Recommendation
One storage service (quota, ownership, auth, signed URLs, backup) consumed by all
modules; migrate `/uploads` behind it gradually (serve legacy paths through auth
shim first).

Reuse: High (core capability). Confidence: High on structure, Probable on internals.
