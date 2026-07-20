import { useEffect, useMemo, useState } from "react";
import type { MaterialOrder } from "@aintel/shared/types/logistics";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { parseApiEnvelope } from "@aintel/shared/utils/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

type MaterialLine = MaterialOrder["items"][number];

type SupplierEmailEntry = { address: string; isDefault: boolean };
type SupplierEntry = { key: string; name: string; emails: SupplierEmailEntry[] };

interface SupplierOrderEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  materialOrderId: string;
  supplierLabel: string;
  lines: MaterialLine[];
  onSent: () => void;
}

function normalizeSupplierNameKey(name: string) {
  const key = (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || "brez-dobavitelja";
}

function buildDefaultBody(supplierLabel: string, projectId: string, lines: MaterialLine[]) {
  const rows = lines
    .filter((line) => (typeof line.quantity === "number" ? line.quantity : 0) > 0)
    .map((line) => `- ${line.quantity} ${line.unit || "kos"} – ${line.name}`);
  return [
    "Pozdravljeni,",
    "",
    "prosimo za dobavo naslednjega materiala:",
    "",
    ...rows,
    "",
    `Naša referenca: ${projectId}`,
    "",
    "Prosimo za potrditev naročila in predviden rok dobave.",
    "",
    "Hvala in lep pozdrav",
  ].join("\n");
}

export function SupplierOrderEmailDialog({
  open,
  onOpenChange,
  projectId,
  materialOrderId,
  supplierLabel,
  lines,
  onSent,
}: SupplierOrderEmailDialogProps) {
  const [supplier, setSupplier] = useState<SupplierEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const supplierKey = useMemo(() => normalizeSupplierNameKey(supplierLabel), [supplierLabel]);

  useEffect(() => {
    if (!open) return;
    setSubject(`Naročilo materiala - ${projectId}`);
    setBody(buildDefaultBody(supplierLabel, projectId, lines));
    setTo("");
    setSupplier(null);
    setLoading(true);

    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/suppliers", { credentials: "include" });
        const payload = await parseApiEnvelope<{ suppliers?: SupplierEntry[] }>(response, "Dobaviteljev ni bilo mogoče naložiti.");
        if (!active) return;
        const match = (payload?.suppliers ?? []).find((entry) => entry.key === supplierKey) ?? null;
        setSupplier(match);
        const defaultEmail = match?.emails.find((entry) => entry.isDefault) ?? match?.emails[0];
        if (defaultEmail) setTo(defaultEmail.address);
      } catch {
        if (active) setSupplier(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // Predizpolnitev se osveži ob vsakem odprtju okna.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const emailOptions = supplier?.emails ?? [];

  // Predogled per-dobavitelj naročilnice v novem zavihku (samo postavke tega dobavitelja).
  const handlePreviewPdf = () => {
    const itemIds = lines.map((line) => line.id).filter(Boolean);
    if (itemIds.length === 0) {
      toast.error("Naročilo nima postavk za predogled.");
      return;
    }
    const query = new URLSearchParams({ docType: "PURCHASE_ORDER", mode: "inline", itemIds: itemIds.join(",") });
    window.open(`/api/projects/${projectId}/material-orders/${materialOrderId}/pdf?${query.toString()}`, "_blank", "noopener,noreferrer");
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/material-orders/${materialOrderId}/supplier-order-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          supplierName: supplierLabel,
          itemIds: lines.map((line) => line.id),
          to,
          subject,
          body,
        }),
      });
      await parseApiEnvelope<unknown>(response, "Naročila ni bilo mogoče poslati.");
      toast.success(`Naročilo poslano dobavitelju ${supplierLabel}. Postavke so označene kot naročene.`);
      onSent();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Naročila ni bilo mogoče poslati.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !sending && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="px-4 pb-3 pt-4 pr-12 sm:px-6 sm:pt-6">
          <DialogTitle>Naroči po emailu - {supplierLabel}</DialogTitle>
          <DialogDescription>Preveri naslov in popis, po potrebi uredi, nato pošlji naročilo dobavitelju.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Prejemnik (dobavitelj)</span>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Nalagam naslove ...
              </div>
            ) : emailOptions.length > 0 ? (
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Izberi e-naslov" />
                </SelectTrigger>
                <SelectContent>
                  {emailOptions.map((entry) => (
                    <SelectItem key={entry.address} value={entry.address}>
                      {entry.address}
                      {entry.isDefault ? " (privzeti)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input type="email" placeholder="narocila@dobavitelj.si" value={to} onChange={(event) => setTo(event.target.value)} />
            )}
            <span className="block text-xs text-muted-foreground">
              {emailOptions.length > 0
                ? "Naslove in privzetega urejate v Nastavitve → Dobavitelji."
                : "Za tega dobavitelja še ni shranjenih naslovov — vnesite ga ročno ali ga dodajte v Nastavitve → Dobavitelji."}
            </span>
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Zadeva</span>
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">Vsebina (popis opreme in količine)</span>
            <Textarea rows={12} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              Priloga: <span className="font-medium text-foreground">naročilnica (PDF)</span> samo s postavkami tega dobavitelja.
            </span>
            <Button type="button" variant="outline" size="sm" onClick={handlePreviewPdf}>
              Predogled naročilnice
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Po pošiljanju se vse postavke tega dobavitelja samodejno označijo kot naročene. Kopija gre na vaš Bcc naslov.
          </p>
        </div>
        <DialogFooter className="border-t px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Prekliči
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={sending || !to.trim() || !subject.trim() || !body.trim()}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {sending ? "Pošiljam" : "Pošlji naročilo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
