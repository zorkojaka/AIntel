import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { toast } from "sonner";
import type { OfferLineItem, OfferVersion } from "@aintel/shared/types/offers";
import type { OfferVersionSummary } from "@aintel/shared/types/offers";
import type { PriceListSearchItem } from "@aintel/shared/types/price-list";
import { Loader2, Plus, Search, Trash } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type OffersTabProps = {
  projectId: string;
};

type OfferLineItemForm = {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  totalNet: number;
  totalVat: number;
  totalGross: number;
};

const createEmptyItem = (): OfferLineItemForm => ({
  id: crypto.randomUUID(),
  productId: null,
  name: "",
  quantity: 1,
  unit: "kos",
  unitPrice: 0,
  vatRate: 22,
  totalNet: 0,
  totalVat: 0,
  totalGross: 0,
});

const clampPositive = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
};

const isItemValid = (item: OfferLineItem) => item.name.trim() !== "" && item.unitPrice > 0;

export function OffersTab({ projectId }: OffersTabProps) {
  const [items, setItems] = useState<OfferLineItemForm[]>([createEmptyItem()]);
  const [title, setTitle] = useState("Ponudba");
  const [paymentTerms, setPaymentTerms] = useState<string>("");
  const [introText, setIntroText] = useState<string>("");
  const [currentOffer, setCurrentOffer] = useState<OfferVersion | null>(null);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);

  const [searchResults, setSearchResults] = useState<PriceListSearchItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchRowId, setSearchRowId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<NodeJS.Timeout | null>(null);
  const nameInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusRowId = useRef<string | null>(null);
  const [versions, setVersions] = useState<OfferVersionSummary[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

  const resetToEmptyOffer = () => {
    setSelectedOfferId(null);
    setTitle("Ponudba");
    setPaymentTerms("");
    setIntroText("");
    setItems([createEmptyItem()]);
    setActiveRowIndex(0);
  };

  useEffect(() => {
    async function loadVersions() {
      const res = await fetch(`/api/projects/${projectId}/offers`);
      const json = await res.json();
      if (!json.success) return;

      const list: OfferVersionSummary[] = json.data ?? [];
      setVersions(list);

      if (list.length === 0) {
        setSelectedOfferId(null);
        resetToEmptyOffer();
        return;
      }

      const last = list[list.length - 1];
      setSelectedOfferId(last._id);
      await loadOfferById(last._id);
    }

    loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadOfferById = async (offerId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/offers/${offerId}`);
      const payload = await response.json();
      if (!payload.success) return;
      const offer: OfferVersion = payload.data;
      if (!offer) return;
      setTitle(offer.baseTitle || "Ponudba");
      setPaymentTerms(offer.paymentTerms ?? "");
      setIntroText(offer.introText ?? "");
      setCurrentOffer(offer);
      const mapped = (offer.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
        totalNet: item.totalNet,
        totalVat: item.totalVat,
        totalGross: item.totalGross,
        productId: item.productId ?? null,
      }));
      setItems([...mapped, createEmptyItem()]);
    } catch (error) {
      console.error(error);
    }
  };

  const recalcItem = (item: OfferLineItemForm): OfferLineItemForm => {
    const quantity = clampPositive(item.quantity, 1);
    const unitPrice = clampPositive(item.unitPrice, 0);
    const vatRate = clampPositive(item.vatRate, 0);
    const totalNet = Number((quantity * unitPrice).toFixed(2));
    const totalVat = Number((totalNet * (vatRate / 100)).toFixed(2));
    const totalGross = Number((totalNet + totalVat).toFixed(2));
    return { ...item, quantity, unitPrice, vatRate, totalNet, totalVat, totalGross };
  };

  const ensureTrailingBlank = (list: OfferLineItemForm[]) => {
    const last = list[list.length - 1];
    if (!last || isItemValid(last)) {
      const blank = createEmptyItem();
      list.push(blank);
      focusRowId.current = blank.id;
    }
    return list;
  };

  const updateItem = (id: string, changes: Partial<OfferLineItemForm>) => {
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      const merged = { ...next[idx], ...changes };
      next[idx] = recalcItem(merged);
      const last = next[next.length - 1];
      const isLastFilled = last && isItemValid(last);
      return isLastFilled ? [...next, createEmptyItem()] : next;
    });
  };

  const deleteRow = (id: string) => {
    setItems((prev) => {
      if (prev.length === 1) return [createEmptyItem()];
      const filtered = prev.filter((item) => item.id !== id);
      if (filtered.length === 0) return [createEmptyItem()];
      return ensureTrailingBlank(filtered);
    });
  };

  useEffect(() => {
    if (!focusRowId.current) return;
    const target = nameInputs.current[focusRowId.current];
    if (target) {
      target.focus();
      focusRowId.current = null;
    }
  }, [items]);

  useEffect(() => {
    const target = items[activeRowIndex];
    if (!target) return;
    const input = nameInputs.current[target.id];
    if (input) {
      input.focus();
      setSearchRowId(target.id);
      setSearchTerm(target.name);
    }
  }, [activeRowIndex, items, setSearchRowId, setSearchTerm]);

  useEffect(() => {
    if (!searchRowId) {
      setSearchResults([]);
      return;
    }
    if (searchDebounce.current) {
      clearTimeout(searchDebounce.current);
    }
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/price-list/items/search?q=${encodeURIComponent(searchTerm.trim())}&limit=10`
        );
        const payload = await response.json();
        if (!payload.success) {
          toast.error(payload.error ?? "Napaka pri iskanju cenika.");
          setSearchResults([]);
          return;
        }
        setSearchResults(Array.isArray(payload.data) ? payload.data : []);
      } catch (error) {
        console.error(error);
        toast.error("Iskanje v ceniku ni uspelo.");
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [searchTerm, searchRowId]);

  const validItems = useMemo(() => items.filter(isItemValid), [items]);

  const totals = useMemo(() => {
    return validItems.reduce(
      (acc, item) => {
        acc.totalNet += item.totalNet;
        if (Math.abs(item.vatRate - 22) < 0.001) {
          acc.totalVat22 += item.totalVat;
        } else if (Math.abs(item.vatRate - 9.5) < 0.001) {
          acc.totalVat95 += item.totalVat;
        }
        acc.totalVat += item.totalVat;
        acc.totalGross += item.totalGross;
        return acc;
      },
      { totalNet: 0, totalVat22: 0, totalVat95: 0, totalVat: 0, totalGross: 0 }
    );
  }, [validItems]);

  const handleSelectProduct = (rowId: string, product: PriceListSearchItem, rowIndex: number) => {
    setSearchRowId(null);
    setSearchResults([]);
    updateItem(rowId, {
      name: product.name,
      productId: product.id,
      unit: product.unit ?? "kos",
      unitPrice: product.unitPrice,
      vatRate: product.vatRate ?? 22,
    });
    setActiveRowIndex(rowIndex + 1);
  };

  const buildPayloadFromCurrentState = () => {
    const cleanItems = items
      .filter((i) => i.name.trim() !== "" && i.unitPrice > 0)
      .map((i) => ({
        id: i.id,
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        vatRate: i.vatRate,
        totalNet: i.totalNet,
        totalVat: i.totalVat,
        totalGross: i.totalGross,
      }));

    return {
      title,
      validUntil: null,
      paymentTerms,
      introText,
      items: cleanItems,
    };
  };

  const handleSave = async () => {
    if (!validItems.length) {
      toast.error("Dodajte vsaj eno postavko z nazivom in ceno.");
      return null;
    }
    setSaving(true);
    try {
      const payloadBody = buildPayloadFromCurrentState();
      const url = selectedOfferId
        ? `/api/projects/${projectId}/offers/${selectedOfferId}`
        : `/api/projects/${projectId}/offers`;
      const method = selectedOfferId ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Ponudbe ni bilo mogoce shraniti.");
        return null;
      }
      const created: OfferVersion = payload.data;
      await reloadVersionsAndSelect(created._id);
      toast.success("Ponudba shranjena.");
      return created;
    } catch (error) {
      console.error(error);
      toast.error("Napaka pri shranjevanju ponudbe.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const ensureSavedOffer = async () => {
    if (currentOffer?._id) {
      return currentOffer;
    }
    return handleSave();
  };
  const handleCreateNewVersion = () => {
    setSelectedOfferId(null);
    resetToEmptyOffer();
  };

  const handleDeleteVersion = async () => {
    if (!selectedOfferId) return;
    if (!window.confirm("Res zelis izbrisati to verzijo ponudbe?")) return;
    const response = await fetch(`/api/projects/${projectId}/offers/${selectedOfferId}`, { method: "DELETE" });
    const payload = await response.json();
    if (!payload.success || !payload.data) return;

    const listRes = await fetch(`/api/projects/${projectId}/offers`);
    const listJson = await listRes.json();
    if (!listJson.success) return;
    const list: OfferVersionSummary[] = listJson.data ?? [];
    setVersions(list);
    if (list.length === 0) {
      setSelectedOfferId(null);
      setTitle("Ponudba");
      setPaymentTerms("");
      setIntroText("");
      setItems([createEmptyItem()]);
      return;
    }
    const last = list[list.length - 1];
    setSelectedOfferId(last._id);
    await loadOfferById(last._id);
  };

  const handleCloneVersion = async () => {
    if (!selectedOfferId) return;
    const payload = buildPayloadFromCurrentState();
    const response = await fetch(`/api/projects/${projectId}/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!json.success || !json.data) return;
    const created: OfferVersion = json.data;
    await reloadVersionsAndSelect(created._id);
  };
  const reloadVersionsAndSelect = async (offerId: string) => {
    const response = await fetch(`/api/projects/${projectId}/offers`);
    const payload = await response.json();
    if (!payload.success) return;
    const list: OfferVersionSummary[] = payload.data ?? [];
    setVersions(list);
    setSelectedOfferId(offerId);
    await loadOfferById(offerId);
  };

  const handleExportPdf = async () => {
    setDownloading(true);
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) return;
      const url = `/api/projects/${projectId}/offers/${saved._id}/pdf`;
      window.open(url, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const saved = await ensureSavedOffer();
      if (!saved?._id) return;
      const response = await fetch(`/api/projects/${projectId}/offers/${saved._id}/send`, { method: "POST" });
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Pošiljanje ni uspelo.");
        return;
      }
      toast.success(payload.data?.message ?? "Pošiljanje bo implementirano kasneje.");
    } catch (error) {
      console.error(error);
      toast.error("Pošiljanje ni uspelo.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Select
          value={selectedOfferId ?? (versions[versions.length - 1]?._id ?? "")}
          onValueChange={async (value) => {
            if (!value) return;
            setSelectedOfferId(value);
            await loadOfferById(value);
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Izberi verzijo" />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v._id} value={v._id}>
                {`${v.baseTitle}_${v.versionNumber}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={handleCreateNewVersion}>
          Nova verzija
        </Button>
        <Button type="button" variant="outline" onClick={handleCloneVersion} disabled={!selectedOfferId}>
          Kopiraj verzijo
        </Button>
        <Button type="button" variant="destructive" disabled={!selectedOfferId} onClick={handleDeleteVersion}>
          Izbrisi verzijo
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Naziv ponudbe</label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ponudba" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Placilni pogoji</label>
          <Input
            value={paymentTerms}
            onChange={(event) => setPaymentTerms(event.target.value)}
            placeholder="Npr. 30 dni"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Uvodno besedilo</label>
          <Input
            value={introText}
            onChange={(event) => setIntroText(event.target.value)}
            placeholder="Kratek opis ali opombe"
          />
        </div>
      </div>

      <div className="bg-card rounded-[var(--radius-card)] border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naziv</TableHead>
              <TableHead className="w-24 text-right">Kolicina</TableHead>
              <TableHead className="w-24">Enota</TableHead>
              <TableHead className="w-32 text-right">Cena</TableHead>
              <TableHead className="w-24 text-right">DDV %</TableHead>
              <TableHead className="w-32 text-right">Skupaj</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="relative">
                  <Popover open={searchRowId === item.id} onOpenChange={(open) => setSearchRowId(open ? item.id : null)}>
                    <PopoverTrigger asChild>
                      <Input
                        ref={(node) => (nameInputs.current[item.id] = node)}
                        value={item.name}
                        placeholder="Naziv ali iskanje v ceniku"
                        onChange={(event) => {
                          updateItem(item.id, { name: event.target.value });
                          setSearchRowId(item.id);
                          setSearchTerm(event.target.value);
                        }}
                        onFocus={() => {
                          setSearchRowId(item.id);
                          setSearchTerm(item.name);
                        }}
                        autoFocus={index === activeRowIndex}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0" side="bottom" align="start">
                      <Command shouldFilter={false}>
                        <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                          <Search className="h-4 w-4" />
                          <span>Poisci v ceniku</span>
                          {searching && <Loader2 className="h-4 w-4 animate-spin ml-auto" />}
                        </div>
                        <CommandInput
                          placeholder="Vnesi naziv ali kodo"
                          value={searchTerm}
                          onValueChange={(value) => {
                            setSearchTerm(value);
                            setSearchRowId(item.id);
                          }}
                        />
                        <CommandList>
                          <CommandEmpty>Ni zadetkov v ceniku, nadaljujte z rocnim vnosom.</CommandEmpty>
                          <CommandGroup>
                            {searchResults.slice(0, 5).map((result) => (
                              <CommandItem
                                key={result.id}
                                onSelect={() => {
                          handleSelectProduct(item.id, result, index);
                          setSearchRowId(null);
                        }}
                        className="flex flex-col items-start gap-1"
                      >
                                <div className="flex w-full justify-between">
                                  <span className="font-medium">{result.name}</span>
                                  <span className="text-muted-foreground">
                                    {result.unitPrice.toLocaleString("sl-SI", { minimumFractionDigits: 2 })} €
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground w-full flex justify-between">
                                  <span>{result.code ?? ""}</span>
                                  <span>{result.unit ?? ""}</span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })}
                  />
                </TableCell>
                <TableCell>
                  <Input value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={item.unitPrice}
                    onChange={(event) => updateItem(item.id, { unitPrice: Number(event.target.value) })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={item.vatRate}
                    onChange={(event) => updateItem(item.id, { vatRate: Number(event.target.value) })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  {(item.totalGross || 0).toLocaleString("sl-SI", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right">
                  {items.length > 1 && (
                    <Button size="icon" variant="ghost" onClick={() => deleteRow(item.id)}>
                      <Trash className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1 rounded-md border p-3">
          <div className="text-sm text-muted-foreground">Material</div>
          <div className="text-xl font-semibold">
            {totals.totalNet.toLocaleString("sl-SI", { minimumFractionDigits: 2 })} €
          </div>
        </div>
        <div className="space-y-1 rounded-md border p-3">
          <div className="text-sm text-muted-foreground">DDV (9.5%)</div>
          <div className="text-xl font-semibold">
            {totals.totalVat95.toLocaleString("sl-SI", { minimumFractionDigits: 2 })} €
          </div>
        </div>
        <div className="space-y-1 rounded-md border p-3">
          <div className="text-sm text-muted-foreground">DDV (22%)</div>
          <div className="text-xl font-semibold">
            {totals.totalVat22.toLocaleString("sl-SI", { minimumFractionDigits: 2 })} €
          </div>
        </div>
        <div className="space-y-1 rounded-md border p-3">
          <div className="text-sm text-muted-foreground">DDV za ponudbo</div>
          <div className="text-xl font-semibold">
            {totals.totalVat.toLocaleString("sl-SI", { minimumFractionDigits: 2 })} €
          </div>
        </div>
        <div className="space-y-1 rounded-md border p-3">
          <div className="text-sm text-muted-foreground">Skupaj z DDV</div>
          <div className="text-xl font-semibold">
            {totals.totalGross.toLocaleString("sl-SI", { minimumFractionDigits: 2 })} €
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Shrani ponudbo
        </Button>
        <Button variant="outline" onClick={handleExportPdf} disabled={downloading}>
          {downloading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Izvozi PDF
        </Button>
        <Button variant="outline" onClick={handleSend} disabled={sending}>
          {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Poslji ponudbo stranki
        </Button>
        <Button variant="ghost" onClick={() => ensureTrailingBlank([...items])}>
          <Plus className="mr-2 h-4 w-4" />
          Dodaj vrstico
        </Button>
      </div>
    </Card>
  );
}

