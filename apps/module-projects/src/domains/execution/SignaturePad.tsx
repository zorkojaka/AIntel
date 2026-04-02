import { useRef, useState, useEffect, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { X } from "lucide-react";

interface SignaturePadProps {
  onSign: (signature: string, signerName: string) => void;
  signerName?: string;
  children?: ReactNode;
  footerActions?: ReactNode;
}

export function SignaturePad({
  onSign,
  signerName: initialSignerName = "",
  children,
  footerActions,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signerName, setSignerName] = useState(initialSignerName);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const configureCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2 * ratio;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };

    configureCanvas();
    window.addEventListener("resize", configureCanvas);
    return () => window.removeEventListener("resize", configureCanvas);
  }, []);

  const getCanvasPoint = (
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    setHasSignature(true);

    const pointer = "touches" in event ? event.touches[0] : event;
    if ("touches" in event) {
      event.preventDefault();
    }
    const { x, y } = getCanvasPoint(pointer.clientX, pointer.clientY, canvas);

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pointer = "touches" in event ? event.touches[0] : event;
    if ("touches" in event) {
      event.preventDefault();
    }
    const { x, y } = getCanvasPoint(pointer.clientX, pointer.clientY, canvas);

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
          onChange={(event) => setSignerName(event.target.value)}
          placeholder="Vnesite ime in priimek"
          className="mt-1"
        />
      </div>

      {children}

      <div className="space-y-2">
        <Label>Podpis</Label>
        <div className="relative rounded-lg border-2 border-dashed border-border bg-card">
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
            <Button size="icon" variant="ghost" className="absolute right-2 top-2" onClick={clearSignature}>
              <X className="h-4 w-4" />
            </Button>
          )}
          {!hasSignature && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
              Podpišite se tukaj
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {footerActions}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={saveSignature} disabled={!hasSignature || !signerName.trim()}>
            Potrdi podpis
          </Button>
          <Button variant="outline" onClick={clearSignature}>
            Počisti
          </Button>
        </div>
      </div>
    </div>
  );
}
