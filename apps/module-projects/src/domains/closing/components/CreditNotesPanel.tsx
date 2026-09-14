import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { fetchApi } from "@aintel/shared/utils/api-client";
import type { CreditNote, CreditNoteOptions } from "@aintel/shared/types/credit-notes";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { downloadPdf } from "../../../api";
import { toast } from "sonner";

const money = new Intl.NumberFormat("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const newRequestId = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Preview = { items: CreditNote["items"]; summary: CreditNote["summary"] };

export function CreditNotesPanel({ projectId, invoiceVersionId, issued, onIssued }: { projectId: string; invoiceVersionId: string; issued: boolean; onIssued: () => Promise<void> | void }) {
  const [options, setOptions] = useState<CreditNoteOptions | null>(null);
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);

  const load = async () => {
    if (!issued) return;
    try { setOptions(await fetchApi<CreditNoteOptions>(`/api/projects/${projectId}/invoices/${invoiceVersionId}/credit-notes`, undefined, "Dobropisov ni mogoče naložiti.")); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Dobropisov ni mogoče naložiti."); }
  };
  useEffect(() => { void load(); }, [projectId, invoiceVersionId, issued]);
  const selected = useMemo(() => Object.entries(quantities).map(([invoiceItemId, value]) => ({ invoiceItemId, quantity: Number(value) })).filter((item) => Number.isFinite(item.quantity) && item.quantity > 0), [quantities]);
  const clearPreview = () => setPreview(null);
  const openDialog = () => { setQuantities({}); setReason(""); clearPreview(); setRequestId(newRequestId()); setOpen(true); };
  const payload = () => ({ reason, items: selected });
  const makePreview = async () => {
    try { setLoading(true); setPreview(await fetchApi<Preview>(`/api/projects/${projectId}/invoices/${invoiceVersionId}/credit-notes/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) }, "Predogled dobropisa ni uspel.")); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Predogled dobropisa ni uspel."); } finally { setLoading(false); }
  };
  const issue = async () => {
    if (!preview) return;
    try {
      setIssuing(true);
      const note = await fetchApi<CreditNote>(`/api/projects/${projectId}/invoices/${invoiceVersionId}/credit-notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), requestId }) }, "Izdaja dobropisa ni uspela.");
      toast.success(`Dobropis ${note.number} je izdan.`); setOpen(false); setPreview(null); await load(); await onIssued();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Izdaja dobropisa ni uspela."); } finally { setIssuing(false); }
  };
  const showPdf = (note: CreditNote, download = false) => {
    const url = `/api/projects/${projectId}/invoices/${invoiceVersionId}/credit-notes/${note.id}/pdf${download ? "" : "?mode=inline"}`;
    if (download) void downloadPdf(url, `dobropis-${note.number}.pdf`);
    else window.open(url, "_blank", "noopener,noreferrer");
  };
  if (!issued) return null;
  return <div className="space-y-2 border-t border-border pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">Dobropisi</div><p className="m-0 text-sm text-muted-foreground">Za vrnjeno blago izdaj ločen dobropis. Izvirni račun ostane nespremenjen.</p></div><Button type="button" variant="outline" onClick={openDialog} disabled={!options?.items.length}>Ustvari dobropis</Button></div>
    {options && !options.items.length && <p className="m-0 text-sm text-muted-foreground">Za ta račun ni več blaga, ki bi ga lahko vrnili.</p>}
    {options?.notes.map((note) => <div key={note.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"><span><strong>{note.number}</strong> · {money.format(note.summary.totalWithVat)} € · {note.reason}</span><span className="flex gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => showPdf(note)}>Poglej</Button><Button type="button" variant="ghost" size="icon" onClick={() => showPdf(note, true)} aria-label="Prenesi dobropis"><Download className="h-4 w-4" /></Button></span></div>)}
    <Dialog open={open} onOpenChange={(next) => !issuing && setOpen(next)}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Ustvari dobropis</DialogTitle><DialogDescription>Izberi vrnjeno blago in količine. Zneske s popusti in DDV izračuna strežnik iz izdanega računa.</DialogDescription></DialogHeader><div className="space-y-3">{options?.items.map((item) => <div key={item.id} className="grid grid-cols-[1fr_9rem] gap-3 items-center"><div><div>{item.name}</div><div className="text-xs text-muted-foreground">Na računu: {item.invoiceQuantity} {item.unit}; na voljo: {item.remainingQuantity} {item.unit}</div></div><Input aria-label={`Vrnjena količina ${item.name}`} type="number" min="0" max={item.remainingQuantity} step="0.000001" value={quantities[item.id] ?? ""} onChange={(event) => { setQuantities((old) => ({ ...old, [item.id]: event.target.value })); clearPreview(); }} /></div>)}<div><label className="mb-1 block text-sm font-medium">Razlog dobropisa</label><Textarea value={reason} onChange={(event) => { setReason(event.target.value); clearPreview(); }} placeholder="Npr. stranka je vrnila neustrezen artikel" /></div>{preview && <div className="rounded border bg-muted/30 p-3 text-sm"><div className="font-medium">Predogled dobropisa</div>{preview.items.map((item) => <div key={item.invoiceItemId} className="flex justify-between gap-3"><span>{item.name} × {item.quantity}</span><span>{money.format(item.totalWithVat)} €</span></div>)}<div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Skupaj z DDV</span><span>{money.format(preview.summary.totalWithVat)} €</span></div></div>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={issuing}>Prekliči</Button><Button type="button" variant="outline" onClick={() => void makePreview()} disabled={loading || issuing}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Preveri znesek</Button><Button type="button" onClick={() => void issue()} disabled={!preview || issuing}>{issuing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Izdaj dobropis</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
