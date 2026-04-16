import React, { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X } from 'lucide-react';

export interface PhotoCaptureProps {
  entityType: string;
  entityId: string;
  onPhotosChange?: (photos: UploadedPhoto[]) => void;
  onPhotoUploaded?: (photo: UploadedPhoto) => void | Promise<void>;
  onDeletePhoto?: (photo: UploadedPhoto) => void | Promise<void>;
  existingPhotoUrls?: string[];
  maxPhotos?: number;
}

export interface UploadedPhoto {
  fileUrl: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
}

interface PhotoPreview {
  id: string;
  dataUrl: string;
  uploading: boolean;
  progress: number;
  uploaded?: UploadedPhoto;
  error?: string;
  isExisting?: boolean;
}

function getFilenameFromUrl(fileUrl: string): string {
  try {
    const resolvedUrl = new URL(fileUrl, window.location.origin);
    const filename = resolvedUrl.pathname.split('/').pop();
    return filename && filename.length > 0 ? filename : 'photo';
  } catch {
    const segments = fileUrl.split('/');
    return segments[segments.length - 1] || 'photo';
  }
}

function getMimeTypeFromFilename(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function buildUploadedPhotoFromUrl(fileUrl: string): UploadedPhoto {
  const filename = getFilenameFromUrl(fileUrl);
  return {
    fileUrl,
    filename,
    originalName: filename,
    size: 0,
    mimeType: getMimeTypeFromFilename(filename),
  };
}

function buildExistingPhotoPreview(fileUrl: string): PhotoPreview {
  return {
    id: `existing-${fileUrl}`,
    dataUrl: fileUrl,
    uploading: false,
    progress: 100,
    uploaded: buildUploadedPhotoFromUrl(fileUrl),
    isExisting: true,
  };
}

function getUploadedPhotos(previews: PhotoPreview[]): UploadedPhoto[] {
  return previews
    .map((preview) => preview.uploaded)
    .filter((photo): photo is UploadedPhoto => photo !== undefined);
}

function mergePhotos(existingPhotoUrls: string[], currentPhotos: PhotoPreview[]): PhotoPreview[] {
  const existingPreviews = existingPhotoUrls.map(buildExistingPhotoPreview);
  const localPhotos = currentPhotos.filter((photo) => !photo.isExisting);
  const merged = [...existingPreviews, ...localPhotos];
  const seenUrls = new Set<string>();

  return merged.filter((photo) => {
    const fileUrl = photo.uploaded?.fileUrl;
    if (!fileUrl) return true;
    if (seenUrls.has(fileUrl)) return false;
    seenUrls.add(fileUrl);
    return true;
  });
}

export function PhotoCapture({
  entityType,
  entityId,
  onPhotosChange,
  onPhotoUploaded,
  onDeletePhoto,
  existingPhotoUrls = [],
  maxPhotos = 10,
}: PhotoCaptureProps) {
  const MAX_IMAGE_DIMENSION = 1920;
  const JPEG_QUALITY = 0.8;
  const [photos, setPhotos] = useState<PhotoPreview[]>(() => existingPhotoUrls.map(buildExistingPhotoPreview));
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPhotos((prev) => mergePhotos(existingPhotoUrls, prev));
  }, [existingPhotoUrls]);

  const uploadedCount = useMemo(
    () => getUploadedPhotos(photos).length,
    [photos],
  );

  const notifyPhotosChange = (nextPhotos: PhotoPreview[]) => {
    onPhotosChange?.(getUploadedPhotos(nextPhotos));
  };

  const compressImage = (file: File): Promise<File> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Canvas context unavailable'));
          return;
        }

        const scale = Math.min(1, MAX_IMAGE_DIMENSION / image.width, MAX_IMAGE_DIMENSION / image.height);
        const targetWidth = Math.max(1, Math.round(image.width * scale));
        const targetHeight = Math.max(1, Math.round(image.height * scale));

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        context.drawImage(image, 0, 0, targetWidth, targetHeight);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);

            if (!blob) {
              reject(new Error('Image compression failed'));
              return;
            }

            const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
            resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          JPEG_QUALITY,
        );
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image load failed'));
      };

      image.src = objectUrl;
    });

  const uploadPhoto = async (photoId: string, file: File) => {
    try {
      const compressedFile = await compressImage(file);
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('entityType', entityType);
      formData.append('entityId', entityId);

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      const uploadedPhoto: UploadedPhoto = result.data;
      let nextPhotos: PhotoPreview[] = [];

      setPhotos((prev) => {
        nextPhotos = prev.map((photo) =>
          photo.id === photoId
            ? {
                ...photo,
                uploading: false,
                progress: 100,
                uploaded: uploadedPhoto,
                error: undefined,
              }
            : photo,
        );
        return nextPhotos;
      });

      notifyPhotosChange(
        nextPhotos.map((photo) =>
          photo.id === photoId
            ? {
                ...photo,
                uploading: false,
                progress: 100,
                uploaded: uploadedPhoto,
                error: undefined,
              }
            : photo,
        ),
      );

      await onPhotoUploaded?.(uploadedPhoto);
    } catch (error) {
      console.error('Upload error:', error);
      setPhotos((prev) =>
        prev.map((photo) =>
          photo.id === photoId
            ? {
                ...photo,
                uploading: false,
                error: error instanceof Error ? error.message : 'Upload failed',
              }
            : photo,
        ),
      );
    }
  };

  const addPhotoToQueue = (file: File, dataUrl: string) => {
    if (photos.length >= maxPhotos) {
      alert(`Maksimalno število fotografij je ${maxPhotos}.`);
      return;
    }

    const photoId = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newPhoto: PhotoPreview = {
      id: photoId,
      dataUrl,
      uploading: true,
      progress: 0,
    };

    setPhotos((prev) => [...prev, newPhoto]);
    void uploadPhoto(photoId, file);
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        alert(`${file.name} ni slika.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const result = loadEvent.target?.result;
        if (typeof result === 'string') {
          addPhotoToQueue(file, result);
        }
      };
      reader.readAsDataURL(file);
    });

    event.target.value = '';
  };

  const deletePhoto = async (photoId: string) => {
    const photo = photos.find((preview) => preview.id === photoId);
    if (!photo?.uploaded) return;

    try {
      if (onDeletePhoto) {
        await onDeletePhoto(photo.uploaded);
      } else {
        const response = await fetch(
          `/api/files/${photo.uploaded.filename}?entityType=${entityType}&entityId=${entityId}`,
          { method: 'DELETE' },
        );
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Delete failed');
        }
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Brisanje fotografije ni uspelo.');
      return;
    }

    const nextPhotos = photos.filter((preview) => preview.id !== photoId);
    setPhotos(nextPhotos);
    if (previewPhotoUrl === photo.dataUrl) {
      setPreviewPhotoUrl(null);
    }
    notifyPhotosChange(nextPhotos);
  };

  const buttonClassName =
    'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
  const isAtLimit = photos.length >= maxPhotos;

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      <div className="space-y-1">
        <p className="text-sm font-medium">{uploadedCount} shranjenih slik</p>
        <p className="text-xs text-muted-foreground">Dodaj fotografije ali odpri obstoječe v povečanem prikazu.</p>
      </div>

      {photos.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border bg-background">
            <Camera className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Še ni fotografij</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square overflow-hidden rounded-xl border bg-muted/20">
              <button
                type="button"
                className="h-full w-full"
                onClick={() => {
                  if (!photo.uploading && !photo.error) {
                    setPreviewPhotoUrl(photo.dataUrl);
                  }
                }}
                disabled={photo.uploading}
              >
                <img src={photo.dataUrl} alt="Fotografija enote" className="h-full w-full object-cover" />
              </button>

              {photo.uploading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                  <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
                </div>
              ) : null}

              {photo.error ? (
                <div className="absolute inset-0 flex items-center justify-center bg-destructive/90 px-2 text-center text-xs font-medium text-destructive-foreground">
                  Napaka pri nalaganju
                </div>
              ) : null}

              {photo.uploaded ? (
                <button
                  type="button"
                  onClick={() => void deletePhoto(photo.id)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white shadow-sm transition-colors hover:bg-red-700"
                  aria-label="Izbriši fotografijo"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto border-t pt-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className={buttonClassName}
            onClick={() => cameraInputRef.current?.click()}
            disabled={isAtLimit}
          >
            <Camera className="h-4 w-4" />
            Kamera
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => galleryInputRef.current?.click()}
            disabled={isAtLimit}
          >
            <ImageIcon className="h-4 w-4" />
            Galerija
          </button>
        </div>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {previewPhotoUrl ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
            onClick={() => setPreviewPhotoUrl(null)}
            aria-label="Zapri predogled"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={previewPhotoUrl}
            alt="Povečan predogled fotografije"
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
