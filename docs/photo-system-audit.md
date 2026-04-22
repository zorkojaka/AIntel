# Photo System Audit

Date: 2026-04-22

Scope: current repository state on the branch this audit was created from. This report documents the existing implementation only. No code behavior was changed.

## Executive summary

The current photo system has two layers:

1. Generic filesystem upload under `POST /api/files/upload`.
2. Work-order photo metadata save/delete under `POST /api/projects/:projectId/work-orders/:workOrderId/photos` and `DELETE /api/projects/:projectId/work-orders/:workOrderId/photos/:photoId`.

The only active `PhotoCapture` callers found in the app are:

- preparation photos in `LogisticsPanel`
- execution unit photos in `ExecutionPanel`

Both callers upload the binary file first, then save a metadata record on the `WorkOrder.photos` array.

There is also older/plain URL storage on:

- `WorkOrder.items[].executionSpec.executionUnits[].unitPhotos`
- `WorkOrder.items[].executionSpec.executionUnits[].prepPhotos`
- `MaterialOrder.deliveryNotePhotos`

Those arrays still exist in schemas/types/sanitizers, but the current `PhotoCapture` callers do not write to them. Delivery-note photos appear especially incomplete: `MaterialOrderCard` accepts `onDeliveryNotePhotosChange`, and the backend can persist `deliveryNotePhotos` through the work-order update flow, but no `PhotoCapture` or other visible UI in that component currently calls the prop.

## Backend

### Physical storage on disk

Implemented in `backend/utils/fileUpload.ts`.

Base directory:

```text
process.env.UPLOAD_BASE_DIR ?? /var/www/aintel/uploads
```

Save path pattern:

```text
{UPLOAD_BASE_DIR}/{entityType}/{entityId}/{timestamp}-{sanitizedOriginalName}
```

Code details:

- `UPLOAD_BASE_DIR` defaults to `/var/www/aintel/uploads`.
- `entityType` comes from `req.body.entityType`; fallback is `general`.
- `entityId` comes from `req.body.entityId`; fallback is `default`.
- filename is `${Date.now()}-${sanitizedOriginalName}`.
- `sanitizedOriginalName` replaces every character outside `[a-zA-Z0-9.-]` with `_`.
- allowed MIME types are `image/jpeg`, `image/png`, and `image/webp`.
- max file size is 10 MB.

Important current frontend behavior: `PhotoCapture` sends only `file` in `FormData`. It does not append `entityType` or `entityId`. Therefore uploads from the current `PhotoCapture` callers are physically saved to:

```text
{UPLOAD_BASE_DIR}/general/default/{timestamp}-{sanitizedOriginalName}
```

With default config this becomes:

```text
/var/www/aintel/uploads/general/default/{timestamp}-{sanitizedOriginalName}
```

Returned public URL pattern:

```text
/uploads/{entityType}/{entityId}/{timestamp}-{sanitizedOriginalName}
```

For current `PhotoCapture` uploads:

```text
/uploads/general/default/{timestamp}-{sanitizedOriginalName}
```

### Static serving

Implemented in `backend/core/app.ts`.

The Express app serves uploaded files directly:

```text
app.use('/uploads', express.static(UPLOAD_BASE_DIR))
```

So a database URL such as:

```text
/uploads/general/default/1710000000000-photo.jpg
```

maps to:

```text
{UPLOAD_BASE_DIR}/general/default/1710000000000-photo.jpg
```

### Models and schemas that hold photo URLs

#### `WorkOrder.photos`

Defined in `backend/modules/projects/schemas/work-order.ts`.

Shape:

```ts
interface WorkOrderPhoto {
  _id?: Types.ObjectId;
  url: string;
  type: 'unit' | 'prep';
  itemIndex: number;
  unitIndex: number;
  uploadedAt: Date;
}
```

Schema field:

```ts
photos: { type: [workOrderPhotoSchema], default: [] }
```

This is the active metadata store used by both current `PhotoCapture` integrations.

#### `WorkOrder.items[].executionSpec.executionUnits[].unitPhotos`

Defined in the same work-order schema.

Shape:

```ts
unitPhotos?: string[];
```

Schema field:

```ts
unitPhotos: { type: [String], default: [] }
```

This is still preserved by execution-spec sanitizers and shared frontend types, but current `PhotoCapture` callers do not write to it.

#### `WorkOrder.items[].executionSpec.executionUnits[].prepPhotos`

Defined in the same work-order schema.

Shape:

```ts
prepPhotos?: string[];
```

Schema field:

```ts
prepPhotos: { type: [String], default: [] }
```

This is also still preserved by execution-spec sanitizers and shared frontend types, but current `PhotoCapture` callers do not write to it.

#### `MaterialOrder.deliveryNotePhotos`

Defined in `backend/modules/projects/schemas/material-order.ts`.

Shape:

```ts
deliveryNotePhotos?: string[];
```

Schema field:

```ts
deliveryNotePhotos: { type: [String], default: [] }
```

The backend serializes this field and can update it through `PUT /api/projects/:projectId/work-orders/:workOrderId` when the payload includes `materialOrderId` and `deliveryNotePhotos`.

Current UI wiring appears incomplete: `MaterialOrderCard` receives an `onDeliveryNotePhotosChange` prop, but no active UI in that component calls it and no `PhotoCapture` is rendered for delivery-note photos.

#### Project delivery notes

`backend/modules/projects/schemas/project.ts` has `deliveryNotes`, and `POST /api/projects/:id/deliveries/:deliveryId/receive` updates delivery receipt data. No photo URL field was found on the project delivery-note schema/path during this audit.

### Photo-related endpoints

All `/api/*` routes are behind `requireAuth` in `backend/core/app.ts` and `backend/routes.ts`, except `/uploads`, `/health`, `/api/health`, and `/api/auth`.

#### `POST /api/files/upload`

Route:

```text
backend/routes.ts -> router.use('/files', filesRoutes)
backend/modules/files/routes.ts -> router.post('/upload', upload.single('file'), uploadFile)
```

Purpose:

- Accepts one multipart file field named `file`.
- `multer` writes the file to disk.
- Returns the relative public URL and file metadata.

Expected multipart body:

```text
file: image file
entityType: optional; used only by multer destination
entityId: optional; used only by multer destination
```

Current `PhotoCapture` body:

```text
file: compressed JPEG
```

Current `PhotoCapture` does not send `entityType` or `entityId`, so the backend falls back to `general/default`.

Success response shape:

```json
{
  "success": true,
  "data": {
    "fileUrl": "/uploads/general/default/1710000000000-photo.jpg",
    "filename": "1710000000000-photo.jpg",
    "originalName": "photo.jpg",
    "size": 12345,
    "mimeType": "image/jpeg"
  }
}
```

Error response if no file:

```json
{
  "success": false,
  "error": "No file uploaded"
}
```

Note: this controller returns raw `res.json(...)`, not the shared `res.success(...)` wrapper, so upload errors do not include `data: null`.

#### `DELETE /api/files/:filename`

Route:

```text
backend/routes.ts -> router.use('/files', filesRoutes)
backend/modules/files/routes.ts -> router.delete('/:filename', deleteFileHandler)
```

Purpose:

- Deletes a file from disk by reconstructing `/uploads/{entityType}/{entityId}/{filename}` from path and query parameters.

Required query params:

```text
entityType
entityId
```

Success response shape:

```json
{
  "success": true,
  "data": {
    "message": "File deleted successfully",
    "filename": "1710000000000-photo.jpg"
  }
}
```

Error response if required params are missing:

```json
{
  "success": false,
  "error": "Missing required parameters: filename, entityType, entityId"
}
```

Current `PhotoCapture` callers do not use this endpoint. They call the work-order photo delete endpoint instead.

#### `POST /api/projects/:projectId/work-orders/:workOrderId/photos`

Route:

```text
backend/modules/projects/routes/index.ts
router.post('/:projectId/work-orders/:workOrderId/photos', requireWorkOrderWrite, saveWorkOrderPhoto)
```

Purpose:

- Saves photo metadata onto `WorkOrder.photos`.
- Does not upload a binary file; it expects the URL returned by `POST /api/files/upload`.
- Deduplicates by exact `{ url, type, itemIndex, unitIndex }`.

Required JSON body:

```json
{
  "url": "/uploads/general/default/1710000000000-photo.jpg",
  "type": "unit",
  "itemIndex": 0,
  "unitIndex": 0
}
```

Validation:

- `url` must be a non-empty string.
- `type` must be `"unit"` or `"prep"`.
- `itemIndex` must be a non-negative integer.
- `unitIndex` must be a non-negative integer.
- work order must match both `_id = workOrderId` and `projectId`.

Success response shape through `res.success(...)`:

```json
{
  "success": true,
  "data": {
    "message": "Photo saved successfully",
    "photo": {
      "_id": "photoSubdocumentId",
      "id": "photoSubdocumentId",
      "url": "/uploads/general/default/1710000000000-photo.jpg",
      "type": "unit",
      "itemIndex": 0,
      "unitIndex": 0,
      "uploadedAt": "2026-04-22T00:00:00.000Z"
    },
    "photos": [
      {
        "_id": "photoSubdocumentId",
        "id": "photoSubdocumentId",
        "url": "/uploads/general/default/1710000000000-photo.jpg",
        "type": "unit",
        "itemIndex": 0,
        "unitIndex": 0,
        "uploadedAt": "2026-04-22T00:00:00.000Z"
      }
    ]
  },
  "error": null
}
```

Error response shape through `res.fail(...)`:

```json
{
  "success": false,
  "data": null,
  "error": "url is required"
}
```

Other possible errors:

- `type must be "unit" or "prep"`
- `itemIndex must be a non-negative integer`
- `unitIndex must be a non-negative integer`
- `Delovni nalog ni najden.`

#### `DELETE /api/projects/:projectId/work-orders/:workOrderId/photos/:photoId`

Route:

```text
backend/modules/projects/routes/index.ts
router.delete('/:projectId/work-orders/:workOrderId/photos/:photoId', requireWorkOrderWrite, deleteWorkOrderPhoto)
```

Purpose:

- Finds the work order by `_id` and `projectId`.
- Finds the `WorkOrder.photos` subdocument by `photoId`.
- Removes the metadata record from `WorkOrder.photos`.
- Deletes the physical file via `deleteFile(photo.url)`.

Success response shape:

```json
{
  "success": true,
  "data": {
    "message": "Photo deleted successfully",
    "photoId": "photoSubdocumentId",
    "photos": []
  },
  "error": null
}
```

Error response examples:

```json
{
  "success": false,
  "data": null,
  "error": "Delovni nalog ni najden."
}
```

```json
{
  "success": false,
  "data": null,
  "error": "Photo not found on work order"
}
```

Important detail: file deletion result is ignored. If metadata is removed successfully but the disk file does not exist, the endpoint still returns success.

#### `PUT /api/projects/:projectId/work-orders/:workOrderId`

Route:

```text
backend/modules/projects/routes/index.ts
router.put('/:projectId/work-orders/:workOrderId', requireWorkOrderWrite, logisticsController.updateWorkOrder)
```

This is not a dedicated photo endpoint, but it is photo-related because it can persist:

- `items[].executionSpec.executionUnits[].unitPhotos`
- `items[].executionSpec.executionUnits[].prepPhotos`
- `deliveryNotePhotos` on a related `MaterialOrder`

Relevant behavior:

- Work-order `items` are sanitized with nested execution spec and `unitPhotos`/`prepPhotos` string arrays.
- If payload includes `materialOrderId`, and payload includes `deliveryNotePhotos`, the backend updates `MaterialOrder.deliveryNotePhotos`.

Response shape:

```json
{
  "success": true,
  "data": {
    "_id": "workOrderId",
    "projectId": "projectId",
    "items": [],
    "photos": [],
    "...": "serialized work order fields"
  },
  "error": null
}
```

Important detail: even when it updates the linked material order's `deliveryNotePhotos`, this endpoint returns only the serialized work order. It does not return the updated material order in this response.

#### `GET /api/projects/:projectId/logistics`

Route:

```text
backend/modules/projects/routes/index.ts
router.get('/:projectId/logistics', logisticsController.getProjectLogistics)
```

This is not a mutation endpoint, but it is the main read path that returns photo data to the frontend.

Response includes:

```json
{
  "success": true,
  "data": {
    "projectId": "projectId",
    "confirmedOfferVersionId": "offerVersionId",
    "materialOrders": [
      {
        "_id": "materialOrderId",
        "deliveryNotePhotos": []
      }
    ],
    "workOrders": [
      {
        "_id": "workOrderId",
        "photos": [
          {
            "_id": "photoSubdocumentId",
            "id": "photoSubdocumentId",
            "url": "/uploads/general/default/1710000000000-photo.jpg",
            "type": "unit",
            "itemIndex": 0,
            "unitIndex": 0,
            "uploadedAt": "2026-04-22T00:00:00.000Z"
          }
        ]
      }
    ],
    "materialOrder": {},
    "workOrder": {}
  },
  "error": null
}
```

## Frontend

### Shared `PhotoCapture`

File: `packages/ui/src/components/PhotoCapture/PhotoCapture.tsx`

Props:

```ts
interface PhotoCaptureProps {
  uploadUrl: string;
  saveUrl?: string;
  deleteUrl: (photoUrl: string, photoId?: string) => string;
  existingPhotos?: Array<ExistingPhoto | string>;
  savePayload?: (photo: UploadedPhoto) => Record<string, unknown>;
  onSaveResponse?: (data: PhotoSaveResponseData) => void;
  onDeleteResponse?: (data: PhotoSaveResponseData) => void;
  onPhotosChange?: (photos: string[]) => void;
  title?: string;
  maxPhotos?: number;
}
```

Photo input behavior:

- It renders two hidden file inputs:
  - camera input: `accept="image/*" capture="environment" multiple`
  - gallery input: `accept="image/*" multiple`
- It reads each selected file into a data URL for local preview.
- It compresses every image client-side to JPEG:
  - max dimension: 1920 px
  - JPEG quality: 0.8
  - output filename: original base name with `.jpg`
- It uploads immediately after selection.

Upload behavior:

```ts
const formData = new FormData();
formData.append('file', compressedFile);
fetch(uploadUrl, { method: 'POST', body: formData });
```

Important: `PhotoCapture` does not append `entityType` or `entityId`.

Save behavior:

- If `saveUrl` is provided, it sends a JSON `POST` to `saveUrl`.
- Default save payload is `{ photoUrl: uploadedPhoto.fileUrl }`.
- Current callers override this with `{ url, type, itemIndex, unitIndex }`.
- It calls `onSaveResponse(data)` after a successful save.
- If `data.photo.url` exists, it replaces the uploaded URL with the saved URL.
- It stores `data.photo.id`/`_id` as `uploadedPhoto.photoId`.

Delete behavior:

- Calls `fetch(deleteUrl(photo.uploaded.fileUrl, photo.uploaded.photoId), { method: 'DELETE' })`.
- Calls `onDeleteResponse(data)` after success.
- Removes the preview locally after the delete response succeeds.

Existing photo behavior:

- Accepts either strings or objects.
- A string becomes `{ url: string }`.
- An object can include `id`, `_id`, `url`, `type`, `itemIndex`, `unitIndex`, `uploadedAt`.
- Preview ID is `existing-${id ?? url}`.
- Delete for existing photos requires `id`/`_id`; otherwise callers that build delete URLs from `photoId` may produce invalid URLs.

### Every current place where a user can add a photo

#### 1. Preparation unit photos in `LogisticsPanel`

File: `apps/module-projects/src/domains/logistics/LogisticsPanel.tsx`

Where the UI opens it:

- The button in the execution-definition/preparation UI calls `openPrepPhotoCapture({ workOrderId, itemIndex, unitIndex })`.
- `openPrepPhotoCapture` sets `activeUnitPhotoCapture`.
- A `Dialog` opens when `activeUnitPhotoCapture` is truthy.
- The dialog renders `PhotoCapture`.

PhotoCapture configuration:

```tsx
<PhotoCapture
  title="Fotografije priprave"
  uploadUrl="/api/files/upload"
  saveUrl={`/api/projects/${projectId}/work-orders/${activeUnitPhotoCapture.workOrderId}/photos`}
  savePayload={(photo) => ({
    url: photo.fileUrl,
    type: "prep",
    itemIndex: activeUnitPhotoCapture.itemIndex,
    unitIndex: activeUnitPhotoCapture.unitIndex,
  })}
  deleteUrl={(_photoUrl, photoId) =>
    `/api/projects/${projectId}/work-orders/${activeUnitPhotoCapture.workOrderId}/photos/${photoId ?? ""}`
  }
  existingPhotos={activePrepPhotos}
  onSaveResponse={(data) => syncWorkOrderPhotos(activeUnitPhotoCapture.workOrderId, data)}
  onDeleteResponse={(data) => syncWorkOrderPhotos(activeUnitPhotoCapture.workOrderId, data)}
  maxPhotos={10}
/>
```

Endpoints called:

1. `POST /api/files/upload`
2. `POST /api/projects/:projectId/work-orders/:workOrderId/photos`
3. `DELETE /api/projects/:projectId/work-orders/:workOrderId/photos/:photoId`

How existing photos are passed:

- `activePrepPhotos` is derived from `workOrderForm.photos` or `selectedWorkOrder.photos`.
- It filters `WorkOrder.photos` by:
  - `photo.type === "prep"`
  - matching `itemIndex`
  - matching `unitIndex`
- It maps each record to:

```ts
{
  id: photo.id ?? photo._id,
  url: photo.url
}
```

Local sync:

- `syncWorkOrderPhotos` normalizes `data.photos`.
- It updates `workOrderForm.photos`.
- If the selected work order matches, it calls `onWorkOrderUpdated({ ...selectedWorkOrder, photos })`.

#### 2. Execution unit photos in `ExecutionPanel`

File: `apps/module-projects/src/domains/execution/ExecutionPanel.tsx`

Where the UI opens it:

- The camera icon button on an execution unit calls `openUnitPhotoCapture({ orderId, itemIndex, unitIndex })`.
- `openUnitPhotoCapture` sets `activeUnitPhotoCapture`.
- A `Dialog` opens when `activeUnitPhotoCapture` is truthy.
- The dialog renders `PhotoCapture`.

PhotoCapture configuration:

```tsx
<PhotoCapture
  title="Fotografije enote"
  uploadUrl="/api/files/upload"
  saveUrl={`/api/projects/${projectId}/work-orders/${activeUnitPhotoCapture.orderId}/photos`}
  savePayload={(photo) => ({
    url: photo.fileUrl,
    type: "unit",
    itemIndex: activeUnitPhotoCapture.itemIndex,
    unitIndex: activeUnitPhotoCapture.unitIndex,
  })}
  deleteUrl={(_photoUrl, photoId) =>
    `/api/projects/${projectId}/work-orders/${activeUnitPhotoCapture.orderId}/photos/${photoId ?? ""}`
  }
  existingPhotos={activeExecutionUnitPhotos}
  onSaveResponse={(data) => syncWorkOrderPhotos(activeUnitPhotoCapture.orderId, data)}
  onDeleteResponse={(data) => syncWorkOrderPhotos(activeUnitPhotoCapture.orderId, data)}
  maxPhotos={10}
/>
```

Endpoints called:

1. `POST /api/files/upload`
2. `POST /api/projects/:projectId/work-orders/:workOrderId/photos`
3. `DELETE /api/projects/:projectId/work-orders/:workOrderId/photos/:photoId`

How existing photos are passed:

- `activeExecutionUnitPhotos` is derived by `getWorkOrderPhotoRecords(activeUnitPhotoCapture)`.
- `getWorkOrderPhotoRecords` reads from `workOrderPhotosByOrderId[orderId]` first, then falls back to `order.photos`.
- It filters `WorkOrder.photos` by:
  - `photo.type === "unit"`
  - matching `itemIndex`
  - matching `unitIndex`
- It maps each record to:

```ts
{
  id: photo.id ?? photo._id,
  url: photo.url
}
```

Local sync:

- `syncWorkOrderPhotos` normalizes `data.photos`.
- It updates local `workOrderPhotosByOrderId[orderId]`.
- The dialog `onOpenChange` refreshes logistics data after the dialog closes.

### Places that look photo-related but do not currently add photos

#### `MaterialOrderCard` delivery-note photos

File: `apps/module-projects/src/domains/logistics/MaterialOrderCard.tsx`

The component declares:

```ts
onDeliveryNotePhotosChange: (photos: string[]) => void;
```

`LogisticsPanel` passes:

```tsx
onDeliveryNotePhotosChange={(photos) =>
  updateMaterialOrderForm(order._id, { deliveryNotePhotos: photos })
}
```

However:

- `MaterialOrderCard` does not import `PhotoCapture`.
- No `PhotoCapture` is rendered in `MaterialOrderCard`.
- The `onDeliveryNotePhotosChange` prop is destructured from props but not used in the function body.
- There is no visible file input or upload call for delivery-note photos in this component.

Backend support exists for `MaterialOrder.deliveryNotePhotos`, but this frontend path currently appears disconnected.

#### Legacy execution-unit arrays

Both `LogisticsPanel` and `ExecutionPanel` preserve `unitPhotos` and `prepPhotos` while normalizing execution units, but current upload dialogs use `WorkOrder.photos` metadata instead of writing those arrays.

## Inconsistencies between places

1. Preparation and execution photos now use the same `WorkOrder.photos` metadata model, but the older execution-unit arrays still exist.

2. Preparation photos are represented as `type: "prep"` records in `WorkOrder.photos`; execution photos are represented as `type: "unit"` records. Both are indexed by numeric `itemIndex` and `unitIndex`, not stable item/unit IDs.

3. Existing photos in both active callers are passed to `PhotoCapture` as object arrays containing only `{ id, url }`. The richer `ExistingPhoto` fields (`type`, `itemIndex`, `unitIndex`, `uploadedAt`) are not passed because filtering already happened in the parent.

4. `PhotoCapture` supports a generic `onPhotosChange(photos: string[])` mode, but active work-order callers use `saveUrl` and metadata callbacks instead.

5. The generic file upload endpoint is designed for `entityType` and `entityId`, but `PhotoCapture` does not send them. All current uploads therefore go under `general/default`, not under a work-order-specific or material-order-specific directory.

6. The generic file delete endpoint requires `{ filename, entityType, entityId }`, but current callers delete through the work-order metadata endpoint instead.

7. `MaterialOrder.deliveryNotePhotos` exists in backend/schema/types and can be updated through the work-order update endpoint, but no active UI found in this audit lets the user add those photos.

8. `PUT /api/projects/:projectId/work-orders/:workOrderId` can update `MaterialOrder.deliveryNotePhotos`, but its response is the serialized work order only. A caller would need a later logistics refresh to see updated material-order photo data.

## Data flow

### Preparation photo flow

1. User clicks the preparation photo button in `LogisticsPanel`.
2. `openPrepPhotoCapture({ workOrderId, itemIndex, unitIndex })` sets `activeUnitPhotoCapture`.
3. Dialog opens and renders `PhotoCapture`.
4. `PhotoCapture` receives `existingPhotos={activePrepPhotos}`.
5. User clicks `Kamera` or `Galerija`.
6. Browser file picker returns one or more image files.
7. `PhotoCapture` reads each file with `FileReader` for immediate preview.
8. `PhotoCapture` compresses each image to JPEG using canvas.
9. `PhotoCapture` posts multipart `file` to `/api/files/upload`.
10. Backend multer saves the file to `{UPLOAD_BASE_DIR}/general/default/...`.
11. Backend returns `data.fileUrl`.
12. `PhotoCapture` posts JSON metadata to `/api/projects/:projectId/work-orders/:workOrderId/photos` with:
    - `url: fileUrl`
    - `type: "prep"`
    - `itemIndex`
    - `unitIndex`
13. Backend appends or reuses a `WorkOrder.photos` subdocument.
14. Backend returns `data.photo` and full `data.photos`.
15. `PhotoCapture` stores the returned photo subdocument id as `uploadedPhoto.photoId`.
16. `LogisticsPanel.syncWorkOrderPhotos` updates local `workOrderForm.photos` and selected work-order state.
17. `activePrepPhotos` recomputes from the updated work-order photos.
18. `PhotoCapture` merges `existingPhotos` with local previews and displays the photo.
19. On delete, `PhotoCapture` calls `DELETE /api/projects/:projectId/work-orders/:workOrderId/photos/:photoId`.
20. Backend removes metadata and calls `deleteFile(photo.url)`.

### Execution unit photo flow

1. User clicks the camera icon on an execution unit in `ExecutionPanel`.
2. `openUnitPhotoCapture({ orderId, itemIndex, unitIndex })` sets `activeUnitPhotoCapture`.
3. Dialog opens and renders `PhotoCapture`.
4. `PhotoCapture` receives `existingPhotos={activeExecutionUnitPhotos}`.
5. User selects or captures images.
6. `PhotoCapture` previews, compresses, uploads to `/api/files/upload`, then saves metadata to `/api/projects/:projectId/work-orders/:workOrderId/photos`.
7. Save payload uses `type: "unit"`.
8. Backend stores records in `WorkOrder.photos`.
9. `ExecutionPanel.syncWorkOrderPhotos` updates `workOrderPhotosByOrderId[orderId]`.
10. Existing photos recompute from local override first, then from `order.photos`.
11. When the dialog closes, `ExecutionPanel` calls `refreshAfterMutation()`.

### Display flow

1. Logistics data is fetched from `GET /api/projects/:projectId/logistics`.
2. Backend serializes `WorkOrder.photos` into each work order.
3. Parent components filter by `type`, `itemIndex`, and `unitIndex`.
4. `PhotoCapture` receives `{ id, url }` entries.
5. It renders image thumbnails using `img src={url}`.
6. Browser requests `/uploads/...`.
7. Express serves the file from `UPLOAD_BASE_DIR`.

## Known break points and risks

### Upload location is not entity-specific

`PhotoCapture` does not send `entityType` or `entityId`, even though the backend upload middleware supports them. Current photos therefore land in:

```text
/var/www/aintel/uploads/general/default
```

instead of paths such as:

```text
/var/www/aintel/uploads/work-order/{workOrderId}
```

### Work-order photos are keyed by array indexes

`WorkOrder.photos` uses `itemIndex` and `unitIndex`. If work-order items or execution units are reordered, inserted, deleted, or regenerated, photos can become associated with the wrong visible row/unit.

The legacy `executionUnits[].id` field exists, but the active photo metadata does not store it.

### Legacy photo fields still exist

`unitPhotos` and `prepPhotos` string arrays still exist under execution units. Current active dialogs read/write `WorkOrder.photos` instead. This creates two possible stores for similar concepts.

### Delivery-note photos are not reachable in the current UI

`MaterialOrder.deliveryNotePhotos` exists and the backend can persist it, but the visible Material UI does not render `PhotoCapture` or call `onDeliveryNotePhotosChange`.

### Work-order delete endpoint deletes physical files by URL but ignores deletion failure

`DELETE /api/projects/:projectId/work-orders/:workOrderId/photos/:photoId` removes metadata first, then calls `deleteFile(photoUrl)`. It does not fail the request if the file was already missing or could not be deleted.

### Generic delete endpoint is mismatched with current uploads

`DELETE /api/files/:filename` requires `entityType` and `entityId`. Current uploads do not send those fields, and current callers do not use this endpoint. If it were used for current uploads, callers would need:

```text
DELETE /api/files/{filename}?entityType=general&entityId=default
```

### Orphan files can be created

The binary upload happens before metadata save. If `/api/files/upload` succeeds but `POST /api/projects/:projectId/work-orders/:workOrderId/photos` fails, the file remains on disk without a `WorkOrder.photos` record.

### No server-side image transformation

Compression happens only in the browser. The backend accepts uploaded JPEG/PNG/WebP images but does not resize, strip metadata, or recompress.

### Upload route response shape is different from app response helper

`POST /api/files/upload` returns raw JSON:

```json
{ "success": true, "data": { "...": "..." } }
```

It does not include `error: null`, unlike `res.success(...)`.

### Stale local state differences

`LogisticsPanel` updates selected work-order state immediately through `onWorkOrderUpdated`. `ExecutionPanel` updates a local `workOrderPhotosByOrderId` override and refreshes after dialog close. Both work, but they are not identical state flows.

## Storage locations

### Code-level default

The only storage location defined in the repo is:

```text
/var/www/aintel/uploads
```

unless `UPLOAD_BASE_DIR` is set in the backend environment.

Current `PhotoCapture` uploads resolve to:

```text
/var/www/aintel/uploads/general/default/{timestamp}-{sanitizedOriginalName}
```

if no environment override is present.

### Local development

The checked local `backend/.env` contains no `UPLOAD_BASE_DIR` entry. Based on code, local development also uses the default:

```text
/var/www/aintel/uploads
```

unless the process environment sets `UPLOAD_BASE_DIR` externally.

### Staging server

Workflow file: `.github/workflows/deploy-staging.yml`

Staging deploys via SSH to:

```text
178.104.24.47
```

and runs:

```text
bash /home/jaka/deploy-aintel-staging.sh ${GITHUB_REF_NAME}
```

The staging deploy script is not present in this repository. No repo-tracked staging environment file or nginx config was found that sets `UPLOAD_BASE_DIR`.

Therefore, based on repository evidence only:

```text
staging upload path = process.env.UPLOAD_BASE_DIR on the server, or /var/www/aintel/uploads if unset
```

For current `PhotoCapture` uploads:

```text
{staging UPLOAD_BASE_DIR or /var/www/aintel/uploads}/general/default/{timestamp}-{sanitizedOriginalName}
```

### Production server

Workflow file: `.github/workflows/deploy.yml`

Production deploys `main` via SSH to:

```text
178.104.24.47
```

and runs:

```text
cd /home/jaka && bash deploy-aintel.sh
```

The production deploy script is not present in this repository. No repo-tracked production environment file or nginx config was found that sets `UPLOAD_BASE_DIR`.

Therefore, based on repository evidence only:

```text
production upload path = process.env.UPLOAD_BASE_DIR on the server, or /var/www/aintel/uploads if unset
```

For current `PhotoCapture` uploads:

```text
{production UPLOAD_BASE_DIR or /var/www/aintel/uploads}/general/default/{timestamp}-{sanitizedOriginalName}
```

### Nginx config

No nginx config was found in the repository.

The app itself serves `/uploads` through Express:

```text
app.use('/uploads', express.static(UPLOAD_BASE_DIR))
```

Deployment may also proxy or serve `/uploads` through nginx, but that config is not tracked here. The exact nginx `location /uploads` behavior on staging/production cannot be verified from the repository alone.

## Files inspected

Backend:

- `backend/utils/fileUpload.ts`
- `backend/core/app.ts`
- `backend/core/response.ts`
- `backend/routes.ts`
- `backend/modules/files/routes.ts`
- `backend/modules/files/controller.ts`
- `backend/modules/projects/routes/index.ts`
- `backend/modules/projects/controllers/work-order-photos.controller.ts`
- `backend/modules/projects/controllers/logistics.controller.ts`
- `backend/modules/projects/schemas/work-order.ts`
- `backend/modules/projects/schemas/material-order.ts`
- `backend/modules/projects/schemas/project.ts`

Frontend/shared:

- `packages/ui/src/components/PhotoCapture/PhotoCapture.tsx`
- `packages/ui/src/index.ts`
- `apps/module-projects/src/domains/logistics/LogisticsPanel.tsx`
- `apps/module-projects/src/domains/execution/ExecutionPanel.tsx`
- `apps/module-projects/src/domains/logistics/MaterialOrderCard.tsx`
- `shared/types/logistics.ts`
- `shared/types/projects/Logistics.ts`

Deployment:

- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy.yml`
- `backend/.env` searched only for upload-related variables; no `UPLOAD_BASE_DIR` was present.

