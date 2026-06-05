export function isReolinkProduct(input: { proizvajalec?: unknown; isService?: unknown }) {
  return input.isService !== true && typeof input.proizvajalec === 'string' && input.proizvajalec.trim().toLowerCase() === 'reolink';
}

export function calculateReolinkSellingPrice(purchasePrice: number) {
  return Math.round((Math.max(purchasePrice * 1.3, purchasePrice + 45) + Number.EPSILON) * 100) / 100;
}

export function applyReolinkSellingPrice<T extends { nabavnaCena: number; prodajnaCena: number; proizvajalec?: unknown; isService?: unknown }>(
  product: T,
): T {
  if (!isReolinkProduct(product)) {
    return product;
  }

  return {
    ...product,
    prodajnaCena: calculateReolinkSellingPrice(product.nabavnaCena),
  };
}
