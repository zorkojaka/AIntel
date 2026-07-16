import { useState, type ReactNode } from "react";
import { SignatureCanvas } from "@aintel/ui";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";

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
  const [signerName, setSignerName] = useState(initialSignerName);
  // Podpis kot PNG data URL; platno je skupna komponenta (@aintel/ui).
  const [signature, setSignature] = useState<string | null>(null);
  const [clearToken, setClearToken] = useState(0);

  const clearSignature = () => {
    setSignature(null);
    setClearToken((current) => current + 1);
  };

  const saveSignature = () => {
    if (!signature || !signerName.trim()) return;
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
        <SignatureCanvas key={clearToken} onChange={setSignature} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {footerActions}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={saveSignature} disabled={!signature || !signerName.trim()}>
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
