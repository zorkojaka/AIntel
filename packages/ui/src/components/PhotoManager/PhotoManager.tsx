import * as Dialog from '@radix-ui/react-dialog';
import React, { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, X } from 'lucide-react';

export type PhotoPhase = 'requirements' | 'offer' | 'preparation' | 'execution' | 'delivery' | 'other';

export interface PhotoContext {
  projectId: string;
  phase: PhotoPhase;
  itemId?: string;
  unitIndex?: number;
  tag?: string;
}

export interface PhotoManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: PhotoContext;
  title?: string;
  description?: string;
  canDelete?: boolean;
  onPhotoCountChange?: (count: number) => void;
}

export interface ManagedPhoto {
  _id: string;
  id?: string;
  projectId: string;
  phase: PhotoPhase;
  itemId?: string;
  unitIndex?: number;
  tag?: string;
  url: string;
  thumbnailUrl?: string;
  originalName: string;
  filename: string;
  size: number;
  mimeType: string;
  width: number;
  height: number;
  uploadedBy: string;
  uploadedAt: string;
}

type PhotoTile =
  | {
      kind: 'photo';
      photo: ManagedPhoto;
    }
  | {
      kind: 'uploading';
      id: string;
      previewUrl?: string;
      filename: string;
      error?: string;
    };

type PhotosResponse = {
  success: boolean;
  data?: {
    photos?: ManagedPhoto[];
    photo?: ManagedPhoto;
  };
  error?: string | null;
};

function buildPhotoQuery(context: PhotoContext) {
  const params = new URLSearchParams();
  params.set('projectId', context.projectId);
  params.set('phase', context.phase);
  if (context.itemId) params.set('itemId', context.itemId);
  if (typeof context.unitIndex === 'number') params.set('unitIndex', String(context.unitIndex));
  if (context.tag) params.set('tag', context.tag);
  return params.toString();
}

function appendContext(formData: FormData, context: PhotoContext) {
  formData.append('projectId', context.projectId);
  formData.append('phase', context.phase);
  if (context.itemId) formData.append('itemId', context.itemId);
  if (typeof context.unitIndex === 'number') formData.append('unitIndex', String(context.unitIndex));
  if (context.tag) formData.append('tag', context.tag);
}

function getPhotoId(photo: ManagedPhoto) {
  return photo.id || photo._id;
}

function getPhotoImageSrc(photo: ManagedPhoto, variant: 'thumbnail' | 'full' = 'thumbnail') {
  return variant === 'thumbnail' ? photo.thumbnailUrl || photo.url : photo.url || photo.thumbnailUrl || '';
}

function isHeic(file: File) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return mime === 'image/heic' || mime === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');
}

function formatPhotoDate(value: string) {
  if (!value) return 'Datum ni znan';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Datum ni znan';
  return new Intl.DateTimeFormat('sl-SI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function PhotoTileImage({ photo }: { photo: ManagedPhoto }) {
  const [imgError, setImgError] = useState(false);
  const src = imgError ? undefined : getPhotoImageSrc(photo);

  if (!src || imgError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/40">
        <Camera className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={photo.originalName || 'Fotografija'}
      className="h-full w-full object-cover"
      onError={() => setImgError(true)}
    />
  );
}

function PhotoPreviewImage({ photo }: { photo: ManagedPhoto }) {
  const [imgError, setImgError] = useState(false);
  const src = imgError ? undefined : getPhotoImageSrc(photo, 'full');

  if (!src || imgError) {
    return (
      <div className="flex h-[50vh] w-[min(80vw,720px)] items-center justify-center rounded-md bg-black/40">
        <Camera className="h-12 w-12 text-white/70" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={photo.originalName || 'Fotografija'}
      className="max-h-[80vh] max-w-full rounded-md object-contain"
      onError={() => setImgError(true)}
    />
  );
}

export function PhotoManager({
  open,
  onOpenChange,
  context,
  title = 'Fotografije',
  description,
  canDelete = true,
  onPhotoCountChange,
}: PhotoManagerProps) {
  const [tiles, setTiles] = useState<PhotoTile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<ManagedPhoto[]>([]);
  const onPhotoCountChangeRef = useRef(onPhotoCountChange);
  const lastNotifiedCountRef = useRef<number | null>(null);
  const { projectId, phase, itemId, unitIndex, tag } = context;
  const queryString = useMemo(
    () => buildPhotoQuery({ projectId, phase, itemId, unitIndex, tag }),
    [itemId, phase, projectId, tag, unitIndex],
  );

  const photos = useMemo(() => tiles.filter((tile): tile is Extract<PhotoTile, { kind: 'photo' }> => tile.kind === 'photo').map((tile) => tile.photo), [tiles]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    onPhotoCountChangeRef.current = onPhotoCountChange;
  }, [onPhotoCountChange]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage((current) => (current === message ? null : current)), 3200);
  }, []);

  const notifyCount = useCallback((nextPhotos: ManagedPhoto[]) => {
    const nextCount = nextPhotos.length;
    if (lastNotifiedCountRef.current === nextCount) return;
    lastNotifiedCountRef.current = nextCount;
    onPhotoCountChangeRef.current?.(nextCount);
  }, []);

  const fetchPhotos = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch(`/api/photos?${queryString}`, {
          credentials: 'same-origin',
          signal,
        });
        const result = (await response.json()) as PhotosResponse;
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Photos load failed');
        }
        const nextPhotos = result.data?.photos ?? [];
        setTiles(nextPhotos.map((photo) => ({ kind: 'photo', photo })));
        notifyCount(nextPhotos);
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        setLoadError('Fotografij ni bilo mogoče naložiti.');
      } finally {
        setLoading(false);
      }
    },
    [notifyCount, queryString],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetchPhotos(controller.signal);
    return () => controller.abort();
  }, [fetchPhotos, itemId, open, phase, projectId, tag, unitIndex]);

  useEffect(() => {
    if (previewIndex !== null && previewIndex >= photos.length) {
      setPreviewIndex(photos.length > 0 ? photos.length - 1 : null);
    }
  }, [photos.length, previewIndex]);

  useEffect(() => {
    if (previewIndex === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPreviewIndex(null);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPreviewIndex((current) => {
          if (current === null || photos.length === 0) return current;
          return current === 0 ? photos.length - 1 : current - 1;
        });
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPreviewIndex((current) => {
          if (current === null || photos.length === 0) return current;
          return current === photos.length - 1 ? 0 : current + 1;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photos.length, previewIndex]);

  useEffect(() => {
    return () => {
      tiles.forEach((tile) => {
        if (tile.kind === 'uploading' && tile.previewUrl) {
          URL.revokeObjectURL(tile.previewUrl);
        }
      });
    };
  }, [tiles]);

  const uploadFile = async (file: File) => {
    const placeholderId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const previewUrl = isHeic(file) ? undefined : URL.createObjectURL(file);
    const placeholder: PhotoTile = {
      kind: 'uploading',
      id: placeholderId,
      previewUrl,
      filename: file.name,
    };

    setTiles((current) => [...current, placeholder]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      appendContext(formData, context);

      const response = await fetch('/api/photos', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const result = (await response.json()) as PhotosResponse;
      if (!response.ok || !result.success || !result.data?.photo) {
        throw new Error(result.error || 'Upload failed');
      }

      const uploadedPhoto = result.data.photo;
      setTiles((current) => {
        const nextTiles = current.map((tile) => (tile.kind === 'uploading' && tile.id === placeholderId ? { kind: 'photo' as const, photo: uploadedPhoto } : tile));
        notifyCount(nextTiles.filter((tile): tile is Extract<PhotoTile, { kind: 'photo' }> => tile.kind === 'photo').map((tile) => tile.photo));
        return nextTiles;
      });
    } catch {
      showToast('Nalaganje slike ni uspelo');
      setTiles((current) =>
        current.map((tile) =>
          tile.kind === 'uploading' && tile.id === placeholderId
            ? {
                ...tile,
                error: 'Napaka',
              }
            : tile,
        ),
      );
    } finally {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    await Promise.all(selectedFiles.map((file) => uploadFile(file)));
  };

  const deletePhoto = async (photo: ManagedPhoto) => {
    if (!window.confirm('Zbrisati sliko?')) return;
    const photoId = getPhotoId(photo);
    try {
      const response = await fetch(`/api/photos/${photoId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const result = (await response.json()) as PhotosResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Delete failed');
      }

      setTiles((current) => {
        const nextTiles = current.filter((tile) => tile.kind !== 'photo' || getPhotoId(tile.photo) !== photoId);
        notifyCount(nextTiles.filter((tile): tile is Extract<PhotoTile, { kind: 'photo' }> => tile.kind === 'photo').map((tile) => tile.photo));
        return nextTiles;
      });
      setPreviewIndex(null);
    } catch {
      showToast('Brisanje slike ni uspelo');
    }
  };

  const openPreview = (photo: ManagedPhoto) => {
    const index = photos.findIndex((candidate) => getPhotoId(candidate) === getPhotoId(photo));
    if (index >= 0) setPreviewIndex(index);
  };

  const movePreview = (direction: -1 | 1) => {
    setPreviewIndex((current) => {
      if (current === null || photos.length === 0) return current;
      if (direction < 0) return current === 0 ? photos.length - 1 : current - 1;
      return current === photos.length - 1 ? 0 : current + 1;
    });
  };

  const previewPhoto = previewIndex === null ? null : photos[previewIndex] ?? null;
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setPreviewIndex(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleDialogOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="flex flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(500px, 90vw)',
            maxHeight: '80vh',
            zIndex: 50,
          }}
        >
          <div className="shrink-0 border-b bg-background px-4 py-4">
            <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-sm text-muted-foreground">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground" aria-label="Zapri fotografije">
              <X className="h-5 w-5" />
            </Dialog.Close>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {loading ? (
              <div className="flex min-h-56 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <div className="flex min-h-56 items-center justify-center rounded-md border border-dashed px-6 text-center text-sm text-muted-foreground">
                {loadError}
              </div>
            ) : tiles.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-md border border-dashed px-6 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dashed bg-background">
                  <Camera className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Še ni fotografij</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {tiles.map((tile) =>
                  tile.kind === 'photo' ? (
                    <div key={getPhotoId(tile.photo)} className="group relative aspect-square overflow-hidden rounded-md border bg-muted/20">
                      <button type="button" className="h-full w-full" onClick={() => openPreview(tile.photo)} aria-label="Odpri fotografijo">
                        <PhotoTileImage photo={tile.photo} />
                      </button>
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => void deletePhoto(tile.photo)}
                          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white opacity-100 shadow-sm transition hover:bg-red-600 md:opacity-0 md:group-hover:opacity-100"
                          aria-label="Izbriši fotografijo"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div key={tile.id} className="relative aspect-square overflow-hidden rounded-md border bg-muted/20">
                      {tile.previewUrl ? <img src={tile.previewUrl} alt={tile.filename} className="h-full w-full object-cover opacity-70" /> : null}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/35 px-3 text-center text-white">
                        {tile.error ? <X className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
                        <span className="text-xs font-medium">{tile.error ?? 'Nalagam...'}</span>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-10 shrink-0 border-t bg-background px-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-accent hover:text-accent-foreground"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                Kamera
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-accent hover:text-accent-foreground"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4" />
                Galerija
              </button>
            </div>
          </div>

          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(event) => void handleFileSelect(event)} className="hidden" />
          <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={(event) => void handleFileSelect(event)} className="hidden" />

          {toastMessage ? (
            <div role="status" aria-live="polite" className="absolute bottom-20 left-4 right-4 rounded-md border bg-background px-4 py-3 text-sm font-medium shadow-lg md:left-auto md:right-4 md:w-80">
              {toastMessage}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>

      {previewPhoto ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onMouseDown={() => setPreviewIndex(null)}>
          <button type="button" className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80" onClick={() => setPreviewIndex(null)} aria-label="Zapri predogled">
            <X className="h-5 w-5" />
          </button>
          {photos.length > 1 ? (
            <>
              <button type="button" className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); movePreview(-1); }} aria-label="Prejšnja fotografija">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button" className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); movePreview(1); }} aria-label="Naslednja fotografija">
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}
          <figure className="flex max-h-full max-w-full flex-col items-center gap-3" onMouseDown={(event) => event.stopPropagation()}>
            <PhotoPreviewImage photo={previewPhoto} />
            <figcaption className="rounded-md bg-black/60 px-3 py-2 text-center text-sm text-white">
              <span>Naložil: {previewPhoto.uploadedBy || 'neznano'}</span>
              <span className="mx-2">-</span>
              <span>{formatPhotoDate(previewPhoto.uploadedAt)}</span>
            </figcaption>
          </figure>
        </div>
      ) : null}
    </Dialog.Root>
  );
}
