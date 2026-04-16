import React, { useEffect, useMemo, useState } from 'react';

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
  file?: File;
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

function getUploadedPhotos(previews: PhotoPreview[]): UploadedPhoto[] {
  return previews
    .map((preview) => preview.uploaded)
    .filter((photo): photo is UploadedPhoto => photo !== undefined);
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
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);

  const existingPhotoPreviews = useMemo<PhotoPreview[]>(
    () =>
      existingPhotoUrls.map((fileUrl) => ({
        id: `existing-${fileUrl}`,
        dataUrl: fileUrl,
        uploading: false,
        progress: 100,
        uploaded: buildUploadedPhotoFromUrl(fileUrl),
        isExisting: true,
      })),
    [existingPhotoUrls]
  );

  useEffect(() => {
    setPhotos((prev) => {
      const existingUrls = new Set(existingPhotoPreviews.map((photo) => photo.uploaded?.fileUrl));
      const localPhotos = prev.filter(
        (photo) => !photo.isExisting && (!photo.uploaded || !existingUrls.has(photo.uploaded.fileUrl))
      );
      return [...existingPhotoPreviews, ...localPhotos];
    });
  }, [existingPhotoPreviews]);

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
          JPEG_QUALITY
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
            ? { ...photo, uploading: false, progress: 100, uploaded: uploadedPhoto }
            : photo
        );
        return nextPhotos;
      });

      await onPhotoUploaded?.(uploadedPhoto);
      onPhotosChange?.(getUploadedPhotos(nextPhotos));
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
            : photo
        )
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
      file,
      uploading: true,
      progress: 0,
    };

    setPhotos((prev) => [...prev, newPhoto]);
    void uploadPhoto(photoId, file);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
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
          { method: 'DELETE' }
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

    const remainingPhotos = photos.filter((preview) => preview.id !== photoId);
    setPhotos(remainingPhotos);
    onPhotosChange?.(getUploadedPhotos(remainingPhotos));
  };

  const actionButtonClassName =
    'relative inline-flex min-h-11 items-center justify-center overflow-hidden rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2';
  const disabled = photos.length >= maxPhotos;

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-wrap gap-3">
        <label
          className={`${actionButtonClassName} ${
            disabled
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              : 'cursor-pointer border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
        >
          Kamera
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleFileSelect}
            disabled={disabled}
            aria-label="Kamera"
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </label>
        <label
          className={`${actionButtonClassName} ${
            disabled
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              : 'cursor-pointer border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Galerija
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            disabled={disabled}
            aria-label="Galerija"
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </label>
      </div>

      {photos.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded-md border-2 border-gray-300 bg-gray-100"
            >
              <img src={photo.dataUrl} alt="Preview" className="h-full w-full object-cover" />
              {photo.uploading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
                </div>
              ) : null}
              {photo.error ? (
                <div className="absolute inset-0 flex items-center justify-center bg-red-600/90 text-2xl text-white">
                  <span>!</span>
                </div>
              ) : null}
              {photo.uploaded ? (
                <button
                  type="button"
                  onClick={() => void deletePhoto(photo.id)}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-600/90 text-xl leading-none text-white transition-all hover:scale-110 hover:bg-red-600"
                  aria-label="Izbriši"
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
