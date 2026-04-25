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

type UploadStep =
  | 'file selection'
  | 'FileReader preview'
  | 'canvas compression'
  | 'FormData creation'
  | 'fetch to /api/photos';

const PHOTO_MANAGER_LOG_PREFIX = '[PhotoManager]';
const LARGE_UPLOAD_WARNING_BYTES = 20 * 1024 * 1024;
const COMPRESSION_MIN_BYTES = 1.5 * 1024 * 1024;
const COMPRESSION_MAX_DIMENSION = 1920;
const COMPRESSION_QUALITY = 0.82;

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size)) return 'unknown size';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function getMimeFromName(name: string) {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.gif')) return 'image/gif';
  if (lowerName.endsWith('.heic')) return 'image/heic';
  if (lowerName.endsWith('.heif')) return 'image/heif';
  return '';
}

function getExtensionFromMime(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'jpg';
}

function getEffectiveMimeType(file: File) {
  return file.type || getMimeFromName(file.name);
}

function describeFile(file: File) {
  return {
    name: file.name || '(missing name)',
    size: file.size,
    formattedSize: formatFileSize(file.size),
    type: file.type || '(empty mimeType)',
    detectedType: getEffectiveMimeType(file) || '(unknown)',
    lastModified: file.lastModified || null,
    isHeic: isHeic(file),
    isLarge: file.size > LARGE_UPLOAD_WARNING_BYTES,
  };
}

class PhotoUploadStepError extends Error {
  step: UploadStep;
  fileDetails: ReturnType<typeof describeFile>;

  constructor(step: UploadStep, cause: unknown, file: File) {
    const message = getErrorMessage(cause);
    super(message);
    this.name = 'PhotoUploadStepError';
    this.step = step;
    this.fileDetails = describeFile(file);
  }
}

async function runUploadStep<T>(step: UploadStep, file: File, details: Record<string, unknown>, action: () => Promise<T>): Promise<T> {
  console.log(`${PHOTO_MANAGER_LOG_PREFIX} Step ${step}: start`, {
    ...details,
    file: describeFile(file),
  });
  try {
    const result = await action();
    console.log(`${PHOTO_MANAGER_LOG_PREFIX} Step ${step}: success`, {
      ...details,
      file: describeFile(file),
    });
    return result;
  } catch (error) {
    console.error(`${PHOTO_MANAGER_LOG_PREFIX} Step ${step}: failed`, {
      ...details,
      error,
      message: getErrorMessage(error),
      file: describeFile(file),
    });
    throw new PhotoUploadStepError(step, error, file);
  }
}

function formatUploadError(error: unknown, fallbackStep: UploadStep, file: File) {
  const step = error instanceof PhotoUploadStepError ? error.step : fallbackStep;
  const fileDetails = error instanceof PhotoUploadStepError ? error.fileDetails : describeFile(file);
  return `Napaka pri nalaganju (${step}): ${getErrorMessage(error)}. Datoteka: ${fileDetails.name}, ${fileDetails.formattedSize}, ${fileDetails.type}, zaznano: ${fileDetails.detectedType}.`;
}

function normalizeUploadFile(file: File) {
  const effectiveType = getEffectiveMimeType(file);
  const hasName = Boolean(file.name?.trim());
  const hasType = Boolean(file.type);

  if (hasName && hasType) return file;

  const fallbackName = hasName ? file.name : `mobile-upload-${Date.now()}.${getExtensionFromMime(effectiveType)}`;
  console.log(`${PHOTO_MANAGER_LOG_PREFIX} Step file selection: normalizing mobile file metadata`, {
    before: describeFile(file),
    fallbackName,
    effectiveType: effectiveType || '(unknown)',
  });

  try {
    return new File([file], fallbackName, {
      type: effectiveType || file.type,
      lastModified: file.lastModified || Date.now(),
    });
  } catch (error) {
    console.warn(`${PHOTO_MANAGER_LOG_PREFIX} Step file selection: File constructor unavailable, using original file`, {
      error,
      message: getErrorMessage(error),
      file: describeFile(file),
    });
    return file;
  }
}

function readPreview(file: File) {
  return new Promise<string | undefined>((resolve, reject) => {
    if (file.size > LARGE_UPLOAD_WARNING_BYTES) {
      console.log(`${PHOTO_MANAGER_LOG_PREFIX} Step FileReader preview: skipped large file preview to avoid mobile memory pressure`, {
        file: describeFile(file),
      });
      resolve(undefined);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed while reading preview'));
    reader.onabort = () => reject(new Error('FileReader preview was aborted'));
    reader.readAsDataURL(file);
  });
}

function loadImageForCanvas(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Browser could not decode image for canvas compression'));
    };
    image.src = objectUrl;
  });
}

async function compressWithCanvas(file: File) {
  const effectiveType = getEffectiveMimeType(file);
  const canvasSupportedTypes = ['image/jpeg', 'image/png', 'image/webp'];

  if (isHeic(file)) {
    console.log(`${PHOTO_MANAGER_LOG_PREFIX} Step canvas compression: skipped HEIC/HEIF; uploading original for server-side sharp handling`, {
      file: describeFile(file),
    });
    return file;
  }

  if (!canvasSupportedTypes.includes(effectiveType)) {
    console.log(`${PHOTO_MANAGER_LOG_PREFIX} Step canvas compression: skipped unsupported or unknown browser canvas type`, {
      effectiveType: effectiveType || '(unknown)',
      file: describeFile(file),
    });
    return file;
  }

  if (file.size < COMPRESSION_MIN_BYTES) {
    console.log(`${PHOTO_MANAGER_LOG_PREFIX} Step canvas compression: skipped small file`, {
      minBytes: COMPRESSION_MIN_BYTES,
      file: describeFile(file),
    });
    return file;
  }

  try {
    const image = await loadImageForCanvas(file);
    const scale = Math.min(1, COMPRESSION_MAX_DIMENSION / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable');
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (!nextBlob) {
          reject(new Error('Canvas compression returned an empty blob'));
          return;
        }
        resolve(nextBlob);
      }, 'image/jpeg', COMPRESSION_QUALITY);
    });

    if (blob.size >= file.size) {
      console.log(`${PHOTO_MANAGER_LOG_PREFIX} Step canvas compression: compressed file was not smaller; uploading original`, {
        originalSize: file.size,
        compressedSize: blob.size,
        file: describeFile(file),
      });
      return file;
    }

    const compressedName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${compressedName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn(`${PHOTO_MANAGER_LOG_PREFIX} Step canvas compression: failed, uploading original instead`, {
      error,
      message: getErrorMessage(error),
      file: describeFile(file),
    });
    return file;
  }
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
        if (tile.kind === 'uploading' && tile.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(tile.previewUrl);
        }
      });
    };
  }, [tiles]);

  const uploadFile = async (selectedFile: File) => {
    let file = normalizeUploadFile(selectedFile);
    const placeholderId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let previewUrl: string | undefined;
    let placeholderAdded = false;

    try {
      await runUploadStep('file selection', file, { placeholderId }, async () => {
        if (file.size <= 0) {
          throw new Error('Selected file is empty');
        }
        if (file.size > LARGE_UPLOAD_WARNING_BYTES) {
          console.log(`${PHOTO_MANAGER_LOG_PREFIX} Step file selection: large file selected`, {
            warningThreshold: formatFileSize(LARGE_UPLOAD_WARNING_BYTES),
            file: describeFile(file),
          });
        }
      });

      previewUrl = await runUploadStep('FileReader preview', file, { placeholderId }, async () => readPreview(file));
      const placeholder: PhotoTile = {
        kind: 'uploading',
        id: placeholderId,
        previewUrl,
        filename: file.name || 'mobile-upload',
      };
      setTiles((current) => [...current, placeholder]);
      placeholderAdded = true;

      file = await runUploadStep('canvas compression', file, { placeholderId }, async () => compressWithCanvas(file));

      const formData = await runUploadStep('FormData creation', file, { placeholderId, context }, async () => {
        const nextFormData = new FormData();
        nextFormData.append('file', file, file.name || `mobile-upload-${Date.now()}.${getExtensionFromMime(getEffectiveMimeType(file))}`);
        appendContext(nextFormData, context);
        return nextFormData;
      });

      const uploadedPhoto = await runUploadStep('fetch to /api/photos', file, { placeholderId }, async () => {
        const response = await fetch('/api/photos', {
          method: 'POST',
          body: formData,
          credentials: 'same-origin',
        });
        let parsedResult: PhotosResponse;
        try {
          parsedResult = (await response.json()) as PhotosResponse;
        } catch (error) {
          throw new Error(`Upload response JSON parse failed: ${getErrorMessage(error)}`);
        }
        const nextPhoto = parsedResult.data?.photo;
        if (!response.ok || !parsedResult.success || !nextPhoto) {
          throw new Error(parsedResult.error || `Upload failed with HTTP ${response.status}`);
        }
        return nextPhoto;
      });

      setTiles((current) => {
        const nextTiles = current.map((tile) => (tile.kind === 'uploading' && tile.id === placeholderId ? { kind: 'photo' as const, photo: uploadedPhoto } : tile));
        notifyCount(nextTiles.filter((tile): tile is Extract<PhotoTile, { kind: 'photo' }> => tile.kind === 'photo').map((tile) => tile.photo));
        return nextTiles;
      });
    } catch (error) {
      const message = formatUploadError(error, 'fetch to /api/photos', file);
      showToast(message);
      if (!placeholderAdded) {
        setTiles((current) => [
          ...current,
          {
            kind: 'uploading',
            id: placeholderId,
            previewUrl,
            filename: file.name || 'mobile-upload',
            error: message,
          },
        ]);
        return;
      }
      setTiles((current) =>
        current.map((tile) =>
          tile.kind === 'uploading' && tile.id === placeholderId
            ? {
                ...tile,
                error: message,
              }
            : tile,
        ),
      );
    } finally {
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      const selectedFiles = Array.from(event.target.files ?? []);
      console.log(`${PHOTO_MANAGER_LOG_PREFIX} Step file selection: input changed`, {
        fileCount: selectedFiles.length,
        files: selectedFiles.map(describeFile),
      });
      event.target.value = '';
      await Promise.all(selectedFiles.map((file) => uploadFile(file)));
    } catch (error) {
      const message = `Napaka pri nalaganju (file selection): ${getErrorMessage(error)}`;
      console.error(`${PHOTO_MANAGER_LOG_PREFIX} Step file selection: failed`, {
        error,
        message,
      });
      showToast(message);
    }
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
                        <span className="max-w-full break-words text-xs font-medium">{tile.error ?? 'Nalagam...'}</span>
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
