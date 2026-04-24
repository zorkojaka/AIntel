# PhotoManager Component

`PhotoManager` is the Phase 2 generic frontend component for the new unified photo system.

It talks only to the new backend API:

- `POST /api/photos`
- `GET /api/photos`
- `DELETE /api/photos/:photoId`

It does not use legacy photo upload components or `/api/files/*` endpoints.

## Imports

```tsx
import { PhotoManager, usePhotoCount, type PhotoContext } from '@aintel/ui';
```

## Context

Every usage passes a photo context. The context determines which photos are loaded, uploaded, and deleted.

```ts
const context: PhotoContext = {
  projectId: 'PRJ-001',
  phase: 'execution',
  itemId: 'item-1',
  unitIndex: 0,
  tag: 'before-install',
};
```

Allowed phases:

```ts
'requirements' | 'offer' | 'preparation' | 'execution' | 'delivery' | 'other'
```

## Basic Usage

```tsx
import { useState } from 'react';
import { PhotoManager, type PhotoContext } from '@aintel/ui';

export function ExecutionPhotoButton() {
  const [open, setOpen] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);

  const context: PhotoContext = {
    projectId: 'PRJ-001',
    phase: 'execution',
    itemId: 'item-1',
    unitIndex: 0,
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {photoCount} fotografij
      </button>

      <PhotoManager
        open={open}
        onOpenChange={setOpen}
        context={context}
        title="Fotografije enote"
        onPhotoCountChange={setPhotoCount}
      />
    </>
  );
}
```

## Read-Only Delete Control

Pass `canDelete={false}` to hide delete buttons.

```tsx
<PhotoManager
  open={open}
  onOpenChange={setOpen}
  context={{
    projectId,
    phase: 'offer',
    tag: 'customer-facing',
  }}
  title="Fotografije za ponudbo"
  canDelete={false}
/>
```

## Count-Only Hook

Use `usePhotoCount` when a parent needs a label without rendering the full manager.

```tsx
import { usePhotoCount, type PhotoContext } from '@aintel/ui';

const context: PhotoContext = {
  projectId,
  phase: 'preparation',
  itemId,
  unitIndex,
};

const { count, loading, refresh } = usePhotoCount(context);

return (
  <button type="button" onClick={() => setOpen(true)}>
    {loading ? 'Nalagam...' : `${count} fotografij`}
  </button>
);
```

If the same parent also renders `PhotoManager`, refresh the hook when the manager reports a count change:

```tsx
<PhotoManager
  open={open}
  onOpenChange={setOpen}
  context={context}
  onPhotoCountChange={() => refresh()}
/>
```

## Phase Examples

Requirements:

```tsx
<PhotoManager
  open={open}
  onOpenChange={setOpen}
  context={{ projectId, phase: 'requirements', tag: 'site-survey' }}
  title="Fotografije zahtev"
/>
```

Offer:

```tsx
<PhotoManager
  open={open}
  onOpenChange={setOpen}
  context={{ projectId, phase: 'offer', itemId: offerItemId }}
  title="Fotografije ponudbe"
/>
```

Preparation:

```tsx
<PhotoManager
  open={open}
  onOpenChange={setOpen}
  context={{ projectId, phase: 'preparation', itemId, unitIndex }}
  title="Fotografije priprave"
/>
```

Execution:

```tsx
<PhotoManager
  open={open}
  onOpenChange={setOpen}
  context={{ projectId, phase: 'execution', itemId, unitIndex }}
  title="Fotografije izvedbe"
/>
```

Delivery:

```tsx
<PhotoManager
  open={open}
  onOpenChange={setOpen}
  context={{ projectId, phase: 'delivery', tag: 'delivery-note' }}
  title="Fotografije dobave"
/>
```

## Behavior Notes

- Photos are fetched when the dialog opens.
- Uploads are optimistic: a loading tile appears immediately.
- HEIC/HEIF files skip browser preview because browsers commonly cannot display them; the backend converts them to JPEG.
- The grid uses `thumbnailUrl` first and falls back to `url`.
- Full-size preview uses `url`.
- Arrow keys navigate photos in preview.
- Escape or outside click closes the preview.
- Delete asks for confirmation before calling `DELETE /api/photos/:photoId`.

