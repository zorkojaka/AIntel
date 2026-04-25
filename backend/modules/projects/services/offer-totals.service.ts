import type { OfferLineItem } from '../../../../shared/types/offers';

function clampNumber(value: unknown, fallback = 0, min = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

const round2 = (value: number) => Number(value.toFixed(2));

export function calculateOfferLineBase(item: Pick<OfferLineItem, 'unitPrice' | 'quantity'>) {
  return (item.unitPrice || 0) * (item.quantity || 0);
}

export function calculateOfferLineNetAmount(
  item: Pick<OfferLineItem, 'unitPrice' | 'quantity' | 'discountPercent'>,
  usePerItemDiscount: boolean,
) {
  const lineBase = calculateOfferLineBase(item);
  if (!usePerItemDiscount) {
    return round2(lineBase);
  }

  const discountPercent = Math.min(100, clampNumber(item.discountPercent, 0, 0));
  return round2(lineBase * (1 - discountPercent / 100));
}

export function calculateOfferTotals(offer: {
  items: OfferLineItem[];
  usePerItemDiscount: boolean;
  useGlobalDiscount: boolean;
  globalDiscountPercent: number;
  vatMode: number;
}) {
  const { items, usePerItemDiscount, useGlobalDiscount, globalDiscountPercent, vatMode } = offer;

  const baseWithoutVat = items.reduce((sum, item) => sum + calculateOfferLineBase(item), 0);

  const perItemDiscountAmount = usePerItemDiscount
    ? items.reduce((sum, item) => {
        const pct = Math.min(100, clampNumber(item.discountPercent, 0, 0));
        return sum + (calculateOfferLineBase(item) * pct) / 100;
      }, 0)
    : 0;

  const baseAfterPerItem = baseWithoutVat - perItemDiscountAmount;

  const normalizedGlobalPct = useGlobalDiscount ? Math.min(100, Math.max(0, Number(globalDiscountPercent) || 0)) : 0;
  const globalDiscountAmount = normalizedGlobalPct > 0 ? (baseAfterPerItem * normalizedGlobalPct) / 100 : 0;

  const baseAfterDiscount = baseAfterPerItem - globalDiscountAmount;

  const vatMultiplier = vatMode === 22 ? 0.22 : vatMode === 9.5 ? 0.095 : 0;
  const vatAmount = baseAfterDiscount * vatMultiplier;

  const totalNetAfterDiscount = baseAfterDiscount;
  const totalGrossAfterDiscount = totalNetAfterDiscount + vatAmount;

  return {
    baseWithoutVat: round2(baseWithoutVat),
    perItemDiscountAmount: round2(perItemDiscountAmount),
    globalDiscountAmount: round2(globalDiscountAmount),
    baseAfterDiscount: round2(baseAfterDiscount),
    vatAmount: round2(vatAmount),
    totalNet: round2(baseAfterDiscount),
    totalVat22: vatMode === 22 ? round2(vatAmount) : 0,
    totalVat95: vatMode === 9.5 ? round2(vatAmount) : 0,
    totalVat: round2(vatAmount),
    totalGross: round2(totalGrossAfterDiscount),
    discountPercent: normalizedGlobalPct,
    discountAmount: round2(perItemDiscountAmount + globalDiscountAmount),
    totalNetAfterDiscount: round2(totalNetAfterDiscount),
    totalGrossAfterDiscount: round2(totalGrossAfterDiscount),
    totalWithVat: round2(totalGrossAfterDiscount),
    vatMode,
  };
}
