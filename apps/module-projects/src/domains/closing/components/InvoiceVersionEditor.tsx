import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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

interface InvoiceVersionEditorProps {
  projectId?: string | null;
}

const TYPE_OPTIONS: InvoiceItem["type"][] = ["Osnovno", "Dodatno", "Manj"];

const numberFormatter = new Intl.NumberFormat("sl-SI", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => `${numberFormatter.format(value)} €`;

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

function calculateSummary(items: InvoiceItem[]): InvoiceSummary {
  const baseWithoutVat = round(items.reduce((sum, item) => sum + (item.totalWithoutVat ?? 0), 0));
  const totalWithVat = round(items.reduce((sum, item) => sum + (item.totalWithVat ?? 0), 0));
  const vatAmount = round(totalWithVat - baseWithoutVat);
  return {
    baseWithoutVat,
    discountedBase: baseWithoutVat,
    vatAmount,
    totalWithVat,
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

export function InvoiceVersionEditor({ projectId }: InvoiceVersionEditorProps) {
  const {
    versions,
    activeVersion,
    setActiveVersionId,
    loading,
    saving,
    createFromClosing,
    saveDraft,
    issue,
    cloneForEdit,
  } = useInvoiceVersions(projectId ?? null);
  const [draftVersion, setDraftVersion] = useState<InvoiceVersion | null>(null);
  const [dirty, setDirty] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setDraftVersion(cloneVersion(activeVersion));
    setDirty(false);
  }, [activeVersion]);

  const canEdit = draftVersion?.status === "draft";
  const items = draftVersion?.items ?? [];
  const calculatedSummary = useMemo(() => calculateSummary(items), [items]);
  const summary = draftVersion?.summary ?? calculatedSummary;

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
    const success = await saveDraft(draftVersion.items);
    if (success) {
      setDirty(false);
    }
    return success;
  };

  const handleIssue = async () => {
    if (!draftVersion || !canEdit) return;
    if (dirty) {
      const saved = await handleSave();
      if (!saved) return;
    }
    await issue();
  };

  const handleClone = async () => {
    await cloneForEdit();
  };

  const handleDownload = async () => {
    if (!draftVersion || !projectId) return;
    try {
      setDownloading(true);
      const filename = `racun-${projectId}-${draftVersion.versionNumber ?? draftVersion._id}.pdf`;
      await downloadPdf(`/api/projects/${projectId}/invoices/${draftVersion._id}/pdf`, filename);
      toast.success("Račun prenesen.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Prenos računa ni uspel.");
    } finally {
      setDownloading(false);
    }
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
                      Račun_{version.versionNumber} – {version.status === "draft" ? "osnutek" : "izdano"}
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
              Status:{" "}
              <span className="font-medium text-foreground">
                {draftVersion.status === "draft" ? "osnutek" : "izdano"}
              </span>
            </div>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="h-4 w-4 mr-1" />
                Dodaj postavko
              </Button>
            )}
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
          <div className="mt-6 space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Osnova brez DDV</span>
              <span>{formatCurrency(summary.baseWithoutVat)}</span>
            </div>
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
                <Button variant="outline" disabled={!draftVersion || downloading} onClick={handleDownload}>
                  {downloading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Prenesi PDF
                </Button>
              <Button variant="outline" disabled>
                Pošlji račun stranki
              </Button>
            </div>
            <div className="flex gap-2">
              {canEdit ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSave}
                    disabled={!dirty || saving}
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
                <Button onClick={handleClone} disabled={saving}>
                  Popravi račun
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
