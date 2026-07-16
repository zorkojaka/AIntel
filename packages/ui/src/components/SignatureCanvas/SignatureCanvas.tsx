import React, { useEffect, useRef, useState } from 'react';
import './SignatureCanvas.css';

export interface SignatureCanvasProps {
  /** Obstoječi podpis (data URL); izriše se na platno, da ga je mogoče videti in prerisati. */
  value?: string | null;
  /** Sproži se ob koncu poteze in ob brisanju (null = platno je prazno). */
  onChange: (dataUrl: string | null) => void;
  placeholder?: string;
  height?: number;
  disabled?: boolean;
}

/**
 * Platno za ročni podpis (miška ali prst). Sama komponenta ne hrani ničesar —
 * podpis vrne kot PNG data URL prek onChange.
 */
export function SignatureCanvas({
  value,
  onChange,
  placeholder = 'Podpišite se tukaj',
  height = 200,
  disabled = false,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!value);

  const configureContext = (canvas: HTMLCanvasElement, ratio: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2 * ratio;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const configureCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * ratio));
      const nextHeight = Math.max(1, Math.round(rect.height * ratio));
      // Sprememba velikosti platna ga zbriše, zato jo naredimo le, kadar je res drugačna.
      if (canvas.width !== width || canvas.height !== nextHeight) {
        canvas.width = width;
        canvas.height = nextHeight;
      }
      configureContext(canvas, ratio);
    };

    configureCanvas();
    window.addEventListener('resize', configureCanvas);
    return () => window.removeEventListener('resize', configureCanvas);
  }, []);

  // Obstoječi podpis narišemo na platno, da uporabnik vidi, kaj je shranjeno.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      setHasSignature(true);
    };
    image.src = value;
  }, [value]);

  const getCanvasPoint = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasSignature(true);

    const pointer = 'touches' in event ? event.touches[0] : event;
    if ('touches' in event) event.preventDefault();
    const { x, y } = getCanvasPoint(pointer.clientX, pointer.clientY, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pointer = 'touches' in event ? event.touches[0] : event;
    if ('touches' in event) event.preventDefault();
    const { x, y } = getCanvasPoint(pointer.clientX, pointer.clientY, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL('image/png'));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange(null);
  };

  return (
    <div className="aintel-signature-canvas" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="aintel-signature-canvas__surface"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      {!hasSignature && <div className="aintel-signature-canvas__placeholder">{placeholder}</div>}
      {hasSignature && !disabled && (
        <button
          type="button"
          className="aintel-signature-canvas__clear"
          onClick={clearSignature}
          aria-label="Počisti podpis"
        >
          ×
        </button>
      )}
    </div>
  );
}
