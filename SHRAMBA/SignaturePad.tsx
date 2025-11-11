import { useRef, useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { X } from "lucide-react";

interface SignaturePadProps {
  onSign: (signature: string, signerName: string) => void;
  signerName?: string;
}

export function SignaturePad({ onSign, signerName: initialSignerName = "" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signerName, setSignerName] = useState(initialSignerName);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    setHasSignature(true);

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature || !signerName.trim()) return;

    const signature = canvas.toDataURL("image/png");
    onSign(signature, signerName);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Ime podpisnika</Label>
        <Input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Vnesite ime in priimek"
          className="mt-1"
        />
      </div>

      <div className="space-y-2">
        <Label>Podpis</Label>
        <div className="relative border-2 border-dashed border-border rounded-lg bg-card">
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            className="w-full cursor-crosshair touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          {hasSignature && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-2 right-2"
              onClick={clearSignature}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          {!hasSignature && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-muted-foreground">
              Podpišite se tukaj
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={saveSignature} disabled={!hasSignature || !signerName.trim()}>
          Potrdi podpis
        </Button>
        <Button variant="outline" onClick={clearSignature}>
          Počisti
        </Button>
      </div>
    </div>
  );
}
