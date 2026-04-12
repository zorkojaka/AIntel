import React, { useState, useRef } from 'react';

export interface PhotoCaptureProps {
  entityType: string;
  entityId: string;
  onPhotosChange?: (photos: UploadedPhoto[]) => void;
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
  file: File;
  uploading: boolean;
  progress: number;
  uploaded?: UploadedPhoto;
  error?: string;
}

export function PhotoCapture({
  entityType,
  entityId,
  onPhotosChange,
  maxPhotos = 10,
}: PhotoCaptureProps) {
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setStream(mediaStream);
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Camera access denied:', error);
      alert('Dostop do kamere ni bil odobren. Uporabite izbiro datoteke.');
      fileInputRef.current?.click();
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;

      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      addPhotoToQueue(file, dataUrl);
      stopCamera();
    }, 'image/jpeg', 0.8);
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
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        addPhotoToQueue(file, dataUrl);
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    event.target.value = '';
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
    uploadPhoto(photoId, file);
  };

  const uploadPhoto = async (photoId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('entityId', entityId);

    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      const uploadedPhoto: UploadedPhoto = result.data;

      setPhotos((prev) =>
        prev.map((photo) =>
          photo.id === photoId
            ? { ...photo, uploading: false, progress: 100, uploaded: uploadedPhoto }
            : photo
        )
      );

      // Notify parent component
      const allUploadedPhotos = photos
        .map((p) => p.uploaded)
        .filter((u): u is UploadedPhoto => u !== undefined);
      allUploadedPhotos.push(uploadedPhoto);
      onPhotosChange?.(allUploadedPhotos);
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

  const deletePhoto = async (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) return;

    if (photo.uploaded) {
      try {
        const response = await fetch(
          `/api/files/${photo.uploaded.filename}?entityType=${entityType}&entityId=${entityId}`,
          { method: 'DELETE' }
        );

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Delete failed');
        }
      } catch (error) {
        console.error('Delete error:', error);
        alert('Brisanje fotografije ni uspelo.');
        return;
      }
    }

    setPhotos((prev) => prev.filter((p) => p.id !== photoId));

    // Notify parent component
    const remainingPhotos = photos
      .filter((p) => p.id !== photoId && p.uploaded)
      .map((p) => p.uploaded!)
      .filter((u): u is UploadedPhoto => u !== undefined);
    onPhotosChange?.(remainingPhotos);
  };

  const handleCaptureClick = () => {
    if (isMobile && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      startCamera();
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {cameraActive ? (
        <div className="relative w-full max-w-[640px] mx-auto">
          <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded-lg bg-black" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className="flex gap-2 justify-center mt-4">
            <button
              type="button"
              onClick={capturePhoto}
              className="px-6 py-3 border-none rounded-md text-base font-medium cursor-pointer transition-all bg-blue-600 text-white hover:bg-blue-700"
            >
              Zajemi
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="px-6 py-3 border-none rounded-md text-base font-medium cursor-pointer transition-all bg-gray-300 text-gray-900 hover:bg-gray-400"
            >
              Prekliči
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={handleCaptureClick}
            className="px-6 py-3 border-2 border-dashed border-blue-600 rounded-md bg-transparent text-blue-600 text-base font-medium cursor-pointer transition-all hover:bg-blue-50 hover:border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={photos.length >= maxPhotos}
          >
            + Dodaj fotografijo
          </button>
        </>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square rounded-md overflow-hidden border-2 border-gray-300 bg-gray-100">
              <img src={photo.dataUrl} alt="Preview" className="w-full h-full object-cover" />
              {photo.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="w-8 h-8 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {photo.error && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-600/90 text-white text-2xl">
                  <span>❌</span>
                </div>
              )}
              {photo.uploaded && (
                <button
                  type="button"
                  onClick={() => deletePhoto(photo.id)}
                  className="absolute top-1 right-1 w-7 h-7 border-none rounded-full bg-red-600/90 text-white text-2xl leading-none cursor-pointer flex items-center justify-center transition-all hover:bg-red-600 hover:scale-110"
                  aria-label="Izbriši"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
