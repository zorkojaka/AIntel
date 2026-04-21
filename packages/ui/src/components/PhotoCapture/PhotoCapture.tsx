import React, { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X } from 'lucide-react';

export interface PhotoCaptureProps {
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

export interface ExistingPhoto {
  id?: string;
  _id?: string;
  url: string;
  type?: 'unit' | 'prep';
  itemIndex?: number;
  unitIndex?: number;
  uploadedAt?: string;
}

interface UploadedPhoto {
  fileUrl: string;
  filename: string;
  photoId?: string;
}

export interface PhotoSaveResponseData {
  photo?: ExistingPhoto;
  photos?: ExistingPhoto[];
  id?: string;
  _id?: string;
  url?: string;
}

interface PhotoPreview {
  id: string;
  dataUrl: string;
  uploading: boolean;
  progress: number;
  uploaded?: UploadedPhoto;
  error?: string;
  isExisting?: boolean;
  imageError?: boolean;
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

function buildUploadedPhotoFromUrl(fileUrl: string): UploadedPhoto {
  const filename = getFilenameFromUrl(fileUrl);
  return {
    fileUrl,
    filename,
  };
}

function normalizeExistingPhoto(photo: ExistingPhoto | string): ExistingPhoto {
  return typeof photo === 'string' ? { url: photo } : photo;
}

function getExistingPhotoId(photo: ExistingPhoto): string | undefined {
  return photo.id ?? photo._id;
}

function buildExistingPhotoPreview(existingPhoto: ExistingPhoto | string): PhotoPreview | null {
  const photo = normalizeExistingPhoto(existingPhoto);
  if (typeof photo.url !== 'string' || photo.url.trim().length === 0) {
    return null;
  }
  const url = photo.url.trim();
  return {
    id: `existing-${getExistingPhotoId(photo) ?? url}`,
    dataUrl: url,
    uploading: false,
    progress: 100,
    uploaded: {
      ...buildUploadedPhotoFromUrl(url),
      photoId: getExistingPhotoId(photo),
    },
    isExisting: true,
  };
}

function buildExistingPhotoPreviews(existingPhotos: Array<ExistingPhoto | string>): PhotoPreview[] {
  return existingPhotos
    .map(buildExistingPhotoPreview)
    .filter((photo): photo is PhotoPreview => photo !== null);
}

function getUploadedPhotos(previews: PhotoPreview[]): UploadedPhoto[] {
  return previews
    .map((preview) => preview.uploaded)
    .filter((photo): photo is UploadedPhoto => photo !== undefined);
}

function mergePhotos(existingPhotos: Array<ExistingPhoto | string>, currentPhotos: PhotoPreview[]): PhotoPreview[] {
  const existingPreviews = buildExistingPhotoPreviews(existingPhotos);
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
  uploadUrl,
  saveUrl,
  deleteUrl,
  existingPhotos = [],
  savePayload,
  onSaveResponse,
  onDeleteResponse,
  onPhotosChange,
  title = 'Fotografije',
  maxPhotos = 10,
}: PhotoCaptureProps) {
  const MAX_IMAGE_DIMENSION = 1920;
  const JPEG_QUALITY = 0.8;
  const [photos, setPhotos] = useState<PhotoPreview[]>(() => buildExistingPhotoPreviews(existingPhotos));
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const photosRef = useRef<PhotoPreview[]>(buildExistingPhotoPreviews(existingPhotos));
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const nextPhotos = mergePhotos(existingPhotos, photosRef.current);
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
  }, [existingPhotos]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const uploadedCount = useMemo(
    () => getUploadedPhotos(photos).length,
    [photos],
  );

  const notifyPhotosChange = (nextPhotos: PhotoPreview[]) => {
    onPhotosChange?.(getUploadedPhotos(nextPhotos).map((photo) => photo.fileUrl));
  };

  const markImageAsBroken = (photoId: string) => {
    const nextPhotos = photosRef.current.map((photo) =>
      photo.id === photoId
        ? {
            ...photo,
            imageError: true,
          }
        : photo,
    );
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
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

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      const uploadedPhoto = result.data as UploadedPhoto;

      if (saveUrl) {
        const saveResponse = await fetch(saveUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(savePayload?.(uploadedPhoto) ?? {
            photoUrl: uploadedPhoto.fileUrl,
          }),
        });
        const saveResult = await saveResponse.json();
        if (!saveResult.success) {
          throw new Error(saveResult.error || 'Photo save failed');
        }
        const data = saveResult.data as PhotoSaveResponseData | undefined;
        onSaveResponse?.(data ?? {});
        const savedPhoto = data?.photo;
        if (savedPhoto?.url) {
          uploadedPhoto.fileUrl = savedPhoto.url;
        }
        uploadedPhoto.photoId = savedPhoto ? getExistingPhotoId(savedPhoto) : data?.id ?? data?._id;
      }

      const nextPhotos = photosRef.current.map((photo) =>
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
      photosRef.current = nextPhotos;
      setPhotos(nextPhotos);

      notifyPhotosChange(nextPhotos);

      const mergedPhotos = mergePhotos(existingPhotos, photosRef.current);
      if (mergedPhotos !== photosRef.current) {
        photosRef.current = mergedPhotos;
        setPhotos(mergedPhotos);
        notifyPhotosChange(mergedPhotos);
      }
    } catch (error) {
      console.error('Upload error:', error);
      const nextPhotos = photosRef.current.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              uploading: false,
              error: error instanceof Error ? error.message : 'Upload failed',
            }
          : photo,
      );
      photosRef.current = nextPhotos;
      setPhotos(nextPhotos);
    }
  };

  const addPhotoToQueue = (file: File, dataUrl: string) => {
    if (photosRef.current.length >= maxPhotos) {
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
    const nextPhotos = [...photosRef.current, newPhoto];
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
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
    const photo = photosRef.current.find((preview) => preview.id === photoId);
    if (!photo?.uploaded) return;

    try {
      const response = await fetch(deleteUrl(photo.uploaded.fileUrl, photo.uploaded.photoId), { method: 'DELETE' });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Delete failed');
      }
      onDeleteResponse?.((result.data as PhotoSaveResponseData | undefined) ?? {});
    } catch (error) {
      console.error('Delete error:', error);
      alert('Brisanje fotografije ni uspelo.');
      return;
    }

    const nextPhotos = photosRef.current.filter((preview) => preview.id !== photoId);
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
    if (previewPhotoUrl === photo.dataUrl) {
      setPreviewPhotoUrl(null);
    }
    notifyPhotosChange(nextPhotos);
  };

  const buttonClassName =
    'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm font-medium">{uploadedCount} shranjenih fotografij</p>
        <p className="text-xs text-muted-foreground">Dodaj fotografije ali odpri obstojece v povecanem prikazu.</p>
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
                  if (!photo.uploading && !photo.error && !photo.imageError) {
                    setPreviewPhotoUrl(photo.dataUrl);
                  }
                }}
                disabled={photo.uploading || photo.imageError}
              >
                {photo.imageError ? (
                  <div className="flex h-full w-full items-center justify-center bg-muted px-2 text-center text-xs font-medium text-muted-foreground">
                    Slike ni mogoce prikazati
                  </div>
                ) : (
                  <img
                    src={photo.dataUrl}
                    alt="Fotografija"
                    className="h-full w-full object-cover"
                    onError={() => markImageAsBroken(photo.id)}
                  />
                )}
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

      <div className="sticky bottom-0 mt-auto border-t bg-background pt-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className={buttonClassName}
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            Kamera
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => galleryInputRef.current?.click()}
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
            alt="Povecan predogled fotografije"
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
