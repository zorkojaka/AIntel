import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { toast } from "sonner";

import type { OfferLineItem, OfferVersion, OfferVersionSummary } from "@aintel/shared/types/offers";
import type { PriceListSearchItem } from "@aintel/shared/types/price-list";

import { Loader2, Plus, Trash } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { PriceListProductAutocomplete } from "./PriceListProductAutocomplete";

type OffersTabProps = {
  projectId: string;
  refreshKey?: number;
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
  discountPercent: number;
};

const createEmptyItem = (): OfferLineItemForm => ({
  id: crypto.randomUUID(),
  productId: null,
  name: "",
  quantity: 0,
  unit: "kos",
  unitPrice: 0,
  vatRate: 22,
  discountPercent: 0,
  totalNet: 0,
  totalVat: 0,
  totalGross: 0,
});

const isEmptyOfferItem = (item: OfferLineItemForm) =>
  !item.productId && (!item.name || item.name.trim() === "") && (!item.quantity || item.quantity === 0);

const clampPositive = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
};

const isItemValid = (item: OfferLineItem | OfferLineItemForm) =>
  item.name.trim() !== "" && item.unitPrice > 0;

export function OffersTab({ projectId, refreshKey = 0 }: OffersTabProps) {
  const [items, setItems] = useState<OfferLineItemForm[]>([createEmptyItem()]);

  const [title, setTitle] = useState("Ponudba");
  const [paymentTerms, setPaymentTerms] = useState<string>("");
  const [introText, setIntroText] = useState<string>("");

  const [currentOffer, setCurrentOffer] = useState<OfferVersion | null>(null);
  const [activeRowIndex, setActiveRowIndex] = useState(0);

  const [globalDiscountPercent, setGlobalDiscountPercent] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [totalNetAfterDiscount, setTotalNetAfterDiscount] = useState<number>(0);
  const [totalGrossAfterDiscount, setTotalGrossAfterDiscount] = useState<number>(0);

  const [useGlobalDiscount, setUseGlobalDiscount] = useState<boolean>(false);
  const [usePerItemDiscount, setUsePerItemDiscount] = useState<boolean>(false);
  const [vatMode, setVatMode] = useState<0 | 9.5 | 22>(22);
  const [overriddenVatIds, setOverriddenVatIds] = useState<Set<string>>(new Set());

  const [perItemDiscountAmount, setPerItemDiscountAmount] = useState<number>(0);
  const [baseWithoutVat, setBaseWithoutVat] = useState<number>(0);
  const [baseAfterDiscount, setBaseAfterDiscount] = useState<number>(0);
  const [globalDiscountAmount, setGlobalDiscountAmount] = useState<number>(0);
  const [vatAmount, setVatAmount] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);

  const nameInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusRowId = useRef<string | null>(null);

  const [versions, setVersions] = useState<OfferVersionSummary[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

  const resetToEmptyOffer = useCallback(() => {
    setSelectedOfferId(null);
    setTitle("Ponudba");
    setPaymentTerms("");
    setIntroText("");
    setItems(ensureTrailingBlank([]));
    setActiveRowIndex(0);
    setGlobalDiscountPercent(0);
    setUseGlobalDiscount(false);
    setUsePerItemDiscount(false);
    setVatMode(22);
    setBaseWithoutVat(0);
    setPerItemDiscountAmount(0);
    setGlobalDiscountAmount(0);
    setBaseAfterDiscount(0);
    setVatAmount(0);
    setTotalNetAfterDiscount(0);
    setTotalGrossAfterDiscount(0);
    setDiscountAmount(0);
  }, []);

  const loadOfferById = useCallback(async (offerId: string) => {
    if (!projectId) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/offers/${offerId}`);
      const payload = await response.json();
      if (!payload.success) return;
      const offer: OfferVersion = payload.data;
      if (!offer) return;

      setTitle(offer.baseTitle || "Ponudba");
      setPaymentTerms(offer.paymentTerms ?? "");
      setIntroText(offer.introText ?? "");

      setUseGlobalDiscount(offer.useGlobalDiscount ?? false);
      setUsePerItemDiscount(offer.usePerItemDiscount ?? false);
      setVatMode((offer.vatMode as 0 | 9.5 | 22) ?? 22);

      const gPercent = offer.globalDiscountPercent ?? offer.discountPercent ?? 0;
      setGlobalDiscountPercent(gPercent);

      setBaseWithoutVat(offer.baseWithoutVat ?? offer.totalNet ?? 0);
      setPerItemDiscountAmount(offer.perItemDiscountAmount ?? 0);
      setGlobalDiscountAmount(offer.globalDiscountAmount ?? offer.discountAmount ?? 0);
      setBaseAfterDiscount(offer.baseAfterDiscount ?? offer.totalNetAfterDiscount ?? 0);
      setVatAmount(offer.vatAmount ?? offer.totalVat ?? 0);
      setTotalNetAfterDiscount(offer.totalNetAfterDiscount ?? offer.baseAfterDiscount ?? 0);
      setTotalGrossAfterDiscount(offer.totalGrossAfterDiscount ?? offer.totalGross ?? 0);
      setDiscountAmount(offer.globalDiscountAmount ?? offer.discountAmount ?? 0);

      setCurrentOffer(offer);

      const mapped: OfferLineItemForm[] = (offer.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
        discountPercent: item.discountPercent ?? 0,
        totalNet: item.totalNet,
        totalVat: item.totalVat,
        totalGross: item.totalGross,
        productId: item.productId ?? null,
      }));

      setItems(ensureTrailingBlank([...mapped]));
    } catch (error) {
      console.error(error);
    }
  }, [projectId]);

  const refreshOffers = useCallback(
    async (preferredId?: string | null, fallbackToLatest = true) => {
      if (!projectId) {
        setVersions([]);
        resetToEmptyOffer();
        return;
      }

      try {
        const res = await fetch(`/api/projects/${projectId}/offers`);
        const json = await res.json();
        if (!json.success) return;

        const list: OfferVersionSummary[] = json.data ?? [];
        setVersions(list);

        if (list.length === 0) {
          resetToEmptyOffer();
          return;
        }

        let nextId: string | null = null;

        if (preferredId && list.some((entry) => entry._id === preferredId)) {
          nextId = preferredId;
        }

        if (!nextId && fallbackToLatest && list.length > 0) {
          nextId = list[list.length - 1]._id;
        }

        if (nextId) {
          setSelectedOfferId(nextId);
          await loadOfferById(nextId);
        } else {
          resetToEmptyOffer();
        }
      } catch (error) {
        console.error(error);
      }
    },
    [loadOfferById, projectId, resetToEmptyOffer],
  );

  const selectedOfferIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedOfferIdRef.current = selectedOfferId;
  }, [selectedOfferId]);

  const previousProjectId = useRef<string | null>(null);
  useEffect(() => {
    const isProjectChange = previousProjectId.current !== projectId;
    previousProjectId.current = projectId;
    const preferredId = isProjectChange ? null : selectedOfferIdRef.current;
    refreshOffers(preferredId, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshKey, refreshOffers]);

  useEffect(() => {
    resetToEmptyOffer();
    setVersions([]);
    setCurrentOffer(null);
    setOverriddenVatIds(new Set());
  }, [projectId]);


  const recalcItem = (item: OfferLineItemForm): OfferLineItemForm => {
    const quantity = clampPositive(item.quantity, 1);
    const unitPrice = clampPositive(item.unitPrice, 0);
    const vatRate = clampPositive(item.vatRate, 0);

    const perItemDiscount = usePerItemDiscount ? clampPositive(item.discountPercent ?? 0, 0) : 0;

    const net = Number((quantity * unitPrice * (1 - perItemDiscount / 100)).toFixed(2));

    const effectiveVatRate = vatMode === 0 ? 0 : vatMode ?? vatRate;
    const totalVat = Number((net * (effectiveVatRate / 100)).toFixed(2));
    const totalGross = Number((net + totalVat).toFixed(2));

    return {
      ...item,
      quantity,
      unitPrice,
      vatRate,
      discountPercent: perItemDiscount,
      totalNet: net,
      totalVat,
      totalGross,
    };
  };

  const ensureTrailingBlank = (list: OfferLineItemForm[]) => {
    const trimmed = list.filter((item, index) => {
      if (index === list.length - 1) return true;
      return !isEmptyOfferItem(item);
    });
    const last = trimmed[trimmed.length - 1];
    if (!last || !isEmptyOfferItem(last)) {
      const blank = createEmptyItem();
      trimmed.push(blank);
      focusRowId.current = blank.id;
    }
    return trimmed;
  };

  const updateItem = (id: string, changes: Partial<OfferLineItemForm>) => {
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx === -1) return prev;

      const next = [...prev];
      const merged = { ...next[idx], ...changes };
      next[idx] = recalcItem(merged);

      return ensureTrailingBlank(next);
    });
  };

  const deleteRow = (id: string) => {
    setItems((prev) => {
      if (prev.length === 1) return ensureTrailingBlank([]);
      const filtered = prev.filter((item) => item.id !== id);
      if (filtered.length === 0) return ensureTrailingBlank([]);
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
    }
  }, [activeRowIndex, items]);



  const validItems = useMemo(
    () => items.filter((item) => !isEmptyOfferItem(item)).filter(isItemValid),
    [items]
  );

  const totals = useMemo(() => {
    const baseWithout = validItems.reduce(
      (acc, item) => acc + item.quantity * item.unitPrice,
      0
    );

    const perItemDisc = usePerItemDiscount
      ? validItems.reduce(
          (acc, item) =>
            acc + item.quantity * item.unitPrice * ((item.discountPercent ?? 0) / 100),
          0
        )
      : 0;

    const baseAfterPerItem = Number((baseWithout - perItemDisc).toFixed(2));

    const normalizedDiscount = useGlobalDiscount
      ? Math.min(100, Math.max(0, globalDiscountPercent || 0))
      : 0;

    const globalDisc = Number((baseAfterPerItem * (normalizedDiscount / 100)).toFixed(2));
    const baseAfterAll = Number((baseAfterPerItem - globalDisc).toFixed(2));

    const vatRate =
      vatMode === 22 ? 0.22 : vatMode === 9.5 ? 0.095 : 0;

    const vatAmt = Number((baseAfterAll * vatRate).toFixed(2));
    const totalWithVatVal = Number((baseAfterAll + vatAmt).toFixed(2));

    return {
      baseWithoutVat: baseWithout,
      perItemDiscountAmount: perItemDisc,
      globalDiscountAmount: globalDisc,
      baseAfterDiscount: baseAfterAll,
      vatAmount: vatAmt,
      totalWithVat: totalWithVatVal,
    };
  }, [validItems, usePerItemDiscount, useGlobalDiscount, globalDiscountPercent, vatMode]);

  useEffect(() => {
    setPerItemDiscountAmount(totals.perItemDiscountAmount ?? 0);
    setGlobalDiscountAmount(totals.globalDiscountAmount ?? 0);
    setBaseWithoutVat(totals.baseWithoutVat ?? 0);
    setBaseAfterDiscount(totals.baseAfterDiscount ?? 0);
    setVatAmount(totals.vatAmount ?? 0);
    setTotalGrossAfterDiscount(totals.totalWithVat ?? 0);
    setTotalNetAfterDiscount(totals.baseAfterDiscount ?? 0);
    setDiscountAmount(totals.globalDiscountAmount ?? 0);
  }, [totals]);

  const formatCurrency = (value: number) =>
    `${value.toLocaleString("sl-SI", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} €`;

  const handleToggleGlobalDiscount = (checked: boolean) => {
    setUseGlobalDiscount(checked);
    if (!checked) {
      setGlobalDiscountPercent(0);
    }
  };

  const handleVatModeChange = (mode: 0 | 9.5 | 22) => {
    setVatMode(mode);
    setItems((prev) =>
      prev.map((item) => {
        if (overriddenVatIds.has(item.id)) return recalcItem(item);
        return recalcItem({ ...item, vatRate: mode });
      })
    );
  };

  const handleSelectProduct = (rowId: string, product: PriceListSearchItem, rowIndex: number) => {
    updateItem(rowId, {
      name: product.name,
      productId: product.id,
      unit: product.unit ?? "kos",
      unitPrice: product.unitPrice,
      vatRate: product.vatRate ?? 22,
    });

    setActiveRowIndex(rowIndex + 1);
  };

  const handleSelectCustomItem = (rowId: string) => {
    updateItem(rowId, { productId: null });
  };

  const buildPayloadFromCurrentState = () => {
    const cleanItems = items
      .filter((i) => !isEmptyOfferItem(i))
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
        discountPercent: usePerItemDiscount ? i.discountPercent ?? 0 : 0,
      }));

    const effectiveGlobalPercent = useGlobalDiscount ? globalDiscountPercent : 0;

    return {
      title,
      validUntil: null,
      paymentTerms,
      introText,
      items: cleanItems,
      // kompatibilnost s starimi polji
      discountPercent: effectiveGlobalPercent,
      globalDiscountPercent: effectiveGlobalPercent,
      useGlobalDiscount,
      usePerItemDiscount,
      vatMode,
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
        toast.error(payload.error ?? "Ponudbe ni bilo mogoče shraniti.");
        return null;
      }

      const created: OfferVersion = payload.data;
      await refreshOffers(created._id ?? selectedOfferId ?? null);
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
    if (!window.confirm("Res želiš izbrisati to verzijo ponudbe?")) return;

    const response = await fetch(`/api/projects/${projectId}/offers/${selectedOfferId}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!payload.success || !payload.data) return;

    await refreshOffers(null);
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
    await refreshOffers(created._id ?? null);
  };

  const handleChangeVersion = async (value: string) => {
    setSelectedOfferId(value);
    await loadOfferById(value);
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

      const response = await fetch(
        `/api/projects/${projectId}/offers/${saved._id}/send`,
        { method: "POST" }
      );
      const payload = await response.json();
      if (!payload.success) {
        toast.error(payload.error ?? "Pošiljanje ni uspelo.");
        return;
      }
      toast.success(
        payload.data?.message ?? "Pošiljanje bo implementirano kasneje."
      );
    } catch (error) {
      console.error(error);
      toast.error("Pošiljanje ni uspelo.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      {/* VERZIJE + DDV + POPUSTI */}
      <div className="mb-4 border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Verzija ponudbe
            </span>
            <Select
              value={selectedOfferId ?? ""}
              onValueChange={handleChangeVersion}
            >
              <SelectTrigger className="min-w-[260px]">
                <SelectValue placeholder="Izberi verzijo ponudbe" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v._id} value={v._id}>
                    {v.title} –{" "}
                    {formatCurrency(
                      v.totalGrossAfterDiscount ?? v.totalWithVat ?? v.totalGross ?? 0
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCreateNewVersion}
            >
              Nova verzija
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCloneVersion}
              disabled={!selectedOfferId}
            >
              Kopiraj verzijo
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!selectedOfferId}
              onClick={handleDeleteVersion}
            >
              Izbriši verzijo
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">DDV način</span>
            <Select
              value={String(vatMode)}
              onValueChange={(value) =>
                handleVatModeChange(Number(value) as 0 | 9.5 | 22)
              }
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="22">22 %</SelectItem>
                <SelectItem value="9.5">9,5 %</SelectItem>
                <SelectItem value="0">0 % (76. člen)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={useGlobalDiscount}
                onChange={(e) =>
                  handleToggleGlobalDiscount(e.target.checked)
                }
              />
              <span>Popust na celotno ponudbo</span>
              {useGlobalDiscount && (
                <>
                  <Input
                    type="number"
                    className="w-20 text-right"
                    inputMode="decimal"
                    value={globalDiscountPercent}
                    onChange={(e) =>
                      setGlobalDiscountPercent(
                        Number(e.target.value) || 0
                      )
                    }
                  />
                  <span className="text-muted-foreground">%</span>
                </>
              )}
            </label>

            <label className="flex items-center gap-2">
              <Checkbox
                checked={usePerItemDiscount}
                onChange={(e) =>
                  setUsePerItemDiscount(e.target.checked)
                }
              />
              <span>Popust po produktih</span>
            </label>
          </div>
        </div>
      </div>

      {/* HEADER POLJA */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Naziv ponudbe</label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ponudba"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Plačilni pogoji</label>
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

      {/* TABELA POSTAVK */}
      <div className="bg-card rounded-[var(--radius-card)] border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[42%] text-left pl-4">
                Naziv
              </TableHead>
              <TableHead className="w-[10%] text-right">
                Količina
              </TableHead>
              <TableHead className="w-[10%] text-right">
                Enota
              </TableHead>
              <TableHead className="w-[12%] text-right">
                Cena
              </TableHead>
              {usePerItemDiscount && (
                <TableHead className="w-[10%] text-right">
                  Popust %
                </TableHead>
              )}
              <TableHead className="w-[10%] text-right">
                DDV %
              </TableHead>
              <TableHead className="w-[12%] text-right pr-4">
                Skupaj
              </TableHead>
              <TableHead className="w-[4%] text-center" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="w-[42%] text-left pl-4 align-top">
                  <PriceListProductAutocomplete
                    value={item.name}
                    placeholder="Naziv ali iskanje v ceniku"
                    autoFocus={index === activeRowIndex}
                    inputRef={(node) => (nameInputs.current[item.id] = node)}
                    inputClassName="text-left"
                    onChange={(name) => {
                      updateItem(item.id, { name, productId: null });
                    }}
                    onCustomSelected={() => handleSelectCustomItem(item.id)}
                    onProductSelected={(product) => handleSelectProduct(item.id, product, index)}
                  />
                </TableCell>

                <TableCell className="w-[10%] text-right align-top">
                  <Input
                    className="text-right"
                    type="number"
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(item.id, {
                        quantity: Number(event.target.value),
                      })
                    }
                  />
                </TableCell>

                <TableCell className="w-[10%] text-right align-top">
                  <Input
                    className="text-right"
                    value={item.unit}
                    onChange={(event) =>
                      updateItem(item.id, { unit: event.target.value })
                    }
                  />
                </TableCell>

                <TableCell className="w-[12%] text-right align-top">
                  <Input
                    className="text-right"
                    type="number"
                    inputMode="decimal"
                    value={item.unitPrice}
                    onChange={(event) =>
                      updateItem(item.id, {
                        unitPrice: Number(event.target.value),
                      })
                    }
                  />
                </TableCell>

                {usePerItemDiscount && (
                  <TableCell className="w-[10%] text-right align-top">
                    <Input
                      className="text-right"
                      type="number"
                      inputMode="decimal"
                      value={item.discountPercent ?? 0}
                      onChange={(event) =>
                        updateItem(item.id, {
                          discountPercent: Number(event.target.value),
                        })
                      }
                    />
                  </TableCell>
                )}

                <TableCell className="w-[10%] text-right align-top">
                  <Input
                    className="text-right"
                    type="number"
                    inputMode="decimal"
                    value={item.vatRate}
                    onChange={(event) => {
                      setOverriddenVatIds((prev) => {
                        const next = new Set(prev);
                        next.add(item.id);
                        return next;
                      });
                      updateItem(item.id, {
                        vatRate: Number(event.target.value),
                      });
                    }}
                  />
                </TableCell>

                <TableCell className="w-[12%] text-right align-top pr-4">
                  {(item.totalGross || 0).toLocaleString("sl-SI", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  €
                </TableCell>

                <TableCell className="w-[4%] text-center align-top">
                  {items.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteRow(item.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* POVZETEK / IZRAČUNI */}
      <div className="mt-6 space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Osnova brez DDV</span>
          <span>{formatCurrency(totals.baseWithoutVat ?? 0)}</span>
        </div>

        {usePerItemDiscount && (totals.perItemDiscountAmount ?? 0) > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Popust po produktih
            </span>
            <span>
              -{formatCurrency(totals.perItemDiscountAmount ?? 0)}
            </span>
          </div>
        )}

        {useGlobalDiscount && (totals.globalDiscountAmount ?? 0) > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Popust na celotno ponudbo ({globalDiscountPercent || 0}%)
            </span>
            <span>
              -{formatCurrency(totals.globalDiscountAmount ?? 0)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Osnova po popustih</span>
          <span>{formatCurrency(totals.baseAfterDiscount ?? 0)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">DDV ({vatMode}%)</span>
          <span>{formatCurrency(vatAmount)}</span>
        </div>

        <div className="flex items-center justify-between font-medium pt-1">
          <span>Skupaj za plačilo (z DDV)</span>
          <span>{formatCurrency(totalGrossAfterDiscount)}</span>
        </div>
      </div>

      {/* GUMBI */}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Shrani ponudbo
        </Button>
        <Button
          variant="outline"
          onClick={handleExportPdf}
          disabled={downloading}
        >
          {downloading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Izvozi PDF
        </Button>
        <Button
          variant="outline"
          onClick={handleSend}
          disabled={sending}
        >
          {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Pošlji ponudbo stranki
        </Button>
      </div>
    </Card>
  );
}
