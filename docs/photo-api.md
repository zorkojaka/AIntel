# Photo API

Phase 1 backend foundation for the new unified photo system.

Base path:

```text
/api/photos
```

All endpoints are behind the existing `/api` authentication middleware.

## Storage

Uploaded images are processed server-side and saved under:

```text
/var/www/aintel/uploads/projects/{projectId}/{phase}/{timestamp}-{sanitizedName}.jpg
```

Thumbnails are saved next to the main image:

```text
/var/www/aintel/uploads/projects/{projectId}/{phase}/{timestamp}-{sanitizedName}-thumb.jpg
```

The public URLs use the existing `/uploads` static route:

```text
/uploads/projects/{projectId}/{phase}/{timestamp}-{sanitizedName}.jpg
/uploads/projects/{projectId}/{phase}/{timestamp}-{sanitizedName}-thumb.jpg
```

`projectId` in the path is the MongoDB project `_id`. For API compatibility, request `projectId` may be the Mongo `_id`, project `id`, or project `code`; the backend resolves it and stores the Mongo `_id` on the photo document.

## Image Processing

The backend accepts image uploads and processes them with `sharp`:

- auto-rotate based on EXIF orientation
- strip metadata
- resize main image to max 1920 px on the longest side
- convert main image to JPEG quality 85
- generate thumbnail at max 400 px on the longest side
- convert thumbnail to JPEG quality 75

Stored `mimeType` is always:

```text
image/jpeg
```

## Photo Object

Response shape:

```json
{
  "_id": "67abc123...",
  "id": "67abc123...",
  "projectId": "67abc123...",
  "phase": "execution",
  "itemId": "item-1",
  "unitIndex": 0,
  "tag": "motion-sensor",
  "url": "/uploads/projects/67abc123/execution/1776864000000-motion-sensor-1.jpg",
  "thumbnailUrl": "/uploads/projects/67abc123/execution/1776864000000-motion-sensor-1-thumb.jpg",
  "originalName": "motion sensor 1.heic",
  "filename": "1776864000000-motion-sensor-1.jpg",
  "size": 245123,
  "mimeType": "image/jpeg",
  "width": 1440,
  "height": 1920,
  "uploadedBy": "67def456...",
  "uploadedAt": "2026-04-22T10:30:00.000Z"
}
```

Allowed phases:

```text
requirements
offer
preparation
execution
delivery
other
```

## Upload Photo

```http
POST /api/photos
Content-Type: multipart/form-data
```

Form fields:

| Field | Required | Description |
| --- | --- | --- |
| `file` | yes | Image file. |
| `projectId` | yes | Mongo project `_id`, project `id`, or project `code`. |
| `phase` | yes | One of the allowed phase values. |
| `itemId` | no | Work-order item or other app-level item reference. |
| `unitIndex` | no | Unit index within the item. Must be a non-negative integer. |
| `tag` | no | Additional categorization. |

Example:

```bash
curl -X POST "https://example.com/api/photos" \
  -b "aintel_session=..." \
  -F "file=@./motion sensor 1.heic" \
  -F "projectId=PRJ-001" \
  -F "phase=execution" \
  -F "itemId=item-1" \
  -F "unitIndex=0" \
  -F "tag=motion-sensor"
```

Success response:

```json
{
  "success": true,
  "data": {
    "photo": {
      "_id": "67abc123...",
      "id": "67abc123...",
      "projectId": "67project...",
      "phase": "execution",
      "itemId": "item-1",
      "unitIndex": 0,
      "tag": "motion-sensor",
      "url": "/uploads/projects/67project/execution/1776864000000-motion-sensor-1.jpg",
      "thumbnailUrl": "/uploads/projects/67project/execution/1776864000000-motion-sensor-1-thumb.jpg",
      "originalName": "motion sensor 1.heic",
      "filename": "1776864000000-motion-sensor-1.jpg",
      "size": 245123,
      "mimeType": "image/jpeg",
      "width": 1440,
      "height": 1920,
      "uploadedBy": "67employee...",
      "uploadedAt": "2026-04-22T10:30:00.000Z"
    }
  },
  "error": null
}
```

Common errors:

```json
{ "success": false, "data": null, "error": "file is required" }
{ "success": false, "data": null, "error": "projectId is required" }
{ "success": false, "data": null, "error": "phase must be one of: requirements, offer, preparation, execution, delivery, other" }
{ "success": false, "data": null, "error": "Projekt ni najden." }
{ "success": false, "data": null, "error": "Ni dostopa do projekta." }
```

## List Photos

```http
GET /api/photos?projectId=PRJ-001&phase=execution
```

Query parameters:

| Parameter | Required | Description |
| --- | --- | --- |
| `projectId` | yes | Mongo project `_id`, project `id`, or project `code`. |
| `phase` | no | Filters to one phase. |
| `itemId` | no | Filters to one item reference. |
| `unitIndex` | no | Filters to one unit index. |
| `tag` | no | Filters to one tag. |

Results are sorted by `uploadedAt` descending.

Example:

```bash
curl "https://example.com/api/photos?projectId=PRJ-001&phase=execution&itemId=item-1&unitIndex=0" \
  -b "aintel_session=..."
```

Success response:

```json
{
  "success": true,
  "data": {
    "photos": [
      {
        "_id": "67abc123...",
        "id": "67abc123...",
        "projectId": "67project...",
        "phase": "execution",
        "itemId": "item-1",
        "unitIndex": 0,
        "tag": "motion-sensor",
        "url": "/uploads/projects/67project/execution/1776864000000-motion-sensor-1.jpg",
        "thumbnailUrl": "/uploads/projects/67project/execution/1776864000000-motion-sensor-1-thumb.jpg",
        "originalName": "motion sensor 1.heic",
        "filename": "1776864000000-motion-sensor-1.jpg",
        "size": 245123,
        "mimeType": "image/jpeg",
        "width": 1440,
        "height": 1920,
        "uploadedBy": "67employee...",
        "uploadedAt": "2026-04-22T10:30:00.000Z"
      }
    ]
  },
  "error": null
}
```

## Delete Photo

```http
DELETE /api/photos/:photoId
```

Delete rules:

- admin can delete
- uploader can delete
- an employee assigned to the project execution team can delete

The endpoint deletes the main file and thumbnail if present. If a disk file is already missing, DB deletion still continues.

Example:

```bash
curl -X DELETE "https://example.com/api/photos/67abc123..." \
  -b "aintel_session=..."
```

Success response:

```json
{
  "success": true,
  "data": {
    "deleted": true
  },
  "error": null
}
```

Common errors:

```json
{ "success": false, "data": null, "error": "Neveljaven ID fotografije." }
{ "success": false, "data": null, "error": "Fotografija ni najdena." }
{ "success": false, "data": null, "error": "Ni dovoljenja za brisanje fotografije." }
```

