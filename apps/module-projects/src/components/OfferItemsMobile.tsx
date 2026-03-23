import { useEffect, useMemo, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { PriceListProductAutocomplete } from "./PriceListProductAutocomplete";

import type { PriceListSearchItem } from "@aintel/shared/types/price-list";

type OfferItemsMobileItem = {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  totalGross: number;
  discountPercent: number;
};

type OfferItemsMobileTotals = {
  baseWithoutVat: number;
  perItemDiscountAmount: number;
  globalDiscountAmount: number;
  baseAfterDiscount: number;
  vatAmount: number;
  totalWithVat: number;
};

type OfferItemsMobileProps = {
  items: OfferItemsMobileItem[];
  visibleBlankItemId: string | null;
  usePerItemDiscount: boolean;
  useGlobalDiscount: boolean;
  globalDiscountPercent: number;
  totals: OfferItemsMobileTotals;
  formatCurrency: (value: number) => string;
  onRevealBlankItem: () => void;
  onUpdateItem: (id: string, changes: Partial<OfferItemsMobileItem>) => void;
  onDeleteItem: (id: string) => void;
  onSelectProduct: (rowId: string, product: PriceListSearchItem, rowIndex: number) => void;
  onSelectCustomItem: (rowId: string) => void;
};

export function OfferItemsMobile({
  items,
  visibleBlankItemId,
  usePerItemDiscount,
  useGlobalDiscount,
  globalDiscountPercent,
  totals,
  formatCurrency,
  onRevealBlankItem,
  onUpdateItem,
  onDeleteItem,
  onSelectProduct,
  onSelectCustomItem,
}: OfferItemsMobileProps) {
  const blankItemRef = useRef<HTMLDivElement | null>(null);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        const isBlank =
          !item.productId &&
          (!item.name || item.name.trim() === "") &&
          (!item.quantity || item.quantity === 0);
        return !isBlank || item.id === visibleBlankItemId;
      }),
    [items, visibleBlankItemId],
  );

  useEffect(() => {
    if (!visibleBlankItemId) return;
    blankItemRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [visibleBlankItemId]);

  return (
    <div className="md:hidden">
      <div className="space-y-3 pb-28">
        {visibleItems.map((item, index) => {
          const isVisibleBlank = item.id === visibleBlankItemId;
          return (
            <div
              key={item.id}
              ref={isVisibleBlank ? blankItemRef : null}
              className="rounded-none border bg-card p-4 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Naziv
                  </label>
                  <PriceListProductAutocomplete
                    value={item.name}
                    placeholder="Naziv ali iskanje v ceniku"
                    inputClassName="min-w-0 h-10 text-base font-semibold"
                    onChange={(name) => {
                      onUpdateItem(item.id, { name, productId: null });
                    }}
                    onCustomSelected={() => onSelectCustomItem(item.id)}
                    onProductSelected={(product) => onSelectProduct(item.id, product, index)}
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="mt-5 shrink-0"
                  onClick={() => onDeleteItem(item.id)}
                  aria-label={`Izbriši postavko ${item.name || index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Količina
                  </label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={item.quantity}
                    onChange={(event) =>
                      onUpdateItem(item.id, {
                        quantity: Number(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Enota
                  </label>
                  <Input
                    value={item.unit}
                    onChange={(event) => onUpdateItem(item.id, { unit: event.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Cena
                  </label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={item.unitPrice}
                    onChange={(event) =>
                      onUpdateItem(item.id, {
                        unitPrice: Number(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    DDV
                  </label>
                  <Select
                    value={String(item.vatRate)}
                    onValueChange={(value) => onUpdateItem(item.id, { vatRate: Number(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="22">22 %</SelectItem>
                      <SelectItem value="9.5">9,5 %</SelectItem>
                      <SelectItem value="0">0 %</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {usePerItemDiscount && (
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Popust %
                    </label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={item.discountPercent ?? 0}
                      onChange={(event) =>
                        onUpdateItem(item.id, {
                          discountPercent: Number(event.target.value),
                        })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <span className="text-sm text-muted-foreground">Skupaj</span>
                <span className="text-base font-semibold">{formatCurrency(item.totalGross || 0)}</span>
              </div>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          className="w-full rounded-none border-dashed"
          onClick={onRevealBlankItem}
        >
          <Plus className="h-4 w-4" />
          Dodaj postavko
        </Button>
      </div>

      <div className="sticky bottom-0 z-20 border-t bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Osnova brez DDV</span>
            <span>{formatCurrency(totals.baseWithoutVat ?? 0)}</span>
          </div>
          {usePerItemDiscount && (totals.perItemDiscountAmount ?? 0) > 0 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Popust po produktih</span>
              <span>-{formatCurrency(totals.perItemDiscountAmount ?? 0)}</span>
            </div>
          )}
          {useGlobalDiscount && (totals.globalDiscountAmount ?? 0) > 0 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                Popust na celotno ponudbo ({globalDiscountPercent || 0}%)
              </span>
              <span>-{formatCurrency(totals.globalDiscountAmount ?? 0)}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">DDV</span>
            <span>{formatCurrency(totals.vatAmount ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t pt-2 text-base font-semibold">
            <span>Skupaj za plačilo</span>
            <span>{formatCurrency(totals.totalWithVat ?? 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
