import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  useInvoiceVersions,
  InvoiceItem,
  InvoiceVersion,
  InvoiceSummary,
} from "../hooks/useInvoiceVersions";
import { downloadPdf } from "../../../api";
import { toast } from "sonner";
import { useProjectMutationRefresh } from "../../core/useProjectMutationRefresh";
import { InvoiceCommunicationComposeDialog } from "../../communication/InvoiceCommunicationComposeDialog";

interface InvoiceVersionEditorProps {
  projectId?: string | null;
  customerName?: string;
  customerEmail?: string;
  projectName?: string;
}

const TYPE_OPTIONS: InvoiceItem["type"][] = ["Osnovno", "Dodatno", "Manj"];
const STATUS_LABELS: Record<InvoiceVersion["status"], string> = {
  draft: "osnutek",
  issued: "izdano",
  cancelled: "preklicano",
};

const numberFormatter = new Intl.NumberFormat("sl-SI", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => `${numberFormatter.format(value)} €`;

function DownloadActionButton({
  label,
  disabled,
  downloading,
  onPreview,
  onDownload,
}: {
  label: string;
  disabled: boolean;
  downloading: boolean;
  onPreview: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-border/70 bg-background">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-none border-r border-border/70 px-3"
        disabled={disabled}
        onClick={onPreview}
      >
        {label}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-none"
        disabled={disabled}
        onClick={onDownload}
        aria-label={label}
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function recalculateItem(item: InvoiceItem): InvoiceItem {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
  const vatPercent = Number.isFinite(item.vatPercent) ? item.vatPercent : 0;
  const totalWithoutVat = round(quantity * unitPrice);
  const vatAmount = round(totalWithoutVat * (vatPercent / 100));
  return {
    ...item,
    quantity,
    unitPrice,
    vatPercent,
    totalWithoutVat,
    totalWithVat: round(totalWithoutVat + vatAmount),
  };
}

function clampPercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, round(parsed)));
}

interface DiscountSettings {
  discountPercent: number;
  useGlobalDiscount: boolean;
  usePerItemDiscount: boolean;
}

/**
 * Zrcali recalculateItems() iz backend/modules/projects/services/invoice.service.ts
 * (pot brez vatMode), da uporabnik vidi učinek popusta že pred shranjevanjem.
 * Merodajen ostaja povzetek strežnika, ki se vrne ob shranjevanju.
 */
function calculateSummary(items: InvoiceItem[], discount: DiscountSettings): InvoiceSummary {
  const globalDiscountPercent = discount.useGlobalDiscount ? clampPercent(discount.discountPercent) : 0;

  const prepared = items.map((item) => {
    const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
    const unitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
    const vatPercent = Number.isFinite(item.vatPercent) ? item.vatPercent : 0;
    const perItemPercent = discount.usePerItemDiscount ? clampPercent(item.discountPercent ?? 0) : 0;
    const baseWithoutVat = round(quantity * unitPrice);
    return {
      baseWithoutVat,
      lineAfterPerItemDiscount: round(baseWithoutVat * (1 - perItemPercent / 100)),
      vatPercent,
    };
  });

  const baseWithoutVat = round(prepared.reduce((sum, item) => sum + item.baseWithoutVat, 0));
  const perItemDiscountedBase = round(prepared.reduce((sum, item) => sum + item.lineAfterPerItemDiscount, 0));
  const globalDiscountAmount = round(perItemDiscountedBase * (globalDiscountPercent / 100));
  const candidates = prepared.filter((item) => item.lineAfterPerItemDiscount > 0);
  const lastCandidate = candidates[candidates.length - 1];

  let allocatedGlobalDiscount = 0;
  let discountedBase = 0;
  let vatAmount = 0;

  prepared.forEach((item) => {
    let itemGlobalDiscount = 0;
    if (globalDiscountPercent > 0 && item.lineAfterPerItemDiscount > 0) {
      if (item === lastCandidate) {
        itemGlobalDiscount = round(globalDiscountAmount - allocatedGlobalDiscount);
      } else if (perItemDiscountedBase > 0) {
        itemGlobalDiscount = round(globalDiscountAmount * (item.lineAfterPerItemDiscount / perItemDiscountedBase));
        allocatedGlobalDiscount = round(allocatedGlobalDiscount + itemGlobalDiscount);
      }
    }
    const totalWithoutVat = round(Math.max(0, item.lineAfterPerItemDiscount - itemGlobalDiscount));
    discountedBase = round(discountedBase + totalWithoutVat);
    vatAmount = round(vatAmount + round(totalWithoutVat * (item.vatPercent / 100)));
  });

  return {
    baseWithoutVat,
    discountedBase,
    vatAmount,
    totalWithVat: round(discountedBase + vatAmount),
  };
}

function cloneVersion(version: InvoiceVersion | null) {
  if (!version) return null;
  return JSON.parse(JSON.stringify(version)) as InvoiceVersion;
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `inv-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function filenameSafe(value: string) {
  return value.trim().replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
}

export function InvoiceVersionEditor({ projectId, customerName = "", customerEmail = "", projectName = "" }: InvoiceVersionEditorProps) {
  const {
    versions,
    activeVersion,
    setActiveVersionId,
    loading,
    saving,
    refresh,
    createFromClosing,
    saveDraft,
    fetchNextInvoiceNumber,
    issue,
    cloneForEdit,
    remove,
  } = useInvoiceVersions(projectId ?? null);
  const refreshAfterMutation = useProjectMutationRefresh(projectId);
  const [draftVersion, setDraftVersion] = useState<InvoiceVersion | null>(null);
  const [dirty, setDirty] = useState(false);
  const [invoiceNumberDraft, setInvoiceNumberDraft] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [creditDownloading, setCreditDownloading] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  useEffect(() => {
    setDraftVersion(cloneVersion(activeVersion));
    setInvoiceNumberDraft(activeVersion?.invoiceNumber ?? "");
    setDirty(false);
  }, [activeVersion]);

  useEffect(() => {
    let cancelled = false;
    if (!activeVersion || activeVersion.status !== "draft" || activeVersion.invoiceNumber) return;
    fetchNextInvoiceNumber().then((next) => {
      if (!cancelled && next?.number) {
        setInvoiceNumberDraft((current) => current.trim() ? current : next.number);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeVersion?._id, activeVersion?.invoiceNumber, activeVersion?.status, fetchNextInvoiceNumber]);

  const canEdit = draftVersion?.status === "draft";
  const items = draftVersion?.items ?? [];
  const discountPercent = draftVersion?.discountPercent ?? 0;
  const useGlobalDiscount = draftVersion?.useGlobalDiscount ?? false;
  const usePerItemDiscount = draftVersion?.usePerItemDiscount ?? false;
  const calculatedSummary = useMemo(
    () => calculateSummary(items, { discountPercent, useGlobalDiscount, usePerItemDiscount }),
    [items, discountPercent, useGlobalDiscount, usePerItemDiscount],
  );
  // Med urejanjem povzetek strežnika zastara — takrat prikažemo lokalni predogled.
  const summary = dirty ? calculatedSummary : draftVersion?.summary ?? calculatedSummary;
  const discountAmount = round(Math.max(0, summary.baseWithoutVat - summary.discountedBase));
  const invoiceNumberChanged = (invoiceNumberDraft.trim() || "") !== (activeVersion?.invoiceNumber?.trim() || "");
  const canSaveDraft = dirty || invoiceNumberChanged;

  const handleDiscountChange = (value: string) => {
    if (!draftVersion || !canEdit) return;
    const nextPercent = clampPercent(value === "" ? 0 : value);
    setDraftVersion({
      ...draftVersion,
      discountPercent: nextPercent,
      useGlobalDiscount: nextPercent > 0,
    });
    setDirty(true);
  };

  const handleItemChange = (itemId: string, updates: Partial<InvoiceItem>) => {
    if (!draftVersion || !canEdit) return;
    const nextItems = draftVersion.items.map((item) =>
      item.id === itemId ? recalculateItem({ ...item, ...updates }) : item,
    );
    setDraftVersion({ ...draftVersion, items: nextItems });
    setDirty(true);
  };

  const handleRemoveItem = (itemId: string) => {
    if (!draftVersion || !canEdit) return;
    setDraftVersion({
      ...draftVersion,
      items: draftVersion.items.filter((item) => item.id !== itemId),
    });
    setDirty(true);
  };

  const handleAddItem = () => {
    if (!draftVersion || !canEdit) return;
    const newItem: InvoiceItem = recalculateItem({
      id: generateId(),
      name: "",
      unit: "",
      quantity: 0,
      unitPrice: 0,
      vatPercent: 22,
      totalWithoutVat: 0,
      totalWithVat: 0,
      type: "Osnovno",
    });
    setDraftVersion({ ...draftVersion, items: [...draftVersion.items, newItem] });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!draftVersion || !canEdit) return false;
    const success = await saveDraft(draftVersion.items, invoiceNumberDraft, {
      discountPercent: draftVersion.discountPercent ?? 0,
      useGlobalDiscount: draftVersion.useGlobalDiscount ?? false,
    });
    if (success) {
      setDirty(false);
    }
    return success;
  };

  const handleIssue = async () => {
    if (!draftVersion || !canEdit) return;
    if (canSaveDraft) {
      const saved = await handleSave();
      if (!saved) return;
    }
    const issuedVersion = await issue(invoiceNumberDraft);
    if (!issuedVersion) {
      return;
    }
    setDraftVersion(cloneVersion(issuedVersion));
    setDirty(false);
    await refreshAfterMutation();
  };

  const handleClone = async () => {
    await cloneForEdit();
  };

  const handleRemoveInvoice = async () => {
    if (!draftVersion) return;
    const label = draftVersion.invoiceNumber || `verzija ${draftVersion.versionNumber}`;
    if (!window.confirm(`Odstrani račun ${label}? Številka računa bo sproščena za ponovno uporabo.`)) {
      return;
    }
    const removed = await remove();
    if (removed) {
      await refreshAfterMutation();
    }
  };

  const handleDownload = async () => {
    if (!draftVersion || !projectId) return;
    try {
      setDownloading(true);
      const numberPart = filenameSafe(draftVersion.invoiceNumber || invoiceNumberDraft || String(draftVersion.versionNumber ?? draftVersion._id));
      const filename = `racun-${numberPart}.pdf`;
      await downloadPdf(`/api/projects/${projectId}/invoices/${draftVersion._id}/pdf`, filename);
      toast.success("Račun prenesen.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Prenos računa ni uspel.");
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = () => {
    if (!draftVersion || !projectId) return;
    window.open(`/api/projects/${projectId}/invoices/${draftVersion._id}/pdf?mode=inline`, "_blank", "noopener,noreferrer");
  };

  const handleDownloadCreditNote = async () => {
    if (!draftVersion || !projectId) return;
    try {
      setCreditDownloading(true);
      const numberPart = filenameSafe(draftVersion.invoiceNumber || invoiceNumberDraft || String(draftVersion.versionNumber ?? draftVersion._id));
      const filename = `dobropis-${numberPart}.pdf`;
      await downloadPdf(`/api/projects/${projectId}/invoices/${draftVersion._id}/pdf?docType=CREDIT_NOTE`, filename);
      toast.success("Dobropis prenesen.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Prenos dobropisa ni uspel.");
    } finally {
      setCreditDownloading(false);
    }
  };

  const handlePreviewCreditNote = () => {
    if (!draftVersion || !projectId) return;
    window.open(`/api/projects/${projectId}/invoices/${draftVersion._id}/pdf?docType=CREDIT_NOTE&mode=inline`, "_blank", "noopener,noreferrer");
  };

  if (!projectId) {
    return (
      <Card className="p-4">
        <h3 className="text-lg font-semibold m-0">Račun</h3>
        <p className="text-sm text-muted-foreground m-0">
          Za delo z računi potrebujemo ID projekta. Osvežite pogled in poskusite znova.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <h3 className="text-lg font-semibold m-0">Račun</h3>
            <p className="text-sm text-muted-foreground m-0">
              Upravljanje verzij računa na podlagi zaključka.
            </p>
          </div>
          {versions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Verzija</span>
              <Select
                value={activeVersion?._id}
                onValueChange={(value) => setActiveVersionId(value)}
                disabled={loading || versions.length === 0}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((version) => (
                    <SelectItem key={version._id} value={version._id}>
                      Račun_{version.versionNumber} – {STATUS_LABELS[version.status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {versions.length === 0 && !loading && (
          <div className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
            <p className="text-sm text-muted-foreground m-0">
              Za projekt še ni pripravljena verzija računa.
            </p>
            <Button onClick={createFromClosing}>Ustvari račun iz zaključka</Button>
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Nalagam račune...
          </div>
        )}
      </div>
      {draftVersion && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Status: <span className="font-medium text-foreground">{STATUS_LABELS[draftVersion.status]}</span>
            </div>
          </div>
          <div className="grid gap-1 max-w-sm">
            <label className="text-sm font-medium" htmlFor="invoice-number">
              Številka računa
            </label>
            <Input
              id="invoice-number"
              value={invoiceNumberDraft}
              onChange={(event) => {
                setInvoiceNumberDraft(event.target.value);
                setDirty(true);
              }}
              readOnly={!canEdit}
              placeholder="50/6/2026"
            />
            {canEdit ? (
              <p className="text-xs text-muted-foreground m-0">
                Po potrebi popravi zaporedno številko pred izdajo računa.
              </p>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naziv</TableHead>
                  <TableHead>Enota</TableHead>
                  <TableHead className="text-right">Količina</TableHead>
                  <TableHead className="text-right">Cena</TableHead>
                  <TableHead className="text-right">DDV %</TableHead>
                  <TableHead className="text-right">Brez DDV</TableHead>
                  <TableHead className="text-right">Z DDV</TableHead>
                  <TableHead>Tip</TableHead>
                  {canEdit && <TableHead className="w-12 text-center">Akcije</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 9 : 8} className="text-center text-muted-foreground">
                      Ni postavk za prikaz.
                    </TableCell>
                  </TableRow>
                )}
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Input
                        value={item.name}
                        onChange={(event) => handleItemChange(item.id, { name: event.target.value })}
                        readOnly={!canEdit}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.unit}
                        onChange={(event) => handleItemChange(item.id, { unit: event.target.value })}
                        readOnly={!canEdit}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(event) =>
                          handleItemChange(item.id, { quantity: Number(event.target.value) })
                        }
                        readOnly={!canEdit}
                        className="text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(event) =>
                          handleItemChange(item.id, { unitPrice: Number(event.target.value) })
                        }
                        readOnly={!canEdit}
                        className="text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={item.vatPercent}
                        onChange={(event) =>
                          handleItemChange(item.id, { vatPercent: Number(event.target.value) })
                        }
                        readOnly={!canEdit}
                        className="text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right">{numberFormatter.format(item.totalWithoutVat)}</TableCell>
                    <TableCell className="text-right">{numberFormatter.format(item.totalWithVat)}</TableCell>
                    <TableCell>
                      {canEdit ? (
                        <Select value={item.type} onValueChange={(value) => handleItemChange(item.id, { type: value as InvoiceItem["type"] })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span>{item.type}</span>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {canEdit && (
            <div className="flex justify-start">
              <Button variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="h-4 w-4 mr-1" />
                Dodaj postavko
              </Button>
            </div>
          )}
          <div className="mt-6 space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Osnova brez DDV</span>
              <span>{formatCurrency(summary.baseWithoutVat)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-muted-foreground">
                Popust
                {canEdit ? (
                  <span className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      className="h-7 w-20 text-right"
                      value={discountPercent}
                      onChange={(event) => handleDiscountChange(event.target.value)}
                      aria-label="Popust v odstotkih"
                    />
                    <span>%</span>
                  </span>
                ) : (
                  <span>({numberFormatter.format(discountPercent)} %)</span>
                )}
              </span>
              <span>{discountAmount > 0 ? `– ${formatCurrency(discountAmount)}` : formatCurrency(0)}</span>
            </div>
            {usePerItemDiscount && (
              <p className="text-xs text-muted-foreground m-0">
                Ponudba ima popuste po postavkah — zgornji odstotek se obračuna dodatno na že popustirane postavke.
              </p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Osnova po popustih</span>
              <span>{formatCurrency(summary.discountedBase)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">DDV</span>
              <span>{formatCurrency(summary.vatAmount)}</span>
            </div>
            <div className="flex items-center justify-between font-medium pt-1">
              <span>Skupaj za plačilo (z DDV)</span>
              <span>{formatCurrency(summary.totalWithVat)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex gap-2">
              <DownloadActionButton
                label="Poglej račun"
                disabled={!draftVersion || downloading}
                downloading={downloading}
                onPreview={handlePreview}
                onDownload={handleDownload}
              />
              <DownloadActionButton
                label="Poglej dobropis"
                disabled={!draftVersion || creditDownloading}
                downloading={creditDownloading}
                onPreview={handlePreviewCreditNote}
                onDownload={handleDownloadCreditNote}
              />
              <Button
                variant="outline"
                disabled={!draftVersion || draftVersion.status !== "issued"}
                onClick={() => setSendDialogOpen(true)}
              >
                Pošlji račun stranki
              </Button>
            </div>
            <div className="flex gap-2">
              {canEdit ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSave}
                    disabled={!canSaveDraft || saving}
                  >
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Shranjujem...
                      </span>
                    ) : (
                      "Shrani račun"
                    )}
                  </Button>
                  <Button onClick={handleIssue} disabled={saving}>
                    Izdaj račun
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={handleRemoveInvoice} disabled={saving}>
                    Odstrani račun
                  </Button>
                  <Button onClick={handleClone} disabled={saving}>
                    Popravi račun
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <InvoiceCommunicationComposeDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        projectId={projectId ?? ""}
        invoiceVersionId={draftVersion?._id ?? null}
        customerName={customerName}
        customerEmail={customerEmail}
        projectName={projectName || projectId || ""}
        invoiceNumber={draftVersion?.invoiceNumber || invoiceNumberDraft || `verzija ${draftVersion?.versionNumber ?? ""}`}
        invoiceTotal={Number(draftVersion?.summary?.totalWithVat ?? 0)}
        companyName=""
        onSent={async () => {
          await refresh();
          await refreshAfterMutation();
        }}
      />
    </Card>
  );
}
